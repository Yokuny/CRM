import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '../repositories/appointment.repository.js';

const listByRangeMock = vi.fn();
const findByIdMock = vi.fn();
const findNextActiveByCustomerMock = vi.fn();
const professionalFindByIdMock = vi.fn();
const customerFindByIdMock = vi.fn();

const createManualAppointmentMock = vi.fn();
const createBlockMock = vi.fn();
const deleteBlockMock = vi.fn();
const cancelByOperatorMock = vi.fn();
const rescheduleAppointmentMock = vi.fn();
const markAttendanceMock = vi.fn();
const issueConfirmationTokenMock = vi.fn();

vi.mock('../repositories/appointment.repository.js', () => ({
  listByRange: (...args: unknown[]) => listByRangeMock(...args),
  findById: (...args: unknown[]) => findByIdMock(...args),
  findNextActiveByCustomer: (...args: unknown[]) => findNextActiveByCustomerMock(...args),
}));

vi.mock('../repositories/professional.repository.js', () => ({
  findById: (...args: unknown[]) => professionalFindByIdMock(...args),
}));

vi.mock('../repositories/customer.repository.js', () => ({
  findById: (...args: unknown[]) => customerFindByIdMock(...args),
}));

// Mock PARCIAL de @crm/db: mantém wallClockToUtc/dateInDisplayTz/
// timeInDisplayTz REAIS (funções puras, já provadas por execução em T1 —
// nunca re-derivadas aqui) e substitui só as transições que tocariam Mongo.
vi.mock('@crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@crm/db')>();
  return {
    ...actual,
    createManualAppointment: (...args: unknown[]) => createManualAppointmentMock(...args),
    createBlock: (...args: unknown[]) => createBlockMock(...args),
    deleteBlock: (...args: unknown[]) => deleteBlockMock(...args),
    cancelByOperator: (...args: unknown[]) => cancelByOperatorMock(...args),
    rescheduleAppointment: (...args: unknown[]) => rescheduleAppointmentMock(...args),
    markAttendance: (...args: unknown[]) => markAttendanceMock(...args),
    issueConfirmationToken: (...args: unknown[]) => issueConfirmationTokenMock(...args),
  };
});

const TENANT_ID = 'tenant-1';
const APPOINTMENT_ID = 'appointment-1';
const PROFESSIONAL_ID = 'professional-1';
const CUSTOMER_ID = 'customer-1';
const USER_ID = 'user-1';

