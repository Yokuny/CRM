# kanban-tool Validation

**Date**: 2026-09-13
**Spec**: `.specs/features/kanban-tool/spec.md`
**Diff range**: `5e632d9..HEAD` (confirmed via `git log --oneline 5e632d9..HEAD`; range starts at `f9f3359 feat(kanban): add Board model...` and ends at `a19a636 docs(kanban): mark T10-T20 done...` — exactly the `feat(kanban): *`/`docs(kanban): *` commits, nothing from the pre-existing `scheduling` feature)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh read of spec.md/design.md/context.md/tasks.md and every test file in scope; authors' own "Test Adequacy Review" claims were not used as evidence

---

## Task Completion

All 20 tasks (T1–T20) marked ✅ Done in `tasks.md` with commit hashes. Cross-checked against `git log` — every listed commit exists in the diff range. No task marked Partial/Blocked.

---

## Spec-Anchored Acceptance Criteria

### P1: Board CRUD e hub

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-01: cria board com nome + ≥1 coluna → persiste com essas colunas, 0 cards | Board persisted, `columns` match input, `Card.countDocuments({board})===0` | `apps/crm-api/src/routers/board.router.e2e.test.ts:162-178` — `expect(res.status).toBe(201); expect(res.body.data.columns...).toEqual(['A fazer','Feito']); expect(await Card.countDocuments(...)).toBe(0)` | ✅ PASS |
| KAN-02: cria board sem coluna → erro de validação | 400, nothing persisted | `apps/crm-api/src/routers/board.router.e2e.test.ts:180-192` — `expect(res.status).toBe(400); expect(await Board.countDocuments({})).toBe(0)`; contract-level: `packages/contracts/src/schemas/createBoard.schema.unit.test.ts:23-27`; service-level: `apps/crm-api/src/services/board.service.unit.test.ts:72-78` — `rejects.toBeInstanceOf(EmptyColumnsError)` | ✅ PASS |
| KAN-03: hub lista todos os boards do tenant, mais recente primeiro | Order `[newer, older]`, own tenant only | `apps/crm-api/src/routers/board.router.e2e.test.ts:223-245` — `expect(res.body.data.map(b=>b.id)).toEqual([newer._id...,older._id...])`; N+1 mitigation: `apps/crm-api/src/repositories/board.repository.int.test.ts:66-77` — `expect(aggregateSpy).toHaveBeenCalledTimes(1)` | ✅ PASS |
| KAN-04: edita nome/descrição de board do próprio tenant → persiste | Field updates, columns untouched | `apps/crm-api/src/routers/board.router.e2e.test.ts:291-311` — `expect(res.body.data.description).toBe('Nova descrição'); expect(res.body.data.columns).toHaveLength(1)` | ✅ PASS |
| KAN-05: usuário sem role operacional → 403 em qualquer operação | 403, nothing persisted | `apps/crm-api/src/routers/board.router.e2e.test.ts:208-220` (POST /boards), `:247-254` (GET /boards), `:585-599` (POST /boards/:id/cards) — `expect(res.status).toBe(403)`; same shared `canOperate` middleware instance gates every other route in `board.router.ts:24` | ✅ PASS |
| KAN-06: lê/edita board de OUTRO tenant → 404 | 404, never leaks existence | `apps/crm-api/src/routers/board.router.e2e.test.ts:272-288` (GET), `:313-330` (PATCH) — `expect(res.status).toBe(404)`; repo-level: `apps/crm-api/src/repositories/board.repository.int.test.ts:44-52` — `expect(result).toBeNull()` | ✅ PASS |

