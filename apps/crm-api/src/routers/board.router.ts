import {
  createBoardSchema,
  createColumnSchema,
  idSchema,
  reorderColumnsSchema,
  updateBoardSchema,
  updateColumnSchema,
} from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as boardController from '../controllers/board.controller.js';
import { checkRole, isAdmin } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md context.md "Permissões": admin/gestor/operador podem criar e
// editar boards, colunas e cards — mesmo canOperate já usado em
// professional.router.ts/product.router.ts/space.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const boardIdParamSchema = z.object({ id: idSchema }).strict();
const columnParamSchema = z.object({ id: idSchema, columnId: idSchema }).strict();

export type BoardRouterDeps = { validToken: RequestHandler };

export const createBoardRouter = (deps: BoardRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createBoardSchema),
    boardController.createBoard,
  );

  router.get('/', deps.validToken, tenantAssignmentCheck, canOperate, boardController.listBoards);

  router.get(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(boardIdParamSchema),
    boardController.getBoardById,
  );

  router.patch(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(boardIdParamSchema),
    validBody(updateBoardSchema),
    boardController.updateBoard,
  );

  // KAN-23: única rota mais restrita que canOperate — apaga o board e todos
  // os seus cards de uma vez (cascata, board.service.deleteBoard).
  router.delete(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    validParams(boardIdParamSchema),
    boardController.deleteBoard,
  );

  router.post(
    '/:id/columns',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(boardIdParamSchema),
    validBody(createColumnSchema),
    boardController.addColumn,
  );

  // design.md: rota estática ANTES de ':columnId' — senão o Express trataria
  // 'reorder' como um valor de :columnId (mesmo cuidado de appointment.
  // router.ts '/blocks' vs '/:id').
  router.patch(
    '/:id/columns/reorder',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(boardIdParamSchema),
    validBody(reorderColumnsSchema),
    boardController.reorderColumns,
  );

  router.patch(
    '/:id/columns/:columnId',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(columnParamSchema),
    validBody(updateColumnSchema),
    boardController.updateColumn,
  );

  router.delete(
    '/:id/columns/:columnId',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(columnParamSchema),
    boardController.removeColumn,
  );

  return router;
};
