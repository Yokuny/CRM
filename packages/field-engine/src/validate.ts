import type { FieldDef } from '@crm/contracts';
import { z } from 'zod';
import type { FieldValues } from './emptyValue.js';

export type ValidationResult = { valid: boolean; errors: Record<string, string[]> };

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const documentValueSchema = z
  .object({
    assetId: z.string().min(1),
    filename: z.string().min(1),
    mime: z.string().min(1),
    size: z.number().int().nonnegative(),
  })
  .strict();

const referenceValueSchema = z.string().regex(OBJECT_ID_PATTERN, 'referência deve ser um ObjectId');

// `precision` limita as casas decimais aceitas. A margem evita o falso
// negativo clássico de ponto flutuante (12.34 * 100 = 1233.9999...).
const withPrecision = (precision: number) =>
  z.number().refine((value) => {
    const scaled = value * 10 ** precision;
    return Math.abs(scaled - Math.round(scaled)) < 1e-9;
  }, `no máximo ${precision} casas decimais`);

const maybeMultiple = (schema: z.ZodType, multiple: boolean | undefined) => (multiple ? z.array(schema) : schema);

const schemaForField = (def: FieldDef): z.ZodType => {
  switch (def.type) {
    case 'text': {
      let schema = z.string();
      if (def.minLength !== undefined) schema = schema.min(def.minLength);
      if (def.maxLength !== undefined) schema = schema.max(def.maxLength);
      if (def.pattern !== undefined) schema = schema.regex(new RegExp(def.pattern));
      return schema;
    }
    case 'number': {
      let schema = def.integer ? z.number().int() : z.number();
      if (def.min !== undefined) schema = schema.min(def.min);
      if (def.max !== undefined) schema = schema.max(def.max);
      return schema;
    }
    // AD/docs: `currency` trafega como inteiro em centavos, nunca decimal.
    case 'currency':
      return z.number().int('valor monetário deve ser inteiro em centavos');
    case 'percent':
      return withPrecision(def.precision);
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.iso.date();
    case 'datetime':
      return z.iso.datetime();
    case 'select':
      return maybeMultiple(z.enum(def.options.map((option) => option.key) as [string, ...string[]]), def.multiple);
    case 'status':
      return z.enum(def.options.map((option) => option.key) as [string, ...string[]]);
    case 'document':
      return maybeMultiple(documentValueSchema, def.multiple);
    // SPEC_DEVIATION: FLD-02/AC3 pede "reference como ObjectId respeitando
    // `target`" — esta função só valida a FORMA de ObjectId, nunca `target`.
    // Reason: `validate` é pura e sem I/O (spec.md AC3 "sem lançar exceção
    // não tratada", design.md a mantém livre de Mongoose/rede); confirmar que
    // um ObjectId realmente existe na collection de `target` exige uma
    // consulta ao banco, que só o consumidor (`crm-core`, feature 3, ainda
    // sem `Customer`/`Process`) pode fazer. A mesma razão cobre o edge case
    // do spec "reference cujo target foi apagado": `hydrate` (hydrate.ts)
    // devolve o ObjectId gravado tal como está, sem tentar resolvê-lo —
    // resolução (e portanto detectar "pendente/inválida") é responsabilidade
    // do consumidor, nunca do motor.
    case 'reference':
      return maybeMultiple(referenceValueSchema, def.multiple);
    case 'array':
      return z.array(schemaForField(def.of));
    case 'group':
      return schemaForFields(def.fields);
  }
};

const schemaForFields = (fields: FieldDef[]): z.ZodType =>
  z.object(
    Object.fromEntries(
      fields.map((field) => {
        const schema = schemaForField(field);
        return [field.fieldId, field.required ? schema : schema.nullish()];
      }),
    ),
  );

// safeParse (nunca parse/try-catch): entrada malformada vira issue, nunca
// exceção não tratada (FLD-02/AC3).
export const validate = (fields: FieldDef[], values: FieldValues): ValidationResult => {
  const result = schemaForFields(fields).safeParse(values);
  if (result.success) return { valid: true, errors: {} };

  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '$root';
    errors[key] = [...(errors[key] ?? []), issue.message];
  }
  return { valid: false, errors };
};
