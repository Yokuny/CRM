// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../../../../query/message.js';
import { MediaCard } from './media-card.js';

const IMAGE_MESSAGE: MessageRecord = {
  id: 'm1',
  direction: 'in',
  type: 'image',
  media: { mediaId: 'media-1', mime: 'image/jpeg', caption: 'Foto do produto' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const DOCUMENT_MESSAGE: MessageRecord = {
  id: 'm2',
  direction: 'in',
  type: 'document',
  media: { mediaId: 'media-2', mime: 'application/pdf' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('MediaCard (T24 — INBOX-17/18)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // jsdom não implementa createObjectURL/revokeObjectURL nativamente.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('INBOX-17/AC1: shows icon/mime/caption without any automatic call to the media route', () => {
    render(<MediaCard conversationId="c1" message={IMAGE_MESSAGE} />);

    expect(screen.getByText('image/jpeg')).toBeInTheDocument();
    expect(screen.getByText('Foto do produto')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('INBOX-17/AC2: clicking "Ver" fetches the media route on demand and renders the image', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
    });
    const user = userEvent.setup();

    render(<MediaCard conversationId="c1" message={IMAGE_MESSAGE} />);
    await user.click(screen.getByRole('button', { name: 'Ver' }));

    expect(fetch).toHaveBeenCalledWith('/conversations/c1/messages/m1/media', { credentials: 'include' });
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'blob:mock-url');
  });

  it('INBOX-17/AC2: clicking "Baixar" on a document renders a download link, not an <img>', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
      blob: () => Promise.resolve(new Blob(['x'], { type: 'application/pdf' })),
    });
    const user = userEvent.setup();

    render(<MediaCard conversationId="c1" message={DOCUMENT_MESSAGE} />);
    await user.click(screen.getByRole('button', { name: 'Baixar' }));

    const link = await screen.findByRole('link', { name: 'Baixar' });
    expect(link).toHaveAttribute('href', 'blob:mock-url');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('INBOX-18/AC3: a 502 from the media route shows a readable error without breaking the screen', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ success: false, message: 'Não foi possível carregar essa mídia agora' }),
    });
    const user = userEvent.setup();

    render(<MediaCard conversationId="c1" message={IMAGE_MESSAGE} />);
    await user.click(screen.getByRole('button', { name: 'Ver' }));

    expect(await screen.findByText('Não foi possível carregar essa mídia agora')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('a network failure (fetch throws) shows a generic readable error without throwing', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<MediaCard conversationId="c1" message={IMAGE_MESSAGE} />);
    await user.click(screen.getByRole('button', { name: 'Ver' }));

    expect(await screen.findByText('Não foi possível carregar essa mídia agora.')).toBeInTheDocument();
  });
});
