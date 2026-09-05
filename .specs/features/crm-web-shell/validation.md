# crm-web-shell Validation

**Date**: 2026-09-05
**Spec**: `.specs/features/crm-web-shell/spec.md`
**Diff range**: `28c7872..56d0daa` (38 commits, `main` → tip of `feature/crm-web-shell`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

All 29 tasks (T1-T28 + T25B) checked against `tasks.md`. Every task's "Done when" boxes are
checked, every task carries a `**Status**: ✅ Complete (commit ...)` line, and every cited
commit exists on the branch (`git log 28c7872..56d0daa` lists all 38, one-to-one with the doc
commit trail — spot-checked `1980dac`/T1, `53832cc`/T7, `d92ad48`/T20, `2b5aa6a`/T25B,
`56d0daa`/T28 via `git show --stat`, all match the files each task claims).

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `updateCustomerSchema`, registered in `index.ts`+`registry.ts` — confirmed |
| T2 | ✅ Done | `GET /customers/:id` |
| T3 | ✅ Done | `PATCH /customers/:id`, AD-029 |
| T4 | ✅ Done | `status=__none__` sentinel |
| T5 | ✅ Done | `GET /field-templates` |
| T6 | ✅ Done | tenant-isolation extended (4 cases incl. T25B, not 3 — correct, T25B added its own case later) |
| T7-T13 | ✅ Done | Design-system bootstrap, AD-030 routing migration |
| T14-T15 | ✅ Done | `DynamicField` leaf + recursive types |
| T16-T18 | ✅ Done | `DataTable`, query hooks, table route |
| T19-T21 | ✅ Done | Kanban column derivation, board+drag, toggle |
| T22-T24 | ✅ Done | Create/detail/edit routes |
| T25, T25B, T26, T27 | ✅ Done | Process picker/create, version-fetch endpoint, values form, stage control |
| T28 | ✅ Done | i18n completion, regression close-out |

No task found blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row below cites a `file:line` and the actual assertion. A row with no
citation is a GAP regardless of task-doc claims.

### WEB-01 — Listar e buscar Customers em tabela

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: tela carrega → tabela paginada via `GET /customers`, nome/telefone/status | Server call with URL params, name/phone/status rendered | `apps/web/src/routes/_private/customers/index.unit.test.tsx:59-74` — `expect(getMock).toHaveBeenCalledWith('/customers?page=2&limit=20&q=ana&sort=name&order=asc&status=ativo')` + `findByText('Ana'/'11999999999'/'ativo')` | ✅ PASS |
| AC2: busca envia `q` ao servidor, nunca filtro local | `navigate` search-updater sets `q`, no local filter | `.../index.unit.test.tsx:76-91` — `searchUpdater(defaultSearch)` `toEqual({...q:'ana',page:1})` | ✅ PASS |
| AC3: troca ordenação/página → nova busca ao servidor | sort/page reflected via URL, server-fetched | `.../index.unit.test.tsx:93-127` — sort → `toEqual({...sort:'name',order:'asc',page:1})`; page → `toEqual({...page:2,limit:20})` | ✅ PASS |
| AC4: busca vazia → estado vazio explícito | Empty state shown, not blank table | `.../index.unit.test.tsx:129-137` — `findByText('Nenhum registro encontrado.')`, `queryByRole('table')` not present | ✅ PASS |

### WEB-02 — Visualizar Customers em kanban por status

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: 1 coluna por opção `status`, ordenada por `order` | Columns sorted by `StatusOption.order` | `apps/web/src/query/customer.unit.test.ts:89-97` — `customerStatusColumns([statusField])` `toEqual([{key:'open',order:0},{key:'closed',order:1},{key:'__none__',order:2}])` | ✅ PASS |
| AC2: cada coluna popula via `GET /customers?status=<key>` | Distinct per-column server call with that column's status | No direct assertion found. `apps/web/src/routes/_private/customers/kanban/index.tsx:46-48` (`useQueries` mapping `columns` → `customersQuery({status:column.key})`) is real code that does this, but `kanban/index.unit.test.tsx`'s 5 tests never assert a distinct `getMock` call per `status=<key>` (only a generic `mockColumnFetches` stub keyed by a mutable `customerStatus` var) | ❌ GAP |
| AC3: coluna sem Customers → renderiza vazia, nunca omitida/erro | An empty column still renders (header+0 cards), not removed | No direct assertion found — no test in `kanban/index.unit.test.tsx` checks column count/header text for a 0-item column (structurally guaranteed by `KanbanProvider columns={columns...}` mapping independent of `data`, but unasserted) | ❌ GAP |
| AC4: Customer sem `status` → coluna "sem status" explícita | Grouped into `__none__`, never dropped | `apps/web/src/query/customer.unit.test.ts:99-102` (sentinel column present even w/ no status field) + backend: `apps/crm-api/src/repositories/customer.repository.int.test.ts:42-95` (missing key + stale value both match `__none__`) + `apps/crm-api/src/routers/customer.router.e2e.test.ts:398-419` (round-trip through the real endpoint) | ✅ PASS |

### WEB-03 — Mudar status arrastando o card

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: soltar em coluna diferente → `PATCH .../:id` com `values.status` | Exact mutation call shape | `apps/web/src/routes/_private/customers/kanban/index.unit.test.tsx:140-152` — `expect(patchMock).toHaveBeenCalledWith('/customers/c1', {values:{status:'closed'}})` | ✅ PASS |
| AC2: sucesso → card na nova coluna, contagens refletem | Both columns reflect new state after refetch | `.../index.unit.test.tsx:154-168` — `invalidateSpy` called, `data.find(id==='c1').column` `toBe('closed')` | ✅ PASS |
| AC3: falha → card volta à coluna de origem + erro visível | Rollback to origin column, `toast.error` fires | `.../index.unit.test.tsx:170-184` — `toastErrorMock` called, `data.find(id==='c1').column` `toBe('open')` (mutation sensor independently confirmed this test kills a rollback-removal mutation — see Discrimination Sensor) | ✅ PASS |
| AC4: 2 movimentos quase simultâneos → ambas aceitas, sem lock | No optimistic lock blocks a concurrent second drag | `.../index.unit.test.tsx:186-209` — `patchMock` `toHaveBeenCalledTimes(2)` after 2 drags before the first resolves | ✅ PASS |

### WEB-04 — Criar um novo Customer

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: formulário renderiza núcleo + campos dinâmicos via `hydrate()` | Core fields + template's dynamic fields render | `apps/web/src/routes/_private/customers/add/index.unit.test.tsx:53-62` — `findByLabelText('Nome'/'Telefone'/'Documento'/'Apelido')` | ✅ PASS |
| AC2: envio válido → `POST /customers`, navega ao detalhe | Exact POST body, navigate to detail with new id | `.../add/index.unit.test.tsx:76-98` — `postMock` `toHaveBeenCalledWith('/customers',{name,phone,document:undefined,values:{nickname:'Aninha'}})`, `navigateMock` `toHaveBeenCalledWith({to:'/customers/details',search:{id:'c1'}})` | ✅ PASS |
| AC3: 400 → formulário mantém dados, mostra erro | Data preserved, message shown, no navigation | `.../add/index.unit.test.tsx:100-115` — `findByRole('alert')` has text, `navigateMock` not called, input still `'Ana'` | ✅ PASS |
| AC4: duplo clique → segundo envio é no-op | Submit disabled while pending, second click is no-op | `.../add/index.unit.test.tsx:117-144` — `submitButton` disabled, `postMock` `toHaveBeenCalledTimes(1)` after 2 clicks | ✅ PASS |

### WEB-05 — Ver o detalhe de um Customer

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: navega para detalhe (incl. reload direto) → `GET /customers/:id`, núcleo+values | Fetches by id, shows core+values | `apps/web/src/routes/_private/customers/details.unit.test.tsx:55-81` — `getMock` `toHaveBeenCalledWith('/customers/c1')`, `findByText('Ana'/'11999999999'/'12345678900'/'Aninha')` | ✅ PASS |
| AC2: `:id` ausente/outro tenant → "não encontrado" | Explicit not-found state, no other-tenant data | `.../details.unit.test.tsx:83-95` — `findByText('Nenhum registro encontrado.')`, `queryByText('Ana')` absent. Backend: `apps/crm-api/src/routers/customer.router.e2e.test.ts:480-507` (404 for missing AND cross-tenant, same message per AD-010) | ✅ PASS |
| AC3: mostra lista de Process via `GET /processes?customerId=`, incl. vazio | Process list rendered + explicit empty state | `.../details.unit.test.tsx:115-149` (`findByText('aberto')`, link to `/processes/details?id=p1&customerId=c1`) + `:151-165` (empty → `findByText('Nenhum registro encontrado.')`) | ✅ PASS |

### WEB-06 — Editar um Customer existente

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: form de edição pré-preenche núcleo+values | Fields show current record's values | `apps/web/src/routes/_private/customers/details.unit.test.tsx:199-216` — `findByLabelText('Nome').toHaveValue('Ana')` etc. | ✅ PASS |
| AC2: save válido → persiste via mutação, reflete no detalhe sem reload | Exact PATCH body, view updates without extra GET | `.../details.unit.test.tsx:218-258` — `patchMock` `toHaveBeenCalledWith('/customers/c1',{name,phone,document,values})`, `findByText('Ana Nova')`, `getMock` calls to `/customers/c1` `toHaveLength(1)` (proves `setQueryData`, not refetch) | ✅ PASS |
| AC3: 400 → form mantém edição, mostra erro, registro original intacto | Data preserved, message shown, cache unchanged | `.../details.unit.test.tsx:260-286` — `findByRole('alert')` has text, input still edited value; after Cancel, `findByText('Ana')` (original) | ✅ PASS |
| Backend: templateVersion bump, archived-doesn't-block, 400+nothing-persists, 404 | design.md step 4/5 exact behavior | `apps/crm-api/src/routers/customer.router.e2e.test.ts:555-592` (bump asserted `templateVersion` 1→2), `:594-630` (stale value re-checked even w/o `values` in body → 400, nothing persists), `:632-654` (archived template → 200, still persists), `:656-672` (invalid → 400, nothing persists), `:674-692` (404 missing/cross-tenant) | ✅ PASS |

### WEB-07 — Abrir um novo Process para um Customer

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: lista templates `process` não-arquivados, oculta arquivados | Only non-archived selectable | `apps/web/src/routes/_private/processes/add/index.unit.test.tsx:60-78` — `findByRole('option',{name:'Compra'})` present, `queryByRole('option',{name:'Venda'})` absent. Backend: `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:451-484` (`{key,label,archived}` list incl. archived flag) | ✅ PASS |
| AC2: zero templates disponíveis → mensagem clara, bloqueia tentativa | Explicit message, no picker/submit control | `.../processes/add/index.unit.test.tsx:80-89` — `findByText('Nenhum registro encontrado.')`, no combobox/Confirmar button | ✅ PASS |
| AC3: seleção válida → `POST /processes` com `templateKey`+`customerId`, mostra `stage` inicial | Exact POST body, initial stage shown | `.../processes/add/index.unit.test.tsx:91-113` — `postMock` `toHaveBeenCalledWith('/processes',{templateKey:'compra',customerId:'c1'})`, `findByText('aberto')` | ✅ PASS |
| AC4: rejeição do servidor → mostra erro, nunca navega como se criado | Error shown, no success/navigation | `.../processes/add/index.unit.test.tsx:115-132` — `findByRole('alert')` has text, success message absent, combobox still present | ✅ PASS |

### WEB-08 — Editar `values`/avançar `stage` de um Process

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: renderiza `values` contra a `templateVersion` PRÓPRIA, nunca a corrente | Fetches record's own `(template,templateVersion)`, never `/current` | `apps/web/src/routes/_private/processes/details.unit.test.tsx:84-93` — `getMock` `toHaveBeenCalledWith('/field-templates/t1/versions/1')`, and explicitly asserts no call `.includes('/field-templates/current')`. Backend: `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:556-582` (bump to v2, fetch v1, confirm v1's own fields returned) | ✅ PASS |
| AC2: save válido → `PATCH /processes/:id/values`, reflete sem reload | Exact PATCH body, server's own response re-seeds form | `.../processes/details.unit.test.tsx:95-117` — `patchMock` body assertion, `getByLabelText('Observação').toHaveValue('nota normalizada')` (server-normalized value, not locally-typed) | ✅ PASS |
| AC3: `stage` oferece apenas os valores do `stages` da snapshot | Exactly the record's own `stages`, no free text | `.../processes/details.unit.test.tsx:156-169` — `getAllByRole('option')` `toHaveLength(2)`, exactly `'aberto'`/`'concluido'` | ✅ PASS |
| AC3b: transição válida → `PATCH .../stage`, atualiza `stage` exibido | Exact PATCH body, stage updates | `.../processes/details.unit.test.tsx:171-183` — `patchMock` `toHaveBeenCalledWith('/processes/p1/stage',{stage:'concluido'})`, combobox text updates | ✅ PASS |
| AC4: rejeição de transição → mantém `stage` atual, sem otimismo | No optimistic update, previous stage stays shown | `.../processes/details.unit.test.tsx:185-197` — `findByRole('alert')`, combobox still `'aberto'` (code-level: `Select value={process.stage}` bound to cache, no local `useState` mirror, `apps/web/src/routes/_private/processes/details.tsx:133`) | ✅ PASS |

