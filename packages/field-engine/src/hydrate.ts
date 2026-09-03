import type { FieldDef } from '@crm/contracts';
import { emptyValueFor, type FieldValues } from './emptyValue.js';

// Folha: o valor gravado (ou a representação vazia do tipo).
// `array`/`group`: sempre RenderNode[] — a recursão é uniforme nos dois, que é
// o que faz `array` de `group` de `array` sobreviver sem caso especial.
export type RenderNodeValue = unknown;

export type RenderNode = FieldDef & { value: RenderNodeValue };

const hydrateNode = (def: FieldDef, raw: unknown): RenderNode => {
  if (def.type === 'group') {
    const obj = (raw ?? {}) as FieldValues;
    return { ...def, value: def.fields.map((field) => hydrateNode(field, obj[field.fieldId])) };
  }
  if (def.type === 'array') {
    const items = Array.isArray(raw) ? raw : [];
    return { ...def, value: items.map((item) => hydrateNode(def.of, item)) };
  }
  return { ...def, value: raw ?? emptyValueFor(def) };
};

export const hydrate = (fields: FieldDef[], values: FieldValues): RenderNode[] =>
  fields.map((field) => hydrateNode(field, values[field.fieldId]));
