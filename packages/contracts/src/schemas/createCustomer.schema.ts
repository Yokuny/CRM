import { z } from 'zod';

// Núcleo fixo de Customer (docs/glossary.md, spec.md Assumptions): nome,
// telefone e documento (opcional) — `status` não é núcleo fixo, vive em
// `values` contra o template `customer` corrente do Tenant. A validação
// profunda de `values` acontece em runtime via field-engine (CORE-02), não
// estaticamente aqui — mesmo split já usado para `fields`/`values` em
// `field-template`.
export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'nome é obrigatório').max(120, 'nome deve ter no máximo 120 caracteres'),
    phone: z.string().trim().min(1, 'telefone é obrigatório').max(30, 'telefone deve ter no máximo 30 caracteres'),
    document: z.string().trim().min(1, 'documento não pode ser vazio quando informado').optional(),
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateCustomer = z.infer<typeof createCustomerSchema>;
