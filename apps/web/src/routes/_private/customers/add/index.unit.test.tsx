// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const navigateMock = vi.fn();
// Mesmo mock mínimo de customers/index.unit.test.tsx (T18) — Card asPage (T8)
// precisa de useLocation/useMatches/useRouter, e este teste renderiza a
// página isolada, sem <RouterProvider> real.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { CustomerCreatePage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerCreatePage />
    </QueryClientProvider>,
  );
}

const TEMPLATE_WITH_FIELD = {
  template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false },
  fields: [{ fieldId: 'nickname', label: 'Apelido', type: 'text' }],
};

describe('CustomerCreatePage (T22 — WEB-04, WEB-13)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('WEB-04 AC1: renders core fields plus the current template’s dynamic fields via hydrate()/DynamicField', async () => {
    getMock.mockResolvedValue({ success: true, data: TEMPLATE_WITH_FIELD });

    renderPage();

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefone')).toBeInTheDocument();
    expect(screen.getByLabelText('Documento')).toBeInTheDocument();
    expect(screen.getByLabelText('Apelido')).toBeInTheDocument();
  });

  it('Edge Case: a template with no fields beyond core still renders normally (values: {})', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: { template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false }, fields: [] },
    });

    renderPage();

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument();
    expect(screen.queryByLabelText('Apelido')).not.toBeInTheDocument();
  });

  it('WEB-04 AC2: valid submit calls POST /customers and navigates to the new record’s detail on success', async () => {
    getMock.mockResolvedValue({ success: true, data: TEMPLATE_WITH_FIELD });
    postMock.mockResolvedValue({ success: true, data: { id: 'c1', name: 'Ana', phone: '11999999999', values: {} } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByLabelText('Nome');

    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');
    await user.type(screen.getByLabelText('Apelido'), 'Aninha');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/customers', {
        name: 'Ana',
        phone: '11999999999',
        document: undefined,
        values: { nickname: 'Aninha' },
      }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/customers/details', search: { id: 'c1' } }));
  });

  it('WEB-04 AC3: a 400 response keeps the form filled and shows the returned message, without navigating', async () => {
    getMock.mockResolvedValue({ success: true, data: TEMPLATE_WITH_FIELD });
    postMock.mockResolvedValue({ success: false, message: 'values inválidos' });
    const user = userEvent.setup();

    renderPage();
    await screen.findByLabelText('Nome');

    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('values inválidos');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana');
  });

  it('WEB-04/WEB-13 AC4: disables submit while the mutation is pending, and a second click before it resolves is a no-op', async () => {
    getMock.mockResolvedValue({ success: true, data: TEMPLATE_WITH_FIELD });
    let resolvePost: (value: {
      success: true;
      data: { id: string; name: string; phone: string; values: object };
    }) => void = () => {};
    postMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByLabelText('Nome');
    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');

    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    await user.click(submitButton);
    await waitFor(() => expect(submitButton).toBeDisabled());
    await user.click(submitButton);

    expect(postMock).toHaveBeenCalledTimes(1);

    resolvePost({ success: true, data: { id: 'c1', name: 'Ana', phone: '11999999999', values: {} } });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });
});
