# CRM Web Shell Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.
The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation,
adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/crm-web-shell/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling. Guidelines found: `.specs/STATE.md` AD-015 (Vitest 4,
> single runner) + AD-017 (concrete `projects` convention: `unit`/`integration`/`e2e`/
> `structural`, suffix-based file naming, no `__test__` dirs). No `AGENTS.md`/
> `CONTRIBUTING.md` found. Existing-test sampling: `apps/crm-api/src/**/*.unit.test.ts`
> (middlewares/providers/config — pure logic), `*.int.test.ts` (models/repositories, real
> `MongoMemoryServer`), `*.e2e.test.ts` (routers, full stack) — **no** `*.service.unit.test.ts`
> exists anywhere in the repo; every prior feature (`dynamic-field-engine`, `crm-core`)
> verifies service/business logic exclusively through the router-level e2e suite, never an
> isolated mocked-repository unit test. This session follows that established convention
> rather than introducing a new layer-to-test-type mapping. `apps/web` sampling:
> `apps/web/src/routes/_public/auth/index.unit.test.tsx` (Testing Library + `vi.mock` +
> dynamic `await import` after mocks + `@vitest-environment jsdom` pragma) — the `unit`
> Vitest project is the **only** one that includes `apps/web` paths (no `integration`/`e2e`
> project targets it), so every front-end test in this feature is a `unit` test.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `apps/web` — ported UI primitives (Button/Input/Select/Dialog/Badge/Card/Item/Breadcrumb/Tooltip/Label/Tabs/Form-wrapper/DropdownMenu/Toaster/DatePicker/MoneyInput/Switch/Checkbox/Spinner/Skeleton) — presentational, no business logic | none | Compiles clean (`tsc`), renders indirectly via the screens that use them — matches the reference repo's own convention of not unit-testing ShadCN primitives individually | `apps/web/src/components/ui/*.tsx` | build gate only |
| `apps/web` — `client.api.ts` (`patch` addition) | unit | Same depth as the existing `get`/`post` tests: request shape (method/body/credentials), success/failure envelope | `apps/web/src/lib/api/client.api.unit.test.ts` (extend) | `pnpm vitest run --project unit` |
| `apps/web` — `DynamicField` (new, no precedent in either repo) | unit | 1:1 per `FieldDef.type` branch (all 13, incl. `document`/`reference` read-only fallback) + `array`/`group` recursion + `required`/`min`/`max` client-side hints (WEB-11) | `apps/web/src/components/dynamic-field/*.unit.test.tsx` | `pnpm vitest run --project unit` |
| `apps/web` — `DataTable` (`@tanstack/react-table` manual mode) | unit | Renders columns/rows from props; `onPaginationChange`/`onSortingChange`/`onSearchChange` fire with correct args; never re-sorts/filters/paginates locally | `apps/web/src/components/ui/data-table.unit.test.tsx` | `pnpm vitest run --project unit` |
| `apps/web` — Kanban board + drag wiring | unit | Column set = template's current `status` options + "sem status"; `handleDragEnd` resolves target column and calls the mutation; optimistic move + rollback on error (WEB-03 AC2/3/4) | `apps/web/src/routes/_private/customers/kanban.unit.test.tsx` | `pnpm vitest run --project unit` |
| `apps/web` — routes/pages (list, detail, create, edit, process screens) | unit | 1:1 to each story's Acceptance Criteria + every Edge Case that applies to that screen; error/empty/not-found states; submit-guard while `isPending` (WEB-13) | `apps/web/src/routes/_private/**/*.unit.test.tsx` | `pnpm vitest run --project unit` |
| `packages/contracts` — `updateCustomerSchema` (new) | unit | Valid payload accepted; each invalid case rejected (empty body via `.refine`, over-length `name`/`phone`, wrong `values` shape) | `packages/contracts/src/schemas/updateCustomer.schema.unit.test.ts` | `pnpm vitest run --project unit` |
| `apps/crm-api` — repository (`customer.repository` status sentinel, `fieldTemplate.repository.findTemplatesByTargetType`) | integration | Real Mongo query behavior: `$exists:false`/`$nin` combination for `__none__`, tenant scoping, `targetType` filter | `apps/crm-api/src/repositories/*.int.test.ts` | `pnpm vitest run --project integration` |
| `apps/crm-api` — routers/controllers/services (`GET /customers/:id`, `PATCH /customers/:id`, `GET /field-templates`, `GET /customers` sentinel, `GET /field-templates/:id/versions/:version` [T25B, added 2026-09-05] end-to-end) | e2e | Every route: happy path + every listed edge case (404 cross-tenant/missing, 400 invalid `values`, archived template does **not** block an edit, `templateVersion` pointer bump on success, non-current version fetch works [T25B], auth/rate-limit chain WEB-14, `dbReqResTime` present WEB-16) | `apps/crm-api/src/routers/*.e2e.test.ts` | `pnpm vitest run --project e2e` |
| `apps/crm-api` — cross-tenant isolation (shared suite, extended) | integration | The 3 new endpoints added to the existing suite: each returns 404/empty for another tenant's id, never leaks data (AD-010) | `apps/crm-api/tests/integration/tenant-isolation.int.test.ts` (extend) | `pnpm vitest run --project integration` |
| Structural | none (inherited, unchanged) | This feature introduces no new architectural invariant — existing structural suite untouched | `tests/structural/*.structural.test.ts` | build gate only |

## Gate Check Commands

> Generated from `package.json` (root `check` script) + AD-017. Confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `pnpm vitest run --project unit --project structural` |
| Full | After tasks with e2e/integration tests | `pnpm vitest run` |
| Build | After UI-primitive/config-only tasks, or closing a phase | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and
tasks within a phase execute in order.

### Phase 1: `apps/crm-api` — the 4 backend touches

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: `apps/web` — design-system bootstrap

