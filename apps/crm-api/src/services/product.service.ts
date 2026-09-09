import type { CreateProduct, UpdateProduct } from '@crm/contracts';
import type { ProductRecord } from '../repositories/product.repository.js';
import * as productRepository from '../repositories/product.repository.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// spec.md AC4: "price ou stock recebidos são negativos, ou name está
// ausente/vazio" → 400, sem criar/alterar o Product. A mesma checagem que o
// Zod já faz na borda HTTP (createProduct/updateProduct.schema.ts) é
// reafirmada aqui — o service não confia em nenhum chamador upstream para
// impor essa regra de negócio.
export class ProductValidationError extends Error {}

// AD-010: findById/updateProduct (product.repository, T5) já são
// tenant-scoped — um id de outro tenant simplesmente não existe para esta
// sessão, mesmo idioma 404 de customer.service.ts.
export class ProductNotFoundError extends Error {}

const validateProductInput = (data: { name?: string; price?: number; stock?: number }): void => {
  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new ProductValidationError('name é obrigatório');
  }
  if (data.price !== undefined && data.price < 0) {
    throw new ProductValidationError('price não pode ser negativo');
  }
  if (data.stock !== undefined && data.stock < 0) {
    throw new ProductValidationError('stock não pode ser negativo');
  }
};

export const createProduct = async (tenantId: string, data: CreateProduct): Promise<ProductRecord> => {
  validateProductInput(data);
  return productRepository.createProduct({
    tenant: tenantId,
    name: data.name,
    sku: data.sku,
    description: data.description,
    price: data.price,
    stock: data.stock,
    active: data.active,
  });
};

export const updateProduct = async (tenantId: string, id: string, data: UpdateProduct): Promise<ProductRecord> => {
  validateProductInput(data);
  const updated = await productRepository.updateProduct(tenantId, id, data);
  if (!updated) throw new ProductNotFoundError('Produto não encontrado');
  return updated;
};

export type ListProductsQuery = {
  page?: number;
  limit?: number;
  name?: string;
  active?: boolean;
};

// Mesmo clamp de page/limit de customer.service.ts (CORE-12) — o repository
// (T5) confia neles como já corretos e nunca reaplica o clamp.
const clampPage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
};

export const listProducts = async (
  tenantId: string,
  query: ListProductsQuery,
): Promise<{ items: ProductRecord[]; total: number }> =>
  productRepository.listProducts(tenantId, {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
    name: query.name,
    active: query.active,
  });
