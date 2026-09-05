import { NO_STATUS_FILTER_VALUE } from '@crm/contracts';
import type { CustomerDocument } from '@crm/db';
import { Customer, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  document?: string;
  template: string;
  templateVersion: number;
  values: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: CustomerDocument): CustomerRecord => ({
  id: doc._id.toString(),
  name: doc.name,
  phone: doc.phone,
  document: doc.document,
  template: doc.template.toString(),
  templateVersion: doc.templateVersion,
  values: doc.values,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateCustomerInput = {
  tenant: string;
  name: string;
  phone: string;
  document?: string;
  template: string;
  templateVersion: number;
  values: Record<string, unknown>;
};

export const createCustomer = async (data: CreateCustomerInput): Promise<CustomerRecord> =>
  withDbTiming('customer.createCustomer', async () => {
    const doc = await Customer.create({
      Tenant: data.tenant,
      name: data.name,
      phone: data.phone,
      document: data.document,
      template: data.template,
      templateVersion: data.templateVersion,
      values: data.values,
    });
    return toRecord(doc);
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// fieldTemplate.repository.findTemplateById.
export const findById = async (tenantId: string, id: string): Promise<CustomerRecord | null> =>
  withDbTiming('customer.findById', async () => {
    const doc = await Customer.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpdateCustomerInput = {
  name?: string;
  phone?: string;
  document?: string;
  values: Record<string, unknown>;
  template: string;
  templateVersion: number;
};

// `values`/`template`/`templateVersion` são sempre reescritos (AD-029 — o
// service já resolveu o merge e o ponteiro corrente antes de chegar aqui);
// `name`/`phone`/`document` só entram no `$set` quando o service os enviou.
// Filtro tenant-scoped: um id de outro tenant não casa nenhum documento, e o
// service traduz `null` em 404 (AD-010).
export const updateCustomer = async (
  tenantId: string,
  id: string,
  data: UpdateCustomerInput,
): Promise<CustomerRecord | null> =>
  withDbTiming('customer.updateCustomer', async () => {
    const update: Record<string, unknown> = {
      values: data.values,
      template: data.template,
      templateVersion: data.templateVersion,
    };
    if (data.name !== undefined) update.name = data.name;
    if (data.phone !== undefined) update.phone = data.phone;
    if (data.document !== undefined) update.document = data.document;

    const doc = await Customer.findOneAndUpdate(tenantScoped({ Tenant: tenantId, _id: id }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

// Regex escapada: `q` é entrada livre do usuário (CORE-03) — sem isso, um
// caractere especial de regex (ex.: "(", "+") lançaria "Invalid regular
// expression" em vez de simplesmente não casar nada.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type ListCustomersInput = {
  page: number;
  limit: number;
  q?: string;
  sort: 'name' | 'createdAt';
  order: 'asc' | 'desc';
  status?: string;
  knownStatusKeys?: string[];
};

export type ListCustomersResult = {
  items: CustomerRecord[];
  total: number;
};

// `page`/`limit` chegam já clampados pelo service (T13) — este repositório
// confia neles, nunca reaplica o clamp (CORE-12 é responsabilidade de quem
// chama). `status` que não existir nas opções do template corrente
// simplesmente não casa nenhum documento — lista vazia, não erro (CORE-04,
// spec Edge Cases). `status=__none__` (WEB-02) é resolvido pelo service em
// `knownStatusKeys` — cobre num único filtro os dois casos de "sem status":
// a chave `values.status` nunca escrita E um valor gravado que não existe
// mais entre as opções correntes do template (status removido depois do
// Customer já ter sido classificado).
export const listCustomers = async (tenantId: string, query: ListCustomersInput): Promise<ListCustomersResult> =>
  withDbTiming('customer.listCustomers', async () => {
    const searchFilter = query.q
      ? { $or: [{ name: new RegExp(escapeRegExp(query.q), 'i') }, { phone: new RegExp(escapeRegExp(query.q), 'i') }] }
      : {};
    const statusFilter =
      query.status === undefined
        ? {}
        : query.status === NO_STATUS_FILTER_VALUE
          ? {
              $or: [
                { 'values.status': { $exists: false } },
                { 'values.status': { $nin: query.knownStatusKeys ?? [] } },
              ],
            }
          : { 'values.status': query.status };
    const filter = tenantScoped({ Tenant: tenantId, ...searchFilter, ...statusFilter });

    const sortSpec: Record<string, 1 | -1> = { [query.sort]: query.order === 'asc' ? 1 : -1 };
    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      Customer.find(filter).sort(sortSpec).skip(skip).limit(query.limit).lean(),
      Customer.countDocuments(filter),
    ]);

    return { items: docs.map(toRecord), total };
  });
