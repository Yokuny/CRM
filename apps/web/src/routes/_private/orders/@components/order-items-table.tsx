import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { OrderItemRecord } from '@/query/order.js';

type OrderItemsTableProps = { items: OrderItemRecord[]; totalPrice: number };

// Itens do pedido com o preço congelado no momento da compra (unitPrice é
// snapshot do Order, não o preço atual do produto). Poucas linhas, parte do
// próprio registro — não é listagem paginada, então sem TablePagination.
export function OrderItemsTable({ items, totalPrice }: OrderItemsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('product')}</TableHead>
          <TableHead className="text-right">{t('quantity')}</TableHead>
          <TableHead className="text-right">{t('unit_price')}</TableHead>
          <TableHead className="text-right">{t('subtotal')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.product}>
            <TableCell>{item.name}</TableCell>
            <TableCell className="text-right">{item.quantity}</TableCell>
            <TableCell className="text-right">{formatMoney(item.unitPrice)}</TableCell>
            <TableCell className="text-right">{formatMoney(item.unitPrice * item.quantity)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-medium">
            {t('total')}
          </TableCell>
          <TableCell className="text-right font-medium">{formatMoney(totalPrice)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
