// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
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

const { CustomFieldAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomFieldAddPage />
    </QueryClientProvider>,
  );
}

describe('CustomFieldAddPage', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('creates a process type (key from the name) and opens its details', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 't9', currentVersion: 1 } });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText('Ex.: Tratamento estético'), 'Pós-venda VIP');
    await user.type(screen.getByPlaceholderText('Ex.: Em andamento'), 'Contato');
    const field = within(screen.getByTestId('field-editor-0'));
    await user.type(field.getByPlaceholderText('Ex.: Data de nascimento'), 'Canal preferido');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/field-templates', {
        targetType: 'process',
        key: 'pos_venda_vip',
        name: 'Pós-venda VIP',
        stages: ['Contato'],
        fields: [
          { fieldId: 'canalPreferido', label: 'Canal preferido', required: false, type: 'text', multiline: false },
        ],
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/custom_fields/details',
      search: { targetType: 'process', key: 'pos_venda_vip' },
    });
  });

  it('blocks saving without a name, a stage or a field label — nothing is posted', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('O nome deve ter entre 3 e 120 caracteres.')).toBeInTheDocument();
    expect(screen.getAllByText('Preencha este campo.')).toHaveLength(2);
    expect(postMock).not.toHaveBeenCalled();
  });
});
