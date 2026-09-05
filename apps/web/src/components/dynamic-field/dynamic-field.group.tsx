import type { RenderNode } from '@crm/field-engine';
import type { Control } from 'react-hook-form';
import { DynamicField } from './dynamic-field.js';

export type DynamicFieldGroupProps = {
  node: RenderNode & { type: 'group' };
  name: string;
  control: Control;
};

// `hydrateNode` (field-engine/hydrate.ts) já monta `node.value` como
// RenderNode[] index-alinhado com `node.fields` — a recursão só precisa
// zipar os dois, nunca re-hidratar nada.
export function DynamicFieldGroup({ node, name, control }: DynamicFieldGroupProps) {
  const children = node.value as RenderNode[];

  return (
    <fieldset className="grid gap-4 border-l pl-4">
      <legend className="font-medium text-sm">{node.label}</legend>
      {node.fields.map((field, index) => (
        <DynamicField key={field.fieldId} node={children[index]} name={`${name}.${field.fieldId}`} control={control} />
      ))}
    </fieldset>
  );
}