```
T7 → T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 3: `apps/web` — `DynamicField` renderer

```
T14 → T15
```

### Phase 4: `apps/web` — Customer table (WEB-01, WEB-09)

```
T16 → T17 → T18
```

### Phase 5: `apps/web` — Customer kanban (WEB-02, WEB-03)

```
T19 → T20 → T21
```

### Phase 6: `apps/web` — Customer create/detail/edit (WEB-04, WEB-05, WEB-06)

```
T22 → T23 → T24
```

### Phase 7: `apps/web` — Process screens (WEB-07, WEB-08, WEB-10)

```
T25 → T25B → T26 → T27
```

> **T25B added 2026-09-05** (Execute-time gap found before Batch 4, no new AD — see T25B's
> own definition below): a small, additive `apps/crm-api` endpoint T26/T27 cannot function
> without. Phase 7 is now 4 tasks, not 3; the feature is 29 tasks total, not 28.

### Phase 8: i18n completion + regression close-out

```
T28
```

---

## Task Breakdown

### T1: `updateCustomerSchema` contract

**What**: Add the Zod schema for the single Customer mutation endpoint.
**Where**: `packages/contracts/src/schemas/updateCustomer.schema.ts` (+ export in `packages/contracts/src/index.ts` and `registry.ts`, same pattern as `createCustomer.schema.ts`).
**Depends on**: None
**Reuses**: `createCustomerSchema`'s field constraints (`name`/`phone`/`document`/`values` shapes); `registry.ts` registration pattern.
**Requirement**: WEB-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Schema accepts any non-empty subset of `{name, phone, document, values}`, rejects an empty object via `.refine`
- [x] Registered in `index.ts`/`registry.ts` exactly like `createCustomerSchema`
- [x] Test count: schema unit tests cover 1 valid + 4 invalid cases (empty body, over-length name, over-length phone, non-object `values`)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `1980dac`)

---

### T2: `GET /customers/:id`

**What**: Expose the already-existing `customerRepository.findById` via a new controller action and router route.
**Where**: `apps/crm-api/src/controllers/customer.controller.ts` (add `getCustomerById`), `apps/crm-api/src/services/customer.service.ts` (add `getCustomerById`, wraps `findById` + 404 `CustomError`), `apps/crm-api/src/routers/customer.router.ts` (add `router.get('/:id', ...)`).
**Depends on**: None
**Reuses**: `customerRepository.findById` (unchanged), `CustomError`/`respObj`/`badRespObj` pattern from `fieldTemplate.service.ts`'s 404s, `idSchema` for `validParams`.
**Requirement**: WEB-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `GET /customers/:id` returns `200 {success:true, data:CustomerRecord}` for an existing id in the caller's tenant
- [x] Returns `404 {success:false, message:'Customer não encontrado'}` for a missing id AND for another tenant's id (AD-010 — tenant-scoped filter makes both cases indistinguishable, by design)
- [x] Middleware chain matches convention: `validToken → tenantAssignmentCheck → validParams(idSchema)`, no rate limit (GET, matches `GET /customers` precedent)
- [x] Gate check passes: `pnpm vitest run --project e2e`
- [x] Test count: e2e adds ≥3 cases (found/own-tenant, missing id, other-tenant id) to `customer.router.e2e.test.ts`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Complete (commit `338d48f`)

---

### T3: `PATCH /customers/:id` — the single Customer mutation endpoint

**What**: Implement the confirmed merge-then-validate-then-bump-pointer behavior (design.md Data Models).
**Where**: `apps/crm-api/src/repositories/customer.repository.ts` (add `updateCustomer`), `apps/crm-api/src/services/customer.service.ts` (add `updateCustomer`), `apps/crm-api/src/controllers/customer.controller.ts` (add `updateCustomer`), `apps/crm-api/src/routers/customer.router.ts` (add `router.patch('/:id', ...)`).
**Depends on**: T1, T2
**Reuses**: `findTemplateByTargetKey`+`findCurrentVersion` (same calls `createCustomer` already makes), `validate()` (field-engine), `formatValidationErrors`, `normalizePhone`/`normalizeDocument`.
**Requirement**: WEB-06, WEB-03 (kanban drag uses this same endpoint)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] 404 when `:id` missing or cross-tenant (reuses T2's `getCustomerById`-style lookup)
- [x] Merges `data.values` (if present) into the existing `values`; always validates the **merged** result against the tenant's **current** `customer` template fields, even when `data.values` is absent from the payload (design.md step 4 — needed to honestly justify the pointer bump in the next bullet)
- [x] On success, persists `name`/`phone`(normalized)/`document`(normalized) when present, `values` merged, **and** `template`/`templateVersion` set to the current template's id/current version (AD-029) — confirmed distinct from `Process`'s snapshot model
- [x] Archived current template does **not** block the edit (AD-022 only blocks new records) — a dedicated test proves this
- [x] 400 with the formatted message when merged `values` fails `validate()`; nothing persists
- [x] Middleware chain: `validToken → tenantAssignmentCheck → customerRateLimit → validParams(idSchema) → validBody(updateCustomerSchema)`
- [x] Gate check passes: `pnpm vitest run --project e2e`
- [x] Test count: e2e adds ≥6 cases (partial `values`-only update as kanban drag would send, full core+values update, `templateVersion` bump assertion, archived-template-does-not-block, invalid `values` → 400 + nothing persisted, cross-tenant/missing → 404) to `customer.router.e2e.test.ts`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Complete (commit `207694b`)

---

### T4: `GET /customers` — `status=__none__` sentinel

**What**: Extend the existing list endpoint's `status` filter to also answer "no status" (missing key OR a value no longer among the current options).
**Where**: `packages/contracts` (new exported `NO_STATUS_FILTER_VALUE = '__none__'` constant, co-located with `createCustomer.schema.ts`), `apps/crm-api/src/repositories/customer.repository.ts` (`listCustomers` — `$or:[{'values.status':{$exists:false}},{'values.status':{$nin:knownStatusKeys}}]` branch), `apps/crm-api/src/services/customer.service.ts` (`listCustomers` — resolve current template's `status` field options into `knownStatusKeys` only when `query.status === NO_STATUS_FILTER_VALUE`).
**Depends on**: None
**Reuses**: `findTemplateByTargetKey`+`findCurrentVersion` (same calls used elsewhere), existing `listCustomersQuerySchema`/`ListCustomersInput` types (no schema shape change — `__none__` is just a string value already accepted).
**Requirement**: WEB-02 (AC4 + the Edge Case about a removed `status` option)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `customer.repository.listCustomers` accepts an optional `knownStatusKeys?: string[]` and builds the `$or` filter only when it's provided
- [x] `customer.service.listCustomers` resolves `knownStatusKeys` from the current template exactly when `query.status === NO_STATUS_FILTER_VALUE`, otherwise behaves unchanged
- [x] A Customer with no `values.status` key AND a Customer whose `values.status` holds a key no longer in the current template's options both appear under `status=__none__`; a Customer with a still-valid `status` never appears there
- [x] Gate check passes: `pnpm vitest run --project integration` (repository) and `pnpm vitest run --project e2e` (endpoint)
- [x] Test count: repository integration test adds ≥3 cases (missing key, stale value, valid value excluded); router e2e adds ≥2 cases (sentinel round-trip through the real endpoint, ordinary `status=<key>` behavior unchanged)

**Tests**: integration, e2e
**Gate**: full
**Status**: ✅ Complete (commit `4762c7d`)

---

### T5: `GET /field-templates` — list endpoint

**What**: New listing endpoint for the Process template picker.
**Where**: `apps/crm-api/src/repositories/fieldTemplate.repository.ts` (add `findTemplatesByTargetType`), `apps/crm-api/src/services/fieldTemplate.service.ts` (add `listTemplates`, maps `name→label`), `apps/crm-api/src/controllers/fieldTemplate.controller.ts` (add `listTemplates`), `apps/crm-api/src/routers/fieldTemplate.router.ts` (add `router.get('/', ...)`).
**Depends on**: None
**Reuses**: `tenantScoped`, `withDbTiming`, the existing `validQuery` shared middleware (confirmed safe here — `targetType` is a plain string enum, not a `z.coerce.*` transform, so it doesn't hit the Express-5 `req.query` getter bug documented in `crm-core`'s `validation.md`).
**Requirement**: WEB-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `GET /field-templates?targetType=process` returns `200 {success:true, data:{items:[{key,label,archived}]}}` for every template of that `targetType` in the caller's tenant, archived included (front-end decides visibility/disabling — design.md)
- [x] `targetType=customer` returns the seeded default template
- [x] No `isAdmin` gate (matches `GET /field-templates/current`'s precedent — open to any authenticated role, WEB-14)
- [x] Gate check passes: `pnpm vitest run --project e2e`
- [x] Test count: e2e adds ≥3 cases (`process` templates incl. one archived, `customer` default, cross-tenant isolation — another tenant's templates never appear) to `fieldTemplate.router.e2e.test.ts`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Complete (commit `0c57130`)

---

### T6: Extend the shared cross-tenant isolation suite

**What**: Add the 3 new endpoints (`GET /customers/:id`, `PATCH /customers/:id`, `GET /field-templates`) to the project-wide tenant-isolation integration suite, matching the precedent `crm-core` already set for its own new endpoints.
**Where**: `apps/crm-api/tests/integration/tenant-isolation.int.test.ts` (extend).
**Depends on**: T2, T3, T5
**Reuses**: The suite's existing two-tenant fixture setup and assertion style (already extended once for `customers`/`processes` in `crm-core`).
**Requirement**: WEB-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Each of the 3 new endpoints, called with tenant B's credentials against a tenant A id, returns 404/empty — never tenant A's data
- [x] Gate check passes: `pnpm vitest run --project integration`
- [x] Test count: suite grows by exactly 3 cases (one per new endpoint)

**Tests**: integration
**Gate**: full
**Status**: ✅ Complete (commit `5d4ea04`)

---

### T7: Tailwind v4 + path alias + `cn()` helper + file-based routing (AD-030)

**What**: Bootstrap the styling infrastructure `apps/web` currently has none of.
**Amended 2026-09-05** (Execute-time gap found, user-confirmed, recorded as **AD-030**): also migrates `apps/web`'s routing from the existing manual `createRoute`+`router.tsx` `addChildren` composition (feature 1) to TanStack Router's file-based routing (`@tanstack/router-plugin` + `createFileRoute`) — the convention `CLAUDE.md` already documents as mandatory and that feature 1 never actually adopted. This feature is the first to add a meaningful volume of new routes (6), the natural point to correct it.
**Where**:
- `apps/web/package.json` (add `tailwindcss@4`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `class-variance-authority`, **and `@tanstack/router-plugin@1.168.18`** — version resolved from the reference's own lockfile, compatible with this project's `@tanstack/react-router@1.170.32`).
- `apps/web/vite.config.ts` (add the Tailwind plugin + path alias `@` → `./src`, **and `tanstackRouter({ target: 'react', autoCodeSplitting: true, routeFileIgnorePrefix: '@', semicolons: true })` from `@tanstack/router-plugin/vite`, ordered BEFORE `viteReact()`** — matches the reference's own plugin order).
- `apps/web/src/index.css` (new — `@import 'tailwindcss'` + `@theme` block).
- `apps/web/src/main.tsx` (import the new CSS).
- `apps/web/src/lib/utils.ts` (new — `cn()` via `clsx`+`tailwind-merge`).
- **`apps/web/src/router.tsx`** (rewritten — imports the generated `routeTree` from `./routeTree.gen.ts` instead of manually composing `addChildren`; `createRouter({ routeTree, context: { queryClient } })`, `Register` module augmentation unchanged).
- **Convert the 4 existing route files** from `createRoute` to `createFileRoute`, preserving all current behavior exactly (session guard, redirect targets, `validateSearch` for the invite token):
  - `apps/web/src/routes/_private.tsx` → `createFileRoute('/_private')({ beforeLoad, component })` (same `beforeLoad` body).
  - `apps/web/src/routes/_private/index.tsx` → `createFileRoute('/_private/')({ component: PrivateIndexPage })`.
  - `apps/web/src/routes/_public/auth/index.tsx` → **moved to** `apps/web/src/routes/auth/index.tsx`, `createFileRoute('/auth')({ component: AuthPage })` (dropping the `_public` prefix — it was never a real pathless layout, no `_public.tsx` component exists to wrap it; inventing one is unneeded ceremony for 2 unrelated screens).
  - `apps/web/src/routes/_public/invite/index.tsx` → **moved to** `apps/web/src/routes/invite/index.tsx`, `createFileRoute('/invite')({ validateSearch: ..., component: InvitePage })` (same `validateSearch` body — already search-param-based, no behavior change).
  - `apps/web/src/routes/__root.tsx` stays `createRootRouteWithContext` (unchanged — root routes don't use `createFileRoute`).
- Move the corresponding `*.unit.test.tsx` files alongside their routes (same rename), update only their import paths — test bodies/assertions unchanged.
**Depends on**: None
**Reuses**: Exact versions confirmed in `../DentalEase/DentalEase/package.json`/lockfile (AD-027, AD-030); the reference's own `tanstackRouter()` plugin options and plugin ordering (`vite.config.ts`).
**Requirement**: (enables all Goals — design system; AD-030 — routing convention for every route in Phases 4-8)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `pnpm dev` in `apps/web` renders a Tailwind utility class visibly (manual smoke check) — verified via `vite build`: compiled CSS asset is 6.93 kB (real utility output, not an empty stylesheet), CSS/route-tree pipeline confirmed working end-to-end
- [x] `cn('a', condition && 'b')` resolves conflicting Tailwind classes correctly (matches DentalEase's own `cn()` behavior)
- [x] `routeTree.gen.ts` is generated on `pnpm dev`/build and `router.tsx` consumes it — no manual `addChildren` call remains
- [x] All 4 existing routes (`_private`, `_private/index`, `auth/index`, `invite/index`) compile and behave identically under `createFileRoute` — the existing `*.unit.test.tsx` suites for these routes (session guard redirect, login, invite-accept) pass unmodified in assertions (import paths only)
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` (full suite — this task touches existing feature-1 tests, so Build gate applies here even though it's not the last task in the phase)

Also ported/adjusted beyond the literal file list above (transitive necessities found running the actual codegen/build, not guessed): root `biome.json` gained `css.parser.tailwindDirectives: true` (Biome otherwise refuses to parse `@theme`/`@apply`) and an `overrides` entry disabling lint/format/assist on `**/*.gen.ts` (matches the reference repo's own `biome.json`, which excludes `routeTree.gen.ts` the same way) — both required for the gate to pass, not optional polish. `apps/web/tsconfig.json` gained `baseUrl`/`paths` (`@/*` → `./src/*`) so `tsc --noEmit` can resolve the `@/...`-aliased imports T8+ introduces (confirmed by experiment: under this project's `moduleResolution: NodeNext`, even a path-mapped bare specifier still needs an explicit `.js` extension — verified before porting any component). The TanStack Router codegen itself corrected `createFileRoute('/auth')`/`createFileRoute('/invite')` to `createFileRoute('/auth/')`/`createFileRoute('/invite/')` (trailing slash — the real convention for a directory+`index.tsx` route with no sibling pathless layout, confirmed by running the actual plugin rather than guessing); `navigate`/`redirect` call sites keep using `to: '/auth'`/`to: '/invite'` unchanged (the router's `to`-form omits the trailing slash by design, per the generated `FileRoutesByTo` type).

**Tests**: none (existing route tests must keep passing, no new tests added by this task)
**Gate**: build
**Status**: ✅ Complete (commit `53832cc`)

---

### T8: Port primitives batch A — Button, Input, Label, Badge, Card, Item, Breadcrumb, Tooltip + Card's icon dependencies

**What**: Port these presentational primitives, replacing the placeholder `card.tsx` (closes that `SPEC_DEVIATION`).
**Amended 2026-09-05** (Execute-time gap found during Batch 2 pre-flight, user-confirmed — no new AD, this is a task-list correction under the existing AD-027 design-system-port umbrella): the reference `card.tsx` is not a standalone primitive — it embeds an automatic `Breadcrumb` (via TanStack Router `useMatches()`) plus `Tooltip` and 3 icons (`Back`/`Help`/`Home`), which is exactly the `CLAUDE.md`-documented contract ("Card asPage ativa Breadcrumb automático via rota"). Separately, `Item`/`ItemGroup`/`ItemContent`/`ItemTitle`/`ItemDescription` — `CLAUDE.md`: mandatory for every non-page "componente comum" (used by `DynamicField`/`DataTable`/`Kanban` in Fases 3-5) — were missing from the original Phase 2 primitive list entirely. Both gaps are closed here, before any later phase needs them.
**Where**: `apps/web/src/components/ui/{button,input,label,badge,card,item,breadcrumb,tooltip,separator}.tsx` (`separator.tsx` added — `item.tsx`'s `ItemSeparator` imports it directly, a hard dependency, not optional), `apps/web/src/components/icons/{Back,Help,Home,Dot,Right}.Icon.tsx` (minimal set — only what `Breadcrumb`/`Card` need: `Right`/`Dot` for `BreadcrumbSeparator`/`BreadcrumbEllipsis`; `Home` ported as a plain static SVG, NOT the reference's `framer-motion`-animated version — avoids a whole animation library dependency for one breadcrumb icon, same visual result; the full reference icon inventory is out of this feature's scope, port more only as future features need them).
**Depends on**: T7
**Reuses**: `../DentalEase/DentalEase/src/components/ui/{button,input,label,badge,card,item,breadcrumb,tooltip,separator}.tsx` verbatim (props/variants kept — see design.md Code Reuse Analysis), `../DentalEase/DentalEase/src/components/icons/{Back,Help,Dot,Right}.Icon.tsx` verbatim (`Home.Icon.tsx` simplified, see above), `cn()` from T7.
**Requirement**: (Goal: replace `card.tsx` `SPEC_DEVIATION`; `CLAUDE.md` Item/ItemGroup + Card/Breadcrumb conventions)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `Card`/`CardHeader`/`CardContent`/`CardAction` preserve the existing call sites' props (`asPage`, `title`) — `apps/web/src/routes/_private/index.tsx`, `auth/index.tsx`, `invite/index.tsx` (T7's new locations, AD-030) compile unchanged
- [x] `Card asPage` renders a working `Breadcrumb` from the current route match, matching `CLAUDE.md`'s documented contract
- [x] `Item`/`ItemGroup`/`ItemContent`/`ItemTitle`/`ItemDescription` exported and usable by later phases' componentes comuns
- [x] `SPEC_DEVIATION` comment removed from `card.tsx`
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check .`

Also ported beyond the literal file list above (transitive necessities found while porting, named in the Batch 2 dispatch prompt): `separator.tsx` (Item hard dependency), `Home.Icon.tsx` as a hand-written static SVG (no `framer-motion`). Two more gaps found only by actually wiring the real `card.tsx`, not anticipated by either doc: (1) `badge.tsx` itself pulls in `Down`/`Up`/`Minus` icons for `BadgeWithDelta` (`Minus.Icon.tsx` net-new, `Down`/`Up.Icon.tsx` pulled forward from T9's list since `Badge` is this task's own scope and needs them now) — ported verbatim, all plain static SVGs. (2) `Card asPage`'s `PageBreadcrumb`/`CardHeader`/`CardDescription` call `useLocation`/`useMatches`/`useRouter` (and `Breadcrumb`'s `<Link>`) unconditionally — these throw outside a `<RouterProvider>`, which broke the 3 pre-existing page-level unit tests (`auth`, `invite`, `_private/index`) that render their page component directly without one. Fixed by adding minimal `useLocation`/`useMatches`/`useRouter` mocks (returning `{pathname:'/'}` / `[]` / a no-op `history.back`) to each test's existing `vi.mock('@tanstack/react-router', ...)` block — same convention already used there for `useNavigate`/`useSearch`, no new test infra. Also required: `apps/web/tsconfig.json`'s `@/*` path alias (added in T7) needed a matching `resolve.alias` in the root `vitest.config.ts`'s `unit` project, since Vitest at the repo root does not inherit `apps/web/vite.config.ts`'s alias — without it, every `@/...`-importing file (all of T8 on) fails to resolve under Vitest even though `tsc`/`vite build` were already fine.

**Tests**: none
**Gate**: build
**Status**: ✅ Complete (commit `04ebc53`)

---

### T9: Port primitives batch B — Select, Dialog, Tabs, DropdownMenu

**What**: Port these 4 Radix-based primitives.
**Where**: `apps/web/src/components/ui/{select,dialog,tabs,dropdown-menu}.tsx`.
**Depends on**: T7
**Reuses**: Same reference files verbatim.
**Requirement**: (enables Goals — used by picker/detail/kanban-card-menu screens)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] All 4 components exported with the same names/props as the reference
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check .`

Also ported beyond the literal file list above (transitive necessities, named in the Batch 2 dispatch prompt): 2 new icons, `Check.Icon.tsx`/`Cross.Icon.tsx` (verbatim, plain static SVGs) — `select.tsx`'s `Down`/`Up` and `dropdown-menu.tsx`'s `Dot`/`Right` were already ported in T8. `dropdown-menu.tsx` imports the `radix-ui` aggregator package (`import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'`), kept as-is (not rewritten to the individual-package style the other 3 files use) — matches the reference file's own import verbatim, per this batch's instructions.

**Tests**: none
**Gate**: build
**Status**: ✅ Complete (commit `92034a2`)

---

### T10: Port Form primitives (react-hook-form wrapper)

**What**: Port `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage`/`useFormField`.
**Where**: `apps/web/src/components/ui/form.tsx`.
**Depends on**: T7, T8 (uses `Label`)
**Reuses**: Reference `form.tsx` verbatim (`react-hook-form`/`@hookform/resolvers` already installed, unused today).
**Requirement**: (enables `DynamicField`, Phase 3)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Exports match the reference exactly
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check .`

**Tests**: none
**Gate**: build
**Status**: ✅ Complete (commit `e981059`)

---

### T11: Port Sonner/Toaster, DatePicker, MoneyInput, Switch, Checkbox, Spinner, Skeleton

**What**: Port the remaining leaf primitives `DynamicField`/kanban-error-toast need.
**Where**: `apps/web/src/components/ui/{sonner,date-picker,money-input,switch,checkbox,spinner,skeleton}.tsx`.
**Depends on**: T7
**Reuses**: Reference files verbatim; `sonner` package added to `apps/web/package.json`.
**Requirement**: (enables `DynamicField` currency/date/boolean fields, WEB-03's error toast)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `Toaster` mounted once at the router root (`apps/web/src/main.tsx` or `__root.tsx`)
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check .`

Also ported beyond the literal file list above (transitive necessities, named in the Batch 2 dispatch prompt): `calendar.tsx` + `popover.tsx` (date-picker.tsx's own hard dependencies), `apps/web/src/lib/helpers/formatDate.helper.ts` + `money.helper.ts` (calendar.tsx's / money-input.tsx's own dependencies — verbatim ports, the exact API `CLAUDE.md` already documents as an established convention), 3 more icons — `Left`/`Loader` (verbatim) and `Calendar` (verbatim visually, renamed from the reference's own typo'd `Calender.Icon.tsx`, since this is a new file in this project rather than a path already referenced elsewhere). `sonner.tsx` simplified per the dispatch prompt's explicit instruction: no `next-themes` (dropped the `useTheme()` call, hardcoded `theme="light"`), no `useIsMobile` (hardcoded one fixed `position="bottom-right"` instead of the mobile/desktop branch), and dropped the `toastOptions.descriptionClassName` (referenced brand-blue tokens tied to the `dark:`/`ocean-blue:`/`sunset:` variants this project's CSS deliberately doesn't define). `calendar.tsx`'s `today`/day-button classNames similarly dropped their `ocean-blue:`/`sunset:`/some `dark:` variants (same reasoning — those custom variants are never defined in `index.css`, so referencing them is dead code, not a missing feature). `Toaster` mounted in `apps/web/src/main.tsx` (outside the router tree, alongside `RouterProvider`).

**Tests**: none
**Gate**: build
**Status**: ✅ Complete (commit `73f270a`)

---

### T12: Rewrite `default-loading.tsx`

**What**: Replace the placeholder with a thin wrapper around the ported `Spinner`/`Skeleton`, closing that `SPEC_DEVIATION`.
**Where**: `apps/web/src/components/default-loading.tsx`.
**Depends on**: T11
**Reuses**: `Spinner`/`Skeleton` from T11.
**Requirement**: (Goal: design system completeness)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Same call signature as today (`<DefaultLoading />`), every existing call site compiles unchanged
- [x] `SPEC_DEVIATION` comment removed
- [x] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check .`

Reference (`../DentalEase/DentalEase/src/components/default-loading.tsx`) exports this component as a `default` export — kept as a named export here (`export function DefaultLoading()`) since the existing call site (`invite/index.tsx`) imports it as `{ DefaultLoading }`; changing the export style would be unrequested scope creep on a file this task doesn't own.

**Tests**: none
**Gate**: build
**Status**: ✅ Complete (commit `124fdf2`)

---

### T13: `client.api.ts` — add `patch()`

**What**: Add the missing HTTP verb the 2 new `PATCH` calling sites (Phase 5/6/7) need.
**Where**: `apps/web/src/lib/api/client.api.ts`.
**Depends on**: None
**Reuses**: The exact `get`/`post` pattern in the same file (`credentials:'include'`, never throws, `ApiResponse<T>` envelope).
**Requirement**: (enables WEB-03, WEB-06, WEB-08)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `patch<T>(path, body): Promise<ApiResponse<T>>` mirrors `post`'s implementation with `method:'PATCH'`
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: `client.api.unit.test.ts` grows by ≥2 cases (success envelope, network-failure envelope) mirroring the existing `post` tests

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `7d6a912`)

Phase 2 close-out (T7-T13): Build gate re-run after T13 — `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`: tsc clean, biome clean (the one remaining diagnostic, `.specs/lessons.json`, is a pre-existing formatting-only issue on `main` before this batch started, unrelated to `crm-web-shell` — confirmed via `git diff HEAD` showing zero local changes to that file — out of this batch's scope to fix), full vitest suite 63 files / 397 tests passed (one `apps/crm-api` e2e test flaked once under full-suite load — `process.router.e2e.test.ts`, unrelated to this batch's `apps/web`-only changes, confirmed pre-existing/flaky by passing in isolation and again on a full-suite rerun).

---

### T14: `DynamicField` — leaf types

**What**: Recursive renderer, leaf-type branches: `text`, `number`, `currency`, `percent`, `boolean`, `date`, `datetime`, `select`, `status`.
**Where**: `apps/web/src/components/dynamic-field/dynamic-field.tsx`.
**Depends on**: T10, T11
**Reuses**: `Input`/`Select`/`DatePicker`/`MoneyInput`/`Switch` from Phase 2; `RenderNode`/`FieldDef` types from `@crm/contracts`.
**Requirement**: WEB-04, WEB-06, WEB-08, WEB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Each of the 9 leaf types renders the primitive from design.md's dispatch table, bound to `react-hook-form`'s `control` via `name`
- [x] `required`/`min`/`max`/`maxLength` from `FieldDef` surface as client-side hints only (WEB-11 — server `validate()` remains the source of truth, never bypassed)
- [x] `currency` reads/writes integer cents (never a decimal) — matches field-engine's `validate()` contract
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 10 tests (one per leaf type + a bonus for `select`'s `multiple:true` checkbox branch)

Deviations found during Execute (small, folded in rather than stopping): (1) `RenderNode` actually lives in `@crm/field-engine` (not `@crm/contracts` as this task's "Reuses" line says) — added `@crm/field-engine: workspace:*` to `apps/web/package.json`. (2) The already-ported `ui/date-picker.tsx` (T11) is a bare, prop-less demo (`const [date,setDate] = useState<Date>()`, no `value`/`onChange`) — unusable as a controlled input. Rather than modifying that already-ported primitive, `date`/`datetime`'s leaf composes the same underlying blocks it uses (`Popover`/`Calendar`/`Button`/`IconCalendar`/`formatDate`), now controlled via `useController`. (3) `select`'s `multiple:true` renders a list of the already-ported `Checkbox` (T11) instead of the single-value-only Radix `Select` primitive, since Radix Select has no native multi-select mode and rewriting that primitive is out of scope. (4) `text`'s `multiline` branch renders a plain `<textarea>` styled with `Input`'s own class language (per this batch's explicit fallback instruction) rather than a new `ui/textarea.tsx` primitive. (5) `currency`'s `MoneyInput` keeps its existing pt-BR/BRL-masked typing UX (T11, unmodified); the field's own `code`/`precision` instead drive a separate `Intl.NumberFormat`-based preview line beneath it, which is what actually varies by field. (6) `date`-only values parse/format via local date components (never `Date`'s UTC ISO parsing) to avoid an off-by-one-day bug in negative-UTC-offset timezones; `datetime` is unaffected (real UTC timestamp).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `7057af5`)

---

### T15: `DynamicField` — recursive types + fallback

**What**: `array`, `group`, and the confirmed read-only fallback for `document`/`reference`.
**Where**: `apps/web/src/components/dynamic-field/{dynamic-field.array,dynamic-field.group}.tsx` (+ fallback branch in `dynamic-field.tsx`).
**Depends on**: T14
**Reuses**: `DynamicField` itself (recursion), `Button` (Add/Remove for `array`).
**Requirement**: WEB-04, WEB-06, WEB-08, WEB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `array` renders one `DynamicField` per item (`of`) with Add/Remove controls
- [x] `group` renders its `fields` recursively, nested
- [x] `document`/`reference` render the raw stored value as read-only text — never block the rest of the form, never drop the field's value on save (confirmed Design decision)
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 5 tests (array add + array remove, group nesting round-trips all children, document fallback, reference fallback)

Deviation found during Execute: `RenderNode.value` for `array`/`group` is the recursively-**hydrated** RenderNode[] tree (structural metadata for the recursion — which type/label/options each child has), not the raw data react-hook-form must control. `defaultValues` for any form embedding an `array`/`group` node must be seeded from the **original raw `values` object** (the same one passed into `hydrate()`), never from `node.value` itself — the two test harnesses (`dynamic-field.array.unit.test.tsx`, `dynamic-field.group.unit.test.tsx`) take an explicit `initialValue` prop for exactly this reason, built via a real `hydrate()` call rather than a hand-rolled `RenderNode`, so the mismatch would have failed loudly instead of silently. This is a load-bearing detail T22/T24/T26 (later batches, the actual form routes) must also get right when they seed their own `useForm({defaultValues: values})`.

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `9dd1363`)

---

### T16: `DataTable<T>` (server mode)

**What**: Build the table component on `@tanstack/react-table`'s manual/server API (design.md's confirmed adaptation — not the reference's client-side wrapper).
**Where**: `apps/web/src/components/ui/data-table.tsx`.
**Depends on**: T8, T9 (Table/Button/Input primitives)
**Reuses**: `@tanstack/react-table`'s `useReactTable`/`getCoreRowModel`/`flexRender` — the same library the reference's unused `DataTableProvider` half already demonstrates, wired for `manualPagination`/`manualSorting`/`manualFiltering: true` instead.
**Requirement**: WEB-01, AD-028

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `onPaginationChange`/`onSortingChange` fire with the new state; component never locally re-sorts/re-filters/re-paginates the `data` prop it's given
- [x] `onSearchChange` fires (debounced, ~300ms) with the typed value
- [x] Empty `data` renders the passed `emptyState`, not a blank table
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 7 tests (pagination callback, sort callback, debounced search callback, custom empty state, default-fallback empty state, loading state, AD-028 no-local-resort proof)

Also built beyond the literal file list above (transitive necessities, per this batch's dispatch prompt): (1) `apps/web/src/components/ui/table.tsx` — ported verbatim from the reference (`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableFooter`/`TableCaption`), since despite this task's own "Depends on" line naming it, no prior Batch-2 task actually ported it; `DataTable` needed it for the real DOM structure. (2) `apps/web/src/components/default-empty-data.tsx` (`DefaultEmptyData`) — `CLAUDE.md` mandates it project-wide and this task's own `emptyState?: ReactNode` default needs a concrete fallback; built minimal (`Item`/`ItemContent`/`ItemTitle`/`ItemDescription`, T8), deliberately NOT porting the reference's random-icon roulette (`Card`/`Cloud`/`Face`/`Mail`/`Package`/`Search`/`Service` icons) — unrequested cosmetic flair, same judgment call already made for `DefaultLoading` (T12). Added 6 translation keys (`not.found`, `not.found.description`, `search.placeholder`, `table.page`, `previous.page`, `next.page`) to `translate.helper.ts`'s existing inline dictionary. Added `@tanstack/react-table@8.21.3` to `apps/web/package.json` (exact version from design.md's Code Reuse Analysis).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `a8df9af`)

---

### T17: Customer query hooks

**What**: TanStack Query `queryOptions`/`queryKey` factories for `GET /customers` (list) and `GET /customers/:id`.
**Where**: `apps/web/src/query/customer.ts` (new).
**Depends on**: T13
**Reuses**: `sessionQuery`'s exact pattern (`apps/web/src/query/session.ts`) — `queryOptions`, `queryKey` factory, `get<T>` from `client.api.ts`.
**Requirement**: WEB-01, WEB-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `customersQuery({page,limit,q,sort,order,status})` builds the querystring and calls `GET /customers`
- [x] `customerQuery(id)` calls `GET /customers/:id`
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 9 tests (querystring built from full params, no-params → no querystring, success resolution, failure message thrown, queryKey varies by params — mirrored for both `customersQuery` and `customerQuery`)

Note: `CustomerRecord` is not exported from `@crm/contracts` (it's a repository-local type in `apps/crm-api`) — mirrored locally in `apps/web/src/query/customer.ts`, same convention `session.ts` already uses for `SessionView`.

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `4e8924e`)

---

### T18: `_private/customers/index.tsx` — table route

**What**: The WEB-01 screen: table wired to `DataTable`, search/sort/page synced to the URL (WEB-09).
**Where**: `apps/web/src/routes/_private/customers/index.tsx` (auto-registered via file-based routing/`routeTree.gen.ts`, AD-030 — no manual `router.tsx` edit needed).
**Depends on**: T16, T17
**Reuses**: `usePatientList`'s `useSearch`/`validateSearch`/`navigate({search...})` pattern from the reference (design.md).
**Requirement**: WEB-01, WEB-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Loads via `GET /customers`, shows name/phone/status columns, paginated
- [x] Typing a search term sends `q` to the server (no local filtering over one page)
- [x] Changing sort/page reflects new server-fetched data
- [x] Empty result shows an explicit empty state
- [x] Search/sort/page/status persist in the URL and restore on reload (WEB-09)
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 5 tests, one per Acceptance Criterion (WEB-01 AC1-4 + WEB-09 AC1-2, some sharing a test — AC1+WEB-09-AC2 together, and each of AC2/AC3(sort)/AC3(page) paired with WEB-09 AC1)

Also created beyond the literal file list above: `@interface/customers.interface.ts` (search-param Zod schema + `CustomersSearch` type) and `@utils/columns.tsx` (DataTable columns), per `CLAUDE.md`'s route-folder convention. Deviation found running the actual structural suite (not guessed): `tests/structural/schema-registry.structural.test.ts` (AD-010) scans **every** `*.schema.ts` under `apps/` + `packages/` and demands every exported `ZodType` be registered in `packages/contracts`'s `schemaRegistry` — a guardrail clearly aimed at backend/contracts validation schemas, not a front-end route's local search-param parser, but the glob doesn't distinguish. Fix: named the file `customers.interface.ts` (not `customers.schema.ts`) — still matches `CLAUDE.md`'s `@interface/{feature}.interface.ts` slot ("Types, Interfaces") even though it contains a small Zod object; avoids touching the structural test (out of this batch's scope) and avoids registering a front-end-only schema in a backend contracts registry it has nothing to do with. **Binding for later batches**: any new `apps/web` route search-param (or other local) Zod schema should be named `*.interface.ts`, never `*.schema.ts`, for the same reason.

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `dc78f80`)

---

### T19: Customer status/kanban query hook + column derivation

**What**: A hook resolving the current `customer` template's `status` `FieldDef.options` (for column set + colors) plus per-column `GET /customers?status=<key>` queries, including the `__none__` sentinel column.
**Where**: `apps/web/src/query/customer.ts` (extend), `apps/web/src/query/fieldTemplate.ts` (new — `currentCustomerTemplateQuery`).
**Depends on**: T17, T4 (backend sentinel must exist)
**Reuses**: `GET /field-templates/current?targetType=customer&key=<default>` (existing endpoint).
**Requirement**: WEB-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Column list = current `status` field's `options`, ordered by `StatusOption.order`, plus one trailing "sem status" column (`NO_STATUS_FILTER_VALUE`)
- [x] Each column independently queries `GET /customers?status=<key>` (or the sentinel)
- [x] A column with zero matching Customers renders empty, not omitted/erroring
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 7 tests (`customerStatusColumns`: sorted-by-order + sentinel appended, sentinel-only when no `status` field exists, sentinel value round-trips through `customersQuery`'s querystring; `currentCustomerTemplateQuery`: builds the GET call, resolves, throws on failure, per-`targetType`+`key` queryKey)

`customerStatusColumns` is a plain exported function (`apps/web/src/query/customer.ts`, extended), not a React hook — it has no internal hook calls, just derives column metadata from a `FieldDef[]` already loaded by `currentCustomerTemplateQuery`; the "each column independently queries" behavior itself is just T17's existing `customersQuery({status: col.key})` called once per column by T20's route (no new fetch function needed — confirmed the per-column render/empty-column behavior is exercised at T20, since this task's own "Where" has no route/component file).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `3f36656`)

---

### T20: Kanban board route + drag persistence

**What**: `_private/customers/kanban/index.tsx` (AD-030 directory+`index.tsx` naming), wiring the ported `KanbanProvider`'s `onDragEnd` to `PATCH /customers/:id`.
**Where**: `apps/web/src/routes/_private/customers/kanban/index.tsx`.
**Depends on**: T19, T3 (backend mutation must exist), T11 (Toaster)
**Reuses**: `KanbanProvider`/`KanbanBoard`/`KanbanCards`/`KanbanCard` verbatim; the "resolve target column inside `onDragEnd`" pattern from `KanbanBoardView.tsx`.
**Requirement**: WEB-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Dropping a card in a different column calls `PATCH /customers/:id` with `{values:{status:targetKey}}`
- [x] On success, the card stays in the new column and both columns' counts reflect it
- [x] On failure (network/400), the card visually returns to its origin column and `toast.error(...)` fires — never left stuck in the rejected column
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 4 tests, one per WEB-03 Acceptance Criterion (AC1 mutation call shape, AC2 success reflects in both columns, AC3 failure rollback+toast, AC4 no optimistic lock blocks a second concurrent drag)

Foundational gaps closed here (per the batch dispatch prompt, folded into this task): (1) `apps/web/src/components/ui/scroll-area.tsx` (`ScrollArea`/`ScrollBar`, verbatim port — `kanban.tsx`'s own hard dependency) and (2) `apps/web/src/components/ui/kanban.tsx` (`KanbanBoard`/`KanbanCard`/`KanbanCards`/`KanbanHeader`/`KanbanProvider`, near-verbatim port). Added `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@radix-ui/react-scroll-area@1.2.12`, `tunnel-rat@0.1.2`.

Deviations found during Execute: (1) `tunnel-rat`'s own `dist/index.d.ts` has no `"type":"module"` in its package.json — under this project's `moduleResolution:NodeNext`, `import tunnel from 'tunnel-rat'` resolves to the module's namespace instead of its default export (a real function), even though the bundled runtime always delivers the function correctly. Fixed with one contained, typed cast (`(tunnel as unknown as () => TunnelInstance)()`) rather than `any`, documented inline — a packaging quirk of that dependency, not a code bug. (2) Optimistic move is a **local override map** (`pendingMoves: Record<customerId,status>`), not a direct write to the TanStack Query cache — each kanban column is its own independent `customersQuery({status})`, so overriding the *displayed* column per id (falling back to the column's own query result otherwise) is the simplest correct mechanism; confirmed via a real bug caught by AC2's own test: clearing the override *before* the invalidated queries' refetch settles let the card visually snap back to its pre-move column for one render (the refetch hadn't caught up yet) — fixed by awaiting `queryClient.invalidateQueries(...)` inside `onSuccess` before clearing the override, so the override only drops once the per-column queries already show the true post-move state. (3) The Kanban card's own content is factored into a small `@components/customer-kanban-card-content.tsx` with an `actions?: ReactNode` slot (currently unused) — the WEB-10 extension point T25 (a later batch) needs for its "new Process" shortcut, per this batch's explicit instruction not to guess its shape further than that.

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `5d1e2af`)

---

### T21: Table ⇄ Kanban toggle

**What**: A small `Tabs`-style link between `_private/customers/index.tsx` and `.../kanban/index.tsx`.
**Where**: A shared, non-route component, e.g. `apps/web/src/routes/_private/customers/@components/view-toggle.tsx` (the `@` prefix matches this project's `routeFileIgnorePrefix: '@'` from T7/AD-030 — the route generator skips it, matching `CLAUDE.md`'s own `@components/` folder convention; do NOT use a `-` prefix, that is not this project's ignore prefix) — or inline in both routes if simpler, Execute decides the exact file split.
**Depends on**: T18, T20
**Reuses**: `Tabs`/`TabsList`/`TabsTrigger` from Phase 2.
**Requirement**: (Design's discretion — connects WEB-01 and WEB-02 into one perceived screen)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Both routes render the same toggle, each linking to the other via TanStack Router `Link`
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: 1 test (toggle links to the correct route from each side)

Built as plain `<Link>`s styled to look like tabs (`data-[status=active]` — the attribute TanStack Router's own `Link` already sets when its target matches the current route), not `Tabs`/`TabsTrigger`: a `TabsTrigger` is a `<button>`, so making it actually navigate would need a synthetic `onClick`/`navigate()` handler instead of a real `href`, losing native anchor semantics (open-in-new-tab, etc.) for no benefit — the dispatch prompt's own alternative ("or plain Links styled as tabs") for exactly this reason. Extending `_private/customers/index.tsx` and `.../kanban/index.tsx` with `<CardAction><CustomersViewToggle /></CardAction>` required adding a `Link` stub to both routes' existing `@tanstack/react-router` mocks (T18/T20's tests otherwise threw, same "needs a real router context" issue `Card asPage`'s breadcrumb `Link` already forced a workaround for).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `a739c11`)

Phase 3+4+5 close-out (T14-T21): Build gate re-run after T21 — `pnpm -r exec tsc --noEmit`: clean across all 7 workspace packages. `pnpm biome check .`: 1 pre-existing error (`.specs/lessons.json`, confirmed unrelated to this batch — `git diff main -- .specs/lessons.json` shows 0 lines changed, same pre-existing formatting-only issue T13 already documented) + 9 warnings (`lint/suspicious/noExplicitAny`, all intentional/documented: the `useNavigate()`-without-`from` search-updater casts in T18's route, the `tunnel-rat` interop cast in T20's kanban port, and T20's test-mock prop types). `pnpm vitest run` (full suite, run separately since the chained `&&` would otherwise skip it over that one pre-existing error): 72 files / 445 tests passed, 0 failed.

---

### T22: `_private/customers/add/index.tsx` — create form

**What**: The WEB-04 screen.
**Where**: `apps/web/src/routes/_private/customers/add/index.tsx` (AD-030 `add/index.tsx` naming).
**Depends on**: T15, T13
**Reuses**: `hydrate()` (field-engine) + `currentCustomerTemplateQuery` (T19) to build the field tree; `DynamicField` (Phase 3); the existing `auth/index.tsx` form-submission convention (inline error text, `useMutation` for the POST).
**Requirement**: WEB-04, WEB-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Renders core fields + the current template's dynamic fields via `hydrate()`/`DynamicField`
- [x] Valid submit calls `POST /customers`, navigates to the new record's detail on success
- [x] 400 response keeps the form filled, shows the message
- [x] Submit button disabled while the mutation is `isPending` — a second click before the first resolves is a no-op (WEB-13)
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: ≥4 tests, one per WEB-04 Acceptance Criterion

Also built beyond the literal file list above (transitive necessity, flagged by the batch dispatch prompt as load-bearing for this and later tasks): `apps/web/src/components/dynamic-field/dynamic-field.utils.ts` — `renderNodesToDefaultValues(nodes)` converts a `hydrate()` `RenderNode[]` tree into the plain nested object react-hook-form's `defaultValues` needs (group/array `RenderNode.value` is itself `RenderNode[]`, never plain data). 6 unit tests (leaf round-trip incl. hydrate()-filled defaults, group, array-of-leaf, array-of-group, nested group-in-group, empty field list) built against a real `hydrate()` call, not a hand-rolled `RenderNode`. Added `save`/`document`/`customer.create.title`/`customer.create.error` keys to `translate.helper.ts`'s dictionary (progressive addition, same convention T16/T18/T19/T20 already established — T28 does the final sweep).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `d8a29e7`)

---

### T23: `_private/customers/details.tsx` — detail

**What**: The WEB-05 screen (view mode).
**Where**: `apps/web/src/routes/_private/customers/details.tsx` (AD-030 — `details.tsx` with `search: { id }` via `validateSearch`, never a `$customerId` path segment).
**Depends on**: T17
**Reuses**: `customerQuery(id)` (T17, `id` read via `Route.useSearch()`); `processesQuery(customerId)` (new, same file/pattern as T17) for the Process list.
**Requirement**: WEB-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Direct navigation/reload (e.g. `/customers/details?id=<id>`) fetches via `GET /customers/:id`, shows core + `values`
- [x] A missing or cross-tenant `:id` shows an explicit not-found state, never another tenant's data or a broken screen
- [x] Shows the Customer's Process list via `GET /processes?customerId=:id`, including its own empty state
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: ≥3 tests, one per WEB-05 Acceptance Criterion

Also created beyond the literal file list above: `apps/web/src/query/process.ts` (new — `processesQuery(customerId)`, same `queryOptions`/`queryKey`-factory pattern as `customer.ts`; `ProcessRecord` mirrored locally, same convention as `CustomerRecord`) with its own 4 unit tests. `customerDetailsSearchSchema`/`CustomerDetailsSearch` defined inline in `details.tsx` (not a separate `@interface/*.interface.ts` file — a 1-field `{id}` schema local to this one route, no reuse elsewhere yet). Not-found state and empty-Process-list both reuse `<DefaultEmptyData />` (CLAUDE.md's mandatory "dados vazios" component) rather than inventing dedicated one-off panels. Test-file deviation found running the real code (not guessed): `useQuery`'s default retry (3 attempts w/ backoff) kept `isLoading` true past `findByText`'s default timeout for the WEB-05 AC2 (404) case — fixed with `retry:false` on the test's own `QueryClient`, first precedent for exercising a real query-error branch through `useQuery` in this feature's test suite (`customer.unit.test.ts`/T18 only ever tested error branches by calling `queryFn` directly, bypassing retry).

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `9845988`)

---

### T24: Same route — edit mode

**What**: The WEB-06 screen (in-place edit toggle on the detail route — Design's discretion, no separate route).
**Where**: `apps/web/src/routes/_private/customers/details.tsx` (extend).
**Depends on**: T23, T15, T3
**Reuses**: `DynamicField`, the `PATCH /customers/:id` mutation.
**Requirement**: WEB-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Edit mode pre-fills core + `values` from the loaded record
- [x] Valid save calls the mutation, reflects new values in the detail view without a manual reload
- [x] 400 response keeps the form filled with the user's edits, shows the message, original record unchanged
- [x] Gate check passes: `pnpm vitest run --project unit`
- [x] Test count: ≥3 tests, one per WEB-06 Acceptance Criterion

Built as an in-place toggle (`isEditing` state) on the same `details.tsx` route, extracting the view-only content into `CustomerDetailsView` and adding `CustomerEditForm` (mirrors `CustomerCreateForm`'s T22 shape: `useForm<FieldValues>`, `DynamicField`, submit-guard while `isPending`) plus a `Cancel` button (necessary minimal UX for a working toggle — not gold-plating, just how one exits edit mode without saving). `templateQuery` (current template's `fields`, needed for `hydrate()`) is fetched with `enabled: isEditing` — never a wasted request in view-only mode. On success, `queryClient.setQueryData(customerKeys.detail(id), data)` writes the mutation's own response directly into the detail query's cache (no `invalidateQueries`+refetch round-trip) — verified by asserting `GET /customers/:id` was called exactly once across the whole edit flow. Test-file deviation found running the real suite (not guessed): moving the Process-list query into a new child component (`CustomerDetailsView`, mounted only once the customer resolves) added one more render tick before it settles — T23's own empty-Process-list test used a synchronous `getByText` right after `findByText('Ana')`, which raced; fixed to `await findByText(...)`, same assertion, just correctly awaited.

**Tests**: unit
**Gate**: quick
**Status**: ✅ Complete (commit `d412f83`)

---

### T25: `_private/processes/add/index.tsx` — Process picker + create

**What**: The WEB-07 screen, plus the WEB-10 kanban-card shortcut reusing the same route.
**Where**: `apps/web/src/routes/_private/processes/add/index.tsx` (AD-030 — `add/index.tsx` with `search: { customerId }`, never a `$customerId` path segment); a shortcut affordance added to the kanban card component from T20 (WEB-10).
**Depends on**: T5, T20
**Reuses**: `fieldTemplatesQuery('process')` (new hook, `GET /field-templates`), `customerId` read via `Route.useSearch()`.
**Requirement**: WEB-07, WEB-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Lists non-archived `targetType:'process'` templates by `label`; archived ones hidden/disabled, never selectable
- [ ] Zero available templates shows an explicit message and blocks the attempt (never a silent empty picker)
- [ ] Valid selection calls `POST /processes` with `templateKey`+`customerId`, shows the returned initial `stage`
- [ ] Server rejection (archived-between-list-and-submit, invalid `values`) shows the error, never navigates as if created
- [ ] The kanban card's shortcut opens this same route with `search: { customerId }` preset from the card
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: ≥5 tests (WEB-07 AC1-4 + WEB-10 AC1)

**Tests**: unit
**Gate**: quick

---

### T25B: `GET /field-templates/:id/versions/:version` — fetch one specific historical version (blocking gap found before Batch 4, no new AD — mirrors T5's pattern)

**What**: A new, small, additive backend endpoint T26/T27 cannot function without. Design.md's Data Models describes T26 as fetching "that exact `FieldTemplateVersion`'s fields (never the current one)" via `GET /processes?customerId=`'s own `template`/`templateVersion` pointer, but no endpoint anywhere returns a NON-current `FieldTemplateVersion` — `GET /field-templates/current` always resolves `template.currentVersion` (see `fieldTemplate.service.ts`'s `getCurrentTemplate`), never an explicit version number. Without this task, Phase 7 cannot render a Process's own snapshot at all. The repository-level function already supports it generically — `fieldTemplate.repository.findCurrentVersion(tenantId, templateId, version)` takes an explicit `version` param and queries `FieldTemplateVersion` by `{Tenant, template, version}` (misleading name aside, it already works for ANY version) — this task only adds the missing service/controller/router wiring, identical in shape to Batch 1's T5.
**Where**: `apps/crm-api/src/services/fieldTemplate.service.ts` (add `getTemplateVersion(tenantId, templateId, version)` — thin wrapper around the existing `findCurrentVersion` repository call, no repository change needed), `apps/crm-api/src/controllers/fieldTemplate.controller.ts` (add `getTemplateVersion` action), `apps/crm-api/src/routers/fieldTemplate.router.ts` (add `router.get('/:id/versions/:version', ...)` — no path collision with the existing `POST /:id/versions` (bump) or `POST /:id/archive`, Express matches on method+path together).
**Depends on**: None (T5 already exists from Batch 1; this is additive to the same module)
**Reuses**: `findCurrentVersion` (repository, unchanged), `CustomError`/`respObj` pattern, `idSchema`, `tenantAssignmentCheck`, no `isAdmin` gate (matches `/current`'s already-open-to-any-role precedent — this is a read, not a structural mutation).
**Requirement**: WEB-08 (enables T26/T27 — the endpoint they depend on)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `GET /field-templates/:id/versions/:version` returns `200 {success:true, data:{fields:FieldDef[], stages?:string[]}}` for a version that exists for that template, in the caller's tenant
- [ ] Returns `404 {success:false, message:'Versão de template não encontrada'}` for a missing template id, cross-tenant id, or a version number that was never claimed for that template (AD-010 — cross-tenant indistinguishable from missing, by design)
- [ ] Works for a version that is NOT the template's current one (the actual point of this endpoint) — a dedicated test proves this: bump a template to v2, then fetch v1 and confirm it returns v1's original fields, not v2's
- [ ] Middleware chain: `validToken → tenantAssignmentCheck → validParams({id, version})`, no rate limit (GET, matches convention), no `isAdmin`
- [ ] Gate check passes: `pnpm vitest run --project e2e`
- [ ] Test count: e2e adds ≥4 cases (current-version fetch, non-current/historical version fetch, missing/cross-tenant → 404, non-existent version number → 404) to `fieldTemplate.router.e2e.test.ts`
- [ ] Tenant-isolation suite (`apps/crm-api/tests/integration/tenant-isolation.int.test.ts`) extended with 1 more case for this endpoint, matching Batch 1's T6 precedent

**Tests**: e2e, integration (tenant-isolation extension)
**Gate**: full

---

### T26: `_private/processes/details.tsx` — values form

**What**: The WEB-08 screen, values half.
**Where**: `apps/web/src/routes/_private/processes/details.tsx` (AD-030 — `search: { id, customerId }`, never a `$processId` path segment — see Reuses for why `customerId` is also needed here).
**Depends on**: T15, T13, T25B
**Reuses**: `DynamicField`; `GET /processes?customerId=` (existing, unchanged — there is no `GET /processes/:id`, confirmed by reading `process.router.ts`) to fetch the Process record itself — the route's `search` params carry BOTH `id` and `customerId` (every caller that links here — Customer detail's Process list (T23), the kanban shortcut (T25) — already has `customerId` in context), the route calls `processesQuery(customerId)` and finds the one item matching `search.id` from `items` (a small, customer-scoped list, not "the full collection" — does not violate AD-028's principle, which targets unbounded/paginated collections); `GET /field-templates/:id/versions/:version` (**new, T25B**) using the found record's own `template`/`templateVersion` to fetch **that exact** `FieldTemplateVersion`'s fields (never the current one) — the key difference from the Customer form (AD-029 does not apply here, `Process` keeps its snapshot model per AD-023).
**Requirement**: WEB-08 (values half)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Renders `values` via `DynamicField` against the record's **own** `templateVersion` snapshot fields, unaffected by any later template bump
- [ ] Valid save calls `PATCH /processes/:id/values`, reflects the new state without a manual reload
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: ≥2 tests (renders against own snapshot even after a hypothetical current-template change, save round-trips)

**Tests**: unit
**Gate**: quick

---

### T27: Same route — stage control

**What**: The WEB-08 screen, `stage` half.
**Where**: `apps/web/src/routes/_private/processes/details.tsx` (extend).
**Depends on**: T26
**Reuses**: The `stages` array already present on the record's own `FieldTemplateVersion` snapshot (AD-023 — same lookup as T26, no new backend call).
**Requirement**: WEB-08 (stage half), WEB-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Stage control's options are **exactly** the record's own snapshot `stages` — never a free-text field, never every stage ever seen system-wide
- [ ] Valid transition calls `PATCH /processes/:id/stage`, updates the shown `stage`
- [ ] Server rejection of an invalid transition keeps the previously shown `stage` — no optimistic update
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: ≥3 tests, one per remaining WEB-08 Acceptance Criterion + WEB-17

**Tests**: unit
**Gate**: quick

---

### T28: i18n completion + regression close-out

**What**: Expand `translate.helper.ts`'s dictionary to cover every user-facing string across every screen (new AND existing — auth/invite/private), closing the second `SPEC_DEVIATION`; re-confirm feature-1 screens are unaffected.
**Where**: `apps/web/src/lib/helpers/translate.helper.ts` (extend the flat dictionary — no i18n library, pt-BR only, per spec's confirmed Assumption).
**Depends on**: T1-T27 (every screen must exist to know its full string inventory)
**Reuses**: The existing `t(key)` function signature, unchanged.
**Requirement**: Goals (i18n `SPEC_DEVIATION` closure), Success Criteria #2/#3

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every user-facing string in every screen (existing + new) is routed through `t(key)` — zero hardcoded user-facing text remains
- [ ] `SPEC_DEVIATION` comment removed from `translate.helper.ts`
- [ ] Full suite green: `pnpm vitest run` — the existing `foundation-tenancy-auth` tests (login, invite, private shell) still pass unmodified, proving zero regression from the design-system/i18n swap (Success Criteria #3)
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`

**Tests**: unit (dictionary completeness), full-suite regression
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase 2:  T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12 ──→ T13
Phase 3:  T14 ──→ T15
Phase 4:  T16 ──→ T17 ──→ T18
Phase 5:  T19 ──→ T20 ──→ T21
Phase 6:  T22 ──→ T23 ──→ T24
Phase 7:  T25 ──→ T25B ──→ T26 ──→ T27
Phase 8:  T28
```

Execution is strictly sequential — no intra-phase parallelism. 29 tasks total (28 original +
T25B, added 2026-09-05 — see Phase 7). Actual Execute-time packing (recorded after the
fact, phases never split across a batch): Batch 1 = Phase 1 (6 tasks), Batch 2 = Phase 2 (7
tasks), Batch 3 = Phase 3+4+5 (8 tasks), Batch 4 = Phase 6+7+8 (8 tasks, incl. T25B).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: `updateCustomerSchema` | 1 schema file | ✅ Granular |
| T2: `GET /customers/:id` | 1 endpoint (controller+service+router, cohesive) | ✅ Granular |
| T3: `PATCH /customers/:id` | 1 endpoint (repository+controller+service+router, cohesive) | ✅ Granular |
| T4: `status=__none__` sentinel | 1 query-contract extension across 2 files (repository+service), cohesive | ✅ Granular |
| T5: `GET /field-templates` | 1 endpoint (repository+controller+service+router, cohesive) | ✅ Granular |
| T6: extend tenant-isolation suite | 1 test file, 3 additive cases | ✅ Granular |
| T7: Tailwind bootstrap | Infra config, 1 cohesive setup (Tailwind+alias+`cn()`) | ✅ Granular (infra, not a component) |
| T8: primitives batch A | 8 files + 3 icons, presentational-only, zero test burden (Coverage Expectation: none); amended 2026-09-05 to add Item/Breadcrumb/Tooltip/icons (gap found pre-Batch-2) | ✅ OK — cohesive port batch, matches "2-3+ related things in same file/purpose = OK if cohesive" |
| T9: primitives batch B | 4 files, presentational-only, zero test burden | ✅ OK — same rationale |
| T10: Form primitives | 1 file (`form.tsx`) | ✅ Granular |
| T11: remaining leaf primitives | 7 files, presentational-only, zero test burden | ✅ OK — same rationale |
| T12: `default-loading.tsx` | 1 file | ✅ Granular |
| T13: `client.api.ts` `patch()` | 1 function | ✅ Granular |
| T14: `DynamicField` leaf types | 1 component, 1 file | ✅ Granular |
| T15: `DynamicField` recursive + fallback | 1 component, 2-3 files, cohesive (same component's remaining branches) | ✅ OK |
| T16: `DataTable` | 1 component | ✅ Granular |
| T17: Customer query hooks | 1 file, 2 related query factories | ✅ OK — cohesive |
| T18: table route | 1 route | ✅ Granular |
| T19: status/kanban query hook | 1-2 files, cohesive (column derivation is one concern) | ✅ OK |
| T20: kanban route + drag | 1 route | ✅ Granular |
| T21: table⇄kanban toggle | 1 small shared component | ✅ Granular |
| T22: create form route | 1 route | ✅ Granular |
| T23: detail route (view) | 1 route | ✅ Granular |
| T24: detail route (edit mode) | Same route, additive mode — cohesive extension of T23 | ✅ OK |
| T25: Process picker route | 1 route + 1 small addition to an existing component (kanban card) | ✅ OK — cohesive (WEB-10 is explicitly "the same flow as WEB-07 from a shortcut") |
| T25B: `GET /field-templates/:id/versions/:version` | 1 endpoint (service+controller+router, cohesive, no repository change) | ✅ Granular — added 2026-09-05 |
| T26: Process values route | 1 route | ✅ Granular |
| T27: Process stage control | Same route, additive control — cohesive extension of T26 | ✅ OK |
| T28: i18n + regression | 1 file (dictionary) + 1 full-suite verification pass | ✅ OK — closing task, verification is its deliverable |

All 29 tasks pass the granularity check (28 original + T25B, added 2026-09-05) — every
multi-file task is either a single cohesive concern (one endpoint, one component's remaining
branches) or an explicitly zero-test-burden presentational port batch.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start of Phase 1) | ✅ Match |
| T2 | None | T1 → T2 | ✅ Match (sequential-within-phase ordering, no real dependency — T2 doesn't need T1's output; ordering is narrative) |
| T3 | T1, T2 | T2 → T3 | ✅ Match |
| T4 | None | T3 → T4 | ✅ Match (ordering, no real dependency) |
| T5 | None | T4 → T5 | ✅ Match (ordering, no real dependency) |
| T6 | T2, T3, T5 | T5 → T6 | ✅ Match |
| T7 | None | (start of Phase 2) | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T7 | T8 → T9 | ✅ Match (ordering, both depend only on T7) |
| T10 | T7, T8 | T9 → T10 | ✅ Match (ordering; real dep is T7+T8) |
| T11 | T7 | T10 → T11 | ✅ Match (ordering, real dep is T7) |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | None | T12 → T13 | ✅ Match (ordering, no real dependency — placed last in phase for narrative flow) |
| T14 | T10, T11 | T14 → T15 (start of Phase 3) | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T8, T9 | (start of Phase 4) | ✅ Match |
| T17 | T13 | T16 → T17 | ✅ Match (ordering; real dep is T13 from Phase 2) |
| T18 | T16, T17 | T17 → T18 | ✅ Match |
| T19 | T17, T4 | (start of Phase 5) | ✅ Match (cross-phase dep on T4, Phase 1) |
| T20 | T19, T3, T11 | T19 → T20 | ✅ Match (cross-phase deps on T3/Phase 1, T11/Phase 2) |
| T21 | T18, T20 | T20 → T21 | ✅ Match (cross-phase dep on T18, Phase 4) |
| T22 | T15, T13 | (start of Phase 6) | ✅ Match (cross-phase deps on Phase 2/3) |
| T23 | T17 | T22 → T23 | ✅ Match (ordering; real dep is T17, Phase 4) |
| T24 | T23, T15, T3 | T23 → T24 | ✅ Match (cross-phase dep on T15/Phase 3, T3/Phase 1) |
| T25 | T5, T20 | (start of Phase 7) | ✅ Match (cross-phase deps on T5/Phase 1, T20/Phase 5) |
| T25B | None | T25 → T25B | ✅ Match (ordering; no real dependency — added 2026-09-05, additive to the already-Verified `fieldTemplate` module) |
| T26 | T15, T13, T25B | T25B → T26 | ✅ Match (real dep on T25B added 2026-09-05; T15/T13 real deps are Phase 2/3) |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T1-T27, T25B | (Phase 8, after all) | ✅ Match |

No task depends on a task in a later phase. All cross-phase dependencies point backward
only. ✅ All 29 rows match (28 original + T25B, added 2026-09-05).

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | `packages/contracts` schema | unit | unit | ✅ OK |
| T2 | `apps/crm-api` router/controller/service | e2e | e2e | ✅ OK |
| T3 | `apps/crm-api` router/controller/service/repository | e2e (highest of e2e/none) | e2e | ✅ OK |
| T4 | `apps/crm-api` repository + service | integration, e2e | integration, e2e | ✅ OK |
| T5 | `apps/crm-api` router/controller/service/repository | e2e | e2e | ✅ OK |
| T6 | `apps/crm-api` shared integration suite | integration | integration | ✅ OK |
| T7 | `apps/web` infra (config, no component) | none (config) | none | ✅ OK |
| T8 | `apps/web` UI primitives | none | none | ✅ OK |
| T9 | `apps/web` UI primitives | none | none | ✅ OK |
| T10 | `apps/web` UI primitives | none | none | ✅ OK |
| T11 | `apps/web` UI primitives | none | none | ✅ OK |
| T12 | `apps/web` UI primitive | none | none | ✅ OK |
| T13 | `apps/web` `client.api.ts` | unit | unit | ✅ OK |
| T14 | `apps/web` `DynamicField` | unit | unit | ✅ OK |
| T15 | `apps/web` `DynamicField` | unit | unit | ✅ OK |
| T16 | `apps/web` `DataTable` | unit | unit | ✅ OK |
| T17 | `apps/web` query hooks | unit | unit | ✅ OK |
| T18 | `apps/web` route | unit | unit | ✅ OK |
| T19 | `apps/web` query hook | unit | unit | ✅ OK |
| T20 | `apps/web` route | unit | unit | ✅ OK |
| T21 | `apps/web` shared component | unit | unit | ✅ OK |
| T22 | `apps/web` route | unit | unit | ✅ OK |
| T23 | `apps/web` route | unit | unit | ✅ OK |
| T24 | `apps/web` route (extend) | unit | unit | ✅ OK |
| T25 | `apps/web` route + component edit | unit | unit | ✅ OK |
| T25B | `apps/crm-api` router/controller/service (no repository change) | e2e | e2e, integration | ✅ OK — added 2026-09-05 |
| T26 | `apps/web` route | unit | unit | ✅ OK |
| T27 | `apps/web` route (extend) | unit | unit | ✅ OK |
| T28 | `apps/web` dictionary + full-suite regression check | none (dictionary is config-like) + full-suite gate | unit (dictionary) + full-suite | ✅ OK — no violation: T28's own deliverable is the regression proof, not a new testable code layer |

No `Tests: none` appears where the matrix requires a test type, and no task defers its
required tests to a later task ("tested elsewhere" does not appear anywhere above). All 29
rows pass.

---

## Tips (author checklist, not part of the deliverable)

- [x] Design reviewed before task creation
- [x] Test Coverage Matrix generated from real codebase sampling (AD-015/017 + existing test files), not invented
- [x] Gate Check Commands taken verbatim from `package.json`'s `check` script + AD-017
- [x] All 29 tasks atomic or explicitly justified as a cohesive batch (28 original + T25B)
- [x] Granularity Check, Diagram-Definition Cross-Check, Test Co-location Validation all ✅ — no restructuring needed
- [x] Every task traces to a WEB-NN requirement or an explicit enabling/infra rationale
