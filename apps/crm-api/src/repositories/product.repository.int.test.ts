import crypto from 'node:crypto';
import { connect, disconnect, Product } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as productRepository from './product.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de channel.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

describe('product.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Product.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createProduct', () => {
    it('persists Tenant from the tenantId parameter (AD-010, spec.md AC1)', async () => {
      const tenantId = randomId();

      const result = await productRepository.createProduct({
        tenant: tenantId,
        name: 'Produto',
        price: 1000,
        stock: 5,
      });

      const persisted = await Product.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
    });

    it('defaults active to true when omitted (spec.md AC1: "com active default true")', async () => {
      const result = await productRepository.createProduct({
        tenant: randomId(),
        name: 'Produto',
        price: 1000,
        stock: 5,
      });

      expect(result.active).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns null for a Product that belongs to a DIFFERENT tenant (AD-010)', async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await productRepository.createProduct({ tenant: owner, name: 'Produto', price: 1000, stock: 5 });

      const result = await productRepository.findById(intruder, created.id);

      expect(result).toBeNull();
    });

    it('returns the Product for its own tenant', async () => {
      const tenantId = randomId();
      const created = await productRepository.createProduct({
        tenant: tenantId,
        name: 'Produto',
        price: 1000,
        stock: 5,
      });

      const result = await productRepository.findById(tenantId, created.id);

      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe('Produto');
    });
  });

  describe('updateProduct', () => {
    it('updates only the fields provided, leaving the rest untouched (spec.md AC3: "atualiza os campos informados")', async () => {
      const tenantId = randomId();
      const created = await productRepository.createProduct({
        tenant: tenantId,
        name: 'Produto Original',
        price: 1000,
        stock: 5,
      });

      const result = await productRepository.updateProduct(tenantId, created.id, { stock: 20 });

      expect(result?.stock).toBe(20);
      expect(result?.name).toBe('Produto Original');
      expect(result?.price).toBe(1000);
    });

    it("returns null and leaves the Product untouched for a DIFFERENT tenant's id (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await productRepository.createProduct({ tenant: owner, name: 'Produto', price: 1000, stock: 5 });

      const result = await productRepository.updateProduct(intruder, created.id, { stock: 999 });

      expect(result).toBeNull();
      const persisted = await Product.findById(created.id).lean();
      expect(persisted?.stock).toBe(5);
    });
  });

  describe('listProducts', () => {
    it('filters by name, case-insensitively (spec.md AC2: "filtro opcional por nome")', async () => {
      const tenantId = randomId();
      await productRepository.createProduct({ tenant: tenantId, name: 'Camiseta Azul', price: 1000, stock: 5 });
      await productRepository.createProduct({ tenant: tenantId, name: 'Calça Preta', price: 2000, stock: 3 });

      const result = await productRepository.listProducts(tenantId, { page: 1, limit: 20, name: 'camiseta' });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.name)).toEqual(['Camiseta Azul']);
    });

    it('filters by active (spec.md AC2: "filtro opcional por ... active")', async () => {
      const tenantId = randomId();
      await productRepository.createProduct({ tenant: tenantId, name: 'Ativo', price: 1000, stock: 5, active: true });
      await productRepository.createProduct({
        tenant: tenantId,
        name: 'Inativo',
        price: 1000,
        stock: 5,
        active: false,
      });

      const result = await productRepository.listProducts(tenantId, { page: 1, limit: 20, active: false });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.name)).toEqual(['Inativo']);
    });

    it("never returns another tenant's Product and respects pagination (AD-010)", async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      await productRepository.createProduct({ tenant: otherTenant, name: 'De Outro Tenant', price: 1000, stock: 5 });
      for (let i = 0; i < 3; i += 1) {
        await productRepository.createProduct({ tenant: tenantId, name: `Produto ${i}`, price: 1000, stock: 5 });
      }

      const result = await productRepository.listProducts(tenantId, { page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.name !== 'De Outro Tenant')).toBe(true);
    });
  });
});
