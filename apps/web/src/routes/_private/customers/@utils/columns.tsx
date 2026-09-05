import type { ColumnDef } from '@tanstack/react-table';
import { t } from '@/lib/helpers/translate.helper.js';
import type { CustomerRecord } from '@/query/customer.js';

export const customerColumns: ColumnDef<CustomerRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: true },
  { accessorKey: 'phone', header: t('phone'), enableSorting: false },
  {
    id: 'status',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => {
      const status = row.original.values.status;
      return typeof status === 'string' && status ? status : '-';
    },
  },
];