### P1: Gerenciar colunas do board

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-07: adiciona coluna → vai ao final da ordem atual | New column appended last | `apps/crm-api/src/routers/board.router.e2e.test.ts:375-397` — `expect(res.body.data.columns.map(c=>c.label)).toEqual(['A','B','C'])` | ✅ PASS |
| KAN-08: renomeia coluna → novo nome, cards não se movem | Label changes, card.column unchanged | `apps/crm-api/src/routers/board.router.e2e.test.ts:399-424` — `expect(res.body.data.columns[0].label).toBe('Renomeada'); expect(persistedCard?.column.toString()).toBe(columnId)` | ✅ PASS |
| KAN-09: reordena colunas → persiste nova ordem | New `order` per column, `reorder` route matched before `:columnId` | `apps/crm-api/src/routers/board.router.e2e.test.ts:426-452` — labels sorted by `order` equal `['B','A']` | ✅ PASS |
| KAN-10: remove coluna com ≥1 card → rejeita | 400, board still has 2 columns | `apps/crm-api/src/routers/board.router.e2e.test.ts:477-499` — `expect(res.status).toBe(400); expect(persisted?.columns).toHaveLength(2)`; service: `apps/crm-api/src/services/board.service.unit.test.ts:221-228` — `rejects.toBeInstanceOf(ColumnNotEmptyError)` | ✅ PASS |
| KAN-11: remove última coluna restante (mesmo vazia) → rejeita | 400, board still has 1 column | `apps/crm-api/src/routers/board.router.e2e.test.ts:501-515`; service: `apps/crm-api/src/services/board.service.unit.test.ts:212-219` — `rejects.toBeInstanceOf(LastColumnError)`, `existsInColumnMock` not called | ✅ PASS |
| KAN-12: remove coluna vazia de board com >1 coluna → remove | 200, `columns.length===1` | `apps/crm-api/src/routers/board.router.e2e.test.ts:454-475` — `expect(res.body.data.columns).toHaveLength(1)` | ✅ PASS |

### P1: CRUD de card

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-13: cria card só com título+coluna → sem referência/responsável | `customer` undefined, card created | `apps/crm-api/src/routers/board.router.e2e.test.ts:519-535` — `expect(res.body.data.customer).toBeUndefined()`; model: `packages/db/src/models/card.model.int.test.ts:23-37` | ✅ PASS |
| KAN-14: referência inexistente/outro tenant → erro de validação | 400, nothing created, never 404 | `apps/crm-api/src/routers/board.router.e2e.test.ts:537-568` (assignee outro tenant, customer inexistente) — `expect(res.status).toBe(400); expect(await Card.countDocuments({})).toBe(0)`; unit, all 4 refs: `apps/crm-api/src/services/card.service.unit.test.ts:130-192` — `rejects.toBeInstanceOf(InvalidReferenceError)` | ✅ PASS |
| KAN-15: cria card em coluna inexistente no board → rejeita | 400, nothing created | `apps/crm-api/src/routers/board.router.e2e.test.ts:570-583`; unit: `apps/crm-api/src/services/card.service.unit.test.ts:196-226` — `rejects.toBeInstanceOf(InvalidColumnError)`, checked BEFORE reference validation | ✅ PASS |
| KAN-16: edita título/descrição/referências → coluna atual não muda | `column` in response unchanged; contract omits the field entirely | `apps/crm-api/src/routers/board.router.e2e.test.ts:671-701` — `expect(res.body.data.column).toBe(columnId)`; contract: `packages/contracts/src/schemas/updateCard.schema.ts:9` (`.omit({column:true})`); unit: `apps/crm-api/src/services/card.service.unit.test.ts:243-261` — `not.toHaveProperty('column'/'position')` | ✅ PASS |
| KAN-17: apaga card → remove do board | 200, `findById` null after | `apps/crm-api/src/routers/board.router.e2e.test.ts:810-831` — `expect(await Card.findById(card._id).lean()).toBeNull()` | ✅ PASS |

### P1: Mover card entre colunas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-18: arrasta pra coluna diferente → persiste nova coluna via rota de mover | `column` field updated server-side | `apps/crm-api/src/routers/board.router.e2e.test.ts:732-760` — `expect(res.body.data.column).toBe(colB.id)`; frontend: `apps/web/src/routes/_private/kanban/details.unit.test.tsx:181-196` — `patchMock` called with `{column:'col-b',position:0}`, optimistic state reflects it | ✅ PASS |
| KAN-19: reordena dentro da MESMA coluna → persiste nova posição | `position` field updated | `apps/crm-api/src/routers/board.router.e2e.test.ts:762-783` — `expect(res.body.data.position).toBe(2)` | ✅ PASS |
| KAN-20: falha de rede/servidor ao mover → UI reverte visualmente + mostra erro | Card returns to origin column, error visible | `apps/web/src/routes/_private/kanban/details.unit.test.tsx:198-211` — `expect(toastErrorMock).toHaveBeenCalledWith('Não foi possível mover o card. Tente novamente.'); expect(capturedProps.data.find(...).column).toBe('col-a')` (reverted) | ✅ PASS |
| KAN-21: payload referencia coluna inexistente no board → backend rejeita, independente de validação client-side | 400, persisted column unchanged | `apps/crm-api/src/routers/board.router.e2e.test.ts:785-807` — `expect(res.status).toBe(400); expect(persisted?.column.toString()).toBe(columnId)`; unit: `apps/crm-api/src/services/card.service.unit.test.ts:308-314` — `rejects.toBeInstanceOf(InvalidColumnError)` | ✅ PASS |

