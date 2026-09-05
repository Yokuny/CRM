import { z } from 'zod';
import { fieldDefSchema, MAX_FIELDS_PER_TEMPLATE } from './fieldDef.schema.js';
import { migrationActionSchema } from './migrationAction.schema.js';

// `expectedVersion` é a guarda otimista do bump (FLD-17): o admin declara
// contra qual versão ele editou, e o slot `{template, version+1}` só é
// reivindicado uma vez.
export const bumpFieldTemplateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    fields: z.array(fieldDefSchema).min(1).max(MAX_FIELDS_PER_TEMPLATE),
    migration: z.record(z.string().min(1), migrationActionSchema).optional(),
    // AD-023: opcional aqui — o schema não tem `targetType` para decidir se é
    // obrigatório. A regra "bump de template process exige stages" é do
    // service (fieldTemplate.service.bumpFieldTemplateVersion, T9), mesmo
    // split já usado hoje para customer/process em `resolveKey`.
    stages: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .strict();

export type BumpFieldTemplate = z.infer<typeof bumpFieldTemplateSchema>;
