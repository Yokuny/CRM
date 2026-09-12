import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const delMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock, del: delMock }));

const {
  appointmentsQuery,
  upcomingAppointmentQuery,
  createAppointmentMutation,
  createBlockMutation,
  deleteBlockMutation,
  cancelAppointmentMutation,
  rescheduleAppointmentMutation,
  markAttendanceMutation,
  requestConfirmationLinkMutation,
  appointmentKeys,
} = await import('./appointment.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto (`{client, meta, mutationKey}`) que nenhuma `mutationFn` daqui
// realmente lê — um valor qualquer satisfaz a assinatura nos testes (mesmo
// molde de query/product.unit.test.ts).
const fakeMutationContext = {} as never;

const appointmentFixture = {
  id: 'a1',
  kind: 'appointment' as const,
  professional: 'p1',
  professionalName: 'Dra. Ana',
  customer: 'c1',
  customerName: 'João',
  start: '2026-09-16T00:00:00.000Z',
  end: '2026-09-16T01:00:00.000Z',
  status: 'pending' as const,
  source: 'operator' as const,
  createdAt: '',
  updatedAt: '',
};

describe('appointmentsQuery (T37, spec.md SCH-29)', () => {
  it('builds the querystring from from/to/professional/space and calls GET /appointments', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: [] });

    const params = { from: '2026-09-14', to: '2026-09-21', professional: 'p1', space: 's1' };
    await appointmentsQuery(params).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21&professional=p1&space=s1');
  });

  it('calls GET /appointments with only from/to when professional/space are omitted', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: [] });

    await appointmentsQuery({ from: '2026-09-14', to: '2026-09-21' }).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21');
  });

  it('resolves with the appointment/block list on success', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: [appointmentFixture] });

    const result = await appointmentsQuery({ from: '2026-09-14', to: '2026-09-21' }).queryFn?.({} as never);

    expect(result).toEqual([appointmentFixture]);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'faixa de datas maior que 42 dias' });

    await expect(
      appointmentsQuery({ from: '2026-09-14', to: '2026-11-21' }).queryFn?.({} as never),
    ).rejects.toThrow('faixa de datas maior que 42 dias');
  });

  it('exposes a queryKey that varies by params (so distinct ranges/filters cache independently)', () => {
    const a = { from: '2026-09-14', to: '2026-09-21' };
    const b = { from: '2026-09-21', to: '2026-09-28' };
    expect(appointmentsQuery(a).queryKey).toEqual(appointmentKeys.list(a));
    expect(appointmentsQuery(a).queryKey).not.toEqual(appointmentsQuery(b).queryKey);
  });
});

describe('upcomingAppointmentQuery (T37, spec.md SCH-38)', () => {
  it('calls GET /appointments/upcoming?customer=...', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: appointmentFixture });

    await upcomingAppointmentQuery('c1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/appointments/upcoming?customer=c1');
  });

  it('resolves with null when there is no active future appointment — a valid state, not an error', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: null });

    const result = await upcomingAppointmentQuery('c1').queryFn?.({} as never);

    expect(result).toBeNull();
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Cliente não encontrado' });

    await expect(upcomingAppointmentQuery('missing').queryFn?.({} as never)).rejects.toThrow('Cliente não encontrado');
  });
});

describe('createAppointmentMutation (T37, spec.md SCH-30)', () => {
  const input = { customerId: 'c1', professionalId: 'p1', date: '2026-09-16', time: '10:00' };

  it('calls POST /appointments with the given wall-clock input and resolves with the created record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: appointmentFixture });

    const result = await createAppointmentMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments', input);
    expect(result).toEqual(appointmentFixture);
  });

  it('throws with the backend message on conflict (409, sobreposição)', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Horário sobreposto' });

    await expect(createAppointmentMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext)).rejects.toThrow(
      'Horário sobreposto',
    );
  });

  it('invalidates appointmentKeys.lists() on success', () => {
    const queryClient = fakeQueryClient();

    createAppointmentMutation(queryClient).onSuccess?.(appointmentFixture, input, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
  });
});

describe('createBlockMutation (T37, spec.md SCH-33)', () => {
  const input = {
    professionalId: 'p1',
    startDate: '2026-09-16',
    startTime: '12:00',
    endDate: '2026-09-16',
    endTime: '13:00',
    title: 'Almoço',
  };
  const blockFixture = { ...appointmentFixture, id: 'b1', kind: 'block' as const, customer: undefined, title: 'Almoço' };

  it('calls POST /appointments/blocks with the given input and resolves with the created block', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: blockFixture });

    const result = await createBlockMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments/blocks', input);
    expect(result).toEqual(blockFixture);
  });

  it('invalidates appointmentKeys.lists() on success', () => {
    const queryClient = fakeQueryClient();

    createBlockMutation(queryClient).onSuccess?.(blockFixture, input, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
  });
});

