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
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { ProcessDetailsPage } = await import('./details.js');

const PROCESS_RECORD = {
  id: 'p1',
  customer: 'c1',
  template: 't1',
  templateVersion: 1,
  stage: 'aberto',
  values: { obs: 'nota original' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockGetDefault(overrides?: { process?: object }) {
  const process = overrides?.process ?? PROCESS_RECORD;
  getMock.mockImplementation((path: string) => {
    if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [process] } });
    if (path === '/field-templates/t1/versions/1') {
      return Promise.resolve({
        success: true,
        data: { fields: [{ fieldId: 'obs', label: 'Observação', type: 'text' }], stages: ['aberto', 'concluido'] },
      });
    }
    throw new Error(`unexpected path ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessDetailsPage />
    </QueryClientProvider>,
  );
}

describe('ProcessDetailsPage — values (T26, WEB-08)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it("WEB-08 AC1: renders values via DynamicField against the record's OWN templateVersion snapshot, never GET /field-templates/current", async () => {
    searchMock.mockReturnValue({ id: 'p1', customerId: 'c1' });
    mockGetDefault();

    renderPage();

    expect(await screen.findByLabelText('Observação')).toHaveValue('nota original');
    expect(getMock).toHaveBeenCalledWith('/field-templates/t1/versions/1');
    expect(getMock.mock.calls.some(([path]) => String(path).includes('/field-templates/current'))).toBe(false);
  });

  it('WEB-08 AC2: a valid save calls PATCH /processes/:id/values and reflects the server’s own returned state without a manual reload', async () => {
    searchMock.mockReturnValue({ id: 'p1', customerId: 'c1' });
    mockGetDefault();
    // O servidor normaliza o texto (trim) — a prova de "reflete o novo
    // estado" é o form mostrar ESSE valor, não simplesmente o que foi
    // digitado localmente.
    patchMock.mockResolvedValue({
      success: true,
      data: { ...PROCESS_RECORD, values: { obs: 'nota normalizada' } },
    });
    const user = userEvent.setup();

    renderPage();
    const input = await screen.findByLabelText('Observação');
    await user.clear(input);
    await user.type(input, '  nota normalizada  ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/processes/p1/values', { values: { obs: '  nota normalizada  ' } }),
    );
    await waitFor(() => expect(screen.getByLabelText('Observação')).toHaveValue('nota normalizada'));
  });

  it('WEB-08 AC2: a 400 response keeps the form filled with the user’s edits and shows the message', async () => {
    searchMock.mockReturnValue({ id: 'p1', customerId: 'c1' });
    mockGetDefault();
    patchMock.mockResolvedValue({ success: false, message: 'obs: valor inválido' });
    const user = userEvent.setup();

    renderPage();
    const input = await screen.findByLabelText('Observação');
    await user.clear(input);
    await user.type(input, 'edição do usuário');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('obs: valor inválido');
    expect(screen.getByLabelText('Observação')).toHaveValue('edição do usuário');
  });

  it('shows an explicit not-found state when the id is not among this customer’s Processes', async () => {
    searchMock.mockReturnValue({ id: 'missing', customerId: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});
