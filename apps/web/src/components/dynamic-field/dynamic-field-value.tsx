import type { FieldDef } from '@crm/contracts';
import type { ReactNode } from 'react';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { formatDate, formatDateTime } from '@/lib/helpers/formatDate.helper.js';
import { formatCurrency } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';

type DynamicFieldValueProps = { def: FieldDef; value: unknown };

// Valor de um campo dinâmico em modo leitura, decidido pelo tipo do FieldDef
// — o par somente-leitura de <DynamicField> (que edita): rótulo da opção,
// nunca a key crua; data/hora no padrão do idioma; moeda pelo code/precision
// do próprio campo. Tipos compostos (document/reference/array/group) seguem
// como texto cru, mesmo critério de ReadOnlyLeaf.
export function DynamicFieldValue({ def, value }: DynamicFieldValueProps): ReactNode {
  switch (def.type) {
    case 'status': {
      const option = def.options.find((candidate) => candidate.key === value);
      return option ? <BadgeIndicator color={option.color}>{option.label}</BadgeIndicator> : String(value);
    }
    case 'select': {
      const keys = Array.isArray(value) ? value : [value];
      return keys.map((key) => def.options.find((option) => option.key === key)?.label ?? String(key)).join(', ');
    }
    case 'date':
      return typeof value === 'string' ? formatDate(value) : String(value);
    case 'datetime':
      return typeof value === 'string' ? formatDateTime(value) : String(value);
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value, def.code, def.precision) : String(value);
    case 'percent':
      return typeof value === 'number' ? `${value}%` : String(value);
    case 'boolean':
      return t(value ? 'yes' : 'no');
    default:
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  }
}
