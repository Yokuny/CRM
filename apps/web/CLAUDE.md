# CRM Web — Regras do Front-End

Front-end do CRM: multi-tenant, entidades Customer e Process com campos dinâmicos por template (`@crm/field-engine`), API em `apps/crm-api`.

## Stack

React 19 + **Vite 7** (nunca `8.x` — o resolver do 8/Rolldown não resolve os imports `.js`→`.tsx` deste projeto, quebra o dev server em silêncio) + TypeScript 5 (`moduleResolution: nodenext` — todo import relativo/`@/` leva `.js` explícito, mesmo apontando pra `.tsx`) + TanStack Router 1 (roteamento por arquivo, `autoCodeSplitting: true`) + TanStack Query 5 + TanStack Table 8 + Tailwind 4 + ShadCN/Radix + react-hook-form 7 + Zod 4 + `@dnd-kit` (kanban) + `lucide-react` (única fonte de ícones) + Biome 2. TanStack Query é a única fonte de verdade de dados — sem Zustand/estado global hoje.

## Roteamento

- Por arquivo, `index.tsx` obrigatório por diretório. Proibido `.` em nome de rota (`edit.$id.tsx`) e `$id` dinâmico pra detalhe — usar `details.tsx` + `search: { id }` (breadcrumb é path-based, path dinâmico o quebraria).
- Dois layouts pathless na raiz de `src/routes/`: `_private.tsx` (guarda via `beforeLoad` + `ensureQueryData(sessionQuery)`, redirect pra `/auth` se falhar; monta `<Outlet/>` + `<MobileDock/>`) e `_public.tsx` (só visual, sem guarda, pra `_public/auth` e `_public/invite`).
- **`index.tsx` de seção com múltiplos destinos vira hub de navegação**, nunca um `redirect()` automático: `Card asPage` + grid de `<Item variant="outline" asChild><Link>`, um card por destino. O conteúdo em si mora nas sub-rotas (ex.: a tabela de clientes está em `customers/list/index.tsx`, não em `customers/index.tsx`). `redirect()` em `beforeLoad` fica só pra guarda binária (autenticado/não).
- `routeTree.gen.ts` é gerado pelo plugin do Vite — nunca editar à mão, e só é regenerado com o dev server rodando (não por `tsc`/`vitest`). Depois de mover/criar arquivo de rota, suba `pnpm --filter web run dev` antes de
  `check`/`build`.

```
src/routes/_private/{feature}/
├── index.tsx       # hub (se >1 destino) OU a própria página principal
├── list/index.tsx  # listagem, quando index.tsx é hub
├── add/index.tsx   # formulário de criação
├── details.tsx     # detalhe (id via search param, nunca $id)
├── @components/    # específico da rota (ignorado pelo scanner de rotas)
├── @interface/     # schemas Zod de search params, types locais
└── @utils/         # colunas de tabela, helpers puros
```

## Componentes obrigatórios

| Situação | Componente |
|---|---|
| Toda rota | `<Card asPage>` (`@/components/ui/card.js`) — breadcrumb automático via `staticData.title` + menu do usuário (`@/components/user-menu.js`: tema, tamanho do texto, sair) |
| Loading / vazio | `<DefaultLoading/>` / `<DefaultEmptyData/>` |
| Listagem tabular | `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` (`@/components/ui/table.js`) num componente próprio da rota (`@components/*-table.tsx`, ex.: `customers/list/@components/customers-table.tsx`) — **sempre server-driven**, nunca filtra/ordena/pagina em memória; a página alterna entre a tabela e `<DefaultEmptyData/>` conforme o resultado (nunca esconder esse toggle dentro de um componente genérico de tabela) |
| Agrupar conteúdo que não é página inteira | `Item/ItemGroup/ItemContent/ItemTitle/ItemDescription/ItemMedia/ItemFooter` (`@/components/ui/item.js`) — `ItemGroup` é pilha por padrão (divisórias tracejadas entre itens) |
| Grade de navegação (hub de seção) | `<ItemGroup variant="grid">` + um `<Item render={<Link>}>` por destino. Sem `variant` no `Item` e sem `<div>` de grade: as linhas tracejadas e as colunas (1/2/3 por breakpoint) vêm do grupo |
| Bloco/painel dentro de uma página | `<Panel>` (`@/components/ui/item.js`), `size` `default`/`sm`/`xs` para a densidade; `render={<form/>}` quando o painel é um formulário |
| Paginação de tabela | `<TablePagination>` (`@/components/ui/table.js`) — a moldura da tabela já vem do próprio `<Table>` |
| Moldura da página (layouts pathless) | `<PageFrame>` (`@/components/page-frame.js`) |
| Formulário | `Form/FormField/FormItem/FormLabel/FormControl/FormMessage` (`@/components/ui/form.js`) + `react-hook-form` + `zodResolver` com schema de `@crm/contracts` — ver `routes/_public/auth/index.tsx`. Seções com título + subtítulo (`<DefaultFormLayout>`, `@/components/default-form-layout.js`) e `placeholder` em todo `<Input>` |
| Detalhe de entidade (visualizar + editar) | Vista somente-leitura por padrão (`Item/ItemGroup/...`); `Editar` no `CardAction` do `CardHeader` troca pro formulário, que ganha `Salvar` + `Cancelar` — nunca um form sempre-editável sem esse toggle. Ver `customers/details.tsx` (referência), `products/details.tsx`, `schedule/professionals/details.tsx`, `schedule/spaces/details.tsx`; em telas sem um "detalhe" de página inteira (ex.: `kanban/details.tsx`, um canvas), o mesmo conceito vira um painel inline (AD-037) aberto pelo `Editar` |

