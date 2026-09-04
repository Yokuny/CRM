# DentalEase Front-End — Regras do Projeto

Sistema de gestão de clínica odontológica. Monorepo com front-end aqui e back-end em `../DentalEase/DentalEase-BackEnd/`.

## Stack

React 19 + Vite 7 + TypeScript 5 + TanStack Router 1 + TanStack Query 5 + Zustand 5 + ShadCN UI + Radix + Tailwind 4 + react-hook-form 7 + Zod 3 + Recharts 2 + Biome 2

## Regras Absolutas

### UI — ShadCN Sempre, HTML Nunca

- **Proibido** usar tags HTML estilizadas (`<div className="font-bold">`, `<p>`, `<h1>`, `<span>` com estilo)
- Para texto use `<ItemTitle>` e `<ItemDescription>` de `@/components/ui/item`
- Para alinhar/agrupar use `<Item>`, `<ItemGroup>`, `<ItemContent>` de `@/components/ui/item`
- Para botões use `<Button>`, para inputs use `<Input>`, para labels use `<FormLabel>` — tudo de `@/components/ui/`
- Ícones customizados ficam em `src/components/icons/` (94 ícones SVG disponíveis)

### Páginas — Card Obrigatório

Todo arquivo que usa `createFileRoute()` é uma **Página** e deve seguir esta estrutura:

```tsx
<Card asPage>
  <CardHeader title={t('titulo')}>
    <CardAction>
      {/* Botões, filtros, busca */}
    </CardAction>
  </CardHeader>
  <CardContent>
    {isLoading ? <DefaultLoading /> : !data?.length ? <DefaultEmptyData /> : <ConteudoPrincipal />}
  </CardContent>
  <CardFooter layout="multi">
    {/* Paginação */}
  </CardFooter>
</Card>
```

- `Card asPage` ativa Breadcrumb automático via rota
- `CardHeader` extrai título e descrição do `staticData` da rota automaticamente
- **Componentes comuns (não-páginas)** usam `Item`/`ItemGroup` — **nunca** `Card`

### Componentes Obrigatórios

| Situação | Componente | Import |
|----------|-----------|--------|
| Loading/requisição pendente | `<DefaultLoading />` | `@/components/default-loading` |
| Dados vazios/busca sem resultado | `<DefaultEmptyData />` | `@/components/default-empty-data` |
| Formulários (criar/editar) | `<DefaultFormLayout sections={[...]} />` | `@/components/default-form-layout` |

### Listagens — DataTable Obrigatório

- Toda listagem de registros usa `<DataTable>` de `@/components/ui/data-table` — **nunca** `ItemGroup`/`Item` para listas de dados
- Colunas declaradas com `useMemo<DataTableColumn<TEntity>[]>`
- Quando paginação/busca é via URL: `searchable={false} showPagination={false}`

## Roteamento

- Rotas baseadas em **diretórios** com `index.tsx` obrigatório
- **Proibido** usar `.` para rotas aninhadas (`edit.$id.tsx`)
- **Proibido** rotas dinâmicas `$id` para detalhes — use `details.tsx` com `search: { id }` via search params (preserva Breadcrumb)
- Estrutura válida: `index.tsx`, `add/index.tsx`, `details.tsx`

### Definição de Rota

```tsx
export const Route = createFileRoute('/_private/feature/')({
  component: FeatureListPage,
  staticData: {
    title: 'Nome da Página',
    description: 'Descrição para breadcrumb/tooltip',
  },
  validateSearch: (search: Record<string, unknown>): SearchParams => searchSchema.parse(search),
});
```

## Estrutura de Pastas por Rota

```
src/routes/_private/{module}/
├── index.tsx           # Página principal (listagem)
├── add/
│   └── index.tsx       # Formulário criar/editar
├── details.tsx         # Detalhe (ID via search params)
├── @components/        # Componentes específicos da rota
│   └── {feature}-form.tsx
├── @consts/            # Valores fixos, enums, configs
│   └── {feature}.consts.ts
├── @hooks/             # Hooks específicos da rota
│   ├── use-{feature}-form.ts
│   └── use-{feature}-api.ts
├── @interface/         # Types, Interfaces, Schemas Zod
│   ├── {feature}.interface.ts
│   └── {feature}.schema.ts
└── @utils/             # Funções auxiliares
    └── columns.tsx     # Colunas do DataTable
```

## Hooks — Verificar Antes de Criar

**Antes de criar qualquer hook**, verificar se já existe:
1. **Hooks globais** em `src/hooks/` (auth, patients, professionals, financials, odontogram, clinic, user, favorites, mobile, sidebar)
2. **Query hooks** em `src/query/` (patients, financials, schedules, odontogram, clinic, user, procedures, reminders)

Hooks específicos de rota ficam em `@hooks/` da rota. Consulte `docs/available-resources.md` para a lista completa.

## Data-Inputs Globais

Comboboxes e selects prontos em `src/components/data-inputs/`:

| Componente | Uso |
|-----------|-----|
| `PatientCombobox` | Seleção de paciente com avatar |
| `ProfessionalCombobox` | Seleção de profissional/dentista |
| `FinancialCombobox` | Seleção financeira por paciente |
| `OdontogramCombobox` | Seleção de odontograma por paciente |
| `ProcedureComponent` | Lista editável de procedimentos |
| `ProceduresSheet` | Sheet lateral para selecionar procedimentos |
| `DatePickerButton` | Botão com popover de calendário |
| `DateTimePicker` | Seletor data/hora com intervalo |

## Tradução (i18n)

