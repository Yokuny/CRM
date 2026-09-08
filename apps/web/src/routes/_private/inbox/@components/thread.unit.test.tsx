// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock }));

const { ConversationThread } = await import('./thread.js');
const { messageKeys } = await import('../../../../query/message.js');

function renderThread(conversationId: string, props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ConversationThread conversationId={conversationId} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe('ConversationThread (T23 — INBOX-05/06/07/10/15)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
  });

  it('INBOX-06/AC3: shows an explicit empty state when the Conversation has no Message yet', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderThread('c1');

    expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeInTheDocument();
  });

  it('INBOX-05/AC1: renders the paginated history in chronological order', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 'm1', direction: 'in', type: 'text', text: 'Olá', createdAt: '2026-01-01T10:00:00.000Z' },
          { id: 'm2', direction: 'out', type: 'text', text: 'Tudo bem?', createdAt: '2026-01-01T10:05:00.000Z' },
        ],
        total: 2,
      },
    });

    renderThread('c1');

    const first = await screen.findByText('Olá');
    const second = await screen.findByText('Tudo bem?');
    // getMessages (T9) já ordena por createdAt asc — a thread renderiza na
    // mesma ordem recebida, sem reordenar/inverter no cliente.
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('INBOX-15: a failed Message stays visible with its "Falhou" badge — it never disappears or gets replaced', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'm1',
            direction: 'out',
            type: 'text',
            text: 'Oi',
            status: 'failed',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        ],
        total: 1,
      },
    });

    renderThread('c1');

    expect(await screen.findByText('Oi')).toBeInTheDocument();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });

  it('renderFailedAction is invoked only for failed messages (composer/T25 attaches the resend button here)', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'm1',
            direction: 'out',
            type: 'text',
            text: 'ok',
            status: 'sent',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
          {
            id: 'm2',
            direction: 'out',
            type: 'text',
            text: 'falhou',
            status: 'failed',
            createdAt: '2026-01-01T10:01:00.000Z',
          },
        ],
        total: 2,
      },
    });
    const renderFailedAction = vi.fn((message) => <button type="button">{`resend-${message.id}`}</button>);

    renderThread('c1', { renderFailedAction });

    await screen.findByText('falhou');
    expect(renderFailedAction).toHaveBeenCalledTimes(1);
    expect(renderFailedAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }));
    expect(screen.getByText('resend-m2')).toBeInTheDocument();
  });

  it('INBOX-05/AC4: a message pushed into the shared cache by useInboxSocket appears without a new GET request', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [{ id: 'm1', direction: 'in', type: 'text', text: 'Oi', createdAt: '2026-01-01T10:00:00.000Z' }],
        total: 1,
      },
    });

    const { queryClient } = renderThread('c1');
    await screen.findByText('Oi');
    expect(getMock).toHaveBeenCalledTimes(1);

    // Mesma técnica de hooks/useInboxSocket.ts (applyMessageNew) —
    // setQueriesData no prefixo listsForConversation, sem invalidateQueries.
    queryClient.setQueriesData({ queryKey: messageKeys.listsForConversation('c1') }, (old: unknown) => {
      const current = old as { items: unknown[]; total: number };
      return {
        items: [
          ...current.items,
          { id: 'm2', direction: 'in', type: 'text', text: 'Nova mensagem', createdAt: '2026-01-01T10:02:00.000Z' },
        ],
        total: current.total + 1,
      };
    });

    expect(await screen.findByText('Nova mensagem')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('renders a template message inline by name', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'm1',
            direction: 'out',
            type: 'text',
            templateName: 'boas_vindas',
            templateLanguage: 'pt_BR',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        ],
        total: 1,
      },
    });

    renderThread('c1');

    expect(await screen.findByText('boas_vindas')).toBeInTheDocument();
  });
});
