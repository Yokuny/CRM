// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock }));

const { ConversationQueue } = await import('./conversation-queue.js');

const SESSION_RESPONSE = {
  success: true,
  data: {
    tenant: { id: 't1', name: 'Tenant', status: 'active' },
    user: { id: 'u1', name: 'Ana', email: 'ana@x.com' },
    role: ['operador'],
  },
};

function renderQueue(onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ConversationQueue onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return { ...utils, onSelect };
}

describe('ConversationQueue (T22 — INBOX-01/03/10)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
  });

  it('INBOX-01/AC1: renders the paginated queue with customer/mode/lastActivityAt/unread/window columns, server-driven', async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      if (path === '/conversations?page=1&limit=20') {
        return Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: 'c1',
                customer: 'cust1',
                mode: 'bot',
                lastActivityAt: '2026-01-01T00:00:00.000Z',
                unread: true,
                windowOpen: true,
                windowExpiresAt: '2026-01-02T00:00:00.000Z',
              },
            ],
            total: 1,
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    renderQueue();

    expect(await screen.findByText('cust1')).toBeInTheDocument();
    // getByRole('cell', ...), não getByText: o filtro "Bot" (botão) e a
    // célula da tabela têm o mesmo texto — o cell é a célula da linha, não o
    // botão de filtro.
    expect(screen.getByRole('cell', { name: 'Bot' })).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/conversations?page=1&limit=20');
  });

  it(`INBOX-10/AC5: mode:"human" shows the assignee's real name (assigneeName, resolved server-side), never the raw id`, async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      return Promise.resolve({
        success: true,
        data: {
          items: [
            {
              id: 'c1',
              customer: 'cust1',
              mode: 'human',
              assignee: 'u1',
              assigneeName: 'Ana',
              lastActivityAt: '2026-01-01T00:00:00.000Z',
              unread: false,
              windowOpen: false,
            },
          ],
          total: 1,
        },
      });
    });

    renderQueue();

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('u1')).not.toBeInTheDocument();
  });

  it(`INBOX-10/AC5: mode:"human" with a different assignee shows that assignee's real name, never the raw id`, async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      return Promise.resolve({
        success: true,
        data: {
          items: [
            {
              id: 'c1',
              customer: 'cust1',
              mode: 'human',
              assignee: 'someone-else',
              assigneeName: 'Carlos',
              lastActivityAt: '2026-01-01T00:00:00.000Z',
              unread: false,
              windowOpen: false,
            },
          ],
          total: 1,
        },
      });
    });

    renderQueue();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();
    expect(screen.queryByText('someone-else')).not.toBeInTheDocument();
  });

  it('INBOX-02/AC2: mode filter re-fetches with the mode query param', async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });
    const user = userEvent.setup();

    renderQueue();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/conversations?page=1&limit=20'));

    await user.click(screen.getByRole('button', { name: 'Humano' }));

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/conversations?mode=human&page=1&limit=20'));
  });

  it('INBOX-02/AC2: the built-in search box drives the assignee filter server-side', async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });
    const user = userEvent.setup();

    renderQueue();
    const searchInput = await screen.findByPlaceholderText('Buscar…');
    expect(getMock).toHaveBeenCalledWith('/conversations?page=1&limit=20');

    await user.type(searchInput, 'u1');

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/conversations?assignee=u1&page=1&limit=20'), {
      timeout: 2000,
    });
  });

  it('clicking a row calls onSelect with that conversation id (navigates to search:{id})', async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve(SESSION_RESPONSE);
      return Promise.resolve({
        success: true,
        data: {
          items: [
            {
              id: 'c1',
              customer: 'cust1',
              mode: 'bot',
              lastActivityAt: '2026-01-01T00:00:00.000Z',
              unread: false,
              windowOpen: false,
            },
          ],
          total: 1,
        },
      });
    });
    const user = userEvent.setup();

    const { onSelect } = renderQueue();
    await screen.findByText('cust1');

    await user.click(screen.getByText('cust1'));

    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
