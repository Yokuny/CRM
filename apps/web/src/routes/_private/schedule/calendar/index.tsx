import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { ButtonGroup } from '@/components/ui/button-group.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import {
  addDaysToDisplayDate,
  addMonthsToDisplayDate,
  displayWeekStartOf,
  formatDisplayDate,
  startOfDisplayMonth,
} from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type AppointmentRecord, appointmentsQuery } from '@/query/appointment.js';
import { professionalsQuery } from '@/query/professional.js';
import { spacesQuery } from '@/query/space.js';
import { AppointmentPanel } from './@components/appointment-panel.js';
import { BlockPanel } from './@components/block-panel.js';
import { MonthView } from './@components/month-view.js';
import { TimeGridView } from './@components/time-grid-view.js';

// Estado de "qual painel está aberto" — nunca mais de um por vez, e nunca um
// Dialog modal (feedback do usuário): o painel escolhido é renderizado
// INLINE entre a barra de ferramentas e a grade, empurrando o conteúdo pra
// baixo em fluxo normal de documento.
type PanelState =
  | { kind: 'appointment-create' }
  | { kind: 'appointment-detail'; appointment: AppointmentRecord }
  | { kind: 'block-create' }
  | { kind: 'block-detail'; block: AppointmentRecord }
  | null;

// Sentinel de "sem filtro" pro <Select> (que não aceita `value=""`, Radix
// trata string vazia como "sem seleção") — nunca enviado ao back-end: os
// handlers abaixo convertem de volta pra `undefined` antes de tocar o search
// param.
const ALL_FILTER_VALUE = '__all__';

