// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('../../../lib/api/client.api.js', () => ({ get: getMock, patch: patchMock }));

const searchMock = vi.fn();
// Mesmo mock mínimo de customers/index.unit.test.tsx (T18) — Card asPage (T8)
// precisa de useLocation/useMatches/useRouter, sem <RouterProvider> real.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    // `search` vira querystring no href — permite afirmar o `customerId`/`id`
    // pré-preenchido nos links de "novo processo" (WEB-07 AC1) e "voltar"
    // sem precisar de um router real.
    Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children?: ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}>{children}</a>
    ),
  };
});

const { CustomerDetailsPage } = await import('./details.js');

function renderPage() {
  // retry:false — a resposta 404 do WEB-05 AC2 (customerQuery lança) senão
  // ficaria retentando (TanStack Query default: 3 tentativas com backoff),
  // deixando `isLoading` verdadeiro além do timeout do findByText.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerDetailsPage />
    </QueryClientProvider>,
  );
}

describe('CustomerDetailsPage (T23 — WEB-05)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it('WEB-05 AC1: fetches via GET /customers/:id (e.g. direct nav/reload) and shows core + values', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({
          success: true,
          data: {
            id: 'c1',
            name: 'Ana',
            phone: '11999999999',
            document: '12345678900',
            values: { nickname: 'Aninha' },
          },
        });
      }
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('12345678900')).toBeInTheDocument();
    expect(screen.getByText('Aninha')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/customers/c1');
  });

  it('WEB-05 AC2: a missing or cross-tenant id shows an explicit not-found state, never a broken screen', async () => {
    searchMock.mockReturnValue({ id: 'missing' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/missing') return Promise.resolve({ success: false, message: 'Customer não encontrado' });
      if (path === '/processes?customerId=missing') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('WEB-07 AC1: shows a "novo processo" link opening /processes/add with this Customer’s id preset', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({ success: true, data: { id: 'c1', name: 'Ana', phone: '119', values: {} } });
      }
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    const { container } = renderPage();
    await screen.findByText('Ana');

    const shortcut = container.querySelector('a[href^="/processes/add"]');
    expect(shortcut).not.toBeNull();
    expect(shortcut?.getAttribute('href')).toBe('/processes/add?customerId=c1');
  });

  it('WEB-05 AC3: shows the Customer’s Process list via GET /processes?customerId=:id', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({ success: true, data: { id: 'c1', name: 'Ana', phone: '119', values: {} } });
      }
      if (path === '/processes?customerId=c1') {
        return Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: 'p1',
                customer: 'c1',
                template: 't1',
                templateVersion: 1,
                stage: 'aberto',
                values: {},
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const { container } = renderPage();

    expect(await screen.findByText('aberto')).toBeInTheDocument();
    const link = container.querySelector('a[href^="/processes/details"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/processes/details?id=p1&customerId=c1');
  });

  it('WEB-05 AC3: shows an explicit empty state ("nenhum Process ainda") when the Process list is empty', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({ success: true, data: { id: 'c1', name: 'Ana', phone: '119', values: {} } });
      }
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    await screen.findByText('Ana');
    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});

const TEMPLATE_WITH_FIELD = {
  template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false },
  fields: [{ fieldId: 'nickname', label: 'Apelido', type: 'text' }],
};

function mockGetForEdit(overrides?: { customer?: object }) {
  const customer = overrides?.customer ?? {
    id: 'c1',
    name: 'Ana',
    phone: '11999999999',
    document: '12345678900',
    values: { nickname: 'Aninha' },
  };
  getMock.mockImplementation((path: string) => {
    if (path === '/customers/c1') return Promise.resolve({ success: true, data: customer });
    if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
    if (path === '/field-templates/current?targetType=customer&key=default') {
      return Promise.resolve({ success: true, data: TEMPLATE_WITH_FIELD });
    }
    throw new Error(`unexpected path ${path}`);
  });
}

describe('CustomerDetailsPage — edit mode (T24, WEB-06)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it('WEB-06 AC1: edit mode pre-fills core + values from the loaded record', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    mockGetForEdit();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CustomerDetailsPage />
      </QueryClientProvider>,
    );
    await screen.findByText('Ana');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByLabelText('Nome')).toHaveValue('Ana');
    expect(screen.getByLabelText('Telefone')).toHaveValue('11999999999');
    expect(screen.getByLabelText('Documento')).toHaveValue('12345678900');
    expect(screen.getByLabelText('Apelido')).toHaveValue('Aninha');
  });

  it('WEB-06 AC2: a valid save persists via PATCH /customers/:id and reflects the new values in the detail view without a manual reload', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    mockGetForEdit();
    patchMock.mockResolvedValue({
      success: true,
      data: {
        id: 'c1',
        name: 'Ana Nova',
        phone: '11999999999',
        document: '12345678900',
        values: { nickname: 'Aninha' },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CustomerDetailsPage />
      </QueryClientProvider>,
    );
    await screen.findByText('Ana');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ana Nova');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/customers/c1', {
        name: 'Ana Nova',
        phone: '11999999999',
        document: '12345678900',
        values: { nickname: 'Aninha' },
      }),
    );
    // Volta ao modo visualização com o novo nome, sem nenhum novo GET
    // /customers/c1 (setQueryData, não invalidateQueries+refetch).
    expect(await screen.findByText('Ana Nova')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/customers/c1');
    expect(getMock.mock.calls.filter(([path]) => path === '/customers/c1')).toHaveLength(1);
  });

  it('WEB-06 AC3: a 400 response keeps the form filled with the user’s edits, shows the message, and leaves the original record unchanged', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    mockGetForEdit();
    patchMock.mockResolvedValue({ success: false, message: 'values inválidos' });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CustomerDetailsPage />
      </QueryClientProvider>,
    );
    await screen.findByText('Ana');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const nameInput = await screen.findByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ana Editada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('values inválidos');
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Editada');

    // Cancela e confirma que a visualização mostra o registro ORIGINAL — nada
    // foi persistido/gravado no cache pela tentativa que falhou.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Ana Editada')).not.toBeInTheDocument();
  });
});