describe('deleteBlockMutation (T37, spec.md SCH-33)', () => {
  it('calls DELETE /appointments/blocks/:id and resolves with {deleted:true}', async () => {
    delMock.mockResolvedValueOnce({ success: true, data: { deleted: true } });

    const result = await deleteBlockMutation(fakeQueryClient()).mutationFn?.({ id: 'b1' }, fakeMutationContext);

    expect(delMock).toHaveBeenCalledWith('/appointments/blocks/b1');
    expect(result).toEqual({ deleted: true });
  });

  it('invalidates appointmentKeys.lists() on success', () => {
    const queryClient = fakeQueryClient();

    deleteBlockMutation(queryClient).onSuccess?.({ deleted: true }, { id: 'b1' }, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
  });
});

describe('cancelAppointmentMutation (T37, spec.md SCH-32)', () => {
  const variables = { id: 'a1', data: { reason: 'Cliente desmarcou' } };
  const canceled = { ...appointmentFixture, status: 'canceled_by_operator' as const };

  it('calls POST /appointments/:id/cancel with the optional reason and resolves with the updated record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: canceled });

    const result = await cancelAppointmentMutation(fakeQueryClient()).mutationFn?.(variables, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Cliente desmarcou' });
    expect(result).toEqual(canceled);
  });

  it('invalidates appointmentKeys.lists() AND appointmentKeys.upcoming(customer) on success when the record has a customer', () => {
    const queryClient = fakeQueryClient();

    cancelAppointmentMutation(queryClient).onSuccess?.(canceled, variables, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.upcoming('c1') });
  });

  it('does not invalidate an upcoming() key when the updated record has no customer (e.g. a block)', () => {
    const queryClient = fakeQueryClient();
    const withoutCustomer = { ...canceled, customer: undefined };

    cancelAppointmentMutation(queryClient).onSuccess?.(withoutCustomer, variables, undefined, {
      client: queryClient,
    } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
  });
});

describe('rescheduleAppointmentMutation (T37, spec.md SCH-31)', () => {
  const variables = { id: 'a1', data: { date: '2026-09-17', time: '11:00' } };

  it('calls POST /appointments/:id/reschedule with the new wall-clock date/time and resolves with the updated record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: appointmentFixture });

    const result = await rescheduleAppointmentMutation(fakeQueryClient()).mutationFn?.(variables, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments/a1/reschedule', { date: '2026-09-17', time: '11:00' });
    expect(result).toEqual(appointmentFixture);
  });

  it('invalidates appointmentKeys.lists() AND appointmentKeys.upcoming(customer) on success', () => {
    const queryClient = fakeQueryClient();

    rescheduleAppointmentMutation(queryClient).onSuccess?.(appointmentFixture, variables, undefined, {
      client: queryClient,
    } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.upcoming('c1') });
  });
});

describe('markAttendanceMutation (T37, spec.md SCH-34)', () => {
  const variables = { id: 'a1', data: { status: 'completed' as const } };
  const completed = { ...appointmentFixture, status: 'completed' as const };

  it('calls POST /appointments/:id/attendance with the status and resolves with the updated record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: completed });

    const result = await markAttendanceMutation(fakeQueryClient()).mutationFn?.(variables, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments/a1/attendance', { status: 'completed' });
    expect(result).toEqual(completed);
  });

  it('invalidates appointmentKeys.lists() AND appointmentKeys.upcoming(customer) on success', () => {
    const queryClient = fakeQueryClient();

    markAttendanceMutation(queryClient).onSuccess?.(completed, variables, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.upcoming('c1') });
  });
});

describe('requestConfirmationLinkMutation (T37, spec.md SCH-37)', () => {
  const link = { confirmationUrl: 'https://app.example.com/appointment?token=abc', waMeUrl: 'https://wa.me/5511999999999?text=oi' };

  it('calls POST /appointments/:id/confirmation-link with no body and resolves with the confirmation/wa.me URLs', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: link });

    const result = await requestConfirmationLinkMutation(fakeQueryClient()).mutationFn?.({ id: 'a1' }, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/appointments/a1/confirmation-link');
    expect(result).toEqual(link);
  });

  it('throws with the backend message when the appointment belongs to another tenant or does not exist (404)', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Appointment não encontrado' });

    await expect(
      requestConfirmationLinkMutation(fakeQueryClient()).mutationFn?.({ id: 'missing' }, fakeMutationContext),
    ).rejects.toThrow('Appointment não encontrado');
  });

  it('invalidates appointmentKeys.lists() on success', () => {
    const queryClient = fakeQueryClient();

    requestConfirmationLinkMutation(queryClient).onSuccess?.(link, { id: 'a1' }, undefined, { client: queryClient } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: appointmentKeys.lists() });
  });
});
