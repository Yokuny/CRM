import type { CreateProfessional, UpdateProfessional } from '@crm/contracts';
import type { ProfessionalRecord } from '../repositories/professional.repository.js';
import * as professionalRepository from '../repositories/professional.repository.js';

// AD-010: findById/updateProfessional (professional.repository, T13) já são
// tenant-scoped — um id de outro tenant simplesmente não existe para esta
// sessão, mesmo idioma 404 de product.service.ts's ProductNotFoundError.
export class ProfessionalNotFoundError extends Error {}

// createProfessionalSchema/updateProfessionalSchema (contracts, T10) já
// cobrem integralmente SCH-02 (end<=start, weekday fora de 0..6, formato
// HH:mm, slotDurationMinutes fora de 5..480) e SCH-03 (sobreposição no mesmo
// weekday) via scheduleWindowSchema.refine + weeklyScheduleSchema.superRefine
// — ao contrário de product.service.ts (cuja regra de negócio de
// stock/price negativo NÃO está no Zod), não há gap para o service fechar
// aqui, então nenhuma validação de negócio é duplicada nesta camada.
export const createProfessional = async (tenantId: string, data: CreateProfessional): Promise<ProfessionalRecord> =>
  professionalRepository.createProfessional({
    tenant: tenantId,
    name: data.name,
    slotDurationMinutes: data.slotDurationMinutes,
    weeklySchedule: data.weeklySchedule,
  });

export const getProfessionalById = async (tenantId: string, id: string): Promise<ProfessionalRecord> => {
  const professional = await professionalRepository.findById(tenantId, id);
  if (!professional) throw new ProfessionalNotFoundError('Profissional não encontrado');
  return professional;
};

export const updateProfessional = async (
  tenantId: string,
  id: string,
  data: UpdateProfessional,
): Promise<ProfessionalRecord> => {
  const updated = await professionalRepository.updateProfessional(tenantId, id, data);
  if (!updated) throw new ProfessionalNotFoundError('Profissional não encontrado');
  return updated;
};

export type ListProfessionalsQuery = {
  page?: number;
  limit?: number;
  active?: boolean;
};

// Mesmo clamp de page/limit de product.service.ts/customer.service.ts
// (CORE-12) — padrão já repetido em vários services deste projeto; o
// repository (T13) confia neles como já corretos e nunca reaplica o clamp.
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

export const listProfessionals = async (
  tenantId: string,
  query: ListProfessionalsQuery,
): Promise<{ items: ProfessionalRecord[]; total: number }> =>
  professionalRepository.listProfessionals(tenantId, {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
    active: query.active,
  });
