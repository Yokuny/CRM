// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Select (dentro do CardPanel) chama APIs que o jsdom não implementa —
// mesmo polyfill mínimo de card-panel.unit.test.tsx/appointment-panel.unit.test.tsx.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, patch: patchMock, post: vi.fn(), del: vi.fn() }));

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

const searchMock = vi.fn();
// Mock mínimo de @tanstack/react-router (apps/web/CLAUDE.md, Testes).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

// Mock mínimo do primitive Kanban (T20 dependency): expõe onDragEnd/data
// diretamente, sem simular um drag real via dnd-kit (pointer capture etc.
// não existem no jsdom) — a lógica testada aqui é a do PRÓPRIO handleDragEnd
// da rota. Mesmo formato de customers/kanban/index.unit.test.tsx.
// biome-ignore lint/suspicious/noExplicitAny: mock props espelham o formato genérico real só pra fiação de teste
let capturedProps: any;
vi.mock('@/components/ui/kanban.js', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanProvider: (props: any) => {
    capturedProps = props;
    return (
      <div>
        {props.columns.map(
          // biome-ignore lint/suspicious/noExplicitAny: mock de teste
          (column: any) => (
            <div key={column.id}>{props.children(column)}</div>
          ),
        )}
      </div>
    );
  },
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanBoard: ({ children }: any) => <div>{children}</div>,
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanHeader: ({ children }: any) => <div>{children}</div>,
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanCards: ({ id, children }: any) => (
    <div>
      {(capturedProps?.data ?? [])
        // biome-ignore lint/suspicious/noExplicitAny: mock de teste
        .filter((item: any) => item.column === id)
        // biome-ignore lint/suspicious/noExplicitAny: mock de teste
        .map((item: any) => children(item))}
    </div>
  ),
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanCard: ({ children, name }: any) => <div>{children ?? name}</div>,
}));

const { KanbanDetailsPage } = await import('./details.js');

const BOARD = {
  id: 'b1',
  name: 'Cobranças',
  columns: [
    { id: 'col-a', label: 'A fazer', order: 0 },
    { id: 'col-b', label: 'Feito', order: 1 },
  ],
  updatedAt: '',
};

const CARD = {
  id: 'card1',
  board: 'b1',
  column: 'col-a',
  title: 'Ligar para o cliente',
  position: 0,
  createdAt: '',
  updatedAt: '',
};

// Estado mutável (não estático): igual a mockSuccessfulPatch em
// customers/kanban/index.unit.test.tsx — sem isso, o refetch pós-
// invalidateQueries do sucesso da mutation devolveria eternamente a coluna
// ANTIGA do card, mascarando a mudança real (o teste veria o card "voltar"
// pra origem mesmo com o move aceito pelo servidor).
let cardsState: (typeof CARD)[];

function mockBoardAndCards(cards = [CARD]) {
  cardsState = cards.map((card) => ({ ...card }));
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/boards/b1/cards')) return Promise.resolve({ success: true, data: cardsState });
    if (path.startsWith('/boards/b1')) return Promise.resolve({ success: true, data: BOARD });
    if (path.startsWith('/customers')) return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    return Promise.resolve({ success: false, message: 'Board não encontrado.' });
  });
}

