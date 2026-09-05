# CRM Core Validation

**Date**: 2026-09-04
**Spec**: `.specs/features/crm-core/spec.md`
**Diff range**: `29dfac7..HEAD` (branch `feature/crm-core`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

All 21 tasks (T1-T21) landed as one commit each, in the exact order and grouping `tasks.md` specifies, plus 2 style-only follow-up commits (allowed per the audit brief). Verified via `git log --oneline 29dfac7..HEAD --reverse` and by reading the diff of every commit against its task's "Where"/"What".

| Task | Commit | Status | Notes |
| ---- | ------ | ------ | ----- |
| T1 | `18a5fc9` docs(architecture) | ✅ Done | `document`/`stages` added to examples exactly as specified |
| T2 | `4c844d4` feat(contracts): stages on field-template schemas | ✅ Done | `superRefine` branch for `process`/`customer` verified in source |
| T3 | `aa017a1` feat(contracts): createCustomerSchema | ✅ Done | `.strict()`, registered in `schemaRegistry` |
| T4 | `b0a10a4` feat(contracts): createProcessSchema | ✅ Done | `idSchema` reused for `customerId` |
| T5 | `d857498` feat(contracts): updateProcessValues/Stage schemas | ✅ Done | both `.strict()`, registered |
| T6 | `cdc5173` feat(db): stages field on FieldTemplateVersion | ✅ Done | `default: undefined` verified by a passing test (not just a comment) |
| T7 | `8fcb8da` feat(db): Customer model | ✅ Done | compound wildcard index present and functionally proven |
| T8 | `77a187d` feat(db): Process model (+ `4b99527` style follow-up) | ✅ Done | both indexes present and functionally proven |
| T9 | `fb4c91e` feat(crm-api): thread stages through field-template (+ `7035545` style follow-up) | ✅ Done | service-level guard runs before `claimVersionSlot` (no orphaned slot), proven by retry test |
| T10 | `1201d95` feat(crm-api): real customer FieldValueStore adapter | ✅ Done | idempotent retry proven (`migrated: 0` on 2nd call) |
| T11 | `652742f` feat(crm-api): real process FieldValueStore adapter | ✅ Done | identical shape to T10 confirmed via diff |
| T12 | `b330120` feat(crm-api): customer repository | ✅ Done | `tenantScoped` + `withDbTiming` on every function |
| T13 | `cdbdfde` feat(crm-api): customer service | ✅ Done | validate-before-write, archived guard, clamp logic present |
| T14 | `f910ccd` feat(crm-api): customer controller | ✅ Done | tenant only from `req.tenantUser.tenant` |
| T15 | `80751e8` feat(crm-api): customer routes + e2e | ✅ Done | 14 tests, all coverage-matrix scenarios present |
| T16 | `136dc92` feat(crm-api): process repository | ✅ Done | `updateStage`/`updateValues` are single `findOneAndUpdate` |
| T17 | `6c12b1d` feat(crm-api): process service | ✅ Done | CORE-08 uses `process.templateVersion`, never `template.currentVersion` |
| T18 | `f99a387` feat(crm-api): process controller | ✅ Done | same shape as customer controller |
| T19 | `a09ade5` feat(crm-api): process routes + e2e | ✅ Done | 16 tests, all coverage-matrix scenarios present |
| T20 | `d50f022` feat(crm-api): wire routers + real adapters | ✅ Done | `app.ts` diff is minimal/surgical, matches design exactly |
| T21 | `8f0e8b5` test(crm-api): extend cross-tenant isolation | ✅ Done | new isolation test covers listing, P2 filter, and cross-tenant mutation-by-id |

---

## Spec-Anchored Acceptance Criteria

### P1: Admin/operador cadastra e lista Customer, com filtro por status

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: create with valid `values` → persist with session Tenant + templateVersion used | Record's `Tenant` = session tenant, `templateVersion` = template's current version at creation | `apps/crm-api/src/routers/customer.router.e2e.test.ts:159-166` — `expect(res.status).toBe(201)`, `expect(created?.Tenant.toString()).toBe(tenant.id)`, `expect(created?.templateVersion).toBe(1)` | ✅ PASS |
| AC2: invalid `values` → 400 with per-field error, nothing created | 400; "erro por campo" | `apps/crm-api/src/routers/customer.router.e2e.test.ts:180-181` — `expect(res.status).toBe(400)`, `expect(await Customer.countDocuments()).toBe(0)` | ⚠️ Spec-precision gap — see note below |
| AC3: list with search/sort/pagination, server-side, tenant-scoped | server-side filtering, correct tenant | `customer.router.e2e.test.ts:278-286` (search), `:305-309` (sort), `:320-330` (pagination clamp) | ✅ PASS |
| AC4: filter listing by `status` → only matching Customers | exact match set | `customer.router.e2e.test.ts:351-354` — `expect(res.body.data.total).toBe(2)`, names sorted match `['Novo A','Novo B']` | ✅ PASS |
| AC5: mirrored tenants, no cross-tenant leak | zero leakage either direction | `customer.router.e2e.test.ts:366-369` — `Customer.countDocuments({})` = 2, `res.body.data.total` = 1, returned id = own tenant's customer | ✅ PASS |
| AC6: forged `Tenant`/`tenantId`/`orgId` in body → ignored | request never honors the forged value | `customer.router.e2e.test.ts:233-234` — `expect(res.status).toBe(400)`, count = 0 (rejected via `.strict()`, same interpretation `design.md` T15 Done-when already approved) | ✅ PASS |

**Note on AC2**: `design.md`'s Error Handling Strategy table states the shape as `400, errors: Record<fieldId, string[]>`, but the project's response envelope (`packages/contracts/src/response/index.ts` `badRespObj({message})`) only ever carries a single `message: string` — this is a pre-existing, whole-codebase constraint (confirmed already used the same way in `validation.middleware.ts` and `fieldTemplate.service.ts`, both pre-existing/Verified). The implementation condenses field errors into one semicolon-joined string that names each field (`customer.service.ts:18-21`, `formatValidationErrors`). This satisfies "por campo" in a weak (field-name-in-message) sense, not the structured shape `design.md` literally promised. Spec.md itself only says "erro por campo" without specifying JSON shape, so this is marked a spec-precision gap, not a failed AC — the load-bearing behavior (400, nothing persisted) is fully proven.

### P1: Process é aberto sobre um template e avança por stage guardado

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: create Process → `templateVersion` corrente, `stage` = `stages[0]`, `values` default | exact values | `apps/crm-api/src/routers/process.router.e2e.test.ts:230-243` — `stage` = `PROCESS_STAGES[0]`, `values` = `{}`, `templateVersion` = 1, `stage` = `'aberto'` | ✅ PASS |
| AC2: update `values` validates against the Process's OWN templateVersion, not the template's current one | old Process (v1 snapshot) still validates against v1 after a template bump to v2 | `process.router.e2e.test.ts:382-410` — `updateOld.status` = 200 after bump (v1 `obs` optional), `newProcess.status` = 400 (v2 `obs` required, same empty payload) — genuine differentiation, not "always passes" | ✅ PASS |
| AC3: move `stage` outside template `stages` → 400, unchanged | exact | `process.router.e2e.test.ts:441-442` — `res.status` = 400, `stage` still `'aberto'` | ✅ PASS |
| AC4: Process created against a foreign-tenant `Customer` → 403/404, nothing created | 404 (per `design.md`'s explicit choice) | `process.router.e2e.test.ts:258-259` — `res.status` = 404, `Process.countDocuments()` = 0 | ✅ PASS |

### P2: Ver o histórico de Process de um Customer

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: list Process filtered by Customer → only that Customer's Process, within session Tenant | exact set | `process.router.e2e.test.ts:479-482` — `items` length 2, every `item.customer` === `customerA.id` | ✅ PASS |

### Dimensões (CORE-12..17)

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CORE-12 (validação/limites) | Zod on name/phone/document; `values` via field-engine; page/limit bounded | `createCustomer.schema.unit.test.ts:30-44`; `customer.router.e2e.test.ts:320-330` (clamp) | ✅ PASS |
| CORE-13 (falha não persiste) | invalid create/update leaves DB unchanged | `customer.router.e2e.test.ts:181`; `process.router.e2e.test.ts:288,373` | ✅ PASS |
| CORE-14 (auth/rate limit) | any authenticated role; rate limit on mutation | `customer.router.e2e.test.ts:218-219` (gestor/operador), `:266` (429); `process.router.e2e.test.ts:316-320`, `:335` | ✅ PASS |
| CORE-15 (concurrency) | 2 concurrent stage moves → one consistent final state | `process.router.e2e.test.ts:453-461` — both 200, final `stage` ∈ `{'em_andamento','concluido'}` | ✅ PASS |
| CORE-16 (observability) | `dbReqResTime` on new ops; structured log on invalid stage transition | `customer.router.e2e.test.ts:382-387`, `process.router.e2e.test.ts:512-519` (dbReqResTime, all operation names present); structured log satisfied generically by the pre-existing `errorHandler.middleware.ts:29-37` (fires on every error, including the stage-guard 400) — no test asserts this log line specifically | ✅ PASS (dbReqResTime proven directly; log-on-error proven structurally, not by a dedicated assertion) |
| CORE-17 (stage transition integrity) | membership-only guard against the snapshot's `stages` | `process.router.e2e.test.ts:422-428` (valid sequence), `:439-442` (rejection); discrimination sensor mutation #1 below | ✅ PASS |

**Status**: ⚠️ One spec-precision gap flagged (AC2 error shape); all other ACs, both P1 stories and the P2 story, and all 6 dimension rows are ✅ PASS with located evidence.

---

## Discrimination Sensor

Sensor ran in the real working tree with `git checkout -- <file>` used to discard each mutation immediately after observing the failure (confirmed via `git status --short` returning empty after each revert). No mutation was left in place.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/crm-api/src/services/process.service.ts:84` | Flipped stage-membership guard: `if (!version.stages?.includes(stage))` → `if (version.stages?.includes(stage))` (CORE-09/17) | ✅ Killed — 3 tests failed in `process.router.e2e.test.ts` (happy sequence, negative case, concurrency) |
| 2 | `apps/crm-api/src/repositories/customer.repository.ts:58` | Removed `tenantScoped` from `findById`: `Customer.findOne(tenantScoped({Tenant: tenantId, _id: id}))` → `Customer.findOne({_id: id})` (CORE-10 tenant-ownership check) | ✅ Killed — `responds 404 and creates nothing for a customerId belonging to another tenant (CORE-10)` failed (201 instead of 404) |
| 3 | `apps/crm-api/src/services/process.service.ts:63` | Made `updateProcessValues` resolve `template.currentVersion` (via a new `findTemplateById` lookup) instead of the Process's own `process.templateVersion` (CORE-08) | ✅ Killed — `validates PATCH .../values against the Process's OWN templateVersion...(CORE-08)` failed (400 instead of 200 for the pre-bump Process) |

**Sensor depth**: lightweight (3 targeted mutations, per the default tier)
**Result**: 3/3 killed — ✅ PASS

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — every file changed maps directly to a task's "Where" |
| Surgical changes | ✅ — `app.ts` diff is a 6-line, additive-only change; no adjacent code touched |
| No scope creep | ✅ — no `GET /customers/:id`/`GET /processes/:id`, no extra HTTP verbs beyond what design.md lists (confirmed via `grep` on both routers) |
| Matches existing patterns | ✅ — repository/service/controller/router layering identical to `field-template`; error-message condensation reuses `validation.middleware.ts`'s established pattern |
| Spec-anchored outcome check | ⚠️ — 1 spec-precision gap (AC2 error shape), documented above; no evidence of any test asserting a vague/wrong outcome |
| Per-layer Coverage Expectation met | ✅ — domain logic (service/repository) has zero dedicated tests, matching the pre-established project floor (confirmed floor exists for `platform`/`invite`/`auth`/`field-template` too); router e2e covers happy+edge+error for every route |
| Every test maps to a spec requirement | ✅ — every `it()` title in both new e2e files and both new schema/model/adapter test files carries an explicit CORE-NN/AD-NN/"spec Edge Case" tag; no unclaimed test found |
| Documented guidelines followed | ✅ — `tasks.md` Test Coverage Matrix + Gate Check Commands (AD-015/AD-017) followed literally; `.strict()` + `TENANT_FORBIDDEN_KEYS` convention followed for every new schema |

**Two implementer-flagged deviations — independently verified:**

1. **`customer.controller.ts` plain functions instead of `createXController(deps)` factory.** Verified `customer.service` genuinely has no composed dependency to inject (unlike `fieldTemplate.service`, which needs `fieldValueStores`) — confirmed by reading `customer.service.ts` (no constructor/factory params) and `customer.controller.ts` (imports `customerService` directly, no `deps`). `auth.controller.ts`/`invite.controller.ts` (checked) use the same plain-function shape for the same reason (no composed dependency). **Judgment: reasonable engineering call, not an unjustified deviation** — the task's "Reuses" field named a *shape*, and the reason that shape exists (DI for a composed store) genuinely does not apply here; forcing the factory indirection would be the kind of unrequested abstraction `coding-principles.md` flags.
2. **`customer.router.ts`'s local `validListCustomersQuery` middleware instead of the shared `validQuery`.** Verified the underlying bug is real: `apps/crm-api/node_modules/.pnpm/express@5.2.1/.../lib/request.js:217-228` defines `req.query` as a getter-only property (`defineGetter`, no setter) that re-parses `req.url` on every access — `Object.assign(req.query, result.data)` in the shared `validation.middleware.ts:25` therefore mutates a throwaway object each time, and the `z.coerce.number()` transform never survives to the controller. Verified `apps/crm-api/package.json` pins `express: 5.2.1`, matching the claim. Verified the workaround is correctly scoped — `Object.defineProperty(req, 'query', {value, ...})` is local to `customer.router.ts` only, and `validation.middleware.ts` itself is untouched. Verified it is genuinely tested, not just exercised: `customer.router.e2e.test.ts:312-330` (`clamps page/limit...`) asserts `hugeLimit.body.data.items` has length `MAX_PAGE_SIZE` for `?limit=999999` — without the workaround, `limit` would arrive at the service as the *string* `"999999"`, `Number.isFinite("999999")` is `false`, and `clampLimit` would fall through to `DEFAULT_PAGE_SIZE` instead, failing this exact assertion. **Judgment: reasonable, correctly scoped, and genuinely proven by a test that would fail without it.**

---

## Edge Cases

- [x] Phone/document formatting normalized before persisting — `customer.router.e2e.test.ts:251-252`
- [x] Pagination `page`/`limit` out of bounds clamped, never the full collection — `customer.router.e2e.test.ts:320-330`
- [x] `status` filter value with zero matches → `[]`, not an error — `customer.router.e2e.test.ts:340-341` (`toEqual({items: [], total: 0})`)
- [x] Process opened against a superseded templateVersion keeps validating against its own snapshot; new Process uses the current one — `process.router.e2e.test.ts:382-410`
- [x] Customer with no Process history yet → `[]`, not an error — `process.router.e2e.test.ts:490-493`

All 5 spec.md Edge Cases are covered with located, precise evidence.

---

## Gate Check

- **Gate command**: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`
- **Result**: `tsc --noEmit` — 0 errors. `biome check .` — "Checked 182 files in 41ms. No fixes applied." `vitest run` — **61 test files passed (61), 366 tests passed (366), 0 failed.**
- **Test count before feature** (computed by diffing `it(`-block counts of every test file touched in this diff, comparing HEAD against `29dfac7`): **281**
- **Test count after feature**: **366**
- **Delta**: **+85 new tests**
- **Skipped tests**: none found (`grep` for `.skip`/`.todo` across the diff's test files returned nothing)
- **Failures**: none

Per-task minimum test counts (from `tasks.md` "Done when") were all met or exceeded: T2 ≥6 (actual +7), T3 ≥5 (6), T4 ≥4 (6), T5 ≥5 (7), T6 ≥2 (2), T7 ≥5 (5), T8 ≥4 (4), T9 ≥5 (5), T10 ≥6 (6), T11 ≥6 (6), T15 ≥14 (14), T19 ≥16 (16), T21 ≥1 (1).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| CORE-01 | Pending | ✅ Verified |
| CORE-02 | Pending | ✅ Verified (spec-precision gap noted on error shape, not a coverage gap) |
| CORE-03 | Pending | ✅ Verified |
| CORE-04 | Pending | ✅ Verified |
| CORE-05 | Pending | ✅ Verified |
| CORE-06 | Pending | ✅ Verified |
| CORE-07 | Pending | ✅ Verified |
| CORE-08 | Pending | ✅ Verified |
| CORE-09 | Pending | ✅ Verified |
| CORE-10 | Pending | ✅ Verified |
| CORE-11 | Pending | ✅ Verified |
| CORE-12 | Pending | ✅ Verified |
| CORE-13 | Pending | ✅ Verified |
| CORE-14 | Pending | ✅ Verified |
| CORE-15 | Pending | ✅ Verified |
| CORE-16 | Pending | ✅ Verified |
| CORE-17 | Pending | ✅ Verified |

`spec.md`'s Requirement Traceability table and its "Coverage" line should be updated to reflect 17/17 requirements Verified.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 17/17 CORE requirements covered with located evidence; both P1 stories' ACs (10 total) and the P2 story's AC all PASS; 1 spec-precision gap flagged (AC2's error-shape wording vs. `design.md`'s literal `Record<fieldId,string[]>` promise — the codebase's response envelope structurally only carries `message: string`, and this condensation pattern is a pre-existing, already-Verified convention, not a new invention).

**Sensor**: 3/3 mutations killed (stage-membership guard, tenant-ownership check on Process creation, own-templateVersion-vs-current-version resolution for value updates).

**Gate**: 366 passed, 0 failed, 0 skipped (`tsc --noEmit` clean, `biome check` clean).

**What works**: Full CRUD-lite surface for `Customer` (create/list with search/sort/pagination/status-filter) and `Process` (create/update-values/update-stage/list-by-customer), all correctly tenant-scoped, all validating against the field-engine, `stage` transitions correctly guarded against the Process's own templateVersion snapshot (not the template's current one), cross-tenant isolation extended and proven, both `FieldValueStore` real adapters implemented with proven idempotent retry, `stages` correctly threaded through `field-template` as an additive, non-breaking extension (AD-023).

**Issues found**: None that block. One spec-precision gap (AC2 error shape) is a documentation/spec-wording imprecision, not a functional gap — the load-bearing behavior (400, nothing persists) is proven; `design.md`'s Error Handling Strategy table cell describing a structured `errors` object doesn't match what the shared response envelope can deliver, and no `SPEC_DEVIATION` marker was left in code to document the divergence at implementation time.

**Next steps**: None required to ship. Optional follow-up (not blocking): either amend `design.md`'s Error Handling Strategy row to describe the actual message-string shape, or file a small future task to extend `badRespObj` with an optional structured `errors` field if a client (feature 4, `crm-web-shell`) later needs per-field error highlighting rather than a parsed message string.
