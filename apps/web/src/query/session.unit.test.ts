import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { sessionQuery, sessionKeys } = await import('./session.js');

describe('sessionQuery', () => {
  it('calls GET /auth/session', async () => {
    getMock.mockResolvedValueOnce({
      success: true,
      data: { user: { id: '1', name: 'A', email: 'a@b.com' }, role: ['admin'] },
      message: '',
    });

    await sessionQuery.queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/auth/session');
  });

  it('resolves with the session data on success (tenant, user, role)', async () => {
    const data = {
      tenant: { id: 't1', name: 'Empresa X', status: 'active' },
      user: { id: '1', name: 'A', email: 'a@b.com' },
      role: ['admin'],
    };
    getMock.mockResolvedValueOnce({ success: true, data, message: '' });

    const result = await sessionQuery.queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws when the backend responds with success:false (invalid/expired session)', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Sessão expirada.' });

    await expect(sessionQuery.queryFn?.({} as never)).rejects.toThrow('Sessão expirada.');
  });

  it('exposes a stable queryKey used by ensureQueryData in the route guard (T30)', () => {
    expect(sessionQuery.queryKey).toEqual(sessionKeys.detail());
  });

  // staleTime > 0 evita refetch a cada navegação privada; retry:false evita
  // que uma sessão inválida atrase o redirect com novas tentativas — as duas
  // condições que o guard de rota (T30) precisa para não fazer loop.
  it('sets a positive staleTime and retry:false, so the route guard (T30) neither refetches on every navigation nor retries a failed session', () => {
    expect(sessionQuery.staleTime).toBeGreaterThan(0);
    expect(sessionQuery.retry).toBe(false);
  });
});
