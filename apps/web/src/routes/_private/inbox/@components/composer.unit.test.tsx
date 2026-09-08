// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { Composer, ResendButton } = await import('./composer.js');
const { toast } = await import('sonner');

const OPEN_CONVERSATION = {
  id: 'c1',
  customer: 'cust1',
  mode: 'bot' as const,
  lastActivityAt: '2026-01-01T00:00:00.000Z',
  unread: false,
  windowOpen: true,
};

const CLOSED_CONVERSATION = { ...OPEN_CONVERSATION, windowOpen: false };

function renderComposer(conversation = OPEN_CONVERSATION) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Composer conversation={conversation} />
    </QueryClientProvider>,
  );
}

describe('Composer (T25 — INBOX-11/12/13)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('INBOX-11/AC1: window open enables free text and calls POST /:id/messages on send', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 'm1', direction: 'out', type: 'text', status: 'queued' } });
    const user = userEvent.setup();

    renderComposer(OPEN_CONVERSATION);

    const input = screen.getByPlaceholderText('Escreva uma mensagem…');
    expect(input).toBeEnabled();
    await user.type(input, 'Olá cliente');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/conversations/c1/messages', { text: 'Olá cliente' }));
    expect(screen.queryByRole('link', { name: 'Abrir no WhatsApp' })).not.toBeInTheDocument();
  });

  it('INBOX-12/AC2: window closed disables text and shows the wa.me button, with no send call', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: { id: 'cust1', name: 'Ana', phone: '5511999999999', values: {} },
    });

    renderComposer(CLOSED_CONVERSATION);

    expect(screen.queryByPlaceholderText('Escreva uma mensagem…')).not.toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Abrir no WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/5511999999999');
    expect(link).toHaveAttribute('target', '_blank');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('edge case (spec.md): uses the phone verbatim as stored, no digit-stripping/normalization', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: { id: 'cust1', name: 'Ana', phone: '+55 (11) 99999-9999', values: {} },
    });

    renderComposer(CLOSED_CONVERSATION);

    const link = await screen.findByRole('link', { name: 'Abrir no WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/+55 (11) 99999-9999');
  });

  it('a failed send shows a toast and keeps the typed text (react state untouched on error)', async () => {
    postMock.mockResolvedValue({ success: false, message: 'Fora da janela de 24 horas' });
    const user = userEvent.setup();

    renderComposer(OPEN_CONVERSATION);
    const input = screen.getByPlaceholderText('Escreva uma mensagem…');
    await user.type(input, 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fora da janela de 24 horas'));
    expect(input).toHaveValue('oi');
  });
});

describe('ResendButton (T25 — INBOX-14/15/16)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('INBOX-14/AC2: clicking resend calls POST .../resend for that specific failed Message', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 'm2', direction: 'out', type: 'text', status: 'queued' } });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ResendButton conversationId="c1" messageId="m1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Reenviar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/conversations/c1/messages/m1/resend'));
  });
});
