# CRM Core Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The
skill is the source of truth for the full flow (per-task cycle, sub-agent delegation,
adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/crm-core/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling + project guidelines — confirm before Execute.
> Guidelines found: **AD-015**/**AD-017** (`.specs/STATE.md`) — Vitest 4 `projects` named
> `unit`/`integration`/`e2e`/`structural`, files by suffix, no separate `__test__` dir;
> `vitest.config.ts` (real globs and `globalSetup`). Sampled the `field-template` module
> (feature 2, Verified) — 9 real files across `contracts`/`db`/`crm-api`. Confirmed floor:
> `apps/crm-api` `repository`/`service`/`controller` layers carry **no dedicated test** in
> any existing module (`platform`, `invite`, `auth`, `field-template`) — all business logic
> is proved transitively by the module's `*.router.e2e.test.ts`. Respected here for
> `customer`/`process`. One deliberate **deviation above the floor**: the no-op
> `FieldValueStore` adapter got a `unit` test (pure function, no I/O); the real
> `customer`/`process` adapters built in this feature do real Mongo bulk writes, so they get
> `integration` tests instead — a stricter type for the same layer, not a lower one.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `packages/contracts` — new/extended schemas (`createCustomer`, `createProcess`, `updateProcessValues`, `updateProcessStage`, `stages` on `createFieldTemplate`/`bumpFieldTemplate`) | unit | `.strict()` rejects `TENANT_FORBIDDEN_KEYS` and unknown keys; every boundary (`min`/`max`/optional) has a valid + invalid case; `stages` required+non-empty+unique for `targetType:'process'`, rejected for `'customer'` — same depth as `createFieldTemplate.schema.unit.test.ts` | `packages/contracts/src/schemas/*.unit.test.ts` | `pnpm vitest run --project unit` |
| `packages/db` — new/extended models (`Customer`, `Process`, `FieldTemplateVersion.stages`) | integration | Indexes exist and behave as designed (`{Tenant,name}`, `{Tenant,phone}`, compound wildcard `{Tenant,'values.$**'}` on `Customer`; `{Tenant,customer}`, `{Tenant,template,templateVersion}` on `Process`); no forced uniqueness on `phone`/`document` (spec Assumption); `stages` persists only for `targetType:'process'` — same level as `fieldTemplate.model.int.test.ts` | `packages/db/src/models/{customer,process}.model.int.test.ts`, `fieldTemplateVersion.model.int.test.ts` (extended) | `pnpm vitest run --project integration` |
| `apps/crm-api` `providers/fieldValueStore` — real `customer`/`process` adapters | integration (deviation above floor — see note) | `countByTemplateVersion` counts only `(Tenant,template,version)` matches; `migrateValues` applies each `MigrationAction` (`discard`/`mapField`/`mapOptions`) correctly; a document already at `toVersion` is excluded by the filter (AD-024 idempotent-retry proof — call `migrateValues` twice, second call migrates 0) | `apps/crm-api/src/providers/fieldValueStore/{customer,process}.fieldValueStore.int.test.ts` | `pnpm vitest run --project integration` |
| `apps/crm-api` `customer`/`process` — repository/service/controller, and the `field-template` repository/service extension for `stages` | **none** (project floor — see note above) | Covered transitively by the router `e2e` tests below | — | — |
| `apps/crm-api` `customer.router` (+ `customerRateLimit`) | e2e | All CORE-01/02/03/04/06/12/13/14/16 scenarios: happy create; invalid `values` → 400, nothing persisted; archived `customer` template → 400; search (`name`/`phone`) + sort + pagination (incl. clamp at bounds); `status` filter incl. a value with zero matches → `[]`, not an error; phone/document normalization; forged `Tenant`/`tenantId`/`orgId` in body → 400 (`.strict()`); 429 rate limit; `dbReqResTime` operation names present | `apps/crm-api/src/routers/customer.router.e2e.test.ts` | `pnpm vitest run --project e2e` |
| `apps/crm-api` `process.router` (+ `processRateLimit`) | e2e | All CORE-07/08/09/10/11/12/13/14/15/16/17 scenarios: happy creation with `stage = stages[0]` and a `templateVersion` snapshot; foreign-tenant `Customer` id → 404, nothing created; `values` update validates against the Process's OWN `templateVersion` (proved by bumping the template mid-test and confirming an existing Process still validates against its original snapshot); valid stage sequence; stage outside `stages` → 400, unchanged; two concurrent stage-move requests (`Promise.all`) resolve to one consistent final state (CORE-15); listing filtered by `Customer` (P2) across 2 customers; archived `process` template blocks new Process creation; 429 rate limit; `dbReqResTime` operation names present | `apps/crm-api/src/routers/process.router.e2e.test.ts` | `pnpm vitest run --project e2e` |
| `field-template.router.e2e.test.ts` (extended for AD-023) | e2e | `stages` required + persisted + returned for `targetType:'process'` create/bump/`GET /current`; rejected for `targetType:'customer'` | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts` (extended) | `pnpm vitest run --project e2e` |
| Cross-tenant isolation (`Customer`/`Process`) | integration | Two mirrored tenants with same-named `Customer`/`Process` — zero leakage either way (CORE-05, extends FND-09) | `apps/crm-api/tests/integration/tenant-isolation.int.test.ts` (extended) | `pnpm vitest run --project integration` |
| `app.ts` wiring | integration (existing smoke, no new dedicated test) | `buildApp()` boots with `/customers`/`/processes` mounted and the real `FieldValueStore` adapters wired — same as T18/`field-template` in feature 2 | `apps/crm-api/src/server.int.test.ts` (existing, unchanged) | `pnpm vitest run --project integration` |
| Structural (`schemaRegistry`, `TENANT_FORBIDDEN_KEYS`, mongoose-boundary) | structural | Automatic sweep already covers any new `*.schema.ts`; only requires the new schemas to be registered — no new test file, no code change to the sweep itself | `tests/structural/*.structural.test.ts` (unchanged) | `pnpm vitest run --project structural` |
| `docs/architecture.md` | none | — (documentation; build gate only validates nothing broke) | — | build gate only |

## Gate Check Commands

> From **AD-017** — reused literally, no new command invented.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `pnpm vitest run --project unit --project structural` |
| Full | After tasks with e2e/integration tests | `pnpm vitest run` |
| Build | End of phase, or config/docs-only tasks | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and
tasks within a phase execute in order.

### Phase 1: Docs sync

```
T1
```

### Phase 2: `packages/contracts`

```
T2 → T3 → T4 → T5
```

### Phase 3: `packages/db`

```
T6 → T7 → T8
```

### Phase 4: `field-template` module — `stages` closure (AD-023)

```
T9
```

### Phase 5: `providers/fieldValueStore` — real adapters (AD-021 closure)

```
T10 → T11
```

### Phase 6: `apps/crm-api` — module `customer`

```
T12 → T13 → T14 → T15
```

### Phase 7: `apps/crm-api` — module `process`

```
T16 → T17 → T18 → T19
```

### Phase 8: Wiring + cross-cutting

```
T20 → T21
```

---

## Task Breakdown

### T1: Sync `docs/architecture.md` with the confirmed `Customer`/`Process` shape

**What**: Update the `customers`/`processes` illustrative document shapes in
`docs/architecture.md` (section "Motor de campos dinâmicos") to add the `document` field to
the `customers` example (spec's fixed core: nome/telefone/documento) and add a `stages`
field to the `fieldTemplateVersions` `targetType:'process'` example (AD-023).
**Where**: `docs/architecture.md`
**Depends on**: None
**Reuses**: Existing structure of the file — only the example payloads change.
**Requirement**: N/A (documentation debt flagged in `design.md` Risks & Concerns)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `customers` example shows `document?` alongside `name`/`phone`
- [ ] `fieldTemplateVersions` `targetType:'process'` example shows `stages: [...]`
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`

**Tests**: none
**Gate**: build
**Commit**: `docs(architecture): add document field and stages to customer/process examples`

---

### T2: `stages` on `createFieldTemplateSchema`/`bumpFieldTemplateSchema` (AD-023)

**What**: Add `stages: z.array(z.string().trim().min(1)).min(1).optional()` to both schemas.
`createFieldTemplateSchema` gains a `superRefine` branch: `targetType === 'process'` requires
`stages` (non-empty, no duplicate values), `targetType === 'customer'` rejects `stages` if
present. `bumpFieldTemplateSchema` keeps `stages` optional at the schema level (it has no
`targetType` field to branch on — the business rule that `process` bumps require it moves to
the service in T9, mirroring the existing `key`/`customer` split in `resolveKey`).
**Where**: `packages/contracts/src/schemas/createFieldTemplate.schema.ts`,
`bumpFieldTemplate.schema.ts` (+ both `.unit.test.ts`)
**Depends on**: None
**Reuses**: Exact `superRefine` pattern already used for `key`/`targetType==='process'` in
`createFieldTemplate.schema.ts`
**Requirement**: AD-023

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `targetType:'process'` without `stages` → rejected; with duplicate values in `stages` → rejected
- [ ] `targetType:'customer'` with `stages` present → rejected; without it → accepted (unchanged)
- [ ] `bumpFieldTemplateSchema` accepts a body with or without `stages` (schema-level only)
- [ ] Both schemas still reject `TENANT_FORBIDDEN_KEYS` (unchanged `.strict()` behavior)
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: ≥ 6 new tests pass (existing suite stays green)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add stages field to field-template schemas (AD-023)`

---

### T3: `createCustomerSchema`

**What**: `{ name, phone, document?, values? }.strict()` — `name`/`phone` required
non-empty strings (max 120/30); `document` optional; `values: z.record(z.string(),
z.unknown()).optional()` (deep validation against the tenant's template happens at runtime
via `field-engine`, not statically here — same split already used for `fields`/`values` in
`field-template`). Register in `schemaRegistry`.
**Where**: `packages/contracts/src/schemas/createCustomer.schema.ts` (+ `.unit.test.ts`),
`packages/contracts/src/registry.ts`
**Depends on**: None
**Reuses**: Mold of `createFieldTemplateSchema` (`.strict()` + `superRefine`-free simple case)
**Requirement**: CORE-01, CORE-02, CORE-06, CORE-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Missing `name`/`phone` rejected; `document` optional and accepted when present or absent
- [ ] Body with `Tenant`/`tenantId`/`orgId` rejected by `.strict()`
- [ ] `values` accepts an arbitrary object shape (runtime-validated elsewhere)
- [ ] Schema appears in `schemaRegistry`; `schema-registry.structural.test.ts` passes unchanged
- [ ] Gate check passes: `pnpm vitest run --project unit --project structural`
- [ ] Test count: ≥ 5 tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add createCustomerSchema`

---

### T4: `createProcessSchema`

**What**: `{ templateKey, customerId, values? }.strict()` — `templateKey` (the `process`
template's `key`, matching the existing `key` concept from `field-template`), `customerId`
via the existing `idSchema`, `values` optional (defaults applied server-side per CORE-07).
Register in `schemaRegistry`.
**Where**: `packages/contracts/src/schemas/createProcess.schema.ts` (+ `.unit.test.ts`),
`packages/contracts/src/registry.ts`
**Depends on**: None
**Reuses**: `idSchema` (`packages/contracts/src/schemas/id.schema.ts`)
**Requirement**: CORE-07, CORE-10, CORE-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Missing `templateKey`/`customerId` rejected; malformed `customerId` (not 24-hex) rejected
- [ ] Body with `Tenant`/`tenantId`/`orgId` rejected by `.strict()`
- [ ] Schema appears in `schemaRegistry`; `schema-registry.structural.test.ts` passes unchanged
- [ ] Gate check passes: `pnpm vitest run --project unit --project structural`
- [ ] Test count: ≥ 4 tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add createProcessSchema`

---

### T5: `updateProcessValuesSchema` + `updateProcessStageSchema`

**What**: Two small, related schemas for the two `Process` mutation endpoints —
`{ values: z.record(z.string(), z.unknown()) }.strict()` and `{ stage: z.string().trim().min(1)
}.strict()`. Register both in `schemaRegistry`.
**Where**: `packages/contracts/src/schemas/updateProcessValues.schema.ts`,
`updateProcessStage.schema.ts` (+ both `.unit.test.ts`), `packages/contracts/src/registry.ts`
**Depends on**: None
**Reuses**: Same minimal `.strict()` shape as `createProcessSchema` (T4)
**Requirement**: CORE-08, CORE-09, CORE-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `updateProcessValuesSchema` rejects a missing `values` key; accepts an arbitrary object
- [ ] `updateProcessStageSchema` rejects empty/missing `stage`
- [ ] Both reject `Tenant`/`tenantId`/`orgId` via `.strict()`
- [ ] Both appear in `schemaRegistry`; `schema-registry.structural.test.ts` passes unchanged
- [ ] Gate check passes: `pnpm vitest run --project unit --project structural`
- [ ] Test count: ≥ 5 tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add updateProcessValues/updateProcessStage schemas`

---

### T6: `stages` on the `FieldTemplateVersion` model (AD-023)

**What**: Add `stages?: string[]` to `FieldTemplateVersionDocument` and its Mongoose schema
(`{ type: [String], required: false }`) — populated only when `targetType === 'process'`.
Extend the existing model integration test.
**Where**: `packages/db/src/models/fieldTemplateVersion.model.ts`,
`fieldTemplateVersion.model.int.test.ts` (extended)
**Depends on**: T2 (`stages` shape in `CreateFieldTemplate`/`BumpFieldTemplate` types)
**Reuses**: Existing model file — purely additive field, no index change
**Requirement**: AD-023

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A `targetType:'process'` document persists and reads back `stages` intact
- [ ] A `targetType:'customer'` document with no `stages` persists unaffected (field absent, not `[]`)
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 2 new tests pass (existing suite stays green)

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add stages field to FieldTemplateVersion (AD-023)`

---

### T7: Model `Customer`

**What**: `CustomerDocument` + Mongoose schema — `Tenant` (ref, required), `name`, `phone`,
`document?`, `template` (ref `FieldTemplate`), `templateVersion` (number), `values`
(`Schema.Types.Mixed`), `{ timestamps: true }`. Indexes: `{Tenant:1,name:1}`,
`{Tenant:1,phone:1}`, compound wildcard `{Tenant:1,'values.$**':1}` (AD-025). No unique
index on `phone`/`document` (spec Assumption — dedup out of scope). Export from
`packages/db/src/index.ts`; add `Customer.createIndexes()` to `syncIndexes()`.
**Where**: `packages/db/src/models/customer.model.ts` (+ `.int.test.ts`),
`packages/db/src/index.ts`
**Depends on**: None
**Reuses**: `FieldTemplateVersion`'s `Mixed`-field precedent (comment explaining the
trade-off, same convention) for `values`
**Requirement**: CORE-01, CORE-03, CORE-04, CORE-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Two `Customer` docs with the same `{Tenant,phone}` both persist (no unique constraint — explicit proof of the spec Assumption)
- [ ] `Customer.collection.indexes()` includes `{Tenant:1,name:1}`, `{Tenant:1,phone:1}`, and the compound wildcard `{Tenant:1,'values.$**':1}`
- [ ] A query `{Tenant, 'values.status': X}` returns only matching docs (functional proof the wildcard index is queryable, not just present)
- [ ] Exported from `packages/db/src/index.ts`; `syncIndexes()` includes `Customer.createIndexes()`
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 5 tests pass

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add Customer model with compound wildcard values index`

---

### T8: Model `Process`

**What**: `ProcessDocument` + Mongoose schema — `Tenant` (ref, required), `customer` (ref
`Customer`, required), `template` (ref `FieldTemplate`), `templateVersion` (number),
`stage` (string), `values` (`Schema.Types.Mixed`), `{ timestamps: true }`. Indexes:
`{Tenant:1,customer:1}` (P2 history), `{Tenant:1,template:1,templateVersion:1}` (mirrors the
exact `FieldValueStore.countByTemplateVersion`/`migrateValues` filter shape). Export from
`packages/db/src/index.ts`; add `Process.createIndexes()` to `syncIndexes()`.
**Where**: `packages/db/src/models/process.model.ts` (+ `.int.test.ts`),
`packages/db/src/index.ts`
**Depends on**: None
**Reuses**: Same `Mixed`-for-`values` convention as `Customer` (T7)
**Requirement**: CORE-07, CORE-08, CORE-09, CORE-10, CORE-11, CORE-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `Process.collection.indexes()` includes `{Tenant:1,customer:1}` and `{Tenant:1,template:1,templateVersion:1}`
- [ ] A query `{Tenant,template,templateVersion}` returns only matching docs (functional proof, mirrors what the FieldValueStore adapter will filter by)
- [ ] Exported from `packages/db/src/index.ts`; `syncIndexes()` includes `Process.createIndexes()`
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 4 tests pass

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add Process model`

---

### T9: Thread `stages` through the `field-template` repository/service (AD-023 closure)

**What**: `fieldTemplate.repository.claimVersionSlot` accepts an optional `stages` and
persists it; `findCurrentVersion` returns `stages` alongside `fields`. `fieldTemplate.service
.createFieldTemplate` passes `data.stages` through; `getCurrentTemplate`'s `CurrentTemplate`
type gains `stages?: string[]`; `bumpFieldTemplateVersion` 400s (before claiming any slot) if
`template.targetType === 'process'` and `data.stages` is missing — mirrors the existing
`resolveKey` service-level branch for `customer` vs `process`. Extend
`fieldTemplate.router.e2e.test.ts` to prove the whole path end-to-end (per the project floor,
repository/service changes have no dedicated test of their own — this task's own e2e
extension is where the behavior becomes verifiable, so the test lives in the same task as the
code it proves, per the "merge forward" rule).
**Where**: `apps/crm-api/src/repositories/fieldTemplate.repository.ts`,
`apps/crm-api/src/services/fieldTemplate.service.ts`,
`apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts` (extended)
**Depends on**: T2, T6
**Reuses**: Existing `resolveKey`-style service-level branching; existing e2e `buildTestApp`
**Requirement**: AD-023

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `POST /field-templates` with `targetType:'process'` and no `stages` → 400, nothing created
- [ ] `POST /field-templates` with `targetType:'process'` and valid `stages` → 201, `GET /current` returns them
- [ ] `POST /field-templates/:id/versions` (bump) on a `process` template without `stages` → 400, version slot NOT claimed (re-attempting the same `expectedVersion` afterward still works — proves no orphaned slot)
- [ ] `targetType:'customer'` templates are unaffected (no `stages` in request or response)
- [ ] Gate check passes: `pnpm vitest run --project e2e`
- [ ] Test count: ≥ 5 new tests pass (existing suite stays green)

**Tests**: e2e
**Gate**: full
**Commit**: `feat(crm-api): thread stages through field-template create/bump (AD-023)`

---

### T10: Real `FieldValueStore` adapter for `customer` (AD-021 closure)

**What**: `createCustomerFieldValueStore(): FieldValueStore` — `countByTemplateVersion`
counts `Customer` docs matching `{Tenant,template,templateVersion:version}`.
`migrateValues(tenantId,templateId,fromVersion,toVersion,migration)` reads the matching
docs (`templateVersion: fromVersion`, idempotent filter — AD-024), applies each
`MigrationAction` to `values` (`discard`: delete the key; `mapField`: rename the key,
preserving the value; `mapOptions`: remap the value through `mapping`, **leaving the value
unchanged if it isn't a key in `mapping`** — never silently drops a value the plan didn't
address), bulk-writes the transformed `values` + `templateVersion: toVersion`, returns
`{migrated: count}`.
**Where**: `apps/crm-api/src/providers/fieldValueStore/customer.fieldValueStore.ts` (+
`.int.test.ts`)
**Depends on**: T7
**Reuses**: `withDbTiming`, `tenantScoped`; same `FieldValueStore` type as the no-op (AD-021 —
signature untouched)
**Requirement**: AD-021, AD-024

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `countByTemplateVersion` counts only docs at the exact `(Tenant,template,version)`
- [ ] `discard`/`mapField`/`mapOptions` each transform `values` correctly on a seeded doc
- [ ] `mapOptions` leaves a value untouched when it has no entry in `mapping`
- [ ] Calling `migrateValues` twice with the same `(fromVersion,toVersion)` — second call migrates 0 docs (AD-024 idempotent-retry proof)
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 6 tests pass

**Tests**: integration
**Gate**: full
**Commit**: `feat(crm-api): add real customer FieldValueStore adapter (AD-021)`

---

### T11: Real `FieldValueStore` adapter for `process` (AD-021 closure)

**What**: `createProcessFieldValueStore(): FieldValueStore` — identical contract to T10, over
the `Process` collection.
**Where**: `apps/crm-api/src/providers/fieldValueStore/process.fieldValueStore.ts` (+
`.int.test.ts`)
**Depends on**: T8
**Reuses**: Same implementation shape as T10 (only the model differs)
**Requirement**: AD-021, AD-024

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Same four checks as T10, against `Process` documents
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 6 tests pass

**Tests**: integration
**Gate**: full
**Commit**: `feat(crm-api): add real process FieldValueStore adapter (AD-021)`

---

### T12: `customer.repository.ts`

**What**: `createCustomer(data)`, `findById(tenantId,id)`, `listCustomers(tenantId,
{page,limit,q,sort,order,status})` → `{items,total}` (search on `name`/`phone` via
case-insensitive regex; `sort` whitelist `name`|`createdAt`; `status` filters
`values.status`; `page`/`limit` are trusted as already-clamped by the caller — see T13). All
functions wrapped in `withDbTiming`.
**Where**: `apps/crm-api/src/repositories/customer.repository.ts`
**Depends on**: T7
**Reuses**: `withDbTiming`, `tenantScoped` — same shape as `fieldTemplate.repository.ts`
**Requirement**: CORE-01, CORE-03, CORE-04, CORE-05, CORE-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every exported function passes through `withDbTiming` with a unique operation name
- [ ] `findById` wraps its filter in `tenantScoped` (foreign-tenant id → `null`)
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T15 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add customer repository with dbReqResTime timing`

---

### T13: `customer.service.ts`

**What**: `createCustomer(tenantId,data)` — resolves the tenant's current `customer`
template (`fieldTemplateRepository.findTemplateByTargetKey` + `findCurrentVersion`), 400s if
`archived` (AD-022 closure), runs `validate()` from `field-engine`, normalizes `phone`
(digits only) and `document` (alphanumeric only), persists via `customer.repository
.createCustomer` with the resolved `template`/`templateVersion`. `listCustomers(tenantId,
query)` — clamps `page`/`limit` to `[1, MAX_PAGE_SIZE]` (new constants
`DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100` in this file), defaults `sort` to `createdAt`
descending, delegates to the repository.
**Where**: `apps/crm-api/src/services/customer.service.ts`
**Depends on**: T3, T12
**Reuses**: `validate` (`@crm/field-engine`), `DEFAULT_CUSTOMER_TEMPLATE_KEY`,
`fieldTemplateRepository.findTemplateByTargetKey`/`findCurrentVersion` (feature 2, read-only)
**Requirement**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-12, CORE-13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Invalid `values` throws before any repository write (`validate().valid === false` short-circuits)
- [ ] `archived === true` on the resolved template throws a 400 `CustomError` before any write
- [ ] `page`/`limit` outside `[1,MAX_PAGE_SIZE]` are clamped, never passed through raw
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T15 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add customer service (validate, archived guard, normalization)`

---

### T14: `customer.controller.ts`

**What**: `createCustomer`, `listCustomers` handlers — tenant id always from
`req.tenantUser.tenant`, never from body/query; success via `respObj({data})`; errors via
`next(e)`.
**Where**: `apps/crm-api/src/controllers/customer.controller.ts`
**Depends on**: T13
**Reuses**: Exact shape of `fieldTemplate.controller.ts`
**Requirement**: CORE-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Both handlers read tenant only from `req.tenantUser.tenant`
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T15 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add customer controller`

---

### T15: `customer.router.ts` + `customerRateLimit` + full e2e

**What**: Router — `POST /customers` (`validToken`→`tenantAssignmentCheck`→
`customerRateLimit`→`validBody(createCustomerSchema)`→controller; any authenticated role,
no `isAdmin` gate — CORE-14), `GET /customers` (`validToken`→`tenantAssignmentCheck`→
`validQuery(listCustomersQuerySchema)`→controller; query schema defined inline in the
router file, same pattern as `/field-templates/current`). New `customerRateLimit` in
`rateLimit.middleware.ts` (`tenantAndIpKeyGenerator`, same shape as `fieldTemplateRateLimit`).
Full e2e suite covering the whole coverage-matrix row for this module.
**Where**: `apps/crm-api/src/routers/customer.router.ts`,
`customer.router.e2e.test.ts`, `apps/crm-api/src/middlewares/rateLimit.middleware.ts`
(extended)
**Depends on**: T14
**Reuses**: Exact shape of `fieldTemplate.router.ts`/`.e2e.test.ts` (`buildTestApp` local,
no dependency on `app.ts`); `rejectWithTooManyRequests` factory
**Requirement**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-12, CORE-13,
CORE-14, CORE-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `POST /customers` creates (201) with valid `values`; invalid `values` → 400, nothing persisted
- [ ] Archived `customer` template → `POST /customers` → 400, nothing created
- [ ] `gestor`/`operador` sessions can create/list (no 403 — unlike `field-template`'s `isAdmin` gate)
- [ ] `GET /customers?q=...` matches `name`/`phone`; `sort=name`/`createdAt` orders correctly; pagination bounds are clamped, never the full collection
- [ ] `GET /customers?status=X` for a value with zero matches → `200 { items: [], total: 0 }`
- [ ] Phone `"(11) 91234-5678"` and document with punctuation persist normalized (digits/alphanumeric only)
- [ ] Body with forged `Tenant`/`tenantId`/`orgId` → 400 (schema `.strict()`)
- [ ] N+1 mutations on the same route → 429
- [ ] `dbReqResTime` metric includes every `customer.*` operation name after a full flow
- [ ] Gate check passes: `pnpm vitest run --project e2e`
- [ ] Test count: ≥ 14 tests pass

**Tests**: e2e
**Gate**: full
**Commit**: `feat(crm-api): add customer routes with rate limit and full e2e coverage`

---

### T16: `process.repository.ts`

**What**: `createProcess(data)`, `findById(tenantId,id)`, `findByCustomer(tenantId,
customerId)`, `updateValues(tenantId,id,values)`, `updateStage(tenantId,id,stage)` (single
atomic `findOneAndUpdate` — this atomicity IS the CORE-15 concurrency guard, no extra
optimistic-lock field). All wrapped in `withDbTiming`.
**Where**: `apps/crm-api/src/repositories/process.repository.ts`
**Depends on**: T8
**Reuses**: Same shape as `customer.repository.ts` (T12)
**Requirement**: CORE-07, CORE-08, CORE-09, CORE-10, CORE-11, CORE-15, CORE-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every exported function passes through `withDbTiming` with a unique operation name
- [ ] `findById`/`findByCustomer` wrap filters in `tenantScoped`
- [ ] `updateStage` is a single `findOneAndUpdate` call (no read-then-write race window)
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T19 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add process repository with dbReqResTime timing`

---

### T17: `process.service.ts`

**What**: `createProcess(tenantId,data)` — resolves the `process` template by
`data.templateKey` (`findTemplateByTargetKey(tenantId,'process',data.templateKey)`), 400s if
`archived` (AD-022 closure), 404s if `customer.repository.findById(tenantId,
data.customerId)` returns `null` (foreign/forged tenant — CORE-10), resolves the current
`FieldTemplateVersion` (`fields`+`stages`), validates `values` (default `{}` if omitted —
CORE-07's "values vazios/default"), sets `stage = stages[0]`, persists with the resolved
`template`/`templateVersion` as a permanent snapshot. `updateProcessValues(tenantId,id,
values)` — loads the Process, resolves **its own** `(template,templateVersion)` pair (never
the template's current version — CORE-08), validates, persists only if valid.
`updateProcessStage(tenantId,id,stage)` — loads the Process, resolves its own snapshot's
`stages`, 400s if `stage` isn't a member (CORE-09/17), else `process.repository.updateStage`.
`listProcessesByCustomer(tenantId,customerId)` — delegates to `findByCustomer` (P2).
**Where**: `apps/crm-api/src/services/process.service.ts`
**Depends on**: T4, T5, T9, T16, T12
**Reuses**: `validate` (`@crm/field-engine`), `fieldTemplateRepository
.findTemplateByTargetKey`/`findCurrentVersion` (now returning `stages` per T9),
`customer.repository.findById` (T12) for the tenant-ownership check
**Requirement**: CORE-07, CORE-08, CORE-09, CORE-10, CORE-11, CORE-12, CORE-13, CORE-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `createProcess` against a foreign-tenant `customerId` throws 404 before any write
- [ ] `createProcess` against an archived `process` template throws 400 before any write
- [ ] `updateProcessValues` resolves `(process.template, process.templateVersion)` — never `template.currentVersion`
- [ ] `updateProcessStage` rejects a `stage` outside the snapshot's `stages` before any write
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T19 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add process service (template resolution, stage guard, archived check)`

---

### T18: `process.controller.ts`

**What**: `createProcess`, `updateProcessValues`, `updateProcessStage`,
`listProcessesByCustomer` handlers — same tenant/response/error conventions as
`customer.controller.ts`.
**Where**: `apps/crm-api/src/controllers/process.controller.ts`
**Depends on**: T17
**Reuses**: Exact shape of `customer.controller.ts` (T14)
**Requirement**: CORE-06 (same forged-tenant-ignored convention, applied here too)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All four handlers read tenant only from `req.tenantUser.tenant`
- [ ] Gate check passes: `pnpm -r exec tsc --noEmit`

**Tests**: none (covered transitively by the e2e of T19 — project floor)
**Gate**: quick
**Commit**: `feat(crm-api): add process controller`

---

### T19: `process.router.ts` + `processRateLimit` + full e2e

**What**: Router — `POST /processes`, `PATCH /processes/:id/values`, `PATCH
/processes/:id/stage` (all three: `validToken`→`tenantAssignmentCheck`→`processRateLimit`→
`validBody`(+`validParams(idSchema)` for the two `PATCH` routes)→controller; any
authenticated role), `GET /processes` (`validToken`→`tenantAssignmentCheck`→
`validQuery`→controller, filtering by `customerId` — P2). New `processRateLimit`
(`tenantAndIpKeyGenerator`, same shape as `customerRateLimit`). Full e2e suite.
**Where**: `apps/crm-api/src/routers/process.router.ts`, `process.router.e2e.test.ts`,
`apps/crm-api/src/middlewares/rateLimit.middleware.ts` (extended)
**Depends on**: T18
**Reuses**: Exact shape of `customer.router.ts` (T15)
**Requirement**: CORE-07, CORE-08, CORE-09, CORE-10, CORE-11, CORE-12, CORE-13, CORE-14,
CORE-15, CORE-16, CORE-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `POST /processes` creates (201) with `stage` equal to the template's first `stages` entry and a `templateVersion` snapshot
- [ ] `POST /processes` against a forged/foreign-tenant `customerId` → 404, nothing created
- [ ] Archived `process` template → `POST /processes` → 400, nothing created
- [ ] After bumping the process template (via the existing `field-template` bump endpoint), an existing Process's `PATCH .../values` still validates against its ORIGINAL `templateVersion`, not the new one
- [ ] `PATCH .../stage` through a valid sequence of `stages` succeeds; a value outside `stages` → 400, `stage` unchanged
- [ ] Two concurrent `PATCH .../stage` requests (`Promise.all`) both resolve without a torn/corrupted document — final `stage` is one of the two requested values, never a hybrid or crash (CORE-15)
- [ ] `GET /processes?customerId=X` returns only that customer's Process docs (P2)
- [ ] N+1 mutations on the same route → 429
- [ ] `dbReqResTime` metric includes every `process.*` operation name after a full flow
- [ ] Gate check passes: `pnpm vitest run --project e2e`
- [ ] Test count: ≥ 16 tests pass

**Tests**: e2e
**Gate**: full
**Commit**: `feat(crm-api): add process routes with rate limit and full e2e coverage`

---

### T20: Wire `customer`/`process` routers and real `FieldValueStore` adapters into `app.ts`

**What**: Mount `/customers` and `/processes` in `buildApp()`. Replace both
`createNoopFieldValueStore()` calls in the `fieldValueStores` composition object with
`createCustomerFieldValueStore()`/`createProcessFieldValueStore()` (T10/T11) — closes AD-021.
**Where**: `apps/crm-api/src/app.ts`
**Depends on**: T10, T11, T15, T19
**Reuses**: Existing composition pattern already used for `platform`/`invite`/`auth`/
`field-template` in the same file
**Requirement**: CORE-01..17 (full surface reachable through the real app)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `buildApp()` mounts both routers
- [ ] `fieldValueStores` uses the real adapters for both `customer` and `process`
- [ ] `apps/crm-api/src/server.int.test.ts` (existing boot smoke test) still passes unchanged
- [ ] Gate check passes: `pnpm vitest run --project integration`

**Tests**: integration (existing smoke, no new dedicated test)
**Gate**: full
**Commit**: `feat(crm-api): wire customer/process routers and real FieldValueStore adapters`

---

### T21: Extend cross-tenant isolation to `Customer`/`Process`

**What**: New `it(...)` blocks in the existing structural isolation suite — two tenants
provisioned via `buildApp()`, each creating a `Customer` (same name/phone) and a `Process`
against it, confirming neither tenant's session can read the other's records through
`GET /customers`, `GET /processes`, or by id.
**Where**: `apps/crm-api/tests/integration/tenant-isolation.int.test.ts`
**Depends on**: T20
**Reuses**: `seedPlatformAdminCookie`/`provisionAndAcceptAdmin` already in the file
**Requirement**: CORE-05 (extends FND-09)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Two tenants with same-named `Customer`/`Process` — each session's listing/detail calls only ever see their own tenant's records
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 1 new test passes (whole file stays green)

**Tests**: integration
**Gate**: full
**Commit**: `test(crm-api): extend cross-tenant isolation to customers and processes`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 1:  T1
Phase 2:  T2 ──→ T3 ──→ T4 ──→ T5
Phase 3:  T6 ──→ T7 ──→ T8
Phase 4:  T9
Phase 5:  T10 ──→ T11
Phase 6:  T12 ──→ T13 ──→ T14 ──→ T15
Phase 7:  T16 ──→ T17 ──→ T18 ──→ T19
Phase 8:  T20 ──→ T21
```

Execution is strictly sequential within a phase. Cross-phase dependencies (see task bodies):
T6 depends on T2; T9 depends on T2, T6; T10 depends on T7; T11 depends on T8; T12 depends on
T7; T13 depends on T3, T12; T17 depends on T4, T5, T9, T16, T12; T20 depends on T10, T11,
T15, T19; T21 depends on T20.

**How phase-based execution works:** at Execute, the agent counts total tasks and packs
phases into ~7-task batches (whole phases, cut only at phase boundaries). 21 tasks packs
into 3 batches (e.g. Phases 1-4 = 7 tasks, Phases 5-6 = 6 tasks, Phases 7-8 = 8 tasks, or a
similar split) — the exact packing and the offer to dispatch sub-agents happens at Execute
time, not here.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 file, one conceptual change (two example payloads) | ✅ Granular |
| T2 | 2 files, one cohesive concern (AD-023 schema shape) | ✅ Granular |
| T3 | 1 schema | ✅ Granular |
| T4 | 1 schema | ✅ Granular |
| T5 | 2 tiny schemas, same mutation module, registered together | ✅ Granular |
| T6 | 1 field on 1 model | ✅ Granular |
| T7 | 1 model | ✅ Granular |
| T8 | 1 model | ✅ Granular |
| T9 | 2 files (repository+service), one cohesive concern, tests merged forward into the same task | ✅ Granular |
| T10 | 1 adapter | ✅ Granular |
| T11 | 1 adapter | ✅ Granular |
| T12 | 1 repository (3 cohesive functions of the same module) | ✅ Granular |
| T13 | 1 service (2 cohesive functions of the same module) | ✅ Granular |
| T14 | 1 controller | ✅ Granular |
| T15 | 1 router + 1 rate limiter + e2e — cohesive (the module's whole HTTP surface, same pattern as `field-template`) | ✅ Granular |
| T16 | 1 repository (5 cohesive functions of the same module) | ✅ Granular |
| T17 | 1 service (4 cohesive functions of the same module) | ✅ Granular |
| T18 | 1 controller | ✅ Granular |
| T19 | 1 router + 1 rate limiter + e2e — cohesive, same pattern as T15 | ✅ Granular |
| T20 | 1 change in 1 file | ✅ Granular |
| T21 | 1 new test block in 1 existing file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Phase 1, isolated | ✅ Match |
| T2 | None | Phase 2 start | ✅ Match |
| T3 | None | T2→T3 (execution order; T3 has no real dependency) | ✅ Match — sequencing only, no conflict |
| T4 | None | T3→T4 (execution order) | ✅ Match — sequencing only |
| T5 | None | T4→T5 (execution order) | ✅ Match — sequencing only |
| T6 | T2 | Phase 3 start; cross-phase note below the diagram | ✅ Match |
| T7 | None | T6→T7 (execution order; T7 has no real dependency) | ✅ Match — sequencing only |
| T8 | None | T7→T8 (execution order) | ✅ Match — sequencing only |
| T9 | T2, T6 | Phase 4, isolated; cross-phase note below the diagram | ✅ Match |
| T10 | T7 | Phase 5 start; cross-phase note below the diagram | ✅ Match |
| T11 | T8 | T10→T11 (execution order; real dependency is Phase 3) | ✅ Match — cross-phase note covers it |
| T12 | T7 | Phase 6 start; cross-phase note below the diagram | ✅ Match |
| T13 | T3, T12 | T12→T13 | ✅ Match — cross-phase note covers T3 |
| T14 | T13 | T13→T14 | ✅ Match |
| T15 | T14 | T14→T15 | ✅ Match |
| T16 | T8 | Phase 7 start; cross-phase note below the diagram | ✅ Match |
| T17 | T4, T5, T9, T16, T12 | T16→T17 | ✅ Match — cross-phase note covers T4/T5/T9/T12 |
| T18 | T17 | T17→T18 | ✅ Match |
| T19 | T18 | T18→T19 | ✅ Match |
| T20 | T10, T11, T15, T19 | Phase 8 start; cross-phase note below the diagram | ✅ Match |
| T21 | T20 | T20→T21 | ✅ Match |

No dependency points to a later phase — every cross-phase dependency is backward, made
explicit in the note under the diagram.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | docs | none | none | ✅ OK |
| T2 | contracts schema | unit | unit | ✅ OK |
| T3 | contracts schema | unit | unit | ✅ OK |
| T4 | contracts schema | unit | unit | ✅ OK |
| T5 | contracts schema | unit | unit | ✅ OK |
| T6 | db model | integration | integration | ✅ OK |
| T7 | db model | integration | integration | ✅ OK |
| T8 | db model | integration | integration | ✅ OK |
| T9 | crm-api repository+service (field-template) | none (floor) — exceeded deliberately | e2e | ✅ OK (exceeds floor, never a violation) |
| T10 | crm-api provider (real adapter) | integration (deviation above floor) | integration | ✅ OK |
| T11 | crm-api provider (real adapter) | integration (deviation above floor) | integration | ✅ OK |
| T12 | crm-api repository | none (project floor) | none | ✅ OK |
| T13 | crm-api service | none (project floor) | none | ✅ OK |
| T14 | crm-api controller | none (project floor) | none | ✅ OK |
| T15 | crm-api router | e2e | e2e | ✅ OK |
| T16 | crm-api repository | none (project floor) | none | ✅ OK |
| T17 | crm-api service | none (project floor) | none | ✅ OK |
| T18 | crm-api controller | none (project floor) | none | ✅ OK |
| T19 | crm-api router | e2e | e2e | ✅ OK |
| T20 | crm-api `app.ts` | integration (existing smoke) | integration | ✅ OK |
| T21 | crm-api integration test | integration | integration | ✅ OK |

No violations — every `Tests: none` matches a layer the coverage matrix explicitly floors at
`none` (repository/service/controller, same convention as `platform`/`invite`/`auth`/
`field-template`), and every deviation from that floor (T9, T10, T11) is *above* the minimum,
never below it.

---

## Tips

- **Phases are ordered** — Each phase completes before the next; tasks run in order within a phase
- **Reuses = Token saver** — Always reference existing code
- **Dependencies are gates** — Clear what blocks what
- **Done when = Testable** — If you can't verify it, rewrite it
- **Requirement ID = Traceable** — Every task traces back to a spec requirement or an AD-NNN
- **One commit per task** — Plan the commit message format in advance
