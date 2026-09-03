import type { FieldDef } from '@crm/contracts';

export type FieldType = FieldDef['type'];

// `fieldId` é o caminho do campo afetado: o próprio `fieldId` no topo, ou o
// caminho pontuado dos `fieldId` ancestrais quando a mudança está dentro de um
// `group`/`array` (ex.: `endereco.rua`).
export type DestructiveChange =
  | { fieldId: string; reason: 'fieldRemoved' }
  | { fieldId: string; reason: 'typeChanged'; from: FieldType; to: FieldType }
  | { fieldId: string; reason: 'optionRemoved'; removedOptions: string[] };

export type FieldDiff = { kind: 'additive'; changes: never[] } | { kind: 'destructive'; changes: DestructiveChange[] };

const optionKeys = (def: FieldDef): string[] =>
  def.type === 'select' || def.type === 'status' ? def.options.map((option) => option.key) : [];

const collect = (before: FieldDef[], after: FieldDef[], prefix: string, changes: DestructiveChange[]): void => {
  const next = new Map(after.map((field) => [field.fieldId, field]));

  for (const old of before) {
    const path = prefix ? `${prefix}.${old.fieldId}` : old.fieldId;
    const current = next.get(old.fieldId);

    if (!current) {
      changes.push({ fieldId: path, reason: 'fieldRemoved' });
      continue;
    }
    if (current.type !== old.type) {
      changes.push({ fieldId: path, reason: 'typeChanged', from: old.type, to: current.type });
      continue;
    }

    // Uma opção removida é destrutiva mesmo sem saber se está em uso: o motor
    // é puro (nenhum I/O), então a decisão conservadora é exigir migração e
    // deixar a contagem de registros para o FieldValueStore do service.
    const keptOptions = optionKeys(current);
    const removedOptions = optionKeys(old).filter((key) => !keptOptions.includes(key));
    if (removedOptions.length > 0) {
      changes.push({ fieldId: path, reason: 'optionRemoved', removedOptions });
    }

    if (old.type === 'group' && current.type === 'group') collect(old.fields, current.fields, path, changes);
    if (old.type === 'array' && current.type === 'array') collect([old.of], [current.of], path, changes);
  }
};

// Puro, sem I/O. Campo novo, label, ordem e opção nova não aparecem em
// `changes` — só o que deixaria um valor já gravado órfão (FLD-04/FLD-05).
export const diffFields = (oldFields: FieldDef[], newFields: FieldDef[]): FieldDiff => {
  const changes: DestructiveChange[] = [];
  collect(oldFields, newFields, '', changes);

  return changes.length === 0 ? { kind: 'additive', changes: [] } : { kind: 'destructive', changes };
};
