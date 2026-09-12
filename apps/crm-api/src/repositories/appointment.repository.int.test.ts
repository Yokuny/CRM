import crypto from 'node:crypto';
import { Appointment, Channel, Conversation, Customer, connect, disconnect, Professional, Space } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as appointmentRepository from './appointment.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de order.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedProfessional = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Professional.create({
    Tenant: tenantId,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
    ...overrides,
  });

const seedSpace = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Space.create({ Tenant: tenantId, name: 'Sala 1', ...overrides });

const seedCustomer = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
    ...overrides,
  });

const seedAppointment = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Appointment.create({
    Tenant: tenantId,
    kind: 'appointment',
    professional: randomId(),
    customer: randomId(),
    start: new Date('2026-09-15T12:00:00.000Z'),
    end: new Date('2026-09-15T12:30:00.000Z'),
    status: 'pending',
    source: 'ai',
    ...overrides,
  });

const seedBlock = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Appointment.create({
    Tenant: tenantId,
    kind: 'block',
    professional: randomId(),
    title: 'Bloqueio',
    start: new Date('2026-09-15T12:00:00.000Z'),
    end: new Date('2026-09-15T13:00:00.000Z'),
    status: 'confirmed',
    source: 'operator',
    ...overrides,
  });

// findLatestConversationIdByCustomer (T44): cada Conversation precisa do
// próprio Channel — {Channel,Customer} é único no schema, então duas
// Conversation do mesmo cliente exigem dois Channel distintos.
const seedConversation = async (
  tenantId: string,
  customerId: string,
  overrides: Partial<Record<string, unknown>> = {},
) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  return Conversation.create({
    Tenant: tenantId,
    Channel: channel._id,
    Customer: customerId,
    mode: 'bot',
    lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
};

describe('appointment.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      Space.deleteMany({}),
      Customer.deleteMany({}),
      Conversation.deleteMany({}),
      Channel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('listByRange (SCH-29)', () => {
    it('returns both appointments and blocks within the half-open range [from, to)', async () => {
      const tenantId = randomId();
      const inRangeAppointment = await seedAppointment(tenantId, { start: new Date('2026-09-15T12:00:00.000Z') });
      const inRangeBlock = await seedBlock(tenantId, { start: new Date('2026-09-15T14:00:00.000Z') });
      // Exatamente no limite inferior (incluído) e um instante antes do
      // limite superior (incluído) — provam a inclusão das duas pontas.
      const atFromBoundary = await seedAppointment(tenantId, { start: new Date('2026-09-15T00:00:00.000Z') });

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      const ids = result.map((item) => item.id).sort();
      expect(ids).toEqual(
        [inRangeAppointment._id.toString(), inRangeBlock._id.toString(), atFromBoundary._id.toString()].sort(),
      );
      expect(result.find((item) => item.id === inRangeBlock._id.toString())?.kind).toBe('block');
    });

    it('excludes an appointment starting exactly at `to` (exclusive upper bound) and one before `from`', async () => {
      const tenantId = randomId();
      await seedAppointment(tenantId, { start: new Date('2026-09-16T00:00:00.000Z') }); // == to, excluded
      await seedAppointment(tenantId, { start: new Date('2026-09-14T23:59:59.000Z') }); // < from, excluded
      const included = await seedAppointment(tenantId, { start: new Date('2026-09-15T10:00:00.000Z') });

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      expect(result.map((item) => item.id)).toEqual([included._id.toString()]);
    });

    it('filters by professionalId and spaceId when given', async () => {
      const tenantId = randomId();
      const professional = await seedProfessional(tenantId);
      const otherProfessional = await seedProfessional(tenantId);
      const space = await seedSpace(tenantId);
      const matching = await seedAppointment(tenantId, {
        professional: professional._id,
        space: space._id,
        start: new Date('2026-09-15T10:00:00.000Z'),
      });
      await seedAppointment(tenantId, {
        professional: otherProfessional._id,
        start: new Date('2026-09-15T11:00:00.000Z'),
      });

      const byProfessional = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
        professional._id.toString(),
      );
      expect(byProfessional.map((item) => item.id)).toEqual([matching._id.toString()]);

      const bySpace = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
        undefined,
        space._id.toString(),
      );
      expect(bySpace.map((item) => item.id)).toEqual([matching._id.toString()]);
    });

    it('resolves customer/professional/space names via a batch lookup', async () => {
      const tenantId = randomId();
      const professional = await seedProfessional(tenantId, { name: 'Dr. João' });
      const space = await seedSpace(tenantId, { name: 'Consultório 2' });
      const customer = await seedCustomer(tenantId, { name: 'Maria Cliente' });
      await seedAppointment(tenantId, { professional: professional._id, space: space._id, customer: customer._id });

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      expect(result[0]?.professionalName).toBe('Dr. João');
      expect(result[0]?.spaceName).toBe('Consultório 2');
      expect(result[0]?.customerName).toBe('Maria Cliente');
    });

    it('a Customer that no longer exists does NOT remove the Appointment from the list — it just comes back without a name', async () => {
      const tenantId = randomId();
      const deletedCustomerId = randomId();
      const created = await seedAppointment(tenantId, { customer: deletedCustomerId });

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      expect(result.map((item) => item.id)).toContain(created._id.toString());
      const found = result.find((item) => item.id === created._id.toString());
      expect(found?.customer).toBe(deletedCustomerId);
      expect(found?.customerName).toBeUndefined();
    });

    it('never returns another tenant Appointment (AD-010)', async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      await seedAppointment(otherTenant);
      const own = await seedAppointment(tenantId);

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      expect(result.map((item) => item.id)).toEqual([own._id.toString()]);
    });

    it('a pending Appointment whose start has already passed comes back with status EXACTLY as stored — read never transforms (SCH-35)', async () => {
      const tenantId = randomId();
      const pastStart = new Date('2026-09-15T08:00:00.000Z');
      const created = await seedAppointment(tenantId, { start: pastStart, status: 'pending' });

      const result = await appointmentRepository.listByRange(
        tenantId,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-16T00:00:00.000Z'),
      );

      const found = result.find((item) => item.id === created._id.toString());
      expect(found?.status).toBe('pending');
    });
  });

  describe('findById (AD-010)', () => {
    it('returns the Appointment with resolved names for its own tenant', async () => {
      const tenantId = randomId();
      const professional = await seedProfessional(tenantId, { name: 'Dra. Ana' });
      const customer = await seedCustomer(tenantId, { name: 'João Cliente' });
      const created = await seedAppointment(tenantId, { professional: professional._id, customer: customer._id });

      const result = await appointmentRepository.findById(tenantId, created._id.toString());

      expect(result?.id).toBe(created._id.toString());
      expect(result?.professionalName).toBe('Dra. Ana');
      expect(result?.customerName).toBe('João Cliente');
    });

    it('returns null for an Appointment belonging to a DIFFERENT tenant', async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await seedAppointment(owner);

      const result = await appointmentRepository.findById(intruder, created._id.toString());

      expect(result).toBeNull();
    });

    it('a pending Appointment whose start has already passed comes back with status EXACTLY as stored — read never transforms (SCH-35)', async () => {
      const tenantId = randomId();
      const created = await seedAppointment(tenantId, {
        start: new Date('2026-01-01T00:00:00.000Z'),
        status: 'pending',
      });

      const result = await appointmentRepository.findById(tenantId, created._id.toString());

      expect(result?.status).toBe('pending');
    });
  });

  describe('findNextActiveByCustomer (SCH-38)', () => {
    it('returns the earliest pending/confirmed future Appointment of the customer', async () => {
      const tenantId = randomId();
      const customerId = randomId();
      const later = await seedAppointment(tenantId, {
        customer: customerId,
        start: new Date('2026-10-01T10:00:00.000Z'),
      });
      const earlier = await seedAppointment(tenantId, {
        customer: customerId,
        start: new Date('2026-09-20T10:00:00.000Z'),
        status: 'confirmed',
      });

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result?.id).toBe(earlier._id.toString());
      expect(later).toBeDefined();
    });

    it('excludes blocks even when they share the customer field pattern (kind must be appointment)', async () => {
      const tenantId = randomId();
      const customerId = randomId();
      await seedBlock(tenantId, { start: new Date('2026-09-20T10:00:00.000Z') });

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });

    it('excludes an Appointment whose start already passed', async () => {
      const tenantId = randomId();
      const customerId = randomId();
      await seedAppointment(tenantId, { customer: customerId, start: new Date('2026-09-10T10:00:00.000Z') });

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });

    it('excludes a terminal (canceled/completed) Appointment', async () => {
      const tenantId = randomId();
      const customerId = randomId();
      await seedAppointment(tenantId, {
        customer: customerId,
        start: new Date('2026-09-20T10:00:00.000Z'),
        status: 'canceled_by_customer',
      });

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });

    it('returns null when the customer has no active future Appointment', async () => {
      const tenantId = randomId();
      const customerId = randomId();

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });

    it('never returns another tenant Appointment for the same customer id (AD-010)', async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      const customerId = randomId();
      await seedAppointment(otherTenant, { customer: customerId, start: new Date('2026-09-20T10:00:00.000Z') });

      const result = await appointmentRepository.findNextActiveByCustomer(
        tenantId,
        customerId,
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });
  });

  describe('findLatestConversationIdByCustomer (T44, SCH-39/40)', () => {
    it("returns the id of the customer's Conversation", async () => {
      // {Channel,Customer} é único e Channel é único por Tenant (um único
      // canal de WhatsApp por tenant, AD-005) — um Customer nunca tem mais
      // de UMA Conversation sob o mesmo Tenant hoje; `sort(lastActivityAt)`
      // é defensivo para quando isso deixar de valer, não testável como
      // "múltiplas, escolhe a mais recente" sem violar o índice único real.
      const tenantId = randomId();
      const customer = await seedCustomer(tenantId);
      const conversation = await seedConversation(tenantId, customer._id.toString());

      const result = await appointmentRepository.findLatestConversationIdByCustomer(tenantId, customer._id.toString());

      expect(result).toBe(conversation._id.toString());
    });

    it('returns null when the customer has no Conversation yet — a valid state, never an error', async () => {
      const tenantId = randomId();
      const customer = await seedCustomer(tenantId);

      const result = await appointmentRepository.findLatestConversationIdByCustomer(tenantId, customer._id.toString());

      expect(result).toBeNull();
    });

    it('never returns a Conversation belonging to a DIFFERENT tenant for the same customer id (AD-010)', async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      const customer = await seedCustomer(tenantId);
      await seedConversation(otherTenant, customer._id.toString());

      const result = await appointmentRepository.findLatestConversationIdByCustomer(tenantId, customer._id.toString());

      expect(result).toBeNull();
    });
  });
});
