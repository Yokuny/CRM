import type { FieldDef } from '@crm/contracts';

// Mapa `fieldId → valor gravado`. Nunca carrega label, tipo ou configuração.
export type FieldValues = Record<string, unknown>;

// Representação vazia de um campo sem valor gravado. Nunca `undefined` solto,
// que quebraria o render da árvore (FLD-01/AC2).
export type EmptyValue = '' | false | null | never[];

// Tabela de valores vazios do design.md. `array`/`group` não passam por aqui
// no `hydrate` (resolvem para RenderNode[] pela recursão), mas a função é
// total sobre FieldDef e devolve a lista vazia — o vazio natural dos dois.
export const emptyValueFor = (field: FieldDef): EmptyValue => {
  switch (field.type) {
    case 'text':
      return '';
    case 'boolean':
      return false;
    case 'number':
    case 'percent':
    case 'currency':
    case 'date':
    case 'datetime':
    case 'status':
    case 'document':
      return null;
    case 'select':
    case 'reference':
      return field.multiple ? [] : null;
    case 'array':
    case 'group':
      return [];
  }
};
