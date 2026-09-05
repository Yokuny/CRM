import { Skeleton } from './ui/skeleton.js';
import { Spinner } from './ui/spinner.js';

// Porte de ../DentalEase/DentalEase/src/components/default-loading.tsx —
// export nomeado (`export function`), não default, para manter os call
// sites existentes (`import { DefaultLoading } from '...'`) compilando sem
// alteração (Tasks T12: "mesma assinatura de chamada").
export function DefaultLoading() {
  return (
    <Skeleton className="flex h-48 w-full items-center justify-center">
      <Spinner />
    </Skeleton>
  );
}
