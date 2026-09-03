import { afterEach, describe, expect, it, vi } from 'vitest';
import { get, post } from './client.api.js';

describe('client.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('get', () => {
    it('sends credentials:"include" and returns the ApiResponse<T> shape on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { id: '1' }, message: '' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await get<{ id: string }>('/invites/abc');

      expect(result).toEqual({ success: true, data: { id: '1' }, message: '' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/invites/abc'),
        expect.objectContaining({ method: 'GET', credentials: 'include' }),
      );
    });

    it('passes through a backend error ApiResponse (success:false, message set) without throwing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, message: 'Convite inválido.' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await get('/invites/bad-token');

      expect(result).toEqual({ success: false, message: 'Convite inválido.' });
    });

    it('never throws on a network failure — returns an ApiResponse with success:false and a readable message (FND-10/AC4)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await get('/auth/session');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Não foi possível conectar ao servidor. Tente novamente.');
    });
  });

  describe('post', () => {
    it('sends a JSON body with Content-Type and credentials:"include"', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, message: 'Login realizado com sucesso.' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await post('/auth/signin', { email: 'a@b.com', password: 'senha123' });

      expect(result).toEqual({ success: true, message: 'Login realizado com sucesso.' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signin'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com', password: 'senha123' }),
        }),
      );
    });
  });
});
