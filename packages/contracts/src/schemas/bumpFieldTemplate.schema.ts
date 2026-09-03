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
  })
  .strict();

export type BumpFieldTemplate = z.infer<typeof bumpFieldTemplateSchema>;