// KAN-18: move bem-sucedido reflete no ESTADO do servidor mockado — sem
// isso o card "voltaria" pra coluna antiga assim que a lista de cards fosse
// invalidada (mesmo motivo de mockSuccessfulPatch em customers/kanban).
function mockSuccessfulMove() {
  patchMock.mockImplementation((path: string, body: { column: string; position: number }) => {
    const match = /\/cards\/([^/]+)\/move$/.exec(path);
    if (match?.[1]) {
      const card = cardsState.find((c) => c.id === match[1]);
      if (card) {
        card.column = body.column;
        card.position = body.position;
      }
      return Promise.resolve({ success: true, data: card });
    }
    return Promise.resolve({ success: true, data: {} });
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  searchMock.mockReturnValue({ id: 'b1' });
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanDetailsPage />
    </QueryClientProvider>,
  );
}

describe('KanbanDetailsPage (T20, spec.md KAN-03/KAN-06/KAN-18/KAN-19/KAN-20/KAN-21)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    toastErrorMock.mockReset();
    searchMock.mockReset();
    capturedProps = undefined;
  });

  it('renders the loading state while board/cards are pending', () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando…' })).toBeInTheDocument();
  });

  it('renders every column with its cards once loaded (KAN-03 via GET /boards/:id)', async () => {
    mockBoardAndCards();
    renderPage();

    expect(await screen.findByText('A fazer')).toBeInTheDocument();
    expect(screen.getByText('Feito')).toBeInTheDocument();
    expect(screen.getByText('Ligar para o cliente')).toBeInTheDocument();
  });

  it('shows the empty/404 state for a board id that does not exist or belongs to another tenant (KAN-06)', async () => {
    getMock.mockResolvedValue({ success: false, message: 'Board não encontrado' });
    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('dropping a card on a different column calls PATCH .../move and reflects it optimistically (KAN-18)', async () => {
    mockBoardAndCards();
    mockSuccessfulMove();
    renderPage();
    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'card1' }, over: { id: 'col-b' } });
    });

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/boards/b1/cards/card1/move', { column: 'col-b', position: 0 }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: mock de teste
    await waitFor(() => expect(capturedProps.data.find((item: any) => item.id === 'card1')?.column).toBe('col-b'));
  });

  it('reverts the card to its origin column and shows a toast when the move fails (KAN-20)', async () => {
    mockBoardAndCards();
    patchMock.mockResolvedValue({ success: false, message: 'Coluna não existe neste board' });
    renderPage();
    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'card1' }, over: { id: 'col-b' } });
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Não foi possível mover o card. Tente novamente.'));
    // biome-ignore lint/suspicious/noExplicitAny: mock de teste
    expect(capturedProps.data.find((item: any) => item.id === 'card1')?.column).toBe('col-a');
  });

  it('a move payload targeting a column that no longer exists is still sent to the backend, which is the one that rejects it (KAN-21)', async () => {
    mockBoardAndCards();
    patchMock.mockResolvedValue({ success: false, message: 'Coluna não existe neste board' });
    renderPage();
    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'card1' }, over: { id: 'missing-column' } });
    });

    // `over.id` não é nem coluna nem outro card conhecido -> handleDragEnd
    // não resolve nenhum alvo e nunca chama a mutation (proteção client-side
    // básica); a validação de verdade (KAN-21) já é 1:1 testada no e2e do
    // backend (board.router.e2e.test.ts, T13).
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('opens the create card-panel from a column\'s "Adicionar" button', async () => {
    mockBoardAndCards();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('A fazer');

    await user.click(screen.getAllByRole('button', { name: /Adicionar/ })[0] as HTMLElement);

    expect(await screen.findByText('Novo card')).toBeInTheDocument();
  });

  it('opens the edit card-panel from an existing card\'s "Editar" action', async () => {
    mockBoardAndCards();
    const user = userEvent.setup();
    renderPage();
    const cardTitle = await screen.findByText('Ligar para o cliente');

    // `getByRole('button', {name:'Editar'})` sozinho seria ambíguo agora: o
    // CardHeader também tem um `Editar` (T20-followup, padrão view/edit de
    // apps/web/CLAUDE.md, edita nome/descrição do board) — escopar pelo
    // `data-slot="item-content"` do próprio card (item.tsx) pega só a ação
    // deste card.
    const cardContent = cardTitle.closest('[data-slot="item-content"]') as HTMLElement;
    await user.click(within(cardContent).getByRole('button', { name: 'Editar' }));

    expect(await screen.findByDisplayValue('Ligar para o cliente')).toBeInTheDocument();
  });

  it('opens the column-manager-panel from the "Colunas" header button', async () => {
    mockBoardAndCards();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('A fazer');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));

    expect(await screen.findByText('Gerenciar colunas')).toBeInTheDocument();
  });
});