### P2: Apagar board (admin, cascata)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-22: admin apaga board → remove board + todos os cards | Board gone, `Card.countDocuments({board})===0` | `apps/crm-api/src/routers/board.router.e2e.test.ts:334-354` — `expect(await Board.findById(...)).toBeNull(); expect(await Card.countDocuments({board:board._id})).toBe(0)`; order enforced: `apps/crm-api/src/services/board.service.unit.test.ts:122-138` — `callOrder` = `['deleteBoard','deleteAllByBoard']`; cascade repo: `apps/crm-api/src/repositories/card.repository.int.test.ts:331-363` | ✅ PASS |
| KAN-23: gestor/operador (sem admin) apaga board → 403 | 403, board untouched | `apps/crm-api/src/routers/board.router.e2e.test.ts:356-373` — `expect(res.status).toBe(403); expect(await Board.findById(...)).not.toBeNull()` | ✅ PASS |

### P2: Card exibe as entidades vinculadas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-24: customer vinculado → exibe nome do cliente | `customerName` field populated | `apps/crm-api/src/routers/board.router.e2e.test.ts:602-648` — `expect(card.customerName).toBe('Maria Cliente')`; UI: `apps/web/src/routes/_private/kanban/details/@components/kanban-card-content.unit.test.tsx:19-23` | ✅ PASS |
| KAN-25: process vinculado → identificador amigável (template + estágio) | `processTemplateName · processStage` | e2e above: `card.processStage`/`card.processTemplateName`; UI: `kanban-card-content.unit.test.tsx:25-29` — `getByText('Fluxo Padrão · Negociação')` | ✅ PASS |
| KAN-26: order vinculado → identificador amigável (valor + status) | `orderTotalPrice`/`orderStatus` formatted | e2e above: `card.orderTotalPrice===100, card.orderStatus==='pending_approval'`; UI: `kanban-card-content.unit.test.tsx:31-35` — `getByText('R$ 123,45 · Confirmado')` | ✅ PASS |
| KAN-27: assignee vinculado → exibe nome do responsável | `assigneeName` populated | e2e above: `card.assigneeName==='Operador Bruno'`; UI: `kanban-card-content.unit.test.tsx:37-40` | ✅ PASS |
| KAN-28: card sem nenhuma referência → só título/descrição, sem seção vazia | All display fields `undefined`, no badge rendered | `apps/crm-api/src/routers/board.router.e2e.test.ts:650-668` — all 4 fields `toBeUndefined()`; UI: `kanban-card-content.unit.test.tsx:62-71` — `container.querySelector('[title="Cliente"]')` etc `not.toBeInTheDocument()` | ✅ PASS |

### P3: Cor por coluna

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KAN-29: define cor (hex) → persiste E exibe como indicador visual no cabeçalho | Persist: color saved and returned. Display: colored dot rendered in column header | **Persist** ✅: `apps/crm-api/src/routers/board.router.e2e.test.ts:194-206` — `expect(res.body.data.columns[0].color).toBe('#FF0000')`; regex: `packages/db/src/models/board.model.int.test.ts:54-60`; UI sets it: `apps/web/src/routes/_private/kanban/details/@components/column-manager-panel.unit.test.tsx:80-92` — `patchMock` called with `color:'#FF0000'`. **Display in header** ❌ GAP: `apps/web/src/routes/_private/kanban/details.tsx:154-161` renders a colored `<span>` dot conditionally on `column.color`, but no test in `details.unit.test.tsx` asserts this renders (grepped for "color" in that file — zero matches) | ⚠️ PARTIAL — persistence fully verified; the "exibir como indicador visual" half of the AC has no test evidence (code exists, unasserted) |

**Status**: 28/29 ACs ✅ PASS with precise spec-outcome match. 1/29 (KAN-29) ⚠️ Partial — real gap in test coverage for the display half only, not the persistence half. No spec-precision gaps (every AC in spec.md defines a precise, testable outcome).

---

## Edge Cases (spec.md)

