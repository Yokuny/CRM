import { z } from 'zod';

// CORE-08: `values` é validado contra a `templateVersion` que o PRÓPRIO
// Process usa (não necessariamente a corrente do template) — essa validação
// profunda é runtime via field-engine, não estática aqui.
export const updateProcessValuesSchema = z
  .object({
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

export type UpdateProcessValues = z.infer<typeof updateProcessValuesSchema>;
