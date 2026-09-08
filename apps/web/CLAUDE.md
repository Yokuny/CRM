# CRM Web — Regras do Front-End

Front-end do CRM: multi-tenant, entidades Customer e Process com campos
dinâmicos por template (`@crm/field-engine`), API em `apps/crm-api`.

## Stack

React 19 + **Vite 7** (nunca `8.x` — o resolver do 8/Rolldown não resolve os
imports `.js`→`.tsx` deste projeto, quebra o dev server em silêncio) +
TypeScript 5 (`moduleResolution: nodenext` — todo import relativo/`@/` leva
`.js` explícito, mesmo apontando pra `.tsx`) + TanStack Router 1 (roteamento
por arquivo, `autoCodeSplitting: true`) + TanStack Query 5 + TanStack Table 8 +
Tailwind 4 + ShadCN/Radix + react-hook-form 7 + Zod 4 + `@dnd-kit` (kanban) +
`lucide-react` (única fonte de ícones) + Biome 2. TanStack Query é a única
fonte de verdade de dados — sem Zustand/estado global hoje.

## Roteamento

- Por arquivo, `index.tsx` obrigatório por diretório. Proibido `.` em nome de
  rota (`edit.$id.tsx`) e `$id` dinâmico pra detalhe — usar `details.tsx` +
  `search: { id }` (breadcrumb é path-based, path dinâmico o quebraria).
- Dois layouts pathless na raiz de `src/routes/`: `_private.tsx` (guarda via
  `beforeLoad` + `ensureQueryData(sessionQuery)`, redirect pra `/auth` se
  falhar; monta `<Outlet/>` + `<MobileDock/>`) e `_public.tsx` (só visual, sem
  guarda, pra `_public/auth` e `_public/invite`).
- **`index.tsx` de seção com múltiplos destinos vira hub de navegação**, nunca
  um `redirect()` automático: `Card asPage` + grid de
  `<Item variant="outline" asChild><Link>`, um card por destino. O conteúdo
  em si mora nas sub-rotas (ex.: a tabela de clientes está em
  `customers/list/index.tsx`, não em `customers/index.tsx`). `redirect()` em
  `beforeLoad` fica só pra guarda binária (autenticado/não).
- `routeTree.gen.ts` é gerado pelo plugin do Vite — nunca editar à mão, e só
  é regenerado com o dev server rodando (não por `tsc`/`vitest`). Depois de
  mover/criar arquivo de rota, suba `pnpm --filter web run dev` antes de
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
| Toda rota | `<Card asPage>` (`@/components/ui/card.js`) — breadcrumb automático via `staticData.title`/`description` |
| Loading / vazio | `<DefaultLoading/>` / `<DefaultEmptyData/>` |
| Listagem tabular | `<DataTable>` (`@/components/ui/data-table.js`) — **sempre server-driven**, nunca filtra/ordena/pagina `data` em memória |
| Agrupar conteúdo que não é página inteira | `Item/ItemGroup/ItemContent/ItemTitle/ItemDescription/ItemMedia/ItemFooter` (`@/components/ui/item.js`) |
| Formulário | `Form/FormField/FormItem/FormLabel/FormControl/FormMessage` (`@/components/ui/form.js`) + `react-hook-form` + `zodResolver` com schema de `@crm/contracts` — ver `routes/_public/auth/index.tsx` |

Navegação desktop é só o breadcrumb do `Card asPage` (não há sidebar); mobile
é só `@/components/mobile-dock.tsx` (`md:hidden`, estado ativo via
`data-status="active"` que o `<Link>` já aplica, nunca estado próprio).

## i18n e datas

Toda string visível passa por `t(key)` de
`@/lib/helpers/translate.helper.js` (objeto TS fixo pt-BR, chaves genéricas
reutilizáveis — buscar antes de criar). Datas sempre via
`formatDate()`/`formatDistanceToNow()` do mesmo diretório, nunca `date-fns`
direto.

## Testes

Páginas com `<Card asPage>` precisam de um mock mínimo de
`@tanstack/react-router` (sem `<RouterProvider>` real):

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
silencioso no sucesso (`--logLevel error`) e imprime o erro completo na
falha; se ficar verboso mesmo passando, é o `@tanstack/router-plugin`
avisando sobre arquivo sem `Route` — cobrir o padrão em
`routeFileIgnorePattern` (`vite.config.ts`).
