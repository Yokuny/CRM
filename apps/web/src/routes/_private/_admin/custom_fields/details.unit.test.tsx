// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

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

const { CustomFieldDetailsPage } = await import('./details.js');

const CURRENT = {
  template: { id: 't1', name: 'Tratamento estético', currentVersion: 3, archived: false },
  stages: ['Avaliação', 'Concluído'],
  fields: [
    {
      fieldId: 'procedimento',
      label: 'Procedimento',
      type: 'select',
      required: true,
      options: [
        { key: 'peeling', label: 'Peeling' },
        { key: 'drenagem', label: 'Drenagem' },
      ],
    },
    { fieldId: 'observacoes', label: 'Observações', type: 'text', multiline: true },
  ],
};

function renderPage() {
  searchMock.mockReturnValue({ targetType: 'process', key: 'tratamento' });
  getMock.mockImplementation((path: string) => {
    if (path === '/field-templates/current?targetType=process&key=tratamento') {
      return Promise.resolve({ success: true, data: CURRENT });
    }
    throw new Error(`unexpected path ${path}`);
  });
  postMock.mockResolvedValue({ success: true, data: { currentVersion: 4 } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomFieldDetailsPage />
    </QueryClientProvider>,
  );
}

describe('CustomFieldDetailsPage', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    searchMock.mockReset();
  });

  it('shows the template read-only: stages, and each field by label with type, requirement and options', async () => {
    renderPage();

    expect(await screen.findByText('Tratamento estético')).toBeInTheDocument();
    expect(screen.getByText('1. Avaliação')).toBeInTheDocument();
    const procedure = within(screen.getByTestId('field-procedimento'));
    expect(procedure.getByText('Procedimento')).toBeInTheDocument();
    expect(procedure.getByText('Seleção · Obrigatório')).toBeInTheDocument();
    expect(procedure.getByText('Peeling, Drenagem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('an additive edit (new field) posts the next version with expectedVersion and no migration plan', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    const newField = within(screen.getByTestId('field-editor-2'));
    await user.type(newField.getByPlaceholderText('Ex.: Data de nascimento'), 'Última sessão');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/field-templates/t1/versions');
    expect(body).toMatchObject({ expectedVersion: 3, stages: ['Avaliação', 'Concluído'] });
    expect(body.migration).toBeUndefined();
    expect((body.fields as Array<{ fieldId: string }>).map((field) => field.fieldId)).toEqual([
      'procedimento',
      'observacoes',
      'ultimaSessao',
    ]);
  });

  it('removing a field asks what to do with the saved values before posting, then sends the chosen plan', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(within(screen.getByTestId('field-editor-1')).getByRole('button', { name: 'Remover' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const plan = within(await screen.findByTestId('migration-plan'));
    expect(plan.getByText(/Observações — Campo removido/)).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();

    // Salvar de novo sem escolher: continua bloqueado, agora com o aviso.
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Escolha o que fazer em cada mudança.')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();

    await user.click(plan.getByRole('combobox', { name: 'Observações' }));
    await user.click(await screen.findByRole('option', { name: 'Descartar os valores' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0]?.[1]).toMatchObject({
      expectedVersion: 3,
      migration: { observacoes: { action: 'discard' } },
    });
  });

  it('archiving asks for confirmation first and only then posts to /archive', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));
    const confirm = within(screen.getByTestId('archive-confirm'));
    expect(postMock).not.toHaveBeenCalled();
    await user.click(confirm.getByRole('button', { name: 'Arquivar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/field-templates/t1/archive'));
  });
});
