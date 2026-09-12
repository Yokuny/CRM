import { describe, expect, it, vi } from 'vitest';

const getWithStatusMock = vi.fn();
const postMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ getWithStatus: getWithStatusMock, post: postMock }));

const {
  appointmentConfirmationQuery,
  confirmAppointmentMutation,
  confirmationCancelMutation,
  AppointmentConfirmationError,
  appointmentConfirmationKeys,
} = await import('./appointmentConfirmation.js');

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto que nenhuma `mutationFn` daqui realmente lê — mesmo molde de
// query/product.unit.test.ts.
const fakeMutationContext = {} as never;

const publicView = {
  date: '2026-09-15',
  time: '14:00',
  professionalName: 'Dra. Ana',
  customerName: 'João da Silva',
  status: 'pending' as const,
};

describe('appointmentConfirmationQuery (T42, spec.md SCH-22/SCH-23)', () => {
  it('calls GET /appointment-confirmations/:token via getWithStatus (never get) and resolves with the public view on success', async () => {
    getWithStatusMock.mockResolvedValueOnce({ success: true, data: publicView, status: 200 });

    const result = await appointmentConfirmationQuery('tok1').queryFn?.({} as never);

    expect(getWithStatusMock).toHaveBeenCalledWith('/appointment-confirmations/tok1');
    expect(result).toEqual(publicView);
  });

  it('throws an AppointmentConfirmationError carrying status:404 when the token does not exist', async () => {
    getWithStatusMock.mockResolvedValueOnce({
      success: false,
      message: 'Link de confirmação não encontrado',
      status: 404,
    });

    await expect(appointmentConfirmationQuery('missing').queryFn?.({} as never)).rejects.toMatchObject({
      message: 'Link de confirmação não encontrado',
      status: 404,
    });
  });

  it('throws an AppointmentConfirmationError carrying status:410 when the token has expired', async () => {
    getWithStatusMock.mockResolvedValueOnce({
      success: false,
      message: 'Link de confirmação expirado',
      status: 410,
    });

    const error = await appointmentConfirmationQuery('expired')
      .queryFn?.({} as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppointmentConfirmationError);
    expect((error as InstanceType<typeof AppointmentConfirmationError>).status).toBe(410);
  });

  it('exposes a queryKey that varies by token (so distinct tokens cache independently)', () => {
    expect(appointmentConfirmationQuery('tok1').queryKey).toEqual(appointmentConfirmationKeys.detail('tok1'));
    expect(appointmentConfirmationQuery('tok1').queryKey).not.toEqual(appointmentConfirmationQuery('tok2').queryKey);
  });
});

describe('confirmAppointmentMutation (T42, spec.md SCH-25)', () => {
  it('calls POST /appointment-confirmations/:token/confirm with no body and resolves with the updated public view', async () => {
    const confirmed = { ...publicView, status: 'confirmed' as const };
    postMock.mockResolvedValueOnce({ success: true, data: confirmed });

    const result = await confirmAppointmentMutation().mutationFn?.('tok1', fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointment-confirmations/tok1/confirm');
    expect(result).toEqual(confirmed);
  });

  it('throws with the backend message on failure (e.g. terminal state, 409)', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Agendamento em estado terminal' });

    await expect(confirmAppointmentMutation().mutationFn?.('tok1', fakeMutationContext)).rejects.toThrow(
      'Agendamento em estado terminal',
    );
  });
});

describe('confirmationCancelMutation (T42, spec.md SCH-26)', () => {
  it('calls POST /appointment-confirmations/:token/cancel with no body and resolves with the updated public view', async () => {
    const canceled = { ...publicView, status: 'canceled_by_customer' as const };
    postMock.mockResolvedValueOnce({ success: true, data: canceled });

    const result = await confirmationCancelMutation().mutationFn?.('tok1', fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointment-confirmations/tok1/cancel');
    expect(result).toEqual(canceled);
  });

  it('throws with the backend message on failure', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Link de confirmação expirado' });

    await expect(confirmationCancelMutation().mutationFn?.('tok1', fakeMutationContext)).rejects.toThrow(
      'Link de confirmação expirado',
    );
  });
});
