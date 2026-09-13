import { createFileRoute, Link } from '@tanstack/react-router';
import { Calendar, DoorOpen, Settings, UserRound } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';

type ScheduleSection = { to: string; titleKey: string; icon: ComponentType<{ className?: string }> };

// Hub de navegação (mesmo padrão de customers/index.tsx/settings/index.tsx de
// referência): index de uma seção com mais de um destino real vira um menu de
// cards, nunca um redirect automático (apps/web/CLAUDE.md). SCH-08/SCH-29:
// os quatro destinos já existentes (calendário, T39; profissionais/ambientes/
// configuração, Fase 7).
const SCHEDULE_SECTIONS: ScheduleSection[] = [
  { to: '/schedule/calendar', titleKey: 'calendar.title', icon: Calendar },
  { to: '/schedule/professionals', titleKey: 'professional.list.title', icon: UserRound },
  { to: '/schedule/spaces', titleKey: 'space.list.title', icon: DoorOpen },
  { to: '/schedule/settings', titleKey: 'scheduling_settings.title', icon: Settings },
];

export function ScheduleIndexPage() {
  return (
    <Card asPage>
      <CardHeader />
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SCHEDULE_SECTIONS.map(({ to, titleKey, icon: Icon }) => (
          <Item key={to} variant="outline" asChild>
            <Link to={to}>
              <ItemMedia variant="icon">
                <Icon className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t(titleKey)}</ItemTitle>
              </ItemContent>
            </Link>
          </Item>
        ))}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/')({
  component: ScheduleIndexPage,
  staticData: { title: t('schedule') },
});
