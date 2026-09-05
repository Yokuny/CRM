import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Customer } from './customer.model.js';

const baseCustomer = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  name: 'Maria Silva',
  phone: '11912345678',
  template: new mongoose.Types.ObjectId(),
  templateVersion: 1,
  values: { status: 'novo' },
  ...overrides,
});

describe('Customer model', () => {
  useTestDb();

  // spec.md Assumption: dedup de Customer por telefone/documento repetido
  // está fora de escopo nesta rodada — nenhuma unicidade forçada.
  it('persists two customers sharing the same {Tenant,phone} without conflict', async () => {
    await Customer.init();
    const Tenant = new mongoose.Types.ObjectId();
    await Customer.create(baseCustomer(Tenant));

    const other = await Customer.create(baseCustomer(Tenant, { name: 'Maria Souza' }));

    expect(other.phone).toBe('11912345678');
    expect(await Customer.countDocuments({ Tenant, phone: '11912345678' })).toBe(2);
  });

  it('declares the {Tenant,name}, {Tenant,phone} and compound wildcard {Tenant,values.$**} indexes', async () => {
    await Customer.init();

    const indexes = await Customer.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, name: 1 }));
    expect(keys).toContain(JSON.stringify({ Tenant: 1, phone: 1 }));
    expect(keys).toContain(JSON.stringify({ Tenant: 1, 'values.$**': 1 }));
  });

  // AD-025: prova funcional de que o índice wildcard composto realmente serve
  // o filtro `values.status` usado pela listagem e pela coluna do kanban —
  // não só que o índice existe.
  it('returns only customers matching {Tenant, values.status} through the wildcard index', async () => {
    await Customer.init();
    const Tenant = new mongoose.Types.ObjectId();
    const otherTenant = new mongoose.Types.ObjectId();
    await Customer.create(baseCustomer(Tenant, { values: { status: 'novo' } }));
    await Customer.create(baseCustomer(Tenant, { name: 'Outro', values: { status: 'ativo' } }));
    await Customer.create(baseCustomer(otherTenant, { values: { status: 'novo' } }));

    const matches = await Customer.find({ Tenant, 'values.status': 'novo' }).lean();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.values).toEqual({ status: 'novo' });
  });

  it('persists an optional document field when provided, and omits it when absent', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const withDocument = await Customer.create(baseCustomer(Tenant, { document: '12345678900' }));
    const withoutDocument = await Customer.create(baseCustomer(Tenant, { name: 'Sem Documento' }));

    expect(withDocument.document).toBe('12345678900');
    expect(withoutDocument.document).toBeUndefined();
  });

  it('stamps createdAt/updatedAt via timestamps', async () => {
    const created = await Customer.create(baseCustomer(new mongoose.Types.ObjectId()));

    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });
});
