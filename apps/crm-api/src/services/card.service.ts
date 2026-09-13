import type { CreateCard, MoveCard, UpdateCard } from '@crm/contracts';
import { Customer, Order, Process, tenantScoped, User } from '@crm/db';
import * as boardRepository from '../repositories/board.repository.js';
import type { CardRecord } from '../repositories/card.repository.js';
import * as cardRepository from '../repositories/card.repository.js';

// AD-010: findById/updateCard/moveCard/deleteCard (card.repository, T7) já
// são tenant+board-scoped — um cardId de outro tenant/board simplesmente não
// existe para esta sessão.
export class CardNotFoundError extends Error {}

// KAN-15/KAN-21: `column` precisa ser um dos Board.columns[]._id — nunca
// revela se o problema é "board não existe" ou "coluna não existe nele"
// (mesmo board+coluna são ambos internos ao tenant, sem necessidade de
// distinguir 404 de 400 aqui — o controller, T11, decide o código HTTP).
export class InvalidColumnError extends Error {}

// KAN-14: customer/process/order/assignee inexistente OU de outro tenant —
// sempre 400 (nunca 404, não revela que o id existe em outro tenant, mesmo
// cuidado do AD-010).
export class InvalidReferenceError extends Error {}

type CardReferences = { customer?: string; process?: string; order?: string; assignee?: string };

// Cada referência informada precisa existir E pertencer ao Tenant atual —
// mesmo formato de validação cross-collection de order.service.ts (valida
// `product` antes de gravar um Order.items). Rodam em paralelo: são checagens
// independentes, nenhuma depende do resultado da outra.
const assertReferencesExist = async (tenantId: string, refs: CardReferences): Promise<void> => {
  const checks: Array<Promise<void>> = [];

  if (refs.customer !== undefined) {
    checks.push(
      Customer.exists(tenantScoped({ Tenant: tenantId, _id: refs.customer })).then((found) => {
        if (!found) throw new InvalidReferenceError('customer não encontrado ou de outro tenant');
      }),
    );
  }
  if (refs.process !== undefined) {
    checks.push(
      Process.exists(tenantScoped({ Tenant: tenantId, _id: refs.process })).then((found) => {
        if (!found) throw new InvalidReferenceError('process não encontrado ou de outro tenant');
      }),
    );
  }
  if (refs.order !== undefined) {
    checks.push(
      Order.exists(tenantScoped({ Tenant: tenantId, _id: refs.order })).then((found) => {
        if (!found) throw new InvalidReferenceError('order não encontrado ou de outro tenant');
      }),
    );
  }
  if (refs.assignee !== undefined) {
    checks.push(
      User.exists(tenantScoped({ Tenant: tenantId, _id: refs.assignee })).then((found) => {
        if (!found) throw new InvalidReferenceError('assignee não encontrado ou de outro tenant');
      }),
    );
  }

  await Promise.all(checks);
};

// Card.column não é uma referência Mongoose real — é um _id dentro do array
// embutido Board.columns[] (design.md, Risk). Esta é a única garantia de que
// `column` é válido, sempre chamada ANTES de qualquer escrita de column.
const assertColumnExists = async (tenantId: string, boardId: string, columnId: string): Promise<void> => {
  const board = await boardRepository.findById(tenantId, boardId);
  if (!board) throw new InvalidColumnError('Board não encontrado');
  const exists = board.columns.some((column) => column.id === columnId);
  if (!exists) throw new InvalidColumnError('Coluna não existe neste board');
};

// KAN-13: card 100% livre, só título+coluna obrigatórios. `position` sempre
// ao final da coluna de destino — contagem via listByBoard (spec.md
// Assumptions: sem paginação, volume de cards por board esperado baixo,
// então este join não é o custo que a spec pede pra evitar; o N+1
// explicitamente mitigado é o de board.repository.listBoards).
export const createCard = async (tenantId: string, boardId: string, data: CreateCard): Promise<CardRecord> => {
  await assertColumnExists(tenantId, boardId, data.column);
  await assertReferencesExist(tenantId, {
    customer: data.customer,
    process: data.process,
    order: data.order,
    assignee: data.assignee,
  });

  const existingInColumn = (await cardRepository.listByBoard(tenantId, boardId)).filter(
    (card) => card.column === data.column,
  );

  return cardRepository.createCard({
    tenant: tenantId,
    board: boardId,
    column: data.column,
    title: data.title,
    description: data.description,
    position: existingInColumn.length,
    customer: data.customer,
    process: data.process,
    order: data.order,
    assignee: data.assignee,
  });
};

export const listCardsByBoard = async (tenantId: string, boardId: string): Promise<CardRecord[]> =>
  cardRepository.listByBoard(tenantId, boardId);

// KAN-16: nunca aceita column/position — o tipo UpdateCard (contracts, T5) já
// os omite, então não há como este service repassá-los adiante mesmo por
// engano.
export const updateCard = async (
  tenantId: string,
  boardId: string,
  cardId: string,
  data: UpdateCard,
): Promise<CardRecord> => {
  await assertReferencesExist(tenantId, {
    customer: data.customer,
    process: data.process,
    order: data.order,
    assignee: data.assignee,
  });

  const updated = await cardRepository.updateCard(tenantId, boardId, cardId, {
    title: data.title,
    description: data.description,
    customer: data.customer,
    process: data.process,
    order: data.order,
    assignee: data.assignee,
  });
  if (!updated) throw new CardNotFoundError('Card não encontrado');
  return updated;
};

// KAN-18/19/21: valida `column` contra board.columns independente de
// qualquer validação client-side.
export const moveCard = async (
  tenantId: string,
  boardId: string,
  cardId: string,
  data: MoveCard,
): Promise<CardRecord> => {
  await assertColumnExists(tenantId, boardId, data.column);

  const moved = await cardRepository.moveCard(tenantId, boardId, cardId, data.column, data.position);
  if (!moved) throw new CardNotFoundError('Card não encontrado');
  return moved;
};

export const deleteCard = async (tenantId: string, boardId: string, cardId: string): Promise<void> => {
  const result = await cardRepository.deleteCard(tenantId, boardId, cardId);
  if (result.deletedCount === 0) throw new CardNotFoundError('Card não encontrado');
};
