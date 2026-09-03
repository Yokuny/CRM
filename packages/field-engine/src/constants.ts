// `customer` tem exatamente um template por Tenant (glossário): a chave é
// fixa e compartilhada entre packages/db (seed) e apps/crm-api (service).
// `process` tem uma chave por tipo de processo, escolhida pelo admin.
export const DEFAULT_CUSTOMER_TEMPLATE_KEY = 'default';
