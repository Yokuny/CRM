import type { AppointmentDocument, AppointmentKind, AppointmentSource, AppointmentStatus } from '@crm/db';
import { Appointment, Customer, Professional, Space, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

const ACTIVE_STATUSES = ['pending', 'confirmed'] as const;

export type AppointmentRecord = {
  id: string;
  kind: AppointmentKind;
  professional: string;
  // Resolvido em lote (nunca `.populate()` — perderia o id de uma referência
  // apagada, mesmo raciocínio de order.repository.listOrders): ausente,
  // nunca `null`, quando o Professional/Space/Customer referenciado não
  // existe mais.
  professionalName?: string;
  space?: string;
  spaceName?: string;
  customer?: string;
  customerName?: string;
  conversation?: string;
  title?: string;
  notes?: string;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  source: AppointmentSource;
  confirmedAt?: Date;
  canceledAt?: Date;
  canceledBy?: string;
  cancelReason?: string;
  attendanceMarkedAt?: Date;
  attendanceMarkedBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Leitura pura (SCH-35): nunca recalcula/ajusta `status` a partir de `start` —
// o valor gravado é devolvido exatamente como está, mesmo quando `start` já
// passou e o agendamento segue `pending`.
const toRecord = (
  doc: AppointmentDocument,
  professionalName?: string,
  spaceName?: string,
  customerName?: string,
): AppointmentRecord => ({
  id: doc._id.toString(),
  kind: doc.kind,
  professional: doc.professional.toString(),
  professionalName,
  space: doc.space?.toString(),
  spaceName,
  customer: doc.customer?.toString(),
  customerName,
  conversation: doc.conversation?.toString(),
  title: doc.title,
  notes: doc.notes,
  start: doc.start,
  end: doc.end,
  status: doc.status,
  source: doc.source,
  confirmedAt: doc.confirmedAt,
  canceledAt: doc.canceledAt,
  canceledBy: doc.canceledBy?.toString(),
  cancelReason: doc.cancelReason,
  attendanceMarkedAt: doc.attendanceMarkedAt,
  attendanceMarkedBy: doc.attendanceMarkedBy?.toString(),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// order.repository.findById. Nomes resolvidos por consultas avulsas (um
// único documento, sem custo de lote aqui).
export const findById = async (tenantId: string, id: string): Promise<AppointmentRecord | null> =>
  withDbTiming('appointment.findById', async () => {
    const doc = await Appointment.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    if (!doc) return null;

    const [professional, space, customer] = await Promise.all([
      Professional.findOne(tenantScoped({ Tenant: tenantId, _id: doc.professional }))
        .select('name')
        .lean(),
      doc.space
        ? Space.findOne(tenantScoped({ Tenant: tenantId, _id: doc.space }))
            .select('name')
            .lean()
        : null,
      doc.customer
        ? Customer.findOne(tenantScoped({ Tenant: tenantId, _id: doc.customer }))
            .select('name')
            .lean()
        : null,
    ]);

    return toRecord(doc, professional?.name, space?.name, customer?.name);
  });

// Faixa da agenda (SCH-29): agendamento E bloqueio (os dois `kind`), meio
// aberta `start ∈ [from, to)`. Nomes de cliente/profissional/ambiente
// resolvidos em TRÊS consultas em lote com `$in` (nunca `.populate()`, que
// sobrescreveria a referência com `null` e perderia o id original quando o
// documento referenciado foi apagado — mesmo padrão de
// order.repository.listOrders, aqui estendido a três tipos de referência em
// vez de um).
export const listByRange = async (
  tenantId: string,
  fromUtc: Date,
  toUtc: Date,
  professionalId?: string,
  spaceId?: string,
): Promise<AppointmentRecord[]> =>
  withDbTiming('appointment.listByRange', async () => {
    const professionalFilter = professionalId ? { professional: professionalId } : {};
    const spaceFilter = spaceId ? { space: spaceId } : {};
    const filter = tenantScoped({
      Tenant: tenantId,
      start: { $gte: fromUtc, $lt: toUtc },
      ...professionalFilter,
      ...spaceFilter,
    });

    const docs = await Appointment.find(filter).sort({ start: 1 }).lean();

    const professionalIds = [...new Set(docs.map((doc) => doc.professional.toString()))];
    const spaceIds = [...new Set(docs.flatMap((doc) => (doc.space ? [doc.space.toString()] : [])))];
    const customerIds = [...new Set(docs.flatMap((doc) => (doc.customer ? [doc.customer.toString()] : [])))];

    const [professionals, spaces, customers] = await Promise.all([
      professionalIds.length
        ? Professional.find(tenantScoped({ Tenant: tenantId, _id: { $in: professionalIds } }))
            .select('name')
            .lean()
        : [],
      spaceIds.length
        ? Space.find(tenantScoped({ Tenant: tenantId, _id: { $in: spaceIds } }))
            .select('name')
            .lean()
        : [],
      customerIds.length
        ? Customer.find(tenantScoped({ Tenant: tenantId, _id: { $in: customerIds } }))
            .select('name')
            .lean()
        : [],
    ]);

    const professionalNameById = new Map(professionals.map((doc) => [doc._id.toString(), doc.name]));
    const spaceNameById = new Map(spaces.map((doc) => [doc._id.toString(), doc.name]));
    const customerNameById = new Map(customers.map((doc) => [doc._id.toString(), doc.name]));

    return docs.map((doc) =>
      toRecord(
        doc,
        professionalNameById.get(doc.professional.toString()),
        doc.space ? spaceNameById.get(doc.space.toString()) : undefined,
        doc.customer ? customerNameById.get(doc.customer.toString()) : undefined,
      ),
    );
  });

// Próximo agendamento (nunca bloqueio: `kind:'appointment'`) ativo
// (`pending`/`confirmed`) e futuro (`start > now`) do cliente — usado pelo
// card do Inbox (SCH-38) e por `GET /appointments/upcoming` (T24). `null`
// quando não há nenhum, nunca erro (é um estado válido).
export const findNextActiveByCustomer = async (
  tenantId: string,
  customerId: string,
  now: Date,
): Promise<AppointmentRecord | null> =>
  withDbTiming('appointment.findNextActiveByCustomer', async () => {
    const doc = await Appointment.findOne(
      tenantScoped({
        Tenant: tenantId,
        kind: 'appointment' as const,
        customer: customerId,
        status: { $in: ACTIVE_STATUSES },
        start: { $gt: now },
      }),
    )
      .sort({ start: 1 })
      .lean();
    if (!doc) return null;

    const [professional, space, customer] = await Promise.all([
      Professional.findOne(tenantScoped({ Tenant: tenantId, _id: doc.professional }))
        .select('name')
        .lean(),
      doc.space
        ? Space.findOne(tenantScoped({ Tenant: tenantId, _id: doc.space }))
            .select('name')
            .lean()
        : null,
      Customer.findOne(tenantScoped({ Tenant: tenantId, _id: doc.customer }))
        .select('name')
        .lean(),
    ]);

    return toRecord(doc, professional?.name, space?.name, customer?.name);
  });