const CALENDAR_VIEWS = ['day', 'week', 'month'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
const DEFAULT_VIEW: CalendarView = 'week';

// `view`/`date`/`professional`/`space` são a ÚNICA fonte de verdade do que é
// renderizado (AD-028) — mesmo molde de productsSearchSchema (T19). `date`
// substitui o antigo `weekStart`: passa a ser uma âncora genérica (qualquer
// dia dentro do período exibido), sem default no schema — o valor efetivo é
// resolvido no componente como "hoje" em hora de parede no FUSO DE EXIBIÇÃO
// (displayTime.helper.ts), nunca a data local do navegador/executor de
// testes. Nenhum outro ponto do app linka pra esta rota com search params
// (só o hub em schedule/index.tsx, sem params), então o rename é seguro.
export const calendarSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date inválida (YYYY-MM-DD)')
    .optional(),
  professional: z.string().optional(),
  space: z.string().optional(),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

// Calcula o range [from,to) enviado a appointmentsQuery a partir da visão
// ativa — todas as 3 visões ficam bem abaixo do limite de 42 dias do
// back-end (appointment.router.ts), então nenhuma mudança de API foi
// necessária pra esta migração.
const rangeForView = (view: CalendarView, date: string): { from: string; to: string } => {
  if (view === 'day') return { from: date, to: addDaysToDisplayDate(date, 1) };
  if (view === 'month') {
    const from = startOfDisplayMonth(date);
    return { from, to: addMonthsToDisplayDate(from, 1) };
  }
  const from = displayWeekStartOf(date);
  return { from, to: addDaysToDisplayDate(from, 7) };
};

// Passo de navegação anterior/próximo depende da visão ativa: 1 dia, 7 dias
// ou 1 mês (com clamp de fim de mês, addMonthsToDisplayDate).
const shiftDate = (view: CalendarView, date: string, direction: 1 | -1): string => {
  if (view === 'day') return addDaysToDisplayDate(date, direction);
  if (view === 'month') return addMonthsToDisplayDate(date, direction);
  return addDaysToDisplayDate(date, direction * 7);
};

// design.md/T39: sem hub — index.tsx é a própria tela. FND-10-style:
// `useSearch({strict:false})` — mesmo motivo documentado em
// products/index.tsx: o componente fica testável isolado do router real.
export function CalendarIndexPage() {
  const search = useSearch({ strict: false }) as CalendarSearch;
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelState>(null);

  const view = search.view ?? DEFAULT_VIEW;
  const date = search.date ?? formatDisplayDate(new Date());
  const { from, to } = rangeForView(view, date);

  const query = useQuery(appointmentsQuery({ from, to, professional: search.professional, space: search.space }));
  const professionalsQueryResult = useQuery(professionalsQuery({ limit: 100 }));
  const spacesQueryResult = useQuery(spacesQuery({ limit: 100 }));
  const professionalItems = [
    { value: ALL_FILTER_VALUE, label: t('all') },
    ...(professionalsQueryResult.data?.items ?? []).map((professional) => ({
      value: professional.id,
      label: professional.name,
    })),
  ];
  const spaceItems = [
    { value: ALL_FILTER_VALUE, label: t('all') },
    ...(spacesQueryResult.data?.items ?? []).map((space) => ({ value: space.id, label: space.name })),
  ];

  // AD-028: nunca recalcula o período no cliente e re-renderiza sem refazer
  // a consulta — todo novo `date`/`view` vem de `navigate()`,
  // `appointmentsQuery` (T37) refaz a chamada ao servidor com o `from`/`to`
  // corretos. `as any`: mesmo workaround de products/index.tsx (limitação
  // conhecida desta versão do TanStack Router).
  const updateSearch = (patch: (prev: CalendarSearch) => CalendarSearch) => {
    navigate({ search: patch as any, replace: true } as any);
  };

  const handleViewChange = (nextView: CalendarView) => updateSearch((prev) => ({ ...prev, view: nextView }));
  const handlePrevious = () => updateSearch((prev) => ({ ...prev, date: shiftDate(view, date, -1) }));
  const handleNext = () => updateSearch((prev) => ({ ...prev, date: shiftDate(view, date, 1) }));
  const handleToday = () => updateSearch((prev) => ({ ...prev, date: formatDisplayDate(new Date()) }));

  const handleProfessionalChange = (value: string | null) => {
    updateSearch((prev) => ({ ...prev, professional: !value || value === ALL_FILTER_VALUE ? undefined : value }));
  };

  const handleSpaceChange = (value: string | null) => {
    updateSearch((prev) => ({ ...prev, space: !value || value === ALL_FILTER_VALUE ? undefined : value }));
  };

  const handleSelectItem = (item: AppointmentRecord) => {
    setPanel(
      item.kind === 'block' ? { kind: 'block-detail', block: item } : { kind: 'appointment-detail', appointment: item },
    );
  };

  const closePanel = () => setPanel(null);

  return (
    <Card asPage>
      <CardHeader title={t('calendar')} />
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup>
            {CALENDAR_VIEWS.map((viewOption) => (
              <Button
                key={viewOption}
                type="button"
                variant={view === viewOption ? 'primary' : 'basic'}
                onClick={() => handleViewChange(viewOption)}
              >
                {t(viewOption)}
              </Button>
            ))}
          </ButtonGroup>
          {/* Só ícone: o texto vai pro aria-label (nome acessível) e pro
              title (dica no hover). */}
          <ButtonGroup>
            <Button
              type="button"
              variant="basic"
              size="icon"
              aria-label={t('previous')}
              title={t('previous')}
              onClick={handlePrevious}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" variant="basic" aria-label={t('today')} title={t('today')} onClick={handleToday}>
              {t('today')}
            </Button>
            <Button
              type="button"
              variant="basic"
              size="icon"
              aria-label={t('next')}
              title={t('next')}
              onClick={handleNext}
            >
              <ChevronRight />
            </Button>
          </ButtonGroup>
          <Select
            items={professionalItems}
            value={search.professional ?? ALL_FILTER_VALUE}
            onValueChange={handleProfessionalChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('professional')} />
            </SelectTrigger>
            <SelectContent>
              {professionalItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={spaceItems} value={search.space ?? ALL_FILTER_VALUE} onValueChange={handleSpaceChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('space')} />
            </SelectTrigger>
            <SelectContent>
              {spaceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* SCH-30/33: os dois gatilhos de criação, empurrados pro fim da
              linha (ml-auto) — nunca abrem um Dialog modal (feedback do
              usuário), só trocam `panel`, que é renderizado INLINE logo
              abaixo, empurrando a grade pra baixo dele. */}
          <div className="ml-auto flex gap-2">
            <Button type="button" onClick={() => setPanel({ kind: 'appointment-create' })}>
              {t('new_appointment')}
            </Button>
            <Button type="button" variant="basic" onClick={() => setPanel({ kind: 'block-create' })}>
              {t('new_block')}
            </Button>
          </div>
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
        ) : view === 'month' ? (
          <MonthView month={date} items={query.data} onSelect={handleSelectItem} />
        ) : (
          <TimeGridView
            days={view === 'day' ? [date] : Array.from({ length: 7 }, (_, index) => addDaysToDisplayDate(from, index))}
            items={query.data}
            onSelect={handleSelectItem}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/calendar/')({
  component: CalendarIndexPage,
  staticData: { title: t('calendar') },
  validateSearch: (search: Record<string, unknown>): CalendarSearch => calendarSearchSchema.parse(search),
});