- [x] Tenant sem nenhum board → hub mostra `DefaultEmptyData` com atalho: `apps/web/src/routes/_private/kanban/index.unit.test.tsx:51-57` + `:93-100` (botão "Adicionar" sempre visível no header)
- [x] Coluna sem card → aparece vazia sem erro: implicit in `details.unit.test.tsx` (column "Feito" with 0 cards renders without crash) + `apps/crm-api/src/repositories/card.repository.int.test.ts:314-327` (`existsInColumn` false case)
- [x] Referência opcional enviada como string vazia → tratada como "sem referência": `packages/contracts/src/schemas/createCard.schema.unit.test.ts:63-80` — all 4 refs `''` → `result.data.X` is `undefined`, `result.success===true`
- [ ] Dois operadores movem cards diferentes simultaneamente → cada movimentação persiste independente: NOT tested (accepted trade-off per spec.md Assumptions — "last-write-wins, sem lock" — architecturally true by omission of any locking code, but no concurrency test exists). Low-risk, explicitly out of scope for automated testing per the Assumption itself.
- [x] Limites de caracteres (card title ≤120, board name ≤80, column label ≤60) → rejeitados: `packages/contracts/src/schemas/createCard.schema.unit.test.ts:47-51`, `createBoard.schema.unit.test.ts:35-39`, `createColumn.schema.unit.test.ts:23-27`

---

## Discrimination Sensor

