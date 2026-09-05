import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';

// Porte simplificado de ../DentalEase/DentalEase/src/components/default-empty-data.tsx
// — a referência puxa um primitive `empty.tsx` ainda não portado e sorteia
// entre 7 ícones decorativos; nada disso foi pedido (T16's dispatch prompt).
// Mesmo espírito minimalista-mas-funcional de default-loading.tsx (T12):
// Item/ItemContent/ItemTitle/ItemDescription já portados (T8), zero ícone.
export function DefaultEmptyData() {
  return (
    <Item variant="muted" className="justify-center text-center">
      <ItemContent className="items-center">
        <ItemTitle>{t('not.found')}</ItemTitle>
        <ItemDescription className="text-center">{t('not.found.description')}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