### WEB-09 — Persistir filtro/ordenação/página na URL

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: busca/ordenação/página refletem na URL | `navigate({search:...})` on every interaction | `apps/web/src/routes/_private/customers/index.unit.test.tsx:76-127` (same tests as WEB-01 AC2/AC3, dual-tagged in the test names) | ✅ PASS |
| AC2: reload com params na URL → restaura o mesmo estado | `useSearch` drives the initial query params | `.../index.unit.test.tsx:59-74` — `searchMock.mockReturnValue({page:2,...})` drives the exact `GET` querystring on first render | ✅ PASS |

### WEB-10 — Atalho de Process no card do kanban

| Criterion | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| AC1: atalho no card abre o mesmo fluxo com `customerId` pré-preenchido | Link to `/processes/add?customerId=<card's id>` | `apps/web/src/routes/_private/customers/kanban/index.unit.test.tsx:211-220` — `shortcut.getAttribute('href')` `toBe('/processes/add?customerId=c1')`; also `apps/web/src/routes/_private/customers/details.unit.test.tsx:97-113` (same shortcut from the Customer detail page) | ✅ PASS |

### Dimension requirements (WEB-11 to WEB-17)

| Req | Spec-defined outcome | file:line — assertion | Result |
| --- | --- | --- | --- |
| WEB-11: validação client-side é só UX | `required`/`min`/`max`/`maxLength` surface as HTML hints, server `validate()` remains authoritative | `apps/web/src/components/dynamic-field/dynamic-field.unit.test.tsx:56-57,79-81` (`toHaveAttribute('maxlength','50')`, `min`/`max`) + every 400-path test above (server rejection still enforced despite client hints) | ✅ PASS |
| WEB-12: rollback/preserva dados em falha | Kanban rollback (WEB-03 AC3), forms preserve input on 400 (WEB-04 AC3, WEB-06 AC3) | Same citations as WEB-03 AC3 / WEB-04 AC3 / WEB-06 AC3 above | ✅ PASS |
| WEB-13: idempotência de submit | Second click while pending is a no-op | `apps/web/src/routes/_private/customers/add/index.unit.test.tsx:117-144` | ✅ PASS |
| WEB-14: auth & rate limit dos novos endpoints | Full middleware chain incl. `customerRateLimit` on mutations, no `isAdmin` gate on reads | `apps/crm-api/src/routers/customer.router.ts:58-88` (chain matches design.md exactly) + `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:522-530,621-634` (`operador` role succeeds, no isAdmin) + `apps/crm-api/tests/integration/tenant-isolation.int.test.ts:450-560` (4 new-endpoint cross-tenant cases) | ✅ PASS |
| WEB-15: concorrência (last-write-wins) | No optimistic lock; both concurrent calls accepted | `apps/web/src/routes/_private/customers/kanban/index.unit.test.tsx:186-209` (WEB-03 AC4) + `apps/crm-api/src/services/customer.service.ts:73-103` (`updateCustomer` has no version/lock check) | ✅ PASS |
| WEB-16: observabilidade (`dbReqResTime`) | New/extended repository operations instrumented | Code: `apps/crm-api/src/repositories/customer.repository.ts:58` (`withDbTiming('customer.findById',...)`), `:82` (`'customer.updateCustomer'`), `apps/crm-api/src/repositories/fieldTemplate.repository.ts:82` (`'fieldTemplate.findTemplatesByTargetType'`) — all correctly wrapped. **But** the e2e "observability" proof tests never exercise/assert these specific new operations: `apps/crm-api/src/routers/customer.router.e2e.test.ts:696-710` only calls `createCustomerReq`/`listCustomersReq` and checks for `customer.createCustomer`/`customer.listCustomers` — never `getCustomerReq`/`patchCustomerReq`, never asserts `customer.findById`/`customer.updateCustomer` in `recordedOperations`; `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:1029-1057` never calls the list-templates route nor asserts `fieldTemplate.findTemplatesByTargetType` | ⚠️ PARTIAL GAP (code compliant, test proof incomplete for T2/T3/T5's own new operations) |
| WEB-17: `stage` só entre opções da snapshot | Exactly `stages` from the record's own template version, no optimistic update | `apps/web/src/routes/_private/processes/details.unit.test.tsx:156-197` (same as WEB-08 AC3/AC4) | ✅ PASS |

**Status**: 33 itemized Acceptance Criteria (WEB-01..WEB-10) + 7 dimension requirements
(WEB-11..WEB-17) = 40 distinct criteria assessed. 37/40 PASS with direct evidence; 2 GAPs
(WEB-02 AC2, WEB-02 AC3) + 1 partial gap (WEB-16, code correct / e2e proof incomplete for the
3 new operations it should cover). No spec-precision gaps (every criterion above has a
precisely defined spec outcome that a test either does or doesn't target).

---

## Edge Cases

| Edge Case | Result | Evidence |
| --- | --- | --- |
| Template `customer` sem campos além do núcleo → form funciona com `values:{}` | ✅ Handled | `apps/web/src/routes/_private/customers/add/index.unit.test.tsx:64-74` |
| Opção de `status` removida após uso → kanban continua mostrando/agrupa em "sem status" | ✅ Handled | `apps/crm-api/src/repositories/customer.repository.int.test.ts:55-67` (stale value matches `__none__`) |
| Template de Process arquivado após criação → edição de `values`/`stage` continua funcionando, nunca bloqueia | ⚠️ Structurally guaranteed, not directly tested | `apps/crm-api/src/services/fieldTemplate.service.ts:100-105` (`getTemplateVersion` has no `archived` check) + `apps/crm-api/src/services/process.service.ts` (pre-existing, crm-core; only `createProcess` checks `archived`, not the values/stage update path) — but no dedicated test in this feature's diff combines "archive template" + "still edit an existing Process on it" in one assertion (crm-core's own suite proves the *snapshot* half — "own templateVersion, not current" — but not this specific archived combination) |
| Tabela/kanban/Process listagem vazia → estado vazio explícito em cada tela | ✅ Handled | WEB-01 AC4, WEB-02 AC3 (partial, see above), WEB-05 AC3, WEB-07 AC2 citations above |
| Sessão expira → redireciona `/auth` (herdado feature 1) | ✅ Handled (unchanged) | Not a new AC; `_private.tsx`'s `beforeLoad` untouched by this feature's diff — confirmed via `git diff 28c7872..56d0daa -- apps/web/src/routes/_private.tsx` showing only the `createFileRoute` conversion (T7), no guard-logic change |

---

## Discrimination Sensor

Run in two disposable `git worktree`s (`sensor-worktree` at `56d0daa`, `baseline-worktree` at
`28c7872`), never in the real working tree (confirmed clean via `git status` before, during,
and after — `git worktree remove --force` at the end).

| # | file:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/crm-api/src/services/fieldTemplate.service.ts:100-105` (`getTemplateVersion`) | Ignore the requested `version` param, always resolve `template.currentVersion` instead — the exact regression T25B exists to prevent | ✅ Killed — 2 tests failed: `fieldTemplate.router.e2e.test.ts:556` ("returns a NON-current/historical version's own fields...") and `:604` ("responds 404 for a version number never claimed") |
| 2 | `apps/crm-api/src/services/customer.service.ts:93-100` (`updateCustomer`) | Persist `existing.template`/`existing.templateVersion` instead of `template.id`/`template.currentVersion` — defeats AD-029's pointer-bump guarantee | ✅ Killed — `customer.router.e2e.test.ts:555` ("advances template/templateVersion to the tenant CURRENT template...") failed: expected `templateVersion` 2, got 1 |
| 3 | `apps/web/src/routes/_private/customers/kanban/index.tsx:102-109` (`handleDragEnd`'s `onError`) | Removed the `setPendingMoves` cleanup on failure — card never rolls back to its origin column | ✅ Killed — `kanban/index.unit.test.tsx:170` ("on failure, the card visually returns to its origin column...") failed: expected column `'open'`, got `'closed'` |

**Sensor depth**: lightweight (3 targeted mutations, proportional to this feature's highest-risk
new logic: T25B's version-fetch, AD-029's pointer-bump, kanban's optimistic-rollback).
**Result**: 3/3 killed — ✅ PASS. No surviving mutants.

---

## Code Quality

Spot-checked across both apps — `apps/crm-api/src/{controllers,routers,services}/customer.*`,
`apps/crm-api/src/services/fieldTemplate.service.ts`, `packages/contracts/src/schemas/updateCustomer.schema.ts`,
`apps/web/src/routes/_private/customers/{index,kanban/index,add/index,details}.tsx`,
`apps/web/src/routes/_private/processes/{add/index,details}.tsx`, `apps/web/src/query/customer.ts`,
`apps/web/src/components/ui/data-table.tsx`, `apps/web/src/components/dynamic-field/dynamic-field.tsx`.

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — every "also built beyond the literal file list" addition in `tasks.md` is a documented, load-bearing transitive dependency (e.g. `table.tsx` for `DataTable`, `scroll-area.tsx`/`kanban.tsx` for the board), not scope creep |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — controller/service/router shape mirrors `fieldTemplate.*` exactly; query hooks mirror `session.ts`'s `queryOptions` factory pattern |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — WEB-06's edit-mode suite (`details.unit.test.tsx:191-287`) asserts exact PATCH body, cache-write-not-refetch (`getMock` call count), and post-cancel original-record restoration — non-shallow |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ 2 GAPs + 1 partial (WEB-02 AC2/AC3, WEB-16) — see AC table above |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ for all but WEB-02 AC2/AC3 |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every test file's `describe`/`it` names cite a WEB-NN/T-number, no orphan test suites found |
| Documented guidelines followed | `.specs/STATE.md` AD-015/AD-017 (Vitest project convention), `CLAUDE.md` (Card/Item/DataTable/route-folder/i18n conventions) — followed; e.g. `customers.interface.ts` correctly named to dodge the structural schema-registry scanner (T18's own documented deviation, verified: `tests/structural/schema-registry.structural.test.ts` still passes) |

---

## Gate Check

- **Gate command** (from `tasks.md`'s Gate Check Commands, Build row): `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`
- **`tsc --noEmit`**: clean, zero errors, all 7 workspace packages.
- **`biome check .`**: 1 error + 9 warnings. The 1 error is in `.specs/lessons.json` (a formatter-only diff) — independently confirmed pre-existing and **outside this feature's diff**: `git diff 28c7872..56d0daa -- .specs/lessons.json` is empty, and `git log --oneline -1 -- .specs/lessons.json` shows the file was last touched by `28c7872` itself (the pre-feature baseline commit), confirmed via `git merge-base --is-ancestor`. The 9 warnings are all `lint/suspicious/noExplicitAny`, all in files this feature touched and all individually documented in `tasks.md` (T18's `useNavigate()`-without-`from` search-updater casts, T20's `tunnel-rat` interop cast, T20/T25's test-mock prop types) — acceptable, non-blocking, matches the author's own T13/T21/T28 close-out notes.
- Because the pre-existing, out-of-scope `.specs/lessons.json` error breaks the `&&` chain before `vitest` would run, `pnpm vitest run` was run as a separate step (same precedent the author's own T13/T21/T28 close-outs already established) — this is a judgment call given the file predates the branch, not a workaround for anything this feature introduced.
- **`vitest run`** (full suite): **78 files / 494 tests passed, 0 failed, 0 skipped.** Matches T28's own claimed count exactly.
- **Test count before feature** (measured directly, not trusted from docs): ran the full suite on a disposable worktree at `28c7872` → **61 files / 366 tests passed.**
- **Test count after feature**: 78 files / 494 tests.
- **Delta**: +17 files / +128 tests. No decrease anywhere — Test Integrity Check passes.
- **Skipped tests**: none.
- **Failures**: none.

---

## Fix Plans

### Fix 1: WEB-02 AC2/AC3 — kanban per-column query & empty-column rendering unasserted

- **Root cause**: `kanban/index.unit.test.tsx`'s 5 tests (T20) were scoped to WEB-03 only (drag/mutation), and no test elsewhere in T19/T20 directly exercises the multi-column, multi-status scenario the spec's own Independent Test describes ("Customers em ao menos 2 status diferentes e 1 sem status... confirmar que cada card aparece na coluna correta, incluindo a coluna 'sem status'"). The underlying code (`useQueries` mapping `columns.map(col => customersQuery({status:col.key}))`, `KanbanProvider columns={columns}` rendering independent of `data`) is structurally sound, but untested at this specific behavior.
- **Fix task**: Add 1-2 tests to `kanban/index.unit.test.tsx`: (a) seed `mockColumnFetches`-style stub with 2+ distinct customers across 2+ different statuses simultaneously (not a single mutable `customerStatus` var) and assert each ends up in its own column's rendered card set; (b) assert a column with a template `status` option that has zero matching customers still renders its header/count (e.g. `(0)`), never omitted.
- **Priority**: Minor (the code is almost certainly correct by construction; this is a test-coverage gap, not an observed functional defect).

### Fix 2: WEB-16 — observability test doesn't exercise the 3 new operations it should prove

- **Root cause**: `customer.router.e2e.test.ts`'s `describe('observability (CORE-16)')` block (pre-dates this feature, extended by CORE-16 not WEB-16) was never extended to call `getCustomerReq`/`patchCustomerReq` or assert `customer.findById`/`customer.updateCustomer` in `recordedOperations`; same gap in `fieldTemplate.router.e2e.test.ts`'s observability block for `listTemplates`/`fieldTemplate.findTemplatesByTargetType`. The production code is correct (`withDbTiming` wraps all 3 new repository functions, confirmed by direct code read) — only the e2e proof is incomplete.
- **Fix task**: Extend both observability tests to call the 3 new endpoints (`GET /customers/:id`, `PATCH /customers/:id`, `GET /field-templates`) and add `'customer.findById'`, `'customer.updateCustomer'`, `'fieldTemplate.findTemplatesByTargetType'` to their respective `recordedOperations` assertion loops.
- **Priority**: Minor (no production risk — this is closing a test-proof gap for an already-correctly-implemented cross-cutting concern).

### Fix 3 (edge case, not blocking): archived-Process-template-still-works has no dedicated test

- **Root cause**: The spec's edge case ("template usado por Process aberto é arquivado depois → edição continua funcionando") is structurally satisfied (no code path checks `archived` on the read/update side for an existing Process — only `createProcess` does, per AD-022), but no test in this feature's diff combines "archive the template" + "still successfully PATCH an existing Process's values/stage" in one assertion.
- **Fix task**: Add one e2e case to `fieldTemplate.router.e2e.test.ts` or `process.router.e2e.test.ts`: create a process template, create a Process against it, archive the template, then successfully `PATCH /processes/:id/values` and `.../stage` against the still-valid snapshot.
- **Priority**: Cosmetic/Minor (very low risk given the snapshot-validation design is already proven by crm-core's own "own templateVersion, not current" test; this closes the remaining combination).

None of the 3 gaps above are blockers — no evidence of an actual functional defect, no failing test, no red gate. All 3 are test-coverage completeness gaps on already-implemented, already-correct behavior. Given the discrimination sensor (which specifically targeted the two highest-risk pieces of NEW logic — AD-029's pointer bump and T25B's version-fetch — both proportionally more critical than the kanban's column-rendering/observability gaps above) found zero surviving mutants, and the two "real" AC gaps (WEB-02 AC2/AC3) sit on structurally-simple, low-risk rendering code, this validation's overall verdict is PASS with 3 minor, non-blocking fix-task recommendations rather than a FAIL.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WEB-01 | Implementing | ✅ Verified |
| WEB-02 | Implementing | ⚠️ Implementing (AC1/AC4 Verified, AC2/AC3 test-coverage gap — see Fix 1) |
| WEB-03 | Implementing | ✅ Verified |
| WEB-04 | Implementing | ✅ Verified |
| WEB-05 | Implementing | ✅ Verified |
| WEB-06 | Implementing | ✅ Verified |
| WEB-07 | Implementing | ✅ Verified |
| WEB-08 | Implementing | ✅ Verified |
| WEB-09 | Implementing | ✅ Verified |
| WEB-10 | Implementing | ✅ Verified |
| WEB-11 | Implementing | ✅ Verified |
| WEB-12 | Implementing | ✅ Verified |
| WEB-13 | Implementing | ✅ Verified |
| WEB-14 | Implementing | ✅ Verified |
| WEB-15 | Implementing | ✅ Verified |
| WEB-16 | Implementing | ⚠️ Implementing (code compliant, e2e proof incomplete — see Fix 2) |
| WEB-17 | Implementing | ✅ Verified |

15/17 requirements move to Verified; WEB-02 and WEB-16 stay Implementing pending the two minor
fix tasks above (test-coverage gaps only, not functional defects).

---

## Summary

**Overall**: ⚠️ Issues (minor, non-blocking) — 15/17 requirements Verified outright; 2 requirements
(WEB-02, WEB-16) have a real, evidence-based test-coverage gap on otherwise-correct code, not a
functional defect.

**Spec-anchored check**: 37/40 criteria matched spec outcome directly (33 itemized ACs across
10 stories + 7 dimension requirements); 2 GAPs (WEB-02 AC2/AC3) + 1 partial gap (WEB-16); 0
spec-precision gaps.
**Sensor**: 3/3 mutations killed (T25B version-fetch, AD-029 pointer-bump, kanban rollback) —
the three highest-risk pieces of genuinely new logic this feature introduced all have
discriminating tests.
**Gate**: 494 passed, 0 failed, 0 skipped (78 files) — full suite, run separately from a
pre-existing, out-of-scope `biome` formatting issue in `.specs/lessons.json` that predates this
branch. Test count grew from 366 (measured at `28c7872`) to 494 (+128), no regressions.

**What works**: The full Customer/Process vertical slice — list/search/sort/page (server-side,
URL-persisted), kanban with drag-persist and rollback, create/detail/edit for Customer, and
Process create/values/stage — all independently re-derived from spec.md and confirmed against
real test assertions, not task-doc claims. Both `SPEC_DEVIATION` markers this feature targeted
(`card.tsx`, `translate.helper.ts`) are confirmed removed, and no new `SPEC_DEVIATION` was
introduced (`grep -rn "SPEC_DEVIATION" apps/ packages/` finds only 2 pre-existing markers in
unrelated features). AD-029's pointer-bump behavior and T25B's version-fetch endpoint — the
two most failure-prone pieces of new logic in this feature — both survived targeted fault
injection.

**Issues found**:
1. WEB-02 AC2/AC3 (kanban per-column query + empty-column rendering) — no direct test
   assertion; low risk, code structurally sound. Fix 1 above.
2. WEB-16 (observability of the 3 new endpoints) — production code correctly instrumented,
   e2e proof incomplete for the specific new operations. Fix 2 above.
3. Edge case (archived-template-doesn't-block-Process-edit) — structurally guaranteed, no
   dedicated combined test. Fix 3 above.

**Next steps**: Route Fix 1/2/3 as small follow-up test-only tasks (no production code change
expected); re-verify WEB-02/WEB-16 once added. Both can land in the next batch without blocking
the feature's Verified status for the other 15 requirements.
