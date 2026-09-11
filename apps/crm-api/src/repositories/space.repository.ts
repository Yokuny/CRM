import type { SpaceDocument } from '@crm/db';
import { Space, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type SpaceRecord = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: SpaceDocument): SpaceRecord => ({
  id: doc._id.toString(),
  name: doc.name,
  active: doc.active,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateSpaceInput = {
  tenant: string;
  name: string;
};

export const createSpace = async (data: CreateSpaceInput): Promise<SpaceRecord> =>
  withDbTiming('space.createSpace', async () => {
    const doc = await Space.create({ Tenant: data.tenant, name: data.name });
    return toRecord(doc);
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// product.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<SpaceRecord | null> =>
  withDbTiming('space.findById', async () => {
    const doc = await Space.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpdateSpaceInput = {
  name?: string;
  active?: boolean;
};

// Só os campos informados entram no $set — mesmo padrão de
// product.repository.updateProduct.
export const updateSpace = async (tenantId: string, id: string, data: UpdateSpaceInput): Promise<SpaceRecord | null> =>
  withDbTiming('space.updateSpace', async () => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.active !== undefined) update.active = data.active;

    const doc = await Space.findOneAndUpdate(tenantScoped({ Tenant: tenantId, _id: id }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

export type ListSpacesInput = {
  page: number;
  limit: number;
  active?: boolean;
};

export type ListSpacesResult = {
  items: SpaceRecord[];
  total: number;
};

// `page`/`limit` chegam já clampados pelo service (mesma divisão de
// responsabilidade de product.repository.listProducts) — este repositório
// confia neles, nunca reaplica o clamp.
export const listSpaces = async (tenantId: string, query: ListSpacesInput): Promise<ListSpacesResult> =>
  withDbTiming('space.listSpaces', async () => {
    const activeFilter = query.active === undefined ? {} : { active: query.active };
    const filter = tenantScoped({ Tenant: tenantId, ...activeFilter });

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Space.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Space.countDocuments(filter),
    ]);

    return { items: docs.map(toRecord), total };
  });
