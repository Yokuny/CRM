import type { FieldDef } from '@crm/contracts';
import { hydrate, type RenderNode } from '@crm/field-engine';
import type { Control } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { DynamicField } from './dynamic-field.js';

export type DynamicFieldArrayProps = {
  node: RenderNode & { type: 'array' };
  name: string;
  control: Control;
};

// Valor "cru" (não um RenderNode) usado para semear um item novo no array do
// react-hook-form — group vira `{}` (cada subcampo lê `undefined` e cada
// leaf já trata isso como vazio); os demais tipos usam o vazio de
// field-engine (emptyValueFor, via hydrate([of], {}) abaixo).
const rawEmptyFor = (def: FieldDef): unknown => {
  if (def.type === 'group') return {};
  if (def.type === 'array') return [];
  return hydrate([def], {})[0]?.value;
};

export function DynamicFieldArray({ node, name, control }: DynamicFieldArrayProps) {
  const { fields, append, remove } = useFieldArray({ name, control });

  // `node.value` (RenderNode[]) só cobre os itens que já existiam no
  // `hydrate()` original — um item recém-adicionado via "Adicionar" ainda
  // não tem RenderNode correspondente, então hidrata `of` sozinho contra
  // `{}` pra obter o mesmo formato (tipo/label/options) com valor vazio.
  const itemNodeAt = (index: number): RenderNode => (node.value as RenderNode[])[index] ?? hydrate([node.of], {})[0];

  return (
    <div className="grid gap-2">
      <Label>{node.label}</Label>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-end gap-2">
          <div className="flex-1">
            <DynamicField node={itemNodeAt(index)} name={`${name}.${index}`} control={control} />
          </div>
          <Button type="button" variant="basic" size="sm" onClick={() => remove(index)}>
            {t('remove')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="basic" size="sm" onClick={() => append(rawEmptyFor(node.of))}>
        {t('add')}
      </Button>
    </div>
  );
}
