import { afterEach, describe, expect, it, vi } from 'vitest';
import { del, get, patch, post, put } from './client.api.js';

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

  describe('patch', () => {
    it('sends a JSON body with Content-Type, credentials:"include" and method:"PATCH", returning the ApiResponse<T> shape on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { id: 'c1', status: 'won' }, message: '' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await patch<{ id: string; status: string }>('/customers/c1', { status: 'won' });

      expect(result).toEqual({ success: true, data: { id: 'c1', status: 'won' }, message: '' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/customers/c1'),
        expect.objectContaining({
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'won' }),
        }),
      );
    });

    it('never throws on a network failure — returns an ApiResponse with success:false and a readable message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await patch('/customers/c1', { status: 'won' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Não foi possível conectar ao servidor. Tente novamente.');
    });
  });

  describe('put', () => {
    it('sends a JSON body with Content-Type, credentials:"include" and method:"PUT", returning the ApiResponse<T> shape on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { maxSlotsPerResponse: 10 }, message: '' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await put<{ maxSlotsPerResponse: number }>('/scheduling-settings', { maxSlotsPerResponse: 10 });

      expect(result).toEqual({ success: true, data: { maxSlotsPerResponse: 10 }, message: '' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/scheduling-settings'),
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxSlotsPerResponse: 10 }),
        }),
      );
    });

    it('never throws on a network failure — returns an ApiResponse with success:false and a readable message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await put('/scheduling-settings', { maxSlotsPerResponse: 10 });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Não foi possível conectar ao servidor. Tente novamente.');
    });
  });

  describe('del', () => {
    it('sends no body, credentials:"include" and method:"DELETE", returning the ApiResponse<T> shape on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { deleted: true }, message: '' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await del<{ deleted: true }>('/appointments/blocks/b1');

      expect(result).toEqual({ success: true, data: { deleted: true }, message: '' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/appointments/blocks/b1'),
        expect.objectContaining({ method: 'DELETE', credentials: 'include', headers: undefined, body: undefined }),
      );
    });

    it('never throws on a network failure — returns an ApiResponse with success:false and a readable message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const result = await del('/appointments/blocks/b1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Não foi possível conectar ao servidor. Tente novamente.');
    });
  });
});
