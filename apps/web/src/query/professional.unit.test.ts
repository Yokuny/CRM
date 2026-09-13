import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock, patch: patchMock }));

const { professionalsQuery, professionalQuery, createProfessionalMutation, updateProfessionalMutation, professionalKeys } =
  await import('./professional.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto (`{client, meta, mutationKey}`) que nenhuma `mutationFn` daqui
// realmente lê — mesmo raciocínio de query/product.unit.test.ts.
const fakeMutationContext = {} as never;

const PROFESSIONAL_RECORD = {
  id: 'pr1',
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('professionalsQuery (T32, spec.md SCH-01/SCH-08)', () => {
  it('builds the querystring from page/limit/active and calls GET /professionals', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await professionalsQuery({ page: 2, limit: 10, active: true }).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/professionals?page=2&limit=10&active=true');
  });

  it('calls GET /professionals with no querystring when no params are given (server-driven default page, AD-028)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await professionalsQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/professionals');
  });

  it('resolves with items/total on success', async () => {
    const data = { items: [PROFESSIONAL_RECORD], total: 1 };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await professionalsQuery({ page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar profissionais.' });

    await expect(professionalsQuery({ page: 1 }).queryFn?.({} as never)).rejects.toThrow(
      'Falha ao listar profissionais.',
    );
  });

  it('exposes a queryKey that varies by params (so distinct pages/filters cache independently)', () => {
    expect(professionalsQuery({ page: 1 }).queryKey).toEqual(professionalKeys.list({ page: 1 }));
    expect(professionalsQuery({ page: 1 }).queryKey).not.toEqual(professionalsQuery({ page: 2 }).queryKey);
  });
});

describe('professionalQuery (T32, spec.md SCH-08 — GET /professionals/:id real, Batch 3/T15)', () => {
  it('calls GET /professionals/:id', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: PROFESSIONAL_RECORD });

    await professionalQuery('pr1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/professionals/pr1');
  });

  it('resolves with the record on success', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: PROFESSIONAL_RECORD });

    const result = await professionalQuery('pr1').queryFn?.({} as never);

    expect(result).toEqual(PROFESSIONAL_RECORD);
  });

  it('throws with the backend message when the professional is not found', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Profissional não encontrado' });

    await expect(professionalQuery('missing').queryFn?.({} as never)).rejects.toThrow('Profissional não encontrado');
  });

  it('exposes a queryKey scoped by id', () => {
    expect(professionalQuery('pr1').queryKey).toEqual(professionalKeys.detail('pr1'));
  });
});

describe('createProfessionalMutation (T32, spec.md SCH-01)', () => {
  it('calls POST /professionals with the given input and resolves with the created record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: PROFESSIONAL_RECORD });
    const input = { name: 'Dra. Ana', slotDurationMinutes: 30, weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }] };

    const result = await createProfessionalMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/professionals', input);
    expect(result).toEqual(PROFESSIONAL_RECORD);
  });

  it('throws with the backend message when creation fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'name é obrigatório' });

    await expect(
      createProfessionalMutation(fakeQueryClient()).mutationFn?.(
        { name: '', slotDurationMinutes: 30, weeklySchedule: [] },
        fakeMutationContext,
      ),
    ).rejects.toThrow('name é obrigatório');
  });

  it('invalidates every cached professionalsQuery list on success', () => {
    const queryClient = fakeQueryClient();

    createProfessionalMutation(queryClient).onSuccess?.(
      PROFESSIONAL_RECORD,
      { name: 'Dra. Ana', slotDurationMinutes: 30, weeklySchedule: [] },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: professionalKeys.lists() });
  });
});

describe('updateProfessionalMutation (T32, spec.md SCH-05)', () => {
  it('calls PATCH /professionals/:id with the given data and resolves with the updated record', async () => {
    const updated = { ...PROFESSIONAL_RECORD, active: false };
    patchMock.mockResolvedValueOnce({ success: true, data: updated });

    const result = await updateProfessionalMutation(fakeQueryClient()).mutationFn?.(
      { id: 'pr1', data: { active: false } },
      fakeMutationContext,
    );

    expect(patchMock).toHaveBeenCalledWith('/professionals/pr1', { active: false });
    expect(result).toEqual(updated);
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Profissional não encontrado' });

    await expect(
      updateProfessionalMutation(fakeQueryClient()).mutationFn?.(
        { id: 'missing', data: { active: false } },
        fakeMutationContext,
      ),
    ).rejects.toThrow('Profissional não encontrado');
  });

  it('invalidates the lists AND the detail(id) cache on success (SCH-05: active toggle must refresh both list and detail views)', () => {
    const queryClient = fakeQueryClient();

    updateProfessionalMutation(queryClient).onSuccess?.(
      { ...PROFESSIONAL_RECORD, active: false },
      { id: 'pr1', data: { active: false } },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: professionalKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: professionalKeys.detail('pr1') });
  });
});
