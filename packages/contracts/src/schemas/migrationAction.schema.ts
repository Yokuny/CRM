import { z } from 'zod';
import { FIELD_ID_PATTERN } from './fieldDef.schema.js';

// Plano de migração exigido por um bump destrutivo (FLD-05/FLD-12): cada
// `fieldId` afetado precisa dizer explicitamente o que acontece com o valor
// já gravado — descartar, mover para outro campo, ou remapear opções.
export const migrationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('discard') }).strict(),
  z
    .object({
      action: z.literal('mapField'),
      toFieldId: z.string().trim().regex(FIELD_ID_PATTERN, 'toFieldId inválido'),
    })
    .strict(),
  z
    .object({
      action: z.literal('mapOptions'),
      mapping: z.record(z.string().min(1), z.string().min(1)),
    })
    .strict(),
]);

export type MigrationAction = z.infer<typeof migrationActionSchema>;

export type MigrationPlan = Record<string, MigrationAction>;
