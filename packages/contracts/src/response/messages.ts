// Toda `message` de ApiResponse é uma CHAVE de tradução, nunca texto pronto:
// o back-end só escolhe a chave, o front-end (apps/web, `t()` de
// translate.helper.ts) é quem a traduz. Esta lista é o contrato entre os dois
// lados — `respObj`/`badRespObj`/`CustomError` só aceitam `ApiMessageKey`, e o
// teste-guarda do web (translate.helper.unit.test.ts) trava qualquer chave
// daqui que falte no dicionário. Mesmas regras de chave de apps/web/CLAUDE.md
// ("Tradução"): snake_case plana, nomeia o texto (nunca a tela/entidade),
// reaproveita uma genérica antes de criar uma nova. Detalhe técnico (campo
// inválido, id, nome) nunca vai na chave — vai no log do servidor.
export const API_MESSAGE_KEYS = [
  // Genéricas
  'not_found',
  'already_exists',
  'already_finalized',
  'invalid_data',
  'load_error',
  'internal_error',
  'too_many_attempts',
  'created_successfully',
  'removed_successfully',
  // Autenticação e acesso
  'invalid_credentials',
  'invalid_session',
  'invalid_access',
  'no_permission',
  'company_link_required',
  'signed_in_successfully',
  'signed_out_successfully',
  // Convites e links
  'invalid_link',
  'expired_link',
  'used_link',
  'email_already_registered',
  'pending_invite_exists',
  'invite_email_failed',
  // Modelos de campos e etapas
  'template_not_found',
  'archived_template',
  'template_without_stages',
  'invalid_stage',
  'outdated_version',
  'migration_plan_required',
  // Agenda
  'unavailable_time',
  'no_linked_customer',
  // Quadros
  'at_least_one_column',
  'column_not_empty',
  // Inbox
  'whatsapp_window_closed',
  'conversation_already_assigned',
  'only_failed_messages_can_be_resent',
  // Integrações
  'invalid_asaas_key',
] as const;

export type ApiMessageKey = (typeof API_MESSAGE_KEYS)[number];

const apiMessageKeySet: ReadonlySet<string> = new Set(API_MESSAGE_KEYS);

export const isApiMessageKey = (value: unknown): value is ApiMessageKey =>
  typeof value === 'string' && apiMessageKeySet.has(value);
