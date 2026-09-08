import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { messagesQuery, messageKeys, resendMessage, mediaUrl } = await import('./message.js');

describe('messagesQuery (INBOX-05/06)', () => {
  afterEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('builds the querystring from page/limit and calls GET /conversations/:id/messages', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await messagesQuery('conv-1', { page: 2, limit: 10 }).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/conversations/conv-1/messages?page=2&limit=10');
  });

  it('calls GET /conversations/:id/messages with no querystring when no params are given', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await messagesQuery('conv-1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/conversations/conv-1/messages');
  });

  it('resolves with items/total on success', async () => {
    const data = {
      items: [{ id: 'm1', direction: 'in', type: 'text', text: 'oi', createdAt: '2026-01-01T00:00:00.000Z' }],
      total: 1,
    };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await messagesQuery('conv-1', { page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false (e.g. Conversation não encontrada)', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Conversation não encontrada' });

    await expect(messagesQuery('missing', { page: 1 }).queryFn?.({} as never)).rejects.toThrow(
      'Conversation não encontrada',
    );
  });

  it('exposes a queryKey that varies by conversationId and by params', () => {
    expect(messagesQuery('conv-1', { page: 1 }).queryKey).toEqual(messageKeys.list('conv-1', { page: 1 }));
    expect(messagesQuery('conv-1', { page: 1 }).queryKey).not.toEqual(messagesQuery('conv-2', { page: 1 }).queryKey);
    expect(messagesQuery('conv-1', { page: 1 }).queryKey).not.toEqual(messagesQuery('conv-1', { page: 2 }).queryKey);
  });
});

describe('resendMessage (INBOX-14)', () => {
  afterEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('calls POST /conversations/:id/messages/:messageId/resend and resolves with the new (cloned) Message', async () => {
    const clone = {
      id: 'm2',
      direction: 'out',
      type: 'text',
      status: 'queued',
      text: 'oi',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    postMock.mockResolvedValueOnce({ success: true, data: clone });
    const queryClient = new QueryClient();

    const result = await resendMessage(queryClient, 'conv-1', 'm1');

    expect(postMock).toHaveBeenCalledWith('/conversations/conv-1/messages/m1/resend');
    expect(result).toEqual(clone);
  });

  it("invalidates ONLY this Conversation's message-list queries on success, so the thread refetches the new attempt", async () => {
    const clone = { id: 'm2', direction: 'out', type: 'text', status: 'queued', createdAt: '2026-01-01T00:00:00.000Z' };
    postMock.mockResolvedValueOnce({ success: true, data: clone });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await resendMessage(queryClient, 'conv-1', 'm1');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: messageKeys.listsForConversation('conv-1') });
  });

  it('throws with the backend message when success:false, without invalidating anything', async () => {
    postMock.mockResolvedValueOnce({
      success: false,
      message: 'Só é possível reenviar uma mensagem com status failed',
    });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await expect(resendMessage(queryClient, 'conv-1', 'm1')).rejects.toThrow(
      'Só é possível reenviar uma mensagem com status failed',
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('mediaUrl (INBOX-17 — helper de URL, não um fetch)', () => {
  it('points at the on-demand media proxy route for the given conversation/message pair', () => {
    expect(mediaUrl('conv-1', 'm1')).toMatch(/\/conversations\/conv-1\/messages\/m1\/media$/);
  });

  it('URL-encodes the conversationId/messageId segments', () => {
    expect(mediaUrl('conv 1', 'm/1')).toContain('/conversations/conv%201/messages/m%2F1/media');
  });
});
