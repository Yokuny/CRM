import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, put: putMock }));

const { schedulingSettingsQuery, updateSchedulingSettingsMutation, schedulingSettingsKeys } = await import(
  './schedulingSettings.js'
);

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto que nenhuma `mutationFn` daqui realmente lê — mesmo raciocínio
// de query/professional.unit.test.ts.
const fakeMutationContext = {} as never;

describe('schedulingSettingsQuery (T36, spec.md SCH-06/SCH-08)', () => {
  it('calls GET /scheduling-settings', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { maxSlotsPerResponse: 16 } });

    await schedulingSettingsQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/scheduling-settings');
  });

  it('resolves with maxSlotsPerResponse:16 when the tenant never configured it (spec.md SCH-06 default)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { maxSlotsPerResponse: 16 } });

    const result = await schedulingSettingsQuery().queryFn?.({} as never);

    expect(result).toEqual({ maxSlotsPerResponse: 16 });
  });

  it('resolves with the configured value once the tenant has set one', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { maxSlotsPerResponse: 10 } });

    const result = await schedulingSettingsQuery().queryFn?.({} as never);

    expect(result).toEqual({ maxSlotsPerResponse: 10 });
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao carregar configuração.' });

    await expect(schedulingSettingsQuery().queryFn?.({} as never)).rejects.toThrow('Falha ao carregar configuração.');
  });

  it('exposes a single, non-parameterized queryKey (one document per tenant, no list/id)', () => {
    expect(schedulingSettingsQuery().queryKey).toEqual(schedulingSettingsKeys.detail());
  });
});

describe('updateSchedulingSettingsMutation (T36, spec.md SCH-06)', () => {
  it('calls PUT /scheduling-settings with the given input and resolves with the updated record', async () => {
    putMock.mockResolvedValueOnce({ success: true, data: { maxSlotsPerResponse: 10 } });

    const result = await updateSchedulingSettingsMutation(fakeQueryClient()).mutationFn?.(
      { maxSlotsPerResponse: 10 },
      fakeMutationContext,
    );

    expect(putMock).toHaveBeenCalledWith('/scheduling-settings', { maxSlotsPerResponse: 10 });
    expect(result).toEqual({ maxSlotsPerResponse: 10 });
  });

  it('throws with the backend message when the update fails', async () => {
    putMock.mockResolvedValueOnce({ success: false, message: 'maxSlotsPerResponse inválido' });

    await expect(
      updateSchedulingSettingsMutation(fakeQueryClient()).mutationFn?.({ maxSlotsPerResponse: 0 }, fakeMutationContext),
    ).rejects.toThrow('maxSlotsPerResponse inválido');
  });

  it('invalidates the schedulingSettings detail cache on success', () => {
    const queryClient = fakeQueryClient();

    updateSchedulingSettingsMutation(queryClient).onSuccess?.(
      { maxSlotsPerResponse: 10 },
      { maxSlotsPerResponse: 10 },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: schedulingSettingsKeys.detail() });
  });
});
