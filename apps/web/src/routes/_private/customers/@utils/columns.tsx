import type { StatusOption } from '@crm/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { CustomerRecord } from '@/query/customer.js';

// `statusOptions` vem do campo `status` (type:'status') do template CORRENTE
// do Customer (fields.status.options, cada uma com sua própria `color`
// configurada pelo tenant, @crm/contracts) — sem elas o valor gravado
// (`values.status`, uma CHAVE, ex. "novo") não tem como virar bolinha
// colorida + label; cai pro valor cru como fallback (ex. template mudou e a
// chave não existe mais entre as opções atuais).
export const customerColumns = (statusOptions: StatusOption[]): ColumnDef<CustomerRecord, unknown>[] => [
  { accessorKey: 'name', header: t('name'), enableSorting: true },
  { accessorKey: 'phone', header: t('phone'), enableSorting: false },
  {
    id: 'status',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => {
      const value = row.original.values.status;
      if (typeof value !== 'string' || !value) return '-';
      const option = statusOptions.find((candidate) => candidate.key === value);
      return option ? <BadgeIndicator color={option.color}>{option.label}</BadgeIndicator> : value;
    },
  },
];
