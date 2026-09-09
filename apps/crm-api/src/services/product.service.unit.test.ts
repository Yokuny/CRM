import type { CreateProduct, UpdateProduct } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRecord } from '../repositories/product.repository.js';

const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const listProductsMock = vi.fn();

vi.mock('../repositories/product.repository.js', () => ({
  createProduct: (...args: unknown[]) => createProductMock(...args),
  updateProduct: (...args: unknown[]) => updateProductMock(...args),
  listProducts: (...args: unknown[]) => listProductsMock(...args),
}));

const TENANT_ID = 'tenant-1';

const sampleRecord = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: 'product-1',
  name: 'Produto',
  price: 1000,
  stock: 5,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('product.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProduct (spec.md AC4)', () => {
    it('throws ProductValidationError for a negative price, without calling the repository', async () => {
      const { createProduct, ProductValidationError } = await import('./product.service.js');
      const input = { name: 'Produto', price: -1, stock: 5 } as CreateProduct;

      await expect(createProduct(TENANT_ID, input)).rejects.toBeInstanceOf(ProductValidationError);
      expect(createProductMock).not.toHaveBeenCalled();
    });

    it('throws ProductValidationError for a negative stock, without calling the repository', async () => {
      const { createProduct, ProductValidationError } = await import('./product.service.js');
      const input = { name: 'Produto', price: 1000, stock: -1 } as CreateProduct;

      await expect(createProduct(TENANT_ID, input)).rejects.toBeInstanceOf(ProductValidationError);
      expect(createProductMock).not.toHaveBeenCalled();
    });

    it('throws ProductValidationError for an empty/whitespace-only name, without calling the repository', async () => {
      const { createProduct, ProductValidationError } = await import('./product.service.js');
      const input = { name: '   ', price: 1000, stock: 5 } as CreateProduct;

      await expect(createProduct(TENANT_ID, input)).rejects.toBeInstanceOf(ProductValidationError);
      expect(createProductMock).not.toHaveBeenCalled();
    });

    it('calls the repository with the tenant-scoped data and returns its result for a valid input', async () => {
      const { createProduct } = await import('./product.service.js');
      const record = sampleRecord();
      createProductMock.mockResolvedValueOnce(record);
      const input: CreateProduct = { name: 'Produto', price: 1000, stock: 5, active: true };

      const result = await createProduct(TENANT_ID, input);

      expect(createProductMock).toHaveBeenCalledWith({
        tenant: TENANT_ID,
        name: 'Produto',
        sku: undefined,
        description: undefined,
        price: 1000,
        stock: 5,
        active: true,
      });
      expect(result).toBe(record);
    });
  });

  describe('updateProduct (spec.md AC3/AC4)', () => {
    it('throws ProductValidationError for a negative price, without calling the repository', async () => {
      const { updateProduct, ProductValidationError } = await import('./product.service.js');
      const input = { price: -1 } as UpdateProduct;

      await expect(updateProduct(TENANT_ID, 'product-1', input)).rejects.toBeInstanceOf(ProductValidationError);
      expect(updateProductMock).not.toHaveBeenCalled();
    });

    it('throws ProductNotFoundError when the repository finds no Product for this tenant/id', async () => {
      const { updateProduct, ProductNotFoundError } = await import('./product.service.js');
      updateProductMock.mockResolvedValueOnce(null);

      await expect(updateProduct(TENANT_ID, 'missing-id', { stock: 10 })).rejects.toBeInstanceOf(ProductNotFoundError);
    });

    it('returns the repository result for a valid update', async () => {
      const { updateProduct } = await import('./product.service.js');
      const record = sampleRecord({ stock: 10 });
      updateProductMock.mockResolvedValueOnce(record);

      const result = await updateProduct(TENANT_ID, 'product-1', { stock: 10 });

      expect(updateProductMock).toHaveBeenCalledWith(TENANT_ID, 'product-1', { stock: 10 });
      expect(result).toBe(record);
    });
  });

  describe('listProducts', () => {
    it('clamps an out-of-range page/limit before delegating to the repository (CORE-12 convention)', async () => {
      const { listProducts } = await import('./product.service.js');
      listProductsMock.mockResolvedValueOnce({ items: [], total: 0 });

      await listProducts(TENANT_ID, { page: -5, limit: 99999 });

      expect(listProductsMock).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        limit: 100,
        name: undefined,
        active: undefined,
      });
    });

    it('passes name/active filters through untouched and returns the repository result', async () => {
      const { listProducts } = await import('./product.service.js');
      const repositoryResult = { items: [sampleRecord()], total: 1 };
      listProductsMock.mockResolvedValueOnce(repositoryResult);

      const result = await listProducts(TENANT_ID, { page: 2, limit: 10, name: 'camiseta', active: true });

      expect(listProductsMock).toHaveBeenCalledWith(TENANT_ID, { page: 2, limit: 10, name: 'camiseta', active: true });
      expect(result).toBe(repositoryResult);
    });
  });
});
