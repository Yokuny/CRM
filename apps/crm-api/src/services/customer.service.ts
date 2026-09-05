import type { CreateCustomer, FieldDef, UpdateCustomer } from '@crm/contracts';
import { NO_STATUS_FILTER_VALUE } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, validate } from '@crm/field-engine';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { CustomerRecord, ListCustomersInput, ListCustomersResult } from '../repositories/customer.repository.js';
import * as customerRepository from '../repositories/customer.repository.js';
import * as fieldTemplateRepository from '../repositories/fieldTemplate.repository.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');
const normalizeDocument = (document: string): string => document.replace(/[^a-zA-Z0-9]/g, '');

// Mesma convenção já usada em validation.middleware.ts/fieldTemplate.service.ts
// para condensar erros de campo num único CustomError.message legível — o
// envelope de resposta do projeto (badRespObj) só carrega `message`, nunca um
// objeto estruturado à parte.
const formatValidationErrors = (errors: Record<string, string[]>): string =>
  Object.entries(errors)
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join('; ');

// CORE-01/02/12/13: resolve o template `customer` corrente do Tenant, recusa
// template arquivado (AD-022) e valida `values` contra o field-engine ANTES
// de qualquer escrita — nada é persistido quando algo falha.
export const createCustomer = async (tenantId: string, data: CreateCustomer): Promise<CustomerRecord> => {
  const template = await fieldTemplateRepository.findTemplateByTargetKey(
    tenantId,
    'customer',
    DEFAULT_CUSTOMER_TEMPLATE_KEY,
  );
  if (!template) throw new CustomError('Template de cliente não encontrado', 404);
  if (template.archived) throw new CustomError('Template arquivado', 400);

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, template.currentVersion);
  if (!version) throw new CustomError('Template de cliente não encontrado', 404);

  const values = data.values ?? {};
  const result = validate(version.fields, values);
  if (!result.valid) {
    throw new CustomError(formatValidationErrors(result.errors), 400);
  }

  return customerRepository.createCustomer({
    tenant: tenantId,
    name: data.name,
    phone: normalizePhone(data.phone),
    document: data.document ? normalizeDocument(data.document) : undefined,
    template: template.id,
    templateVersion: template.currentVersion,
    values,
  });
};

// AD-010: findById já é tenant-scoped — um id de outro tenant simplesmente
// não existe para esta sessão, então id ausente e id de outro tenant caem no
// mesmo 404, por design (nunca um formato de erro diferente que vazaria
// existência).
export const getCustomerById = async (tenantId: string, id: string): Promise<CustomerRecord> => {
  const customer = await customerRepository.findById(tenantId, id);
  if (!customer) throw new CustomError('Customer não encontrado', 404);
  return customer;
};

// AD-029: o `values` mesclado é SEMPRE revalidado contra o template `customer`
// CORRENTE do Tenant — mesmo quando `data.values` não veio no corpo — porque o
// ponteiro (`template`/`templateVersion`) sempre avança para o corrente ao
// final, e só é honesto avançar o ponteiro depois de checar o valor completo
// contra as regras que ele agora aponta. AD-022: template arquivado NÃO
// bloqueia esta edição (só bloqueia criar um registro novo) — por isso, ao
// contrário de createCustomer, não há checagem de `template.archived` aqui.
export const updateCustomer = async (
  tenantId: string,
  id: string,
  data: UpdateCustomer,
): Promise<CustomerRecord> => {
  const existing = await customerRepository.findById(tenantId, id);
  if (!existing) throw new CustomError('Customer não encontrado', 404);

  const template = await fieldTemplateRepository.findTemplateByTargetKey(
    tenantId,
    'customer',
    DEFAULT_CUSTOMER_TEMPLATE_KEY,
  );
  if (!template) throw new CustomError('Template de cliente não encontrado', 404);

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, template.currentVersion);
  if (!version) throw new CustomError('Template de cliente não encontrado', 404);

  const mergedValues = data.values ? { ...existing.values, ...data.values } : existing.values;
  const result = validate(version.fields, mergedValues);
  if (!result.valid) {
    throw new CustomError(formatValidationErrors(result.errors), 400);
  }

  const updated = await customerRepository.updateCustomer(tenantId, id, {
    name: data.name,
    phone: data.phone ? normalizePhone(data.phone) : undefined,
    document: data.document ? normalizeDocument(data.document) : undefined,
    values: mergedValues,
    template: template.id,
    templateVersion: template.currentVersion,
  });
  if (!updated) throw new CustomError('Customer não encontrado', 404);
  return updated;
};

export type ListCustomersQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  status?: string;
};

// CORE-12/spec Edge Cases: page/limit fora de [1,MAX_PAGE_SIZE] são clampados
// aqui — o repositório (T12) confia neles como já corretos e nunca reaplica o
// clamp.
const clampPage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
};

// WEB-02: `status=__none__` só faz sentido resolvido contra as opções
// CORRENTES do template — a mesma chave que já foi removida das opções não
// pode ser reconhecida como "válida" só porque algum Customer antigo ainda a
// guarda em `values.status`.
const resolveKnownStatusKeys = (fields: FieldDef[]): string[] => {
  const statusField = fields.find((field) => field.type === 'status');
  return statusField && statusField.type === 'status' ? statusField.options.map((option) => option.key) : [];
};

export const listCustomers = async (tenantId: string, query: ListCustomersQuery): Promise<ListCustomersResult> => {
  let knownStatusKeys: string[] | undefined;
  if (query.status === NO_STATUS_FILTER_VALUE) {
    const template = await fieldTemplateRepository.findTemplateByTargetKey(
      tenantId,
      'customer',
      DEFAULT_CUSTOMER_TEMPLATE_KEY,
    );
    const version = template
      ? await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, template.currentVersion)
      : null;
    knownStatusKeys = version ? resolveKnownStatusKeys(version.fields) : [];
  }

  const input: ListCustomersInput = {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
    q: query.q,
    sort: query.sort ?? 'createdAt',
    order: query.order ?? 'desc',
    status: query.status,
    knownStatusKeys,
  };
  return customerRepository.listCustomers(tenantId, input);
};