const sampleAppointmentRecord = (overrides: Partial<AppointmentRecord> = {}): AppointmentRecord => ({
  id: APPOINTMENT_ID,
  kind: 'appointment',
  professional: PROFESSIONAL_ID,
  customer: CUSTOMER_ID,
  start: new Date('2026-09-16T00:00:00.000Z'),
  end: new Date('2026-09-16T00:30:00.000Z'),
  status: 'pending',
  source: 'operator',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('appointment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('date/time conversion to UTC before reaching any transition (AD-036)', () => {
    it("'2026-09-15'+'21:00' (America/Sao_Paulo) threads through as 2026-09-16T00:00:00.000Z into createManualAppointment's start", async () => {
      const { createManualAppointment } = await import('./appointment.service.js');
      professionalFindByIdMock.mockResolvedValueOnce({
        id: PROFESSIONAL_ID,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createManualAppointmentMock.mockResolvedValueOnce({
        appointment: { _id: { toString: () => APPOINTMENT_ID } },
        confirmationToken: 'apt_token',
      });
      findByIdMock.mockResolvedValueOnce(sampleAppointmentRecord());

      await createManualAppointment(TENANT_ID, {
        customerId: CUSTOMER_ID,
        professionalId: PROFESSIONAL_ID,
        date: '2026-09-15',
        time: '21:00',
      });

      expect(createManualAppointmentMock).toHaveBeenCalledWith(
        expect.objectContaining({ start: new Date('2026-09-16T00:00:00.000Z') }),
      );
      // end = start + slotDurationMinutes (30min do profissional resolvido).
      expect(createManualAppointmentMock).toHaveBeenCalledWith(
        expect.objectContaining({ end: new Date('2026-09-16T00:30:00.000Z') }),
      );
    });

    it("same date/time threads through rescheduleAppointment's start", async () => {
      const { rescheduleAppointment } = await import('./appointment.service.js');
      rescheduleAppointmentMock.mockResolvedValueOnce(sampleAppointmentRecord());
      findByIdMock.mockResolvedValueOnce(sampleAppointmentRecord());

      await rescheduleAppointment(TENANT_ID, APPOINTMENT_ID, { date: '2026-09-15', time: '21:00' });

      expect(rescheduleAppointmentMock).toHaveBeenCalledWith(
        TENANT_ID,
        APPOINTMENT_ID,
        expect.objectContaining({ start: new Date('2026-09-16T00:00:00.000Z') }),
      );
    });
  });

  describe('code -> typed error translation (spec.md SCH-30..34)', () => {
    it("code:'not_found' -> AppointmentNotFoundError (controller maps to 404), via cancelAppointment", async () => {
      const { cancelAppointment, AppointmentNotFoundError } = await import('./appointment.service.js');
      cancelByOperatorMock.mockResolvedValueOnce({ error: 'não encontrado', code: 'not_found' });

      await expect(cancelAppointment(TENANT_ID, APPOINTMENT_ID, USER_ID)).rejects.toBeInstanceOf(
        AppointmentNotFoundError,
      );
    });

    it("code:'conflict' -> AppointmentConflictError (controller maps to 409), via rescheduleAppointment", async () => {
      const { rescheduleAppointment, AppointmentConflictError } = await import('./appointment.service.js');
      rescheduleAppointmentMock.mockResolvedValueOnce({ error: 'horário indisponível', code: 'conflict' });

      await expect(
        rescheduleAppointment(TENANT_ID, APPOINTMENT_ID, { date: '2026-09-15', time: '21:00' }),
      ).rejects.toBeInstanceOf(AppointmentConflictError);
    });

    it("code:'terminal' -> AppointmentTerminalError (controller maps to 409), via markAttendance", async () => {
      const { markAttendance, AppointmentTerminalError } = await import('./appointment.service.js');
      markAttendanceMock.mockResolvedValueOnce({ error: 'estado terminal', code: 'terminal' });

      await expect(markAttendance(TENANT_ID, APPOINTMENT_ID, USER_ID, 'completed')).rejects.toBeInstanceOf(
        AppointmentTerminalError,
      );
    });

    it("code:'invalid' from createBlock (e.g. professional check race) -> AppointmentNotFoundError, same as not_found", async () => {
      const { createBlock, AppointmentNotFoundError } = await import('./appointment.service.js');
      professionalFindByIdMock.mockResolvedValueOnce({
        id: PROFESSIONAL_ID,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createBlockMock.mockResolvedValueOnce({ error: 'inválido', code: 'invalid' });

      await expect(
        createBlock(TENANT_ID, {
          professionalId: PROFESSIONAL_ID,
          startDate: '2026-09-15',
          startTime: '09:00',
          endDate: '2026-09-15',
          endTime: '10:00',
          title: 'Bloqueio',
        }),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);
    });

    it('createManualAppointment throws AppointmentNotFoundError WITHOUT calling the transition when the professional does not belong to the tenant', async () => {
      const { createManualAppointment, AppointmentNotFoundError } = await import('./appointment.service.js');
      professionalFindByIdMock.mockResolvedValueOnce(null);

      await expect(
        createManualAppointment(TENANT_ID, {
          customerId: CUSTOMER_ID,
          professionalId: PROFESSIONAL_ID,
          date: '2026-09-15',
          time: '21:00',
        }),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);
      expect(createManualAppointmentMock).not.toHaveBeenCalled();
    });

    it('deleteBlock maps not_found the same way', async () => {
      const { deleteBlock, AppointmentNotFoundError } = await import('./appointment.service.js');
      deleteBlockMock.mockResolvedValueOnce({ error: 'não encontrado', code: 'not_found' });

      await expect(deleteBlock(TENANT_ID, 'block-1')).rejects.toBeInstanceOf(AppointmentNotFoundError);
    });
  });

  describe('happy paths reload the resolved AppointmentRecord after mutating (T21 reuse)', () => {
    it('createManualAppointment returns the record resolved via appointmentRepository.findById', async () => {
      const { createManualAppointment } = await import('./appointment.service.js');
      professionalFindByIdMock.mockResolvedValueOnce({
        id: PROFESSIONAL_ID,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createManualAppointmentMock.mockResolvedValueOnce({
        appointment: { _id: { toString: () => APPOINTMENT_ID } },
        confirmationToken: 'apt_token',
      });
      const record = sampleAppointmentRecord();
      findByIdMock.mockResolvedValueOnce(record);

      const result = await createManualAppointment(TENANT_ID, {
        customerId: CUSTOMER_ID,
        professionalId: PROFESSIONAL_ID,
        date: '2026-09-15',
        time: '21:00',
      });

      expect(findByIdMock).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID);
      expect(result).toBe(record);
    });

    it('cancelAppointment passes tenantId/appointmentId/userId/reason through to cancelByOperator', async () => {
      const { cancelAppointment } = await import('./appointment.service.js');
      cancelByOperatorMock.mockResolvedValueOnce(sampleAppointmentRecord({ status: 'canceled_by_operator' }));
      findByIdMock.mockResolvedValueOnce(sampleAppointmentRecord({ status: 'canceled_by_operator' }));

      const result = await cancelAppointment(TENANT_ID, APPOINTMENT_ID, USER_ID, 'cliente desmarcou');

      expect(cancelByOperatorMock).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID, USER_ID, 'cliente desmarcou');
      expect(result.status).toBe('canceled_by_operator');
    });

    it('markAttendance passes status through and reloads the record', async () => {
      const { markAttendance } = await import('./appointment.service.js');
      markAttendanceMock.mockResolvedValueOnce(sampleAppointmentRecord({ status: 'completed' }));
      findByIdMock.mockResolvedValueOnce(sampleAppointmentRecord({ status: 'completed' }));

      const result = await markAttendance(TENANT_ID, APPOINTMENT_ID, USER_ID, 'completed');

      expect(markAttendanceMock).toHaveBeenCalledWith(TENANT_ID, APPOINTMENT_ID, USER_ID, 'completed');
      expect(result.status).toBe('completed');
    });
  });

  describe('listAppointments / getUpcomingByCustomer (SCH-29/SCH-38)', () => {
    it('converts from/to wall-clock dates to UTC boundaries and passes optional filters through', async () => {
      const { listAppointments } = await import('./appointment.service.js');
      listByRangeMock.mockResolvedValueOnce([sampleAppointmentRecord()]);

      await listAppointments(TENANT_ID, {
        from: '2026-09-15',
        to: '2026-09-16',
        professionalId: PROFESSIONAL_ID,
      });

      expect(listByRangeMock).toHaveBeenCalledWith(
        TENANT_ID,
        new Date('2026-09-15T03:00:00.000Z'),
        new Date('2026-09-16T03:00:00.000Z'),
        PROFESSIONAL_ID,
        undefined,
      );
    });

    it('getUpcomingByCustomer returns null when the repository finds none (a valid state, never an error)', async () => {
      const { getUpcomingByCustomer } = await import('./appointment.service.js');
      findNextActiveByCustomerMock.mockResolvedValueOnce(null);

      const result = await getUpcomingByCustomer(TENANT_ID, CUSTOMER_ID);

      expect(result).toBeNull();
    });
  });

  describe('requestConfirmationLink (spec.md SCH-37)', () => {
    it('returns a confirmationUrl starting with WEB_BASE_URL/appointment?token=apt_ and a waMeUrl containing the encoded link', async () => {
      const { requestConfirmationLink } = await import('./appointment.service.js');
      const { env } = await import('../config/env.config.js');
      issueConfirmationTokenMock.mockResolvedValueOnce({ confirmationToken: 'apt_freshtoken123' });
      findByIdMock.mockResolvedValueOnce(sampleAppointmentRecord());
      customerFindByIdMock.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        name: 'Cliente Teste',
        phone: '11999998888',
        template: 'template-1',
        templateVersion: 1,
        values: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await requestConfirmationLink(TENANT_ID, APPOINTMENT_ID);

      const expectedUrl = `${env.WEB_BASE_URL}/appointment?token=apt_freshtoken123`;
      expect(result.confirmationUrl).toBe(expectedUrl);
      expect(result.confirmationUrl.startsWith(`${env.WEB_BASE_URL}/appointment?token=apt_`)).toBe(true);
      expect(result.waMeUrl.startsWith('https://wa.me/11999998888?text=')).toBe(true);
      expect(result.waMeUrl).toContain(encodeURIComponent(expectedUrl));
    });

    it("code:'not_found' from issueConfirmationToken -> AppointmentNotFoundError, without looking up the customer", async () => {
      const { requestConfirmationLink, AppointmentNotFoundError } = await import('./appointment.service.js');
      issueConfirmationTokenMock.mockResolvedValueOnce({ error: 'não encontrado', code: 'not_found' });

      await expect(requestConfirmationLink(TENANT_ID, APPOINTMENT_ID)).rejects.toBeInstanceOf(AppointmentNotFoundError);
      expect(customerFindByIdMock).not.toHaveBeenCalled();
    });
  });
});
