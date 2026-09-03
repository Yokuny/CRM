import { z } from 'zod';

// Limites técnicos de FLD-14 (o spec deixa o número a critério do agente —
// design.md, Tech Decisions). `fieldId` proíbe `.` e `$` porque vira segmento
// de path do índice wildcard `values.$**` fixado em docs/architecture.md.
export const MAX_TREE_DEPTH = 5;
export const MAX_FIELDS_PER_TEMPLATE = 100;
export const FIELD_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/;

export type FieldId = string;

export type FieldDefBase = {
  fieldId: FieldId;
  label: string;
  required?: boolean;
  order?: number;
};

export type SelectOption = { key: string; label: string };
export type StatusOption = { key: string; label: string; color: string; order: number };
export type ReferenceTarget = 'customer' | 'product' | 'user' | 'process';

// Os 11 tipos do v1 (docs/architecture.md, "Tipos de campo (v1)") — `date` e
// `datetime` compartilham config; `array`/`group` são os dois recursivos.
export type FieldDef =
  | (FieldDefBase & {
      type: 'text';
      multiline?: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
    })
  | (FieldDefBase & { type: 'number'; min?: number; max?: number; integer?: boolean; step?: number })
  | (FieldDefBase & { type: 'currency'; code: string; precision: number })
  | (FieldDefBase & { type: 'percent'; precision: number })
  | (FieldDefBase & { type: 'boolean' })
  | (FieldDefBase & { type: 'date'; timezone?: string })
  | (FieldDefBase & { type: 'datetime'; timezone?: string })
  | (FieldDefBase & { type: 'select'; options: SelectOption[]; multiple?: boolean })
  | (FieldDefBase & { type: 'status'; options: StatusOption[] })
  | (FieldDefBase & { type: 'document'; accept?: string[]; maxSizeMb?: number; multiple?: boolean })
  | (FieldDefBase & { type: 'reference'; target: ReferenceTarget; multiple?: boolean })
  | (FieldDefBase & { type: 'array'; of: FieldDef })
  | (FieldDefBase & { type: 'group'; fields: FieldDef[] });

const baseShape = {
  fieldId: z.string().trim().regex(FIELD_ID_PATTERN, 'fieldId inválido'),
  label: z
    .string()
    .trim()
    .min(1, 'label deve ter entre 1 e 120 caracteres')
    .max(120, 'label deve ter entre 1 e 120 caracteres'),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
};

const selectOptionSchema = z.object({ key: z.string().min(1), label: z.string().min(1) }).strict();

const statusOptionSchema = z
  .object({ key: z.string().min(1), label: z.string().min(1), color: z.string().min(1), order: z.number().int() })
  .strict();

const treeDepth = (def: FieldDef): number => {
  if (def.type === 'array') return 1 + treeDepth(def.of);
  if (def.type === 'group') return 1 + Math.max(0, ...def.fields.map(treeDepth));
  return 1;
};

const countNodes = (def: FieldDef): number => {
  if (def.type === 'array') return 1 + countNodes(def.of);
  if (def.type === 'group') return 1 + def.fields.reduce((total, field) => total + countNodes(field), 0);
  return 1;
};

// z.lazy + discriminatedUnion: a recursão de `array`/`group` referencia o
// próprio fieldDefSchema (já refinado), então profundidade e contagem são
// checadas em cada subárvore, e o nó mais externo é o único a exceder.
export const fieldDefSchema: z.ZodType<FieldDef> = z
  .lazy(() =>
    z.discriminatedUnion('type', [
      z
        .object({
          ...baseShape,
          type: z.literal('text'),
          multiline: z.boolean().optional(),
          minLength: z.number().int().min(0).optional(),
          maxLength: z.number().int().min(0).optional(),
          pattern: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          ...baseShape,
          type: z.literal('number'),
          min: z.number().optional(),
          max: z.number().optional(),
          integer: z.boolean().optional(),
          step: z.number().optional(),
        })
        .strict(),
      z
        .object({
          ...baseShape,
          type: z.literal('currency'),
          code: z.string().trim().min(1),
          precision: z.number().int().min(0),
        })
        .strict(),
      z.object({ ...baseShape, type: z.literal('percent'), precision: z.number().int().min(0) }).strict(),
      z.object({ ...baseShape, type: z.literal('boolean') }).strict(),
      z.object({ ...baseShape, type: z.literal('date'), timezone: z.string().min(1).optional() }).strict(),
      z.object({ ...baseShape, type: z.literal('datetime'), timezone: z.string().min(1).optional() }).strict(),
      z
        .object({
          ...baseShape,
          type: z.literal('select'),
          options: z.array(selectOptionSchema),
          multiple: z.boolean().optional(),
        })
        .strict(),
      z.object({ ...baseShape, type: z.literal('status'), options: z.array(statusOptionSchema) }).strict(),
      z
        .object({
          ...baseShape,
          type: z.literal('document'),
          accept: z.array(z.string().min(1)).optional(),
          maxSizeMb: z.number().positive().optional(),
          multiple: z.boolean().optional(),
        })
        .strict(),
      z
        .object({
          ...baseShape,
          type: z.literal('reference'),
          target: z.enum(['customer', 'product', 'user', 'process']),
          multiple: z.boolean().optional(),
        })
        .strict(),
      z.object({ ...baseShape, type: z.literal('array'), of: fieldDefSchema }).strict(),
      z.object({ ...baseShape, type: z.literal('group'), fields: z.array(fieldDefSchema) }).strict(),
    ]),
  )
  .superRefine((def, ctx) => {
    if (treeDepth(def) > MAX_TREE_DEPTH) {
      ctx.addIssue({ code: 'custom', message: `profundidade máxima de ${MAX_TREE_DEPTH} níveis excedida` });
    }
    if (countNodes(def) > MAX_FIELDS_PER_TEMPLATE) {
      ctx.addIssue({ code: 'custom', message: `máximo de ${MAX_FIELDS_PER_TEMPLATE} campos por template excedido` });
    }
  });