All mutations applied via `Edit` directly on the tracked working-tree files (confirmed clean via `git status --porcelain` before each mutation), run against the relevant test file, then reverted with `git checkout --` (confirmed clean after each revert). The real working tree was never left in a mutated state.

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/crm-api/src/services/board.service.ts:95` | Flipped `removeColumn` non-empty guard: `if (hasCards)` → `if (!hasCards)` | ✅ Killed — 2 tests failed (`board.service.unit.test.ts`: KAN-10 "throws ColumnNotEmptyError...", KAN-12 "removes an empty column...") |
| 2 | `apps/crm-api/src/services/board.service.ts:92` | Flipped `removeColumn` last-column guard: `=== 1` → `!== 1` | ✅ Killed — 3 tests failed (KAN-11 "throws LastColumnError...", KAN-10, KAN-12) |
| 3 | `apps/crm-api/src/services/card.service.ts:79-86` | Removed the `assertReferencesExist(...)` call from `createCard` (cross-tenant reference check) | ✅ Killed — 6 tests failed in `card.service.unit.test.ts` (all 4 KAN-14 reference-rejection tests + 2 cascading `updateCard` failures from shared mock state) |
| 4 | `apps/crm-api/src/routers/board.router.ts` | Moved `PATCH /:id/columns/reorder` to AFTER `PATCH /:id/columns/:columnId` (breaks the documented route-ordering fix) | ✅ Killed — 1 test failed in `board.router.e2e.test.ts` (KAN-09: "reorder" matched as `:columnId`, `res.status` 400 instead of 200) |
| 5 | `apps/crm-api/src/routers/board.router.ts:70` | Flipped `DELETE /boards/:id` gate from `isAdmin` to `canOperate` | ✅ Killed — 1 test failed in `board.router.e2e.test.ts` (KAN-23: gestor got 200 instead of 403) |

**Sensor depth**: lightweight (5 mutations, default tier)
**Result**: 5/5 killed — ✅ PASS. No surviving mutants; no fix tasks required from the sensor.

---

## Gate Check

- **Gate command**: `pnpm run check` (= `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`)
- **Result**: exit code 1 — but NOT due to kanban-tool code. Breakdown:
  - `tsc --noEmit`: 0 errors (repo-wide, all packages)
  - `pnpm biome check .`: 9 errors — ALL in 3 files that are **not part of the kanban diff** and **unmodified since the base commit `5e632d9`**: `apps/web/src/query/professional.unit.test.ts`, `apps/web/src/query/schedulingSettings.ts`, `apps/web/src/query/space.unit.test.ts`. Confirmed via `git diff --name-only 5e632d9..HEAD` (none of the 3 files listed) and `git log --oneline 5e632d9..HEAD -- <files>` (no commits touch them). Pre-existing repo-wide formatting drift, unrelated to this feature — biome check short-circuits the `&&` chain before vitest ever runs.
  - Because biome failed, `pnpm vitest run` was never reached by the composite command. Ran it separately to get real counts: **Test Files 244 passed, 1 failed (245) / Tests 1985 passed, 1 failed (1986)**. The 1 failure is `apps/web/src/routes/_private/inbox/@components/media-card.unit.test.tsx` (INBOX-17/AC2, absolute vs. relative URL assertion) — also not part of the kanban diff, unrelated feature.
  - **Zero kanban-related test files failed.** Grepped the vitest output for `kanban`/`board.`/`card.` failures — none found.
- **Test count before feature**: not independently re-derived (would require checking out `5e632d9` and running vitest, which was not necessary to establish delta — all new kanban test files are additions, not modifications of pre-existing tests)
- **Test count after feature**: 1986 total tests repo-wide; kanban-tool contributes 24 new test files (`board.model.int.test.ts`, `card.model.int.test.ts`, 8× `*.schema.unit.test.ts`, `board.repository.int.test.ts`, `card.repository.int.test.ts`, `board.service.unit.test.ts`, `card.service.unit.test.ts`, `board.router.e2e.test.ts`, `board.unit.test.ts` (query), 7× frontend `*.unit.test.tsx`)
- **Delta**: all additions, no test deleted or weakened
- **Skipped tests**: none found in kanban scope
- **Failures**: 1, pre-existing/unrelated (`media-card.unit.test.tsx`, inbox feature)

**Conclusion**: the kanban-tool diff itself introduces 0 tsc errors, 0 biome violations, and 0 test failures. The repo-wide `pnpm run check` command currently fails due to pre-existing, unrelated debt (biome formatting drift in 3 untouched files, and 1 unrelated flaky/environment-dependent inbox test) — this is a real repo-health issue but not a kanban-tool regression, and is called out here rather than silently absorbed into the verdict.

---

## SPEC_DEVIATION Review

One marker found: `apps/web/src/routes/_private/kanban/details/@components/card-panel.tsx:36-44`.

> `process`/`order`/`assignee` são inputs de texto (id bruto), não `<Select>` com busca — não existe hoje nenhuma query de frontend que liste TODOS os processos/pedidos/usuários de um tenant... O back-end (card.service.ts, T9) já valida cada id informado por completo (existe + pertence ao tenant, KAN-14) antes de gravar.

**Assessment**: accurate and genuinely necessary, not a cover for missed work.
- Verified `apps/web/src/query/customer.ts` has a tenant-wide `customersQuery` (used for the `customer` field, which correctly IS a searchable `<Select>` per the code at the top of `card-panel.tsx`), but grepping the frontend query directory confirms no equivalent tenant-wide listing query exists for `Process`/`Order`/`User` — `processesQuery` (where it exists) is scoped by `customerId`, not tenant-wide.
- Building such a query/endpoint was not in any task's `Where`/`What` for T18 (`tasks.md` T18 lists only `card-panel.tsx`, no new query file).
- Backend enforcement is real and tested: `card.service.ts:29-62` (`assertReferencesExist`) validates existence + tenant match for all 4 references regardless of what the UI sends, confirmed by 4 dedicated tests in `card.service.unit.test.ts:130-192` and killed by discrimination mutation #3 above — so a malicious or malformed raw-text id is rejected server-side exactly per KAN-14, independent of the UI's input widget.
- Scope is correctly bounded: the deviation only affects UX polish (searchable select vs. raw text input) for 3 of 4 optional fields, not correctness, security, or tenant isolation.

**Verdict**: legitimate, accurately described, scoped correctly. Not a defect.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — no abstractions beyond what's needed; column identity reuses `_id` instead of adding a redundant `key` field (design.md decision, followed) |
| Surgical changes | ✅ — diff touches only files listed in design.md's Integration Points; `app.ts` diff is a 2-line router mount |
| No scope creep | ✅ — sharing/collaborators, process↔column sync, and seeded columns are all correctly left out per spec.md's Out of Scope table |
| Matches patterns | ✅ — repository/service/controller/router shape mirrors `professional.*`; `pendingMoves` optimistic-move pattern mirrors `customers/kanban/index.tsx` |
| Spec-anchored outcome check | ✅ — see AC table above; every PASS row cites the exact asserted value against spec.md's exact expected outcome |
| Per-layer Coverage Expectation met | ✅ — domain logic (services) has 1:1 AC mapping per test `describe` block; router e2e covers happy+edge+error (400/403/404) for every route in scope |
| Every test maps to a requirement | ✅ — every test file/block references a KAN-id or a named edge case in its description; no unclaimed tests found during review |
| Documented guidelines followed | `.specs/STATE.md` AD-017 (Vitest `projects`, file-suffix convention) — followed; `apps/web/CLAUDE.md` (painel inline AD-037, `search:{id}` AD-030, mock pattern for `@tanstack/react-router`) — followed in every frontend file reviewed |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| KAN-01 | In Tasks | ✅ Verified |
| KAN-02 | In Tasks | ✅ Verified |
| KAN-03 | In Tasks | ✅ Verified |
| KAN-04 | In Tasks | ✅ Verified |
| KAN-05 | In Tasks | ✅ Verified |
| KAN-06 | In Tasks | ✅ Verified |
| KAN-07 | In Tasks | ✅ Verified |
| KAN-08 | In Tasks | ✅ Verified |
| KAN-09 | In Tasks | ✅ Verified |
| KAN-10 | In Tasks | ✅ Verified |
| KAN-11 | In Tasks | ✅ Verified |
| KAN-12 | In Tasks | ✅ Verified |
| KAN-13 | In Tasks | ✅ Verified |
| KAN-14 | In Tasks | ✅ Verified |
| KAN-15 | In Tasks | ✅ Verified |
| KAN-16 | In Tasks | ✅ Verified |
| KAN-17 | In Tasks | ✅ Verified |
| KAN-18 | In Tasks | ✅ Verified |
| KAN-19 | In Tasks | ✅ Verified |
| KAN-20 | In Tasks | ✅ Verified |
| KAN-21 | In Tasks | ✅ Verified |
| KAN-22 | In Tasks | ✅ Verified |
| KAN-23 | In Tasks | ✅ Verified |
| KAN-24 | In Tasks | ✅ Verified |
| KAN-25 | In Tasks | ✅ Verified |
| KAN-26 | In Tasks | ✅ Verified |
| KAN-27 | In Tasks | ✅ Verified |
| KAN-28 | In Tasks | ✅ Verified |
| KAN-29 | In Tasks | ⚠️ Verified (partial) — persistence fully verified; header display sub-clause untested, see Fix Plan below |

---

## Fix Plans (minor, non-blocking)

### Fix 1: KAN-29 header color indicator has no frontend assertion

- **Root cause**: `details.unit.test.tsx` (T20) covers loading/render/drag/panels but never asserts the colored dot (`details.tsx:154-161`) renders when a column has a `color`, nor that it's absent when a column has none.
- **Fix task**: add 1-2 assertions to `apps/web/src/routes/_private/kanban/details.unit.test.tsx` rendering a board with one colored column and one uncolored column, asserting the dot span is present/absent respectively (e.g. via a `data-testid` or the existing `aria-hidden` span's `style.backgroundColor`).
- **Priority**: Cosmetic (P3 story, explicitly "puramente cosmético" per spec.md; underlying code is simple and correct on inspection — this is a coverage gap, not a functional defect)

---

## Summary

**Overall**: ✅ Ready (PASS)

**Spec-anchored check**: 28/29 ACs matched spec outcome precisely; 1/29 (KAN-29) partial — persistence half fully verified, display half has a real but minor/cosmetic test-coverage gap. 0 spec-precision gaps (every spec.md AC defines a precise, testable outcome).
**Sensor**: 5/5 mutations killed (lightweight tier, default for non-P0 feature)
**Gate**: tsc 0 errors; vitest 1985/1986 passed (1 pre-existing unrelated failure); biome 9 pre-existing unrelated errors (blocks the composite `pnpm run check` exit code, but not caused by this feature)

**What works**: All P1 (Board CRUD, column management, card CRUD, drag-and-drop move with optimistic UI + revert-on-error) and P2 (admin-only cascading delete, card reference display) stories are implemented with rigorous, non-shallow, spec-anchored tests at every layer (model → repository → service → router e2e → frontend query → frontend component), including explicit tenant-isolation (AD-010) tests at repository and router level, and the documented edge cases (empty hub, empty column, empty-string reference, character limits) are all covered. The one `SPEC_DEVIATION` marker is accurate, necessary, and does not weaken backend enforcement of KAN-14.

**Issues found**: KAN-29's visual-indicator-in-header sub-clause lacks a dedicated frontend test (code present and correct on inspection). The repo-wide `pnpm run check` currently fails due to pre-existing biome debt in 3 files unrelated to this feature, and 1 pre-existing unrelated vitest failure in the inbox feature — both flagged here for visibility but out of scope to fix as this feature's Verifier (read-only mandate).

**Next steps**: Optional low-priority fix task (Fix 1 above) for KAN-29 test coverage; separately (outside this feature's scope) the repo's biome debt and the inbox test flake should be tracked as their own housekeeping items so future `pnpm run check` runs are not silently short-circuited before vitest runs.
