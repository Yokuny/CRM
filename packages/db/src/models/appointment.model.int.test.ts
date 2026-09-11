import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Appointment } from './appointment.model.js';

const baseAppointment = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  kind: 'appointment' as const,
  professional: new mongoose.Types.ObjectId(),
  customer: new mongoose.Types.ObjectId(),
  start: new Date('2026-09-15T12:00:00.000Z'),
  end: new Date('2026-09-15T12:30:00.000Z'),
  status: 'pending' as const,
  source: 'ai' as const,
  ...overrides,
});

describe('Appointment model', () => {
  useTestDb();

  describe('customer obrigatório só quando kind=appointment (SCH-33)', () => {
    it('rejects a kind=appointment document without customer', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const { customer: _customer, ...withoutCustomer } = baseAppointment(Tenant);

      await expect(Appointment.create(withoutCustomer)).rejects.toThrow();
    });

    it('accepts a kind=block document without customer', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const { customer: _customer, ...withoutCustomer } = baseAppointment(Tenant, {
        kind: 'block',
        status: 'confirmed',
        source: 'operator',
        title: 'Almoço',
      });

      const created = await Appointment.create(withoutCustomer);

      expect(created.kind).toBe('block');
      expect(created.customer).toBeUndefined();
    });
  });

  describe('enums (status, source)', () => {
    it('accepts exactly the 6 documented status values', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const statuses = ['pending', 'confirmed', 'completed', 'no_show', 'canceled_by_customer', 'canceled_by_operator'] as const;

      for (const [index, status] of statuses.entries()) {
        const created = await Appointment.create(
          baseAppointment(Tenant, { status, start: new Date(Date.UTC(2026, 8, 15, 12 + index)), end: new Date(Date.UTC(2026, 8, 15, 13 + index)) }),
        );
        expect(created.status).toBe(status);
      }
    });

    it('rejects a status outside the enum', async () => {
      const Tenant = new mongoose.Types.ObjectId();

      await expect(Appointment.create(baseAppointment(Tenant, { status: 'archived' }))).rejects.toThrow();
    });

    it('accepts only source ai|operator, rejects anything else', async () => {
      const Tenant = new mongoose.Types.ObjectId();

      const ai = await Appointment.create(baseAppointment(Tenant, { source: 'ai' }));
      const operator = await Appointment.create(
        baseAppointment(Tenant, { source: 'operator', start: new Date('2026-09-15T13:00:00.000Z'), end: new Date('2026-09-15T13:30:00.000Z') }),
      );
      expect(ai.source).toBe('ai');
      expect(operator.source).toBe('operator');

      await expect(Appointment.create(baseAppointment(Tenant, { source: 'system' }))).rejects.toThrow();
    });
  });

  describe('índice único parcial {Tenant,professional,start} (SCH-20)', () => {
    it('rejects a second active (pending/confirmed) insert at the same triple with E11000', async () => {
      await Appointment.init();
      const Tenant = new mongoose.Types.ObjectId();
      const professional = new mongoose.Types.ObjectId();
      const start = new Date('2026-09-15T12:00:00.000Z');
      const end = new Date('2026-09-15T12:30:00.000Z');

      await Appointment.create(baseAppointment(Tenant, { professional, start, end, status: 'pending' }));

      await expect(
        Appointment.create(baseAppointment(Tenant, { professional, start, end, status: 'confirmed', customer: new mongoose.Types.ObjectId() })),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('accepts a new active insert at the same triple after the first is canceled', async () => {
      await Appointment.init();
      const Tenant = new mongoose.Types.ObjectId();
      const professional = new mongoose.Types.ObjectId();
      const start = new Date('2026-09-15T12:00:00.000Z');
      const end = new Date('2026-09-15T12:30:00.000Z');

      const first = await Appointment.create(baseAppointment(Tenant, { professional, start, end, status: 'pending' }));
      await Appointment.updateOne({ _id: first._id }, { status: 'canceled_by_customer' });

      const second = await Appointment.create(
        baseAppointment(Tenant, { professional, start, end, status: 'pending', customer: new mongoose.Types.ObjectId() }),
      );

      expect(second._id).toBeDefined();
      await expect(Appointment.countDocuments({ Tenant, professional, start })).resolves.toBe(2);
    });

    it('lets two independently canceled_by_customer rows coexist at the same triple', async () => {
      await Appointment.init();
      const Tenant = new mongoose.Types.ObjectId();
      const professional = new mongoose.Types.ObjectId();
      const start = new Date('2026-09-15T12:00:00.000Z');
      const end = new Date('2026-09-15T12:30:00.000Z');

      await Appointment.create(baseAppointment(Tenant, { professional, start, end, status: 'canceled_by_customer' }));
      await Appointment.create(
        baseAppointment(Tenant, { professional, start, end, status: 'canceled_by_customer', customer: new mongoose.Types.ObjectId() }),
      );

      await expect(Appointment.countDocuments({ Tenant, professional, start, status: 'canceled_by_customer' })).resolves.toBe(2);
    });

    it('declares the index as unique and partial on status pending|confirmed', async () => {
      await Appointment.init();

      const indexes = await Appointment.collection.indexes();
      const tripleIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ Tenant: 1, professional: 1, start: 1 }));

      expect(tripleIndex?.unique).toBe(true);
      expect(tripleIndex?.partialFilterExpression).toEqual({ status: { $in: ['pending', 'confirmed'] } });
    });
  });

  describe('demais índices', () => {
    it('declares {Tenant,start} and {Tenant,customer,start}', async () => {
      await Appointment.init();

      const indexes = await Appointment.collection.indexes();
      const keys = indexes.map((index) => JSON.stringify(index.key));

      expect(keys).toContain(JSON.stringify({ Tenant: 1, start: 1 }));
      expect(keys).toContain(JSON.stringify({ Tenant: 1, customer: 1, start: 1 }));
    });

    it('declares confirmationTokenHash as unique and sparse', async () => {
      await Appointment.init();

      const indexes = await Appointment.collection.indexes();
      const tokenIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ confirmationTokenHash: 1 }));

      expect(tokenIndex?.unique).toBe(true);
      expect(tokenIndex?.sparse).toBe(true);
    });

    it('allows multiple documents with no confirmationTokenHash (sparse — they never collide)', async () => {
      const Tenant = new mongoose.Types.ObjectId();

      const first = await Appointment.create(
        baseAppointment(Tenant, { start: new Date('2026-09-15T12:00:00.000Z'), end: new Date('2026-09-15T12:30:00.000Z') }),
      );
      const second = await Appointment.create(
        baseAppointment(Tenant, { start: new Date('2026-09-15T13:00:00.000Z'), end: new Date('2026-09-15T13:30:00.000Z') }),
      );

      expect(first.confirmationTokenHash).toBeUndefined();
      expect(second.confirmationTokenHash).toBeUndefined();
    });

    it('rejects a second document with the same confirmationTokenHash', async () => {
      await Appointment.init();
      const Tenant = new mongoose.Types.ObjectId();
      const sharedHash = 'a'.repeat(64);

      await Appointment.create(
        baseAppointment(Tenant, { confirmationTokenHash: sharedHash, start: new Date('2026-09-15T12:00:00.000Z'), end: new Date('2026-09-15T12:30:00.000Z') }),
      );

      await expect(
        Appointment.create(
          baseAppointment(Tenant, { confirmationTokenHash: sharedHash, start: new Date('2026-09-15T13:00:00.000Z'), end: new Date('2026-09-15T13:30:00.000Z') }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
    });
  });
});
