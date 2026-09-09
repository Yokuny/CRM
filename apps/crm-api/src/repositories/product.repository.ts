import type { ProductDocument } from '@crm/db';
import { Product, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type ProductRecord = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  price: number;
  stock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: ProductDocument): ProductRecord => ({
  id: doc._id.toString(),
  name: doc.name,
  sku: doc.sku,
  description: doc.description,
  price: doc.price,
  stock: doc.stock,
  active: doc.active,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateProductInput = {
  tenant: string;
  name: string;
  sku?: string;
  description?: string;
  price: number;
  stock: number;
  active?: boolean;
};

export const createProduct = async (data: CreateProductInput): Promise<ProductRecord> =>
  withDbTiming('product.createProduct', async () => {
    const doc = await Product.create({
      Tenant: data.tenant,
      name: data.name,
      sku: data.sku,
      description: data.description,
      price: data.price,
      stock: data.stock,
      active: data.active,
    });
    return toRecord(doc);
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// customer.repository.findById/process.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<ProductRecord | null> =>
  withDbTiming('product.findById', async () => {
    const doc = await Product.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpdateProductInput = {
  name?: string;
  sku?: string;
  description?: string;
  price?: number;
  stock?: number;
  active?: boolean;
};

// Só os campos informados entram no $set (spec.md AC3: "atualiza os campos
// informados") — mesmo padrão de customer.repository.updateCustomer, nunca
// sobrescreve um campo omitido com undefined.
export const updateProduct = async (
  tenantId: string,
  id: string,
  data: UpdateProductInput,
): Promise<ProductRecord | null> =>
  withDbTiming('product.updateProduct', async () => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.sku !== undefined) update.sku = data.sku;
    if (data.description !== undefined) update.description = data.description;
    if (data.price !== undefined) update.price = data.price;
    if (data.stock !== undefined) update.stock = data.stock;
    if (data.active !== undefined) update.active = data.active;

    const doc = await Product.findOneAndUpdate(tenantScoped({ Tenant: tenantId, _id: id }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

// Regex escapada: `name` é entrada livre do operador (spec.md AC2, "filtro
// opcional por nome") — mesmo padrão de customer.repository.escapeRegExp.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type ListProductsInput = {
  page: number;
  limit: number;
  name?: string;
  active?: boolean;
};

export type ListProductsResult = {
  items: ProductRecord[];
  total: number;
};

// `page`/`limit` chegam já clampados pelo service (mesma divisão de
// responsabilidade de customer.repository.listCustomers) — este repositório
// confia neles, nunca reaplica o clamp.
export const listProducts = async (tenantId: string, query: ListProductsInput): Promise<ListProductsResult> =>
  withDbTiming('product.listProducts', async () => {
    const nameFilter = query.name ? { name: new RegExp(escapeRegExp(query.name), 'i') } : {};
    const activeFilter = query.active === undefined ? {} : { active: query.active };
    const filter = tenantScoped({ Tenant: tenantId, ...nameFilter, ...activeFilter });

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Product.countDocuments(filter),
    ]);

    return { items: docs.map(toRecord), total };
  });
