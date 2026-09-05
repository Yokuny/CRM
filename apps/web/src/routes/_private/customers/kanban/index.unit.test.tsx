// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, patch: patchMock }));

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

// useLocation/useMatches/useRouter: dependências do Card asPage (T8) — mesmo
// mock mínimo de auth/invite/customers-index.unit.test.tsx (pathname '/' faz
// PageBreadcrumb retornar cedo, sem precisar de um <RouterProvider> real).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    // CustomersViewToggle (T21) renderiza um <Link> real fora do breadcrumb —
    // mesmo motivo dos mocks acima, evita precisar de um <RouterProvider> de
    // verdade; o comportamento do toggle em si é escopo de
    // view-toggle.unit.test.tsx.
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

// biome-ignore lint/suspicious/noExplicitAny: mock props mirror KanbanProvider's real generic shape loosely, for test wiring only
let capturedProps: any;
// Mock mínimo do primitive Kanban (T20 dependency): expõe `onDragEnd`/`data`
// direto, sem precisar simular um drag real via dnd-kit (pointer capture
// etc. não existem no jsdom) — a lógica real testada aqui é a do PRÓPRIO
// `handleDragEnd` da rota (resolveTargetColumn, mutation otimista, rollback).
vi.mock('../../../../components/ui/kanban.js', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanProvider: (props: any) => {
    capturedProps = props;
    return (
      <div>
        {props.columns.map((column: any) => (
          <div key={column.id}>{props.children(column)}</div>
        ))}
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
      {(capturedProps?.data ?? []).filter((item: any) => item.column === id).map((item: any) => children(item))}
    </div>
  ),
  // biome-ignore lint/suspicious/noExplicitAny: mock de teste
  KanbanCard: ({ name }: any) => <div>{name}</div>,
}));

const { CustomersKanbanPage } = await import('./index.js');

const templateResponse = {
  success: true,
  data: {
    template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false },
    fields: [
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        options: [
          { key: 'open', label: 'Aberto', color: '#22c55e', order: 0 },
          { key: 'closed', label: 'Fechado', color: '#ef4444', order: 1 },
        ],
      },
    ],
  },
};

// Fixture com estado real (não estático): `getMock` sempre reflete o
// `status` atual de "c1", e o sucesso de `patchMock` (mockSuccessfulPatch)
// avança esse estado — sem isso, o refetch pós-invalidateQueries de AC2
// devolveria eternamente o dado "antigo" e a asserção nunca casaria com um
// comportamento real de servidor.
let customerStatus: string;

function mockColumnFetches() {
  customerStatus = 'open';
  getMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/field-templates/current')) return templateResponse;
    const status = /status=([^&]+)/.exec(path)?.[1];
    if (status === customerStatus) {
      return {
        success: true,
        data: { items: [{ id: 'c1', name: 'Ana', phone: '11999999999', values: { status } }], total: 1 },
      };
    }
    return { success: true, data: { items: [], total: 0 } };
  });
}

function mockSuccessfulPatch() {
  patchMock.mockImplementation(async (_path: string, body: { values: { status: string } }) => {
    customerStatus = body.values.status;
    return { success: true, data: {} };
  });
}

function renderPage() {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CustomersKanbanPage />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy };
}

describe('CustomersKanbanPage (T20 — WEB-03)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    toastErrorMock.mockReset();
    capturedProps = undefined;
  });

  it('WEB-03 AC1: dropping a card in a different column calls PATCH /customers/:id with {values:{status:targetKey}}', async () => {
    mockColumnFetches();
    mockSuccessfulPatch();
    renderPage();

    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'c1' }, over: { id: 'closed' } });
    });

    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('/customers/c1', { values: { status: 'closed' } }));
  });

  it('WEB-03 AC2: on success, the card stays in the new column and both columns refetch (invalidateQueries called)', async () => {
    mockColumnFetches();
    mockSuccessfulPatch();
    const { invalidateSpy } = renderPage();

    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'c1' }, over: { id: 'closed' } });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    // biome-ignore lint/suspicious/noExplicitAny: mock de teste
    await waitFor(() => expect(capturedProps.data.find((item: any) => item.id === 'c1')?.column).toBe('closed'));
  });

  it('WEB-03 AC3: on failure, the card visually returns to its origin column and toast.error fires (never stuck in the rejected column)', async () => {
    mockColumnFetches();
    patchMock.mockResolvedValue({ success: false, message: 'Falha ao mover.' });
    renderPage();

    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    await act(async () => {
      capturedProps.onDragEnd({ active: { id: 'c1' }, over: { id: 'closed' } });
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    // biome-ignore lint/suspicious/noExplicitAny: mock de teste
    expect(capturedProps.data.find((item: any) => item.id === 'c1').column).toBe('open');
  });

  it('WEB-03 AC4: a second drag before the first mutation settles is never blocked (no optimistic lock, both calls fire)', async () => {
    mockColumnFetches();
    mockSuccessfulPatch(); // resposta padrão a partir da 2ª chamada
    let resolveFirst: (value: unknown) => void = () => undefined;
    patchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    renderPage();

    await waitFor(() => expect(capturedProps?.data?.length).toBe(1));

    act(() => {
      capturedProps.onDragEnd({ active: { id: 'c1' }, over: { id: 'closed' } });
    });
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));

    act(() => {
      capturedProps.onDragEnd({ active: { id: 'c1' }, over: { id: 'open' } });
    });
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));

    // limpa a promise pendente da primeira chamada (evita vazamento entre testes)
    await act(async () => {
      resolveFirst({ success: true, data: {} });
    });
  });
});