Toda string visível usa `t('chave')` de `@/lib/helpers/translate.helper`; chaves em `src/lib/config/translations.json`.

1. **Buscar antes de criar** — grep pelo conceito e sinônimos. Quase tudo já existe.
2. **Criar chave genérica, nunca por feature/tela** — nomeie pelo conceito reutilizável. `billing.type` ✓ (serve qualquer cobrança) · `asaas.billing.type` ✗
3. **Reusar globais** — `save`, `cancel`, `name`, `status`, `type`, `date` sem prefixo.
4. Máximo 2–3 segmentos · separador `.` apenas.

```tsx
t('save')          // "Salvar"
t('billing.type')  // "Forma de cobrança"
t('due.date')      // "Vencimento"
```

Detalhes: `docs/i18n.md`

## Formatação de Datas

- **Sempre** usar `formatDate()` de `@/lib/helpers/formatDate.helper`
- **Nunca** importar `format` diretamente do `date-fns`
- Formato default (sem parâmetro): `dd MMM yyyy` → "01 jan 2026"

```tsx
import { formatDate, formatDistanceToNow } from '@/lib/helpers/formatDate.helper';

formatDate(new Date())                    // "01 jan 2026"
formatDate(new Date(), 'PP')              // "1 de jan. de 2026"
formatDate(null, 'dd MMM yyyy', '-')      // "-"
formatDistanceToNow(date)                 // "há 2 horas"
```

## Estado Global — Zustand

- **Proibido** `localStorage.setItem` — usar Zustand com middleware `persist`
- TanStack Query é dono da verdade para dados da API
- Zustand guarda apenas estado de UI e utilitários puros
- **Nunca** sincronizar TanStack Query → Zustand via useEffect

```tsx
// CORRETO — Zustand para UI persistente
export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      filter: '',
      setFilter: (f) => set({ filter: f }),
    }),
    { name: 'filter-storage' },
  ),
);
```

## TanStack Query — Padrão de API

```tsx
// src/query/{feature}.ts
export const featureKeys = {
  all: ['feature'] as const,
  lists: () => [...featureKeys.all, 'list'] as const,
  list: () => [...featureKeys.lists()] as const,
  partials: () => [...featureKeys.all, 'partial'] as const,
  partial: () => [...featureKeys.partials()] as const,
  details: () => [...featureKeys.all, 'detail'] as const,
  detail: (id: string) => [...featureKeys.details(), id] as const,
};
```

- Fetch functions privadas usando `request()` + `GET()`/`POST()` de `@/lib/api/client.api`
- Mutations agrupadas num único hook com `invalidateQueries` no `onSuccess`
- Ao criar/atualizar/deletar: invalidar as keys corretas para que o TanStack Query gerencie o cache sem refresh manual

## Formulários — react-hook-form + Zod

- Hook em `@hooks/use-{feature}-form.ts` com `zodResolver`
- Componente em `@components/{feature}-form.tsx` usando `useFormContext`
- Layout com `<DefaultFormLayout sections={[...]} />`
- Cada section tem: `{ title, description?, fields: ReactNode[] }`

## Gráficos — Recharts

- **Sempre** usar `getChartColor(index)` de `@/components/ui/chart`
- **Nunca** usar `mx-auto` no `ChartContainer`
- Modelos em `src/components/graph-*.tsx` são referência — **não importar**
- Gráficos ficam em componentes comuns → usar `Item`/`ItemContent` — **nunca** `Card`

Consulte `docs/charts.md` para exemplos detalhados de cada tipo de gráfico.

## Back-End (Referência)

- **Local**: `../DentalEase/DentalEase-BackEnd/`
- **Rotas**: `../DentalEase/DentalEase-BackEnd/src/index.ts` (auth, patient, schedule, financial, odontogram, clinic, user, procedure, reminder, s3, passkey)
- **Arquitetura**: Route → Controller → Service → Repository → MongoDB
- **Padrão de response**: `{ success: boolean, data?: any, message?: string }`
- Rotas `/partial` retornam dados resumidos para preencher selects/comboboxes com ID para busca completa posterior
- Validação via Zod nos middlewares

## Padrões React

- **Sempre** `function` declarations (nunca `const Component = () =>`)
- Ordem interna: hooks de contexto → zustand → query → useState → useMemo → useCallback → useEffect → early returns → render
- Early returns: loading → error → empty → conteúdo

## Antes de Commitar

```bash
pnpm run format  # Biome formatter
pnpm run check   # TypeScript type-check
```

## Documentação Detalhada (sob demanda)

Para padrões detalhados com exemplos completos, consulte os docs conforme o cenário:

| Cenário | Documento |
|---------|-----------|
| Adicionar/buscar chave i18n, evitar chaves verbosas | `docs/i18n.md` |
| Iniciar nova feature / criar pastas | `docs/route-structure.md`, `docs/checklist.md` |
| Criar página de listagem ou formulário | `docs/page-patterns.md` |
| Criar queries de API (TanStack Query) | `docs/api-hooks.md`, `src/query/PATTERN.md` |
| Criar formulários (react-hook-form) | `docs/form-hooks.md` |
| Criar schemas Zod, interfaces, consts | `docs/schemas-types.md` |
| Gerenciar estado global (Zustand) | `docs/state-management.md` |
| Padrões de componentes React | `docs/react-patterns.md` |
| Gráficos (Recharts, cores, tipos) | `docs/charts.md` |
| Buscar comboboxes, hooks, componentes existentes | `docs/available-resources.md` |
| Consultar tech stack e versões | `docs/stack.md` |
| Estrutura e rotas do back-end | `docs/backend-reference.md` |
