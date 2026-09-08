// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationRecord } from '../../../../query/conversation.js';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { TakeoverBadge } = await import('./takeover-badge.js');
const { toast } = await import('sonner');
const { conversationsQuery } = await import('../../../../query/conversation.js');

const SESSION_RESPONSE = {
  success: true,
  data: {
    tenant: { id: 't1', name: 'Tenant', status: 'active' },
    user: { id: 'u1', name: 'Ana', email: 'ana@x.com' },
    role: ['operador'],
  },
};

const BOT_CONVERSATION: ConversationRecord = {
  id: 'c1',
  customer: 'cust1',
  mode: 'bot',
  lastActivityAt: '2026-01-01T00:00:00.000Z',
  unread: false,
  windowOpen: true,
};

function renderBadge(
  conversation: ConversationRecord = BOT_CONVERSATION,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TakeoverBadge conversation={conversation} />
      </QueryClientProvider>,
    ),
  };
}

describe('TakeoverBadge (T26 — INBOX-08/09/10)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('INBOX-10/AC5: shows the mode badge (bot) with no "Liberar" button when the conversation is free', () => {
    getMock.mockResolvedValue(SESSION_RESPONSE);

    renderBadge(BOT_CONVERSATION);

    expect(screen.getByText('Bot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assumir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Liberar' })).not.toBeInTheDocument();
  });

  it('INBOX-08/AC1: clicking "Assumir" on a free conversation succeeds and updates the badge without a manual reload', async () => {
    getMock.mockResolvedValue(SESSION_RESPONSE);
    postMock.mockResolvedValue({ success: true, data: { mode: 'human', assignee: 'u1', assigneeName: 'Ana' } });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Popula o cache de conversationsQuery (mesma prática de useInboxSocket)
    // para provar que o badge propaga a atualização por setQueriesData, não
    // por um segundo estado local.
    queryClient.setQueryData(conversationsQuery({ limit: 100 }).queryKey, { items: [BOT_CONVERSATION], total: 1 });

    renderBadge(BOT_CONVERSATION, queryClient);
    await user.click(screen.getByRole('button', { name: 'Assumir' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/conversations/c1/takeover'));
    await waitFor(() =>
      expect(queryClient.getQueryData(conversationsQuery({ limit: 100 }).queryKey)).toEqual({
        items: [{ ...BOT_CONVERSATION, mode: 'human', assignee: 'u1', assigneeName: 'Ana' }],
        total: 1,
      }),
    );
  });

  it('INBOX-08/AC3: a 409 conflict shows a toast naming the current assignee (message comes straight from the backend)', async () => {
    getMock.mockResolvedValue(SESSION_RESPONSE);
    postMock.mockResolvedValue({ success: false, message: 'Conversa já assumida por Carlos' });
    const user = userEvent.setup();

    renderBadge({ ...BOT_CONVERSATION, mode: 'human', assignee: 'someone-else' });
    await user.click(screen.getByRole('button', { name: 'Assumir' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Conversa já assumida por Carlos'));
  });

  it('INBOX-09: "Liberar" is available and works for any operator, not just the current assignee', async () => {
    getMock.mockResolvedValue(SESSION_RESPONSE);
    postMock.mockResolvedValue({ success: true, data: { mode: 'bot', assignee: undefined } });
    const user = userEvent.setup();

    // assignee é "outro operador" (someone-else), não a sessão atual (u1) —
    // o botão precisa aparecer e funcionar mesmo assim.
    renderBadge({ ...BOT_CONVERSATION, mode: 'human', assignee: 'someone-else' });
    const releaseButton = await screen.findByRole('button', { name: 'Liberar' });
    await user.click(releaseButton);

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/conversations/c1/release'));
  });

  it("INBOX-10/AC5: shows the assignee's real name (assigneeName, resolved server-side), never the raw id", async () => {
    getMock.mockResolvedValue(SESSION_RESPONSE);

    renderBadge({ ...BOT_CONVERSATION, mode: 'human', assignee: 'u1', assigneeName: 'Ana' });

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('u1')).not.toBeInTheDocument();
  });
});
