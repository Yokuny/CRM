import { describe, expect, it } from 'vitest';
import { provisionTenantSchema } from './provisionTenant.schema.js';

describe('provisionTenantSchema', () => {
  it('accepts a valid name and CNPJ, normalizing the document to digits only', () => {
    const result = provisionTenantSchema.safeParse({
      name: 'Empresa Exemplo',
      document: '12.345.678/0001-95',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.document).toBe('12345678000195');
    }
  });

  it('rejects a forged Tenant field instead of silently dropping it', () => {
    const result = provisionTenantSchema.safeParse({
      name: 'Empresa Exemplo',
      document: '12345678000195',
      tenant: 'forged-tenant-id',
    });
    expect(result.success).toBe(false);
  });
});
