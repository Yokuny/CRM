import type {
  CreateBoard,
  CreateCard,
  CreateColumn,
  MoveCard,
  UpdateBoard,
  UpdateCard,
  UpdateColumn,
} from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { del, get, patch, post } from '../lib/api/client.api.js';

// Espelham board.repository.ts/card.repository.ts (apps/crm-api) — a
// verdade fica no back-end; este tipo só descreve o que a tela consome
// (mesma convenção de "espelho local" de query/professional.ts). Datas
// chegam como string ISO (JSON não serializa Date).
export type BoardColumnRecord = { id: string; label: string; order: number; color?: string };

export type BoardRecord = {
  id: string;
  name: string;
  description?: string;
  columns: BoardColumnRecord[];
  createdAt: string;
  updatedAt: string;
};

export type BoardWithCardCount = BoardRecord & { cardCount: number };

export type CardRecord = {
  id: string;
  board: string;
  column: string;
  title: string;
  description?: string;
  position: number;
  customer?: string;
  customerName?: string;
  process?: string;
  processStage?: string;
  processTemplateName?: string;
  order?: string;
  orderTotalPrice?: number;
  orderStatus?: string;
  assignee?: string;
  assigneeName?: string;
  createdAt: string;
  updatedAt: string;
};

export const boardKeys = {
  all: ['board'] as const,
  lists: () => [...boardKeys.all, 'list'] as const,
  details: () => [...boardKeys.all, 'detail'] as const,
  detail: (id: string) => [...boardKeys.details(), id] as const,
  cardsList: (boardId: string) => [...boardKeys.detail(boardId), 'cards'] as const,
};

// spec.md KAN-03: hub lista todos os boards do tenant, ordenados por
// atualização mais recente (já garantido pelo backend, board.repository.
// listBoards) — sem paginação (spec.md Assumptions).
export const boardsQuery = () =>
  queryOptions({
    queryKey: boardKeys.lists(),
    queryFn: async (): Promise<BoardWithCardCount[]> => {
      const res = await get<BoardWithCardCount[]>('/boards');
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os boards.');
      return res.data;
    },
  });

export const boardQuery = (id: string) =>
  queryOptions({
    queryKey: boardKeys.detail(id),
    queryFn: async (): Promise<BoardRecord> => {
      const res = await get<BoardRecord>(`/boards/${encodeURIComponent(id)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Board não encontrado.');
      return res.data;
    },
  });

export const boardCardsQuery = (boardId: string) =>
  queryOptions({
    queryKey: boardKeys.cardsList(boardId),
    queryFn: async (): Promise<CardRecord[]> => {
      const res = await get<CardRecord[]>(`/boards/${encodeURIComponent(boardId)}/cards`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os cards.');
      return res.data;
    },
  });

// spec.md KAN-01: cria um board com colunas iniciais. Invalida a lista do
// hub no sucesso, mesmo padrão de createProfessionalMutation.
export const createBoardMutation = (queryClient: QueryClient): UseMutationOptions<BoardRecord, Error, CreateBoard> => ({
  mutationFn: async (data) => {
    const res = await post<BoardRecord>('/boards', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o board.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: boardKeys.lists() });
  },
});

// spec.md KAN-04: edita nome/descrição de um board existente.
export const updateBoardMutation = (
  queryClient: QueryClient,
): UseMutationOptions<BoardRecord, Error, { id: string; data: UpdateBoard }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await patch<BoardRecord>(`/boards/${encodeURIComponent(id)}`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar o board.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.lists() });
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.id) });
  },
});

// spec.md KAN-22: apaga o board e todos os seus cards (cascata no backend,
// admin-only) — o controller (T10) responde só uma mensagem, sem `data`.
export const deleteBoardMutation = (queryClient: QueryClient): UseMutationOptions<void, Error, { id: string }> => ({
  mutationFn: async ({ id }) => {
    const res = await del<never>(`/boards/${encodeURIComponent(id)}`);
    if (!res.success) throw new Error(res.message ?? 'Não foi possível remover o board.');
  },
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.lists() });
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.id) });
  },
});

// spec.md KAN-07: adiciona uma coluna ao final da ordem atual do board.
export const addColumnMutation = (
  queryClient: QueryClient,
): UseMutationOptions<BoardRecord, Error, { boardId: string; data: CreateColumn }> => ({
  mutationFn: async ({ boardId, data }) => {
    const res = await post<BoardRecord>(`/boards/${encodeURIComponent(boardId)}/columns`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível adicionar a coluna.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.boardId) });
  },
});

// spec.md KAN-08/KAN-29: renomeia e/ou define a cor de uma coluna, sem mover
// os cards já associados a ela (cache de cards não é invalidado aqui).
export const updateColumnMutation = (
  queryClient: QueryClient,
): UseMutationOptions<BoardRecord, Error, { boardId: string; columnId: string; data: UpdateColumn }> => ({
  mutationFn: async ({ boardId, columnId, data }) => {
    const res = await patch<BoardRecord>(
      `/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
      data,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar a coluna.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.boardId) });
  },
});

