import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock, patch: patchMock }));

const { spacesQuery, spaceQuery, createSpaceMutation, updateSpaceMutation, spaceKeys } = await import('./space.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto que nenhuma `mutationFn` daqui realmente lê — mesmo raciocínio
// de query/professional.unit.test.ts.
const fakeMutationContext = {} as never;

const SPACE_RECORD = {
  id: 'sp1',
  name: 'Sala 1',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('spacesQuery (T35, spec.md SCH-04/SCH-08)', () => {
  it('builds the querystring from page/limit/active and calls GET /spaces', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await spacesQuery({ page: 2, limit: 10, active: true }).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/spaces?page=2&limit=10&active=true');
  });

  it('calls GET /spaces with no querystring when no params are given (server-driven default page, AD-028)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await spacesQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/spaces');
  });

  it('resolves with items/total on success', async () => {
    const data = { items: [SPACE_RECORD], total: 1 };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await spacesQuery({ page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar ambientes.' });

    await expect(spacesQuery({ page: 1 }).queryFn?.({} as never)).rejects.toThrow('Falha ao listar ambientes.');
  });

  it('exposes a queryKey that varies by params (so distinct pages/filters cache independently)', () => {
    expect(spacesQuery({ page: 1 }).queryKey).toEqual(spaceKeys.list({ page: 1 }));
    expect(spacesQuery({ page: 1 }).queryKey).not.toEqual(spacesQuery({ page: 2 }).queryKey);
  });
});

describe('spaceQuery (T35, spec.md SCH-08 — GET /spaces/:id real, Batch 3/T17)', () => {
  it('calls GET /spaces/:id', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: SPACE_RECORD });

    await spaceQuery('sp1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/spaces/sp1');
  });

  it('resolves with the record on success', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: SPACE_RECORD });

    const result = await spaceQuery('sp1').queryFn?.({} as never);

    expect(result).toEqual(SPACE_RECORD);
  });

  it('throws with the backend message when the space is not found', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Ambiente não encontrado' });

    await expect(spaceQuery('missing').queryFn?.({} as never)).rejects.toThrow('Ambiente não encontrado');
  });

  it('exposes a queryKey scoped by id', () => {
    expect(spaceQuery('sp1').queryKey).toEqual(spaceKeys.detail('sp1'));
  });
});

describe('createSpaceMutation (T35, spec.md SCH-04)', () => {
  it('calls POST /spaces with the given input and resolves with the created record', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: SPACE_RECORD });
    const input = { name: 'Sala 1' };

    const result = await createSpaceMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/spaces', input);
    expect(result).toEqual(SPACE_RECORD);
  });

  it('throws with the backend message when creation fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'name é obrigatório' });

    await expect(
      createSpaceMutation(fakeQueryClient()).mutationFn?.({ name: '' }, fakeMutationContext),
    ).rejects.toThrow('name é obrigatório');
  });

  it('invalidates every cached spacesQuery list on success', () => {
    const queryClient = fakeQueryClient();

    createSpaceMutation(queryClient).onSuccess?.(SPACE_RECORD, { name: 'Sala 1' }, undefined, {
      client: queryClient,
    } as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: spaceKeys.lists() });
  });
});

describe('updateSpaceMutation (T35, spec.md SCH-04)', () => {
  it('calls PATCH /spaces/:id with the given data and resolves with the updated record', async () => {
    const updated = { ...SPACE_RECORD, active: false };
    patchMock.mockResolvedValueOnce({ success: true, data: updated });

    const result = await updateSpaceMutation(fakeQueryClient()).mutationFn?.(
      { id: 'sp1', data: { active: false } },
      fakeMutationContext,
    );

    expect(patchMock).toHaveBeenCalledWith('/spaces/sp1', { active: false });
    expect(result).toEqual(updated);
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Ambiente não encontrado' });

    await expect(
      updateSpaceMutation(fakeQueryClient()).mutationFn?.({ id: 'missing', data: { active: false } }, fakeMutationContext),
    ).rejects.toThrow('Ambiente não encontrado');
  });

  it('invalidates the lists AND the detail(id) cache on success', () => {
    const queryClient = fakeQueryClient();

    updateSpaceMutation(queryClient).onSuccess?.(
      { ...SPACE_RECORD, active: false },
      { id: 'sp1', data: { active: false } },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: spaceKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: spaceKeys.detail('sp1') });
  });
});