Navegação desktop é só o breadcrumb do `Card asPage` (não há sidebar); mobile é só `@/components/mobile-dock.tsx` (`md:hidden`, estado ativo via `data-status="active"` que o `<Link>` já aplica, nunca estado próprio).

**Identidade visual mora no primitivo, nunca na rota.** A linguagem tracejada do app (moldura `border-dashed border-border/60`, `rounded-none`, divisórias sem `gap`) é responsabilidade de `card.tsx`/`item.tsx`/`table.tsx`/`kanban.tsx`/`page-frame.tsx`. Numa rota, `className` só pode carregar **layout local** (`grid-cols-*`, `gap-*`, `flex-1`, `col-span-*`, largura máxima). Se aparecer vontade de escrever `border`, `border-dashed`, `rounded-*`, `shadow-*` ou `ring-*` num `<div>` de rota, o certo é criar/estender o primitivo em `components/ui/` — foi exatamente assim que `ItemGroup variant="grid"`, `Panel` e `TablePagination` nasceram (antes eram `<div>` copiada em 4, 17 e 6 lugares). Duas armadilhas do Tailwind 4 ao mexer nisso: `divide-*` sai dentro
de `:where()` (especificidade 0) e some — usar `[&>*:not(:first-child)]:border-t`; e o filho não deve trazer utilitário de
borda nenhum (nem `border-0`), senão empata com o seletor do pai e a ordem no CSS decide quem pinta.

## Tradução (`t()`) e datas

Toda string visível — texto, `placeholder`, `aria-label`, `sr-only`, toast, fallback de `Error` em `src/query/*.ts` — passa por `t(key)` de `@/lib/helpers/translate.helper.js` (objeto TS fixo pt-BR, sem biblioteca de i18n). Só erro de desenvolvedor/invariante (nunca chega ao usuário, ex.: `main.tsx` sem `#root`, `parseMoneyInput` com entrada impossível) fica literal. `t(key)` devolve a própria `key` quando ela não existe no dicionário — uma chave errada nunca estoura em runtime, só aparece como texto cru na tela (ou falha no teste-guarda, ver regra 10).

O dicionário já teve 289 chaves específicas por tela (`product.list.title`, `block.field.start_time_placeholder`, uma por task) — a mesma frase repetida em N chaves, breadcrumb mostrando slug cru por falta de chave, e nada barrando a próxima chave hiper-específica. As regras abaixo existem pra isso não voltar:

