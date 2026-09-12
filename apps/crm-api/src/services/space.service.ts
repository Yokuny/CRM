import type { CreateSpace, UpdateSpace } from '@crm/contracts';
import type { SpaceRecord } from '../repositories/space.repository.js';
import * as spaceRepository from '../repositories/space.repository.js';

// AD-010: findById/updateSpace (space.repository, T16) já são tenant-scoped
// — um id de outro tenant simplesmente não existe para esta sessão, mesmo
// idioma 404 de product.service.ts's ProductNotFoundError.
export class SpaceNotFoundError extends Error {}

// createSpaceSchema/updateSpaceSchema (contracts, T11) já cobrem
// integralmente a única regra de SCH-04 (name obrigatório/não vazio) — sem
// gap para o service fechar aqui, mesmo raciocínio de professional.service.ts.
export const createSpace = async (tenantId: string, data: CreateSpace): Promise<SpaceRecord> =>
  spaceRepository.createSpace({ tenant: tenantId, name: data.name });

export const getSpaceById = async (tenantId: string, id: string): Promise<SpaceRecord> => {
  const space = await spaceRepository.findById(tenantId, id);
  if (!space) throw new SpaceNotFoundError('Ambiente não encontrado');
  return space;
};

export const updateSpace = async (tenantId: string, id: string, data: UpdateSpace): Promise<SpaceRecord> => {
  const updated = await spaceRepository.updateSpace(tenantId, id, data);
  if (!updated) throw new SpaceNotFoundError('Ambiente não encontrado');
  return updated;
};

export type ListSpacesQuery = {
  page?: number;
  limit?: number;
  active?: boolean;
};

// Mesmo clamp de page/limit de product.service.ts/professional.service.ts
// (CORE-12) — padrão já repetido em vários services deste projeto; o
// repository (T16) confia neles como já corretos e nunca reaplica o clamp.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const clampPage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
};

export const listSpaces = async (
  tenantId: string,
  query: ListSpacesQuery,
): Promise<{ items: SpaceRecord[]; total: number }> =>
  spaceRepository.listSpaces(tenantId, {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
    active: query.active,
  });