// spec.md KAN-09: reordena as colunas do board (array completo de columnIds
// na nova ordem desejada).
export const reorderColumnsMutation = (
  queryClient: QueryClient,
): UseMutationOptions<BoardRecord, Error, { boardId: string; columnIds: string[] }> => ({
  mutationFn: async ({ boardId, columnIds }) => {
    const res = await patch<BoardRecord>(`/boards/${encodeURIComponent(boardId)}/columns/reorder`, { columnIds });
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível reordenar as colunas.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.boardId) });
  },
});

// spec.md KAN-10/KAN-11/KAN-12: remove uma coluna vazia (backend rejeita
// coluna não-vazia ou a última restante — a UI só repassa o erro).
export const removeColumnMutation = (
  queryClient: QueryClient,
): UseMutationOptions<BoardRecord, Error, { boardId: string; columnId: string }> => ({
  mutationFn: async ({ boardId, columnId }) => {
    const res = await del<BoardRecord>(
      `/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível remover a coluna.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.detail(variables.boardId) });
  },
});

// spec.md KAN-13: cria um card 100% livre (só título+coluna obrigatórios).
// Invalida a lista de cards do board E o hub (cardCount muda).
export const createCardMutation = (
  queryClient: QueryClient,
): UseMutationOptions<CardRecord, Error, { boardId: string; data: CreateCard }> => ({
  mutationFn: async ({ boardId, data }) => {
    const res = await post<CardRecord>(`/boards/${encodeURIComponent(boardId)}/cards`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o card.');
    return res.data;
  },
  onSuccess: (_created, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.cardsList(variables.boardId) });
    queryClient.invalidateQueries({ queryKey: boardKeys.lists() });
  },
});

// spec.md KAN-16: edita título/descrição/referências sem alterar a coluna
// atual do card (mover é sempre via moveCardMutation).
export const updateCardMutation = (
  queryClient: QueryClient,
): UseMutationOptions<CardRecord, Error, { boardId: string; cardId: string; data: UpdateCard }> => ({
  mutationFn: async ({ boardId, cardId, data }) => {
    const res = await patch<CardRecord>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
      data,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar o card.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.cardsList(variables.boardId) });
  },
});

// spec.md KAN-18/19/20/21: move um card entre colunas ou reordena dentro da
// mesma coluna (rota dedicada, nunca via updateCardMutation) — usado pelo
// drag-and-drop (T20) com override otimista local; esta invalidação só
// assenta o estado real do servidor depois que a mutation resolve.
export const moveCardMutation = (
  queryClient: QueryClient,
): UseMutationOptions<CardRecord, Error, { boardId: string; cardId: string; data: MoveCard }> => ({
  mutationFn: async ({ boardId, cardId, data }) => {
    const res = await patch<CardRecord>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/move`,
      data,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível mover o card.');
    return res.data;
  },
  onSuccess: (_moved, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.cardsList(variables.boardId) });
  },
});

// spec.md KAN-17: apaga um card do board — o controller (T11) responde só
// uma mensagem, sem `data`. Invalida a lista de cards E o hub (cardCount).
export const deleteCardMutation = (
  queryClient: QueryClient,
): UseMutationOptions<void, Error, { boardId: string; cardId: string }> => ({
  mutationFn: async ({ boardId, cardId }) => {
    const res = await del<never>(`/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`);
    if (!res.success) throw new Error(res.message ?? 'Não foi possível remover o card.');
  },
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: boardKeys.cardsList(variables.boardId) });
    queryClient.invalidateQueries({ queryKey: boardKeys.lists() });
  },
});
