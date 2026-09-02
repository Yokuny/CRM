import { z } from 'zod';

export const provisionTenantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'nome deve ter entre 3 e 120 caracteres')
      .max(120, 'nome deve ter entre 3 e 120 caracteres'),
    document: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, ''))
      .refine((value) => value.length === 14, 'documento deve ter 14 dígitos (CNPJ)'),
  })
  .strict();

export type ProvisionTenant = z.infer<typeof provisionTenantSchema>;
