import crypto from 'node:crypto';
import { connect, disconnect, Product } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { searchProducts } from './searchProducts.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de openProcess.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

describe('searchProducts tool (spec.md P1 "Cliente pesquisa produtos"/AC1/AC2)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Product.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('returns only active Products of the ToolContext Tenant, never active:false or another tenant', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    const active = await Product.create({ Tenant: tenant, name: 'Camiseta Azul', price: 1000, stock: 5, active: true });
    await Product.create({ Tenant: tenant, name: 'Inativo', price: 1000, stock: 5, active: false });
    await Product.create({ Tenant: otherTenant, name: 'De Outro Tenant', price: 1000, stock: 5, active: true });

    const result = await searchProducts({}, baseCtx(tenant));

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe(active._id.toString());
    expect(result.products[0]?.name).toBe('Camiseta Azul');
    expect(result.products[0]?.price).toBe(1000);
    expect(result.products[0]?.stock).toBe(5);
  });

  it('without query, returns the 5 most recently created active Products, never more than 5', async () => {
    const tenant = randomId();
    for (let i = 0; i < 7; i += 1) {
      await Product.create({ Tenant: tenant, name: `Produto ${i}`, price: 1000, stock: 5, active: true });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const result = await searchProducts({}, baseCtx(tenant));

    expect(result.products).toHaveLength(5);
    expect(result.products.map((p) => p.name)).toEqual([
      'Produto 6',
      'Produto 5',
      'Produto 4',
      'Produto 3',
      'Produto 2',
    ]);
  });

  it('with query, filters by name case-insensitively, never by description (design.md Tech Decisions)', async () => {
    const tenant = randomId();
    await Product.create({ Tenant: tenant, name: 'Camiseta Azul', price: 1000, stock: 5, active: true });
    await Product.create({ Tenant: tenant, name: 'Calça Preta', price: 2000, stock: 3, active: true });
    await Product.create({
      Tenant: tenant,
      name: 'Sem Relação',
      description: 'camiseta esportiva',
      price: 3000,
      stock: 1,
      active: true,
    });

    const result = await searchProducts({ query: 'CAMISETA' }, baseCtx(tenant));

    expect(result.products.map((p) => p.name)).toEqual(['Camiseta Azul']);
  });

  it('returns an empty array (never {error}) when no active Product matches the query (spec.md AC2)', async () => {
    const tenant = randomId();
    await Product.create({ Tenant: tenant, name: 'Camiseta Azul', price: 1000, stock: 5, active: true });

    const result = await searchProducts({ query: 'produto-inexistente' }, baseCtx(tenant));

    expect(result).toEqual({ products: [] });
  });
});
