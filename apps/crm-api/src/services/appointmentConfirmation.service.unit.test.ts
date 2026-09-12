import { beforeEach, describe, expect, it, vi } from 'vitest';

const appointmentFindOneMock = vi.fn();
const professionalFindOneMock = vi.fn();
const spaceFindOneMock = vi.fn();
const customerFindOneMock = vi.fn();
const hashTokenMock = vi.fn((token: string) => `hash-of-${token}`);
const confirmByTokenTransitionMock = vi.fn();
const cancelByTokenTransitionMock = vi.fn();

// `.select('name').lean()` encadeado (Professional/Space/Customer) — mock
// mínimo que só precisa devolver a Promise no fim da cadeia.
const selectableChain = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

vi.mock('@crm/db', () => ({
  Appointment: { findOne: (...args: unknown[]) => appointmentFindOneMock(...args) },
  Professional: { findOne: (...args: unknown[]) => professionalFindOneMock(...args) },
  Space: { findOne: (...args: unknown[]) => spaceFindOneMock(...args) },
  Customer: { findOne: (...args: unknown[]) => customerFindOneMock(...args) },
  tenantScoped: (filter: unknown) => filter,
  hashToken: (...args: [string]) => hashTokenMock(...args),
  confirmByToken: (...args: unknown[]) => confirmByTokenTransitionMock(...args),
  cancelByToken: (...args: unknown[]) => cancelByTokenTransitionMock(...args),
  dateInDisplayTz: () => '2026-09-15',
  timeInDisplayTz: () => '14:00',
}));

const TENANT_ID = 'tenant-1';
const PROFESSIONAL_ID = 'professional-1';
const SPACE_ID = 'space-1';
const CUSTOMER_ID = 'customer-1';

const sampleAppointment = (overrides: Partial<Record<string, unknown>> = {}) => ({
  _id: 'appointment-1',
  Tenant: TENANT_ID,
  kind: 'appointment',
  professional: PROFESSIONAL_ID,
  space: SPACE_ID,
  customer: CUSTOMER_ID,
  start: new Date('2026-09-15T17:00:00.000Z'),
  end: new Date('2026-09-15T17:30:00.000Z'),
  status: 'pending',
  source: 'ai',
  confirmationTokenHash: 'hash-of-plain-token',
  confirmationExpiresAt: new Date('2026-09-15T17:30:00.000Z'),
  ...overrides,
});

describe('appointmentConfirmation.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    professionalFindOneMock.mockReturnValue(selectableChain({ name: 'Dra. Ana' }));
    spaceFindOneMock.mockReturnValue(selectableChain({ name: 'Sala 1' }));
    customerFindOneMock.mockReturnValue(selectableChain({ name: 'Cliente Teste' }));
  });

  describe('getByToken (spec.md SCH-22/SCH-23)', () => {
    it('throws AppointmentConfirmationNotFoundError (->404) when no Appointment matches the hash', async () => {
      const { getByToken, AppointmentConfirmationNotFoundError } = await import('./appointmentConfirmation.service.js');
      appointmentFindOneMock.mockReturnValue({ lean: () => Promise.resolve(null) });

      await expect(getByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationNotFoundError);
      expect(hashTokenMock).toHaveBeenCalledWith('plain-token');
    });

    it('throws AppointmentConfirmationExpiredError (->410) when confirmationExpiresAt is in the past', async () => {
      const { getByToken, AppointmentConfirmationExpiredError } = await import('./appointmentConfirmation.service.js');
      appointmentFindOneMock.mockReturnValue({
        lean: () => Promise.resolve(sampleAppointment({ confirmationExpiresAt: new Date(Date.now() - 60_000) })),
      });

      await expect(getByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationExpiredError);
    });

    it('returns only the public fields — date, time, professionalName, spaceName, customerName, status — for a valid token', async () => {
      const { getByToken } = await import('./appointmentConfirmation.service.js');
      appointmentFindOneMock.mockReturnValue({ lean: () => Promise.resolve(sampleAppointment()) });

      const result = await getByToken('plain-token');

      expect(result).toEqual({
        date: '2026-09-15',
        time: '14:00',
        professionalName: 'Dra. Ana',
        spaceName: 'Sala 1',
        customerName: 'Cliente Teste',
        status: 'pending',
      });
      expect(Object.keys(result)).not.toContain('_id');
      expect(Object.keys(result)).not.toContain('professional');
      expect(Object.keys(result)).not.toContain('customer');
    });
  });

  describe('confirmByToken — code -> typed error, translated by the controller to HTTP (spec.md SCH-25)', () => {
    it('code:not_found -> AppointmentConfirmationNotFoundError (controller maps to 404)', async () => {
      const { confirmByToken, AppointmentConfirmationNotFoundError } = await import(
        './appointmentConfirmation.service.js'
      );
      confirmByTokenTransitionMock.mockResolvedValueOnce({ error: 'não encontrado', code: 'not_found' });

      await expect(confirmByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationNotFoundError);
    });

    it('code:expired -> AppointmentConfirmationExpiredError (controller maps to 410)', async () => {
      const { confirmByToken, AppointmentConfirmationExpiredError } = await import(
        './appointmentConfirmation.service.js'
      );
      confirmByTokenTransitionMock.mockResolvedValueOnce({ error: 'expirado', code: 'expired' });

      await expect(confirmByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationExpiredError);
    });

    it('code:terminal -> AppointmentConfirmationTerminalError (controller maps to 409)', async () => {
      const { confirmByToken, AppointmentConfirmationTerminalError } = await import(
        './appointmentConfirmation.service.js'
      );
      confirmByTokenTransitionMock.mockResolvedValueOnce({ error: 'terminal', code: 'terminal' });

      await expect(confirmByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationTerminalError);
    });

    it('on success, hashes the token and returns the same public-safe shape as getByToken', async () => {
      const { confirmByToken } = await import('./appointmentConfirmation.service.js');
      confirmByTokenTransitionMock.mockResolvedValueOnce(sampleAppointment({ status: 'confirmed' }));

      const result = await confirmByToken('plain-token');

      expect(confirmByTokenTransitionMock).toHaveBeenCalledWith('hash-of-plain-token');
      expect(result.status).toBe('confirmed');
    });
  });

  describe('cancelByToken — reuses the same code -> typed error translation (spec.md SCH-26)', () => {
    it('code:not_found -> AppointmentConfirmationNotFoundError', async () => {
      const { cancelByToken, AppointmentConfirmationNotFoundError } = await import(
        './appointmentConfirmation.service.js'
      );
      cancelByTokenTransitionMock.mockResolvedValueOnce({ error: 'não encontrado', code: 'not_found' });

      await expect(cancelByToken('plain-token')).rejects.toBeInstanceOf(AppointmentConfirmationNotFoundError);
    });

    it('on success, returns status canceled_by_customer', async () => {
      const { cancelByToken } = await import('./appointmentConfirmation.service.js');
      cancelByTokenTransitionMock.mockResolvedValueOnce(sampleAppointment({ status: 'canceled_by_customer' }));

      const result = await cancelByToken('plain-token');

      expect(cancelByTokenTransitionMock).toHaveBeenCalledWith('hash-of-plain-token');
      expect(result.status).toBe('canceled_by_customer');
    });
  });
});
