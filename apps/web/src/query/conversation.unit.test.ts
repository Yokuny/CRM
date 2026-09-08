import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { conversationsQuery, conversationKeys } = await import('./conversation.js');

describe('conversationsQuery (INBOX-01/03)', () => {
  it('builds the querystring from mode/assignee/page/limit and calls GET /conversations', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    const params = { mode: 'human' as const, assignee: 'user-1', page: 2, limit: 10 };
    await conversationsQuery(params).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/conversations?mode=human&assignee=user-1&page=2&limit=10');
  });

  it('calls GET /conversations with no querystring when no params are given', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await conversationsQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/conversations');
  });

  it('resolves with items/total on success', async () => {
    const data = {
      items: [
        {
          id: 'c1',
          customer: 'cust-1',
          mode: 'bot',
          lastActivityAt: '2026-01-01T00:00:00.000Z',
          unread: false,
          windowOpen: true,
        },
      ],
      total: 1,
    };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await conversationsQuery({ page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar conversas.' });

    await expect(conversationsQuery({ page: 1 }).queryFn?.({} as never)).rejects.toThrow('Falha ao listar conversas.');
  });

  it('exposes a queryKey that varies by params (so distinct filters/pages cache independently)', () => {
    expect(conversationsQuery({ mode: 'bot' }).queryKey).toEqual(conversationKeys.list({ mode: 'bot' }));
    expect(conversationsQuery({ mode: 'bot' }).queryKey).not.toEqual(conversationsQuery({ mode: 'human' }).queryKey);
  });
});
