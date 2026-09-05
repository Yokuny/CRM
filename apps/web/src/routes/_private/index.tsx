import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '../../components/ui/card.js';
import { t } from '../../lib/helpers/translate.helper.js';
import { sessionQuery } from '../../query/session.js';

// FND-10/AC2: shell mostra nome do Tenant e papel vindos de GET /auth/session.
// useSuspenseQuery lê o cache já populado por ensureQueryData no beforeLoad
// de _private.tsx — nenhum novo fetch, mesma fonte única de verdade.
export function PrivateIndexPage() {
  const { data } = useSuspenseQuery(sessionQuery);

  return (
    <Card asPage>
      <CardHeader title={data.tenant?.name ?? ''} />
      <CardContent>
        <p>
          {t('private.role')}: {data.role.join(', ')}
        </p>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/')({
  component: PrivateIndexPage,
});
