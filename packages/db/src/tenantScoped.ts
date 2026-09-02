// Semente do TenantScopedRepo (AD-010): um filtro sem `Tenant` é erro de
// TIPO em tempo de compilação, não uma checagem em runtime.
export const tenantScoped = <F extends { Tenant: string }>(filter: F): F => filter;
