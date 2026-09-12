import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { addDaysToDisplayDate, currentDisplayWeekStart } from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type AppointmentRecord, appointmentsQuery } from '@/query/appointment.js';
import { professionalsQuery } from '@/query/professional.js';
import { spacesQuery } from '@/query/space.js';
import { AppointmentPanel } from './@components/appointment-panel.js';
import { BlockPanel } from './@components/block-panel.js';
import { WeekGrid } from './@components/week-grid.js';

// Estado de "qual painel está aberto" — nunca mais de um por vez, e nunca um
// Dialog modal (feedback do usuário): o painel escolhido é renderizado
// INLINE entre a barra de ferramentas e o WeekGrid, empurrando a grade pra
// baixo em fluxo normal de documento.
type PanelState =
  | { kind: 'appointment-create' }
  | { kind: 'appointment-detail'; appointment: AppointmentRecord }
  | { kind: 'block-create' }
  | { kind: 'block-detail'; block: AppointmentRecord }
  | null;

const WEEK_DAYS = 7;
// Sentinel de "sem filtro" pro <Select> (que não aceita `value=""`, Radix
// trata string vazia como "sem seleção") — nunca enviado ao back-end: os
// handlers abaixo convertem de volta pra `undefined` antes de tocar o search
// param.
const ALL_FILTER_VALUE = '__all__';

// spec.md SCH-29: `weekStart`/`professional`/`space` são a ÚNICA fonte de
// verdade do que é renderizado (AD-028) — mesmo molde de productsSearchSchema
// (T19). `weekStart` fica opcional aqui (sem default no schema): o valor
// efetivo é resolvido no componente via `currentDisplayWeekStart()` — hora de
// parede no FUSO DE EXIBIÇÃO (displayTime.helper.ts, T38), nunca a data local
// do navegador/executor de testes.
export const calendarSearchSchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart inválido (YYYY-MM-DD)')
    .optional(),
  professional: z.string().optional(),
  space: z.string().optional(),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

// design.md/T39: sem hub — index.tsx é a própria tela (WeekGrid, T38, já
// concentra a grade em si). FND-10-style: `useSearch({strict:false})` —
// mesmo motivo documentado em products/index.tsx: o componente fica testável
// isolado do router real.
export function CalendarIndexPage() {
  const search = useSearch({ strict: false }) as CalendarSearch;
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelState>(null);

  const weekStart = search.weekStart ?? currentDisplayWeekStart();
  const weekEnd = addDaysToDisplayDate(weekStart, WEEK_DAYS);

  const query = useQuery(
    appointmentsQuery({ from: weekStart, to: weekEnd, professional: search.professional, space: search.space }),
  );
  const professionalsQueryResult = useQuery(professionalsQuery({ limit: 100 }));
  const spacesQueryResult = useQuery(spacesQuery({ limit: 100 }));

  // AD-028: nunca recalcula a semana no cliente e re-renderiza sem refazer a
  // consulta — todo novo `weekStart` vem de `navigate()`, `appointmentsQuery`
  // (T37) refaz a chamada ao servidor com o `from`/`to` corretos. `as any`:
  // mesmo workaround de products/index.tsx (limitação conhecida desta versão
  // do TanStack Router).
  const goToWeek = (nextWeekStart: string) => {
    navigate({
      search: ((prev: CalendarSearch) => ({ ...prev, weekStart: nextWeekStart })) as any,
      replace: true,
    } as any);
  };

  const handlePrevious = () => goToWeek(addDaysToDisplayDate(weekStart, -WEEK_DAYS));
  const handleNext = () => goToWeek(addDaysToDisplayDate(weekStart, WEEK_DAYS));

  const handleProfessionalChange = (value: string) => {
    navigate({
      search: ((prev: CalendarSearch) => ({
        ...prev,
        professional: value === ALL_FILTER_VALUE ? undefined : value,
      })) as any,
      replace: true,
    } as any);
  };

  const handleSpaceChange = (value: string) => {
    navigate({
      search: ((prev: CalendarSearch) => ({ ...prev, space: value === ALL_FILTER_VALUE ? undefined : value })) as any,
      replace: true,
    } as any);
  };

  const handleSelectItem = (item: AppointmentRecord) => {
    setPanel(
      item.kind === 'block' ? { kind: 'block-detail', block: item } : { kind: 'appointment-detail', appointment: item },
    );
  };

  const closePanel = () => setPanel(null);

  return (
    <Card asPage>
      <CardHeader title={t('calendar.title')} />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="basic" onClick={handlePrevious}>
            {t('calendar.previous_week')}
          </Button>
          <Button type="button" variant="basic" onClick={handleNext}>
            {t('calendar.next_week')}
          </Button>
          <Select value={search.professional ?? ALL_FILTER_VALUE} onValueChange={handleProfessionalChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('calendar.filter.professional')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>{t('calendar.filter.all_professionals')}</SelectItem>
              {(professionalsQueryResult.data?.items ?? []).map((professional) => (
                <SelectItem key={professional.id} value={professional.id}>
                  {professional.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.space ?? ALL_FILTER_VALUE} onValueChange={handleSpaceChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('calendar.filter.space')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>{t('calendar.filter.all_spaces')}</SelectItem>
              {(spacesQueryResult.data?.items ?? []).map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* SCH-30/33: os dois gatilhos de criação — nunca abrem um Dialog
              modal (feedback do usuário), só trocam `panel`, que é renderizado
              INLINE logo abaixo, empurrando o WeekGrid pra baixo dele. */}
          <Button type="button" onClick={() => setPanel({ kind: 'appointment-create' })}>
            {t('calendar.new_appointment')}
          </Button>
          <Button type="button" variant="basic" onClick={() => setPanel({ kind: 'block-create' })}>
            {t('calendar.new_block')}
          </Button>
        </div>
        {panel?.kind === 'appointment-create' && <AppointmentPanel onClose={closePanel} />}
        {panel?.kind === 'appointment-detail' && (
          <AppointmentPanel onClose={closePanel} appointment={panel.appointment} />
        )}
        {panel?.kind === 'block-create' && <BlockPanel onClose={closePanel} />}
        {panel?.kind === 'block-detail' && <BlockPanel onClose={closePanel} block={panel.block} />}
        {query.isLoading ? (
          <DefaultLoading />
        ) : !query.data || query.data.length === 0 ? (
          <DefaultEmptyData />
        ) : (
          <WeekGrid weekStart={weekStart} items={query.data} onSelect={handleSelectItem} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/calendar/')({
  component: CalendarIndexPage,
  staticData: { title: t('calendar.title') },
  validateSearch: (search: Record<string, unknown>): CalendarSearch => calendarSearchSchema.parse(search),
});
