# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — For a 'repeated request against existing pending state must invalidate-and-reissue' requirement, assert the reissue outcome (old token rejected, new token works, exactly one live record) — a test asserting 409-on-duplicate locks in rejection as the contract and hides that reuse was never built.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `idempotency/invite-resend/repositories` · harmful: 0
- features: foundation-tenancy-auth
- evidence: apps/crm-api/src/services/platform.service.ts:42-57; apps/crm-api/src/routers/platform.router.e2e.test.ts:195-214 (idempotency/invite-resend/repositories)
- last seen: 2026-09-03T23:33:09Z

### L-002 — When design.md commits to a per-operation instrument that is only named inside another component's Dependencies column, give it its own task during Tasks authoring — instrumentation mentioned as a side-detail of a different task is dropped silently and no Done-when criterion catches it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tasks-authoring/observability/instrumentation` · harmful: 0
- features: foundation-tenancy-auth
- evidence: .specs/features/foundation-tenancy-auth/design.md (Requirement→Component rows citing dbReqResTime); absent from implementation (tasks-authoring/observability/instrumentation)
- last seen: 2026-09-03T23:33:10Z

### L-003 — Run at least one manual smoke test against the real running Node process for any module importing a CommonJS package via 'import * as X from pkg' — Vitest's esbuild transform synthesizes named exports that real Node ESM cannot, so a fully green suite can ship with those functions undefined.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `build-runtime/esm-cjs-interop/auth` · harmful: 0
- features: foundation-tenancy-auth
- evidence: apps/crm-api/src/middlewares/authentication.middleware.ts:4; apps/crm-api/src/services/auth.service.ts:4; apps/crm-api/src/services/invite.service.ts:4 (fixed in aec2a83) (build-runtime/esm-cjs-interop/auth)
- last seen: 2026-09-03T23:33:10Z

### L-004 — Assert instrumentation on at least one real operation of an instrumented module, not only on the wrapper with fictitious operation names — otherwise the whole instrumentation can be deleted without turning a single test red.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `observability/instrumentation` · harmful: 0
- features: dynamic-field-engine
- evidence: M9 (validation.md Discrimination Sensor) — apps/crm-api/src/repositories/fieldTemplate.repository.ts:4,34,50,58,68,87,100,105 (observability/instrumentation)
- last seen: 2026-09-03T23:33:22Z

### L-005 — Assert a lifecycle flag's flipped value on the read endpoint that serves it, not only on the document in the database — the API layer can drop or hardcode the flag while the database assertion stays green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes/lifecycle-flags` · harmful: 0
- features: dynamic-field-engine
- evidence: M10 (validation.md Discrimination Sensor) — apps/crm-api/src/services/fieldTemplate.service.ts:73; apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:547-550 (routes/lifecycle-flags)
- last seen: 2026-09-03T23:33:22Z

### L-006 — Exercise a concurrency guard on the branch that does the expensive side-effect work, not only on the cheap branch — a concurrency test on the cheap path cannot detect the guard being reordered to after the work.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `concurrency/versioning` · harmful: 0
- features: dynamic-field-engine
- evidence: M13 (validation.md Discrimination Sensor) — apps/crm-api/src/services/fieldTemplate.service.ts:112-127; apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:504 (concurrency/versioning)
- last seen: 2026-09-03T23:33:22Z

### L-007 — When an operation claims a unique slot before doing work that can fail, assert the outcome of retrying it after that failure — an unreleased slot otherwise ships a permanent conflict response as the de facto contract.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `idempotency/retry/versioning` · harmful: 0
- features: dynamic-field-engine
- evidence: FLD-15 / nota D (validation.md) — apps/crm-api/src/services/fieldTemplate.service.ts:113,120-125; fieldTemplate.router.e2e.test.ts:483-490 (idempotency/retry/versioning)
- last seen: 2026-09-03T23:33:22Z

### L-008 — When an acceptance criterion has two halves (keep serving X but block new Y), give each half its own task and its own assertion — the half without a natural happy path is the one that ships unimplemented and unnoticed.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tasks-authoring/lifecycle` · harmful: 0
- features: dynamic-field-engine
- evidence: P1-AC6 / FLD-08 (validation.md) — apps/crm-api/src/services/fieldTemplate.service.ts:57-77; no route denies use by archived (tasks-authoring/lifecycle)
- last seen: 2026-09-03T23:33:38Z

### L-009 — When an acceptance criterion says behavior must still hold after state has advanced, assert it in that exact conjunction — a test on the pre-advance state plus a separate immutability test proves neither half of it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `versioning/e2e` · harmful: 0
- features: dynamic-field-engine
- evidence: P1-AC4 / FLD-06 (validation.md nota F) — apps/crm-api/tests/integration/tenant-isolation.int.test.ts:289; no route serves an arbitrary version (versioning/e2e)
- last seen: 2026-09-03T23:33:38Z

### L-010 — Write RBAC-denial tests with a non-privileged user inside the same tenant as the resource — a cross-tenant user makes the request fail on tenant scoping (404) and the 403 assertion never reaches the role check.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `rbac/routes/e2e` · harmful: 0
- features: dynamic-field-engine
- evidence: P1-AC5 / FLD-07 (validation.md nota E) — M7 kill 'expected 404 to be 403'; apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:518,593; seed helper at :131-133 (rbac/routes/e2e)
- last seen: 2026-09-03T23:33:38Z

### L-011 — When a spec qualifies a validation rule with a discriminator (validate an id 'respecting target'), either implement the discriminator or leave a // SPEC_DEVIATION marker — validating only the generic form silently narrows the requirement and passes review.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `field-engine/validation` · harmful: 0
- features: dynamic-field-engine
- evidence: P1-AC3 / FLD-02 (validation.md nota A) — packages/field-engine/src/validate.ts:62-65; validate.unit.test.ts:119 (field-engine/validation)
- last seen: 2026-09-03T23:33:38Z

### L-012 — State the concrete value an edge case must produce, not just that it must not throw — an outcome phrased only as 'returns pending/invalid, never throws' can only ever be tested as not.toThrow().
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec-authoring/field-engine` · harmful: 0
- features: dynamic-field-engine
- evidence: Edge case 'reference cujo target foi apagado' (validation.md Edge Cases) — packages/field-engine/src/hydrate.unit.test.ts:168-169 (spec-authoring/field-engine)
- last seen: 2026-09-03T23:33:38Z

### L-013 — Before promising a structured per-field error shape in design.md, confirm the shared response envelope actually supports it — do not let a design doc contradict a project-wide constraint like a message-only error envelope.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `error-handling` · harmful: 0
- features: crm-core
- evidence: spec.md CORE-02 AC2 / design.md Error Handling Strategy (error-handling)
- last seen: 2026-09-04T20:22:47Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
