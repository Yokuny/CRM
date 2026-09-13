import type { ProfessionalDocument, ScheduleWindow } from '@crm/db';
import { Professional, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type ProfessionalRecord = {
  id: string;
  name: string;
  slotDurationMinutes: number;
  weeklySchedule: ScheduleWindow[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// `weeklySchedule` é reconstruído campo a campo: em `Professional.create`
// (sem `.lean()`), o array vem como subdocumentos Mongoose, não objetos
// simples — comparar/serializar o subdocumento bruto vaza campos internos do
// Mongoose (ex.: `$__parent`, circular refs). `.lean()` já devolve objetos
// simples, então este map é um no-op nesse caso.
const toRecord = (doc: ProfessionalDocument): ProfessionalRecord => ({
  id: doc._id.toString(),
  name: doc.name,
  slotDurationMinutes: doc.slotDurationMinutes,
  weeklySchedule: doc.weeklySchedule.map((window) => ({
    weekday: window.weekday,
    start: window.start,
    end: window.end,
  })),
  active: doc.active,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateProfessionalInput = {
  tenant: string;
  name: string;
  slotDurationMinutes: number;
  weeklySchedule: ScheduleWindow[];
};

export const createProfessional = async (data: CreateProfessionalInput): Promise<ProfessionalRecord> =>
  withDbTiming('professional.createProfessional', async () => {
    const doc = await Professional.create({
      Tenant: data.tenant,
      name: data.name,
      slotDurationMinutes: data.slotDurationMinutes,
      weeklySchedule: data.weeklySchedule,
    });
    return toRecord(doc);
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// product.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<ProfessionalRecord | null> =>
  withDbTiming('professional.findById', async () => {
    const doc = await Professional.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpdateProfessionalInput = {
  name?: string;
  slotDurationMinutes?: number;
  weeklySchedule?: ScheduleWindow[];
  active?: boolean;
};

// Só os campos informados entram no $set (SCH-01/05: PATCH atualiza os campos
// informados, inclusive `active` sem apagar histórico) — mesmo padrão de
// product.repository.updateProduct. `weeklySchedule`, quando informado, é
// substituído como array inteiro (contracts, T10, já valida sobreposição
// contra o array completo enviado).
export const updateProfessional = async (
  tenantId: string,
  id: string,
  data: UpdateProfessionalInput,
): Promise<ProfessionalRecord | null> =>
  withDbTiming('professional.updateProfessional', async () => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.slotDurationMinutes !== undefined) update.slotDurationMinutes = data.slotDurationMinutes;
    if (data.weeklySchedule !== undefined) update.weeklySchedule = data.weeklySchedule;
    if (data.active !== undefined) update.active = data.active;

    const doc = await Professional.findOneAndUpdate(tenantScoped({ Tenant: tenantId, _id: id }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

export type ListProfessionalsInput = {
  page: number;
  limit: number;
  active?: boolean;
};

export type ListProfessionalsResult = {
  items: ProfessionalRecord[];
  total: number;
};

// `page`/`limit` chegam já clampados pelo service (mesma divisão de
// responsabilidade de product.repository.listProducts) — este repositório
// confia neles, nunca reaplica o clamp.
export const listProfessionals = async (
  tenantId: string,
  query: ListProfessionalsInput,
): Promise<ListProfessionalsResult> =>
  withDbTiming('professional.listProfessionals', async () => {
    const activeFilter = query.active === undefined ? {} : { active: query.active };
    const filter = tenantScoped({ Tenant: tenantId, ...activeFilter });

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Professional.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Professional.countDocuments(filter),
    ]);

    return { items: docs.map(toRecord), total };
  });