1. **Buscar e reaproveitar antes de criar.** Antes de escrever qualquer `'nova_chave'`, procurar no `translate.helper.ts` pelo texto e pelo conceito — um `active`/`status`/`details`/`information` genérico já existente é sempre preferível a um específico novo, mesmo quando o específico "parece caber melhor".
2. **Chave plana, sem namespace**: `^[a-z0-9]+(_[a-z0-9]+)*$`. Nunca `.` (`tela.secao.campo`), nunca prefixo de feature/rota/componente.
3. **A chave nomeia o texto, nunca o lugar onde ele aparece.** Ela é a tradução literal (ou um resumo curto em inglês) do valor, não uma descrição de tela/tarefa/papel:

   | ❌ Errado (nomeia o lugar) | ✅ Certo (nomeia o texto) |
   |---|---|
   | `product.list.title` → `'Catálogo'` | `catalog` → `'Catálogo'` |
   | `professional.list.title` → `'Profissionais'` | `professionals` → `'Profissionais'` (já existia — reaproveitar, regra 1) |
   | `block.field.start_time` → `'Hora de início'` | `start_time` → `'Hora de início'` |
   | `block.field.start_time_placeholder` → `'hh:mm'` | `time_format` → `'hh:mm'` |
   | `customer.create.error` → `'Não foi possível criar o cliente.'` | `create_error` → `'Não foi possível criar o registro.'` |
   | `product.details.title` → `'Detalhe do produto'` | `details` → `'Detalhes'` |

4. **Texto genérico vence texto específico.** Uma tela que já deixa claro de qual entidade se trata (o card de Produto, o formulário de Ambiente) não precisa repetir a entidade no texto — `information`/`details`/`active` já bastam. Texto específico só quando duas coisas com o MESMO papel aparecem juntas na MESMA tela e precisam se distinguir (`new_appointment` ao lado de `new_block` no calendário; `column_name` no mesmo formulário que `name`).
5. **Um texto = uma chave.** Duas strings idênticas em telas diferentes compartilham a mesma chave — nunca `customer.status.active` e `product.status.active` para o mesmo `'Ativo'`. Exceções: (a) chave que é o próprio valor de um enum (`pending` e `pending_approval` podem coexistir mesmo os dois valendo `'Pendente'`, porque a chave é ditada pelo valor do enum, não escolhida à toa); (b) homônimos de sentido diferente (`home`/`start` → ambos `'Início'`, mas conceitos distintos).
6. **Nova chave só quando nenhuma existente serve.** Aí sim: 1:1 com o texto, curta, no grupo certo do dicionário (campos/ações/entidades/estados/placeholders/mensagens/erros), sem comentário de tela ou task — o comentário é só de categoria.
7. **Chave dinâmica nunca é template/concat.** Pra um valor de enum, a própria chave é o valor (`t(order.status)`, com todo valor do enum presente no dicionário) — nunca `` t(`order.status.${x}`) ``. Pra um índice (dia da semana), usar um array de chaves exportado do helper (`WEEKDAY_KEYS[n]`), nunca `` t(`weekday.${n}`) ``.
8. **Breadcrumb de segmento sem `staticData`** (o pai de `add`/`details`, quando não é ancestral de rota — ver `PageBreadcrumb` em `components/ui/card.tsx`) resolve via `t(segmento_da_url)`. Todo diretório de rota com filhos `add`/`details` precisa de uma chave homônima ao segmento (`professionals`, `spaces`, `kanban`, `processes`, `orders`, `products`) — sem ela o breadcrumb mostra o slug cru em inglês.
9. **Remover a chave junto com o último uso.** Nenhuma chave órfã.
10. **Teste-guarda**: `translate.helper.unit.test.ts` varre `apps/web/src` e trava violação das regras 2, 7 e toda chave usada (`t('...')`, `titleKey: '...'`) que não existe no dicionário — rodar `pnpm run check` depois de mexer em chave de tradução.

Datas sempre via `formatDate()`/`formatDistanceToNow()` (`@/lib/helpers/formatDate.helper.js`), nunca `date-fns` direto.

## Testes

Páginas com `<Card asPage>` precisam de um mock mínimo de `@tanstack/react-router` (sem `<RouterProvider>` real):

```tsx
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }) => <a href={to}>{children}</a>, // só se a página usa <Link>
  };
});
```

## Verificação (sempre, ao terminar qualquer tarefa aqui)

```bash
pnpm run format                  # Biome, da raiz do monorepo
pnpm run check                   # tsc --noEmit + biome check + vitest
(cd apps/web && pnpm run build)  # único passo que empacota o app de fato
```

`check` não pega import quebrado que só o Rollup do build resolve de forma
estrita — o dev server (esbuild) e o type-check passam batido. `build` é
silencioso no sucesso (`--logLevel error`) e imprime o erro completo na falha; se ficar verboso mesmo passando, é o `@tanstack/router-plugin` avisando sobre arquivo sem `Route` — cobrir o padrão em `routeFileIgnorePattern` (`vite.config.ts`).
