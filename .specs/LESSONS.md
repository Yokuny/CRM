# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-026 — When a task's What description names a specific function mirroring an existing pattern (e.g. a by-id query), verify during Tasks that a corresponding backend endpoint is actually planned before assigning the task, so implementers don't discover the mismatch mid-Execute.
- signal: `spec_deviation` · recurrence: 2 feature(s) · scope: `tasks` · harmful: 0
- features: inbox-realtime, catalog-orders
- evidence: apps/web/src/query/conversation.ts:31 (tasks) (+1 more)
- last seen: 2026-09-09T16:52:33Z

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

### L-014 — For a column-based board view backed by independent per-column server queries, write a test that seeds items across multiple distinct columns (including one with zero matches) simultaneously and asserts each column's own query and empty-column rendering, not just a single-item single-status drag scenario.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes/kanban` · harmful: 0
- features: crm-web-shell
- evidence: spec.md WEB-02 AC2/AC3 / apps/web/src/routes/_private/customers/kanban/index.unit.test.tsx (routes/kanban)
- last seen: 2026-09-05T18:39:47Z

### L-015 — When a feature adds new repository operations wrapped in an existing observability helper (e.g. withDbTiming), extend that feature's own e2e observability test to actually call the new endpoints and assert their specific operation labels appear, rather than leaving the pre-existing observability test's assertion list unextended.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `observability` · harmful: 0
- features: crm-web-shell
- evidence: spec.md WEB-16 / apps/crm-api/src/routers/customer.router.e2e.test.ts:696-710, fieldTemplate.router.e2e.test.ts:1029-1057 (observability)
- last seen: 2026-09-05T18:39:53Z

### L-016 — Before treating the Build gate's chained tsc/biome/vitest command exit code as a real failure, independently confirm any biome error is inside this feature's diff range (git log/diff on the flagged file against the pre-feature baseline) — a pre-existing, out-of-scope formatting issue elsewhere in the repo will otherwise always break the && chain before vitest runs and must be handled by running vitest as a separate step, not treated as a gate failure.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `gate-check` · harmful: 0
- features: crm-web-shell
- evidence: .specs/lessons.json (pre-existing biome formatting error, unrelated to this feature's diff) (gate-check)
- last seen: 2026-09-05T18:39:59Z

### L-017 — Before closing Tasks authoring, confirm every requirement ID in spec.md's traceability table is named in at least one task's Requirement field in tasks.md — a requirement can satisfy a 'nenhum unmapped' coverage claim in prose while never actually being assigned to any task, and ships fully unimplemented.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tasks-authoring/observability` · harmful: 0
- features: ai-gateway
- evidence: AIG-44 / .specs/features/ai-gateway/tasks.md (no task references AIG-44 in its Requirement field) (tasks-authoring/observability)
- last seen: 2026-09-07T18:09:39Z

### L-018 — When a spec requires throttling a secondary side-effect to 'at most N per window' (e.g. one warning message per rate-limit window), implement a dedicated last-sent timestamp for that side-effect — a counter that only gates the primary action lets every excess event still re-fire the secondary side-effect once per event.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `rate-limiting/guardrails` · harmful: 0
- features: ai-gateway
- evidence: AIG-11 / packages/ai-kit/src/runTurn.ts:87-90 (dispatchFixedReply called unconditionally on every guard_rejected outcome) (rate-limiting/guardrails)
- last seen: 2026-09-07T18:09:39Z

### L-019 — When a spec enumerates a closed list of variant types requiring identical treatment, write a test that iterates that exact literal list — a type-mapping switch or lookup that recognizes only a subset silently drops the rest into a generic fallback with zero failing test.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `message-ingestion/type-mapping` · harmful: 0
- features: ai-gateway
- evidence: AIG-48 / apps/ai-gateway/src/routers/webhook.router.ts:48-56 (mapMessageType/extractMediaId recognize only 3 of the 5 spec-listed non-text types) (message-ingestion/type-mapping)
- last seen: 2026-09-07T18:09:49Z

### L-020 — When a cross-tenant isolation acceptance criterion names multiple collections in one sentence, give each named collection its own dedicated assertion — proving isolation on some of them does not evidence it for the others, even when they are structurally coupled (e.g. 1:1 via a unique index).
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-isolation/testing` · harmful: 0
- features: ai-gateway
- evidence: AIG-41 / apps/crm-api/tests/integration/tenant-isolation.int.test.ts:584-673 (extension covers Channel + find_or_create_customer only, not AiSession named in the same AC) (tenant-isolation/testing)
- last seen: 2026-09-07T18:09:49Z

### L-021 — When a spec requires that a second producer's output 'follows the same path' as an already-tested first producer's, write one end-to-end test that creates the record via the second producer and drives it through the shared consumer — the absence of a discriminator field in the code is not the same as a tested guarantee.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `queue-consumer/testing` · harmful: 0
- features: ai-gateway
- evidence: AIG-38 / apps/ai-gateway/src/workers/outboxConsumer.int.test.ts (only seeds via Message.create directly, never via createOutboundMessage/the manual-send endpoint) (queue-consumer/testing)
- last seen: 2026-09-07T18:09:59Z

### L-022 — When a later, same-day decision (e.g. a project-wide tooling ADR) supersedes an earlier decision's implementation-mechanics text, update the earlier decision's own status/text in STATE.md to point at the newer one — do not leave the conflict to be silently reconciled only via a code-level SPEC_DEVIATION comment discovered later by a future feature.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `decision-log/adr-hygiene` · harmful: 0
- features: ai-gateway
- evidence: evals/runner/expectTool.ts:14-19 (SPEC_DEVIATION: ADR-0013's YAML DSL superseded by same-day AD-015 fixing Vitest as the only runner, reconciled only in a code comment) (decision-log/adr-hygiene)
- last seen: 2026-09-07T18:09:59Z

### L-023 — Before wiring an existing local gate script into an automated CI workflow, first run that exact script clean end-to-end against the current default branch — a pre-existing exit-code failure a human Verifier already knows to read past (e.g. a machine-owned file's formatting nit) will make every single CI run fail identically, since CI has no equivalent judgment to distinguish accepted baseline noise from a real regression.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `ci-cd/gate-check` · harmful: 0
- features: ai-gateway
- evidence: .github/workflows/ci.yml / c2e3468 (pnpm biome check . exits 1 deterministically on the current tree due to the unaddressed pre-existing .specs/lessons.json formatting baseline) (ci-cd/gate-check)
- last seen: 2026-09-07T19:49:53Z

### L-024 — When a spec AC requires displaying another entity's name and no directory/lookup endpoint is in the task's declared scope, resolve the name server-side in the same response instead of shipping a generic placeholder label in the UI.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/web` · harmful: 0
- features: inbox-realtime
- evidence: spec.md INBOX-10/AC5 — apps/web/src/routes/_private/inbox/@components/takeover-badge.tsx:74 (apps/web)
- last seen: 2026-09-08T22:22:31Z

### L-025 — A WebSocket reconnect handler must trigger a query-cache resync (invalidateQueries) for the data it mirrors, not just resubscribe to rooms, or messages missed during the outage are silently dropped.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/web` · harmful: 0
- features: inbox-realtime
- evidence: spec.md Edge Cases (WS disconnect) — apps/web/src/hooks/useInboxSocket.ts:111-116 (apps/web)
- last seen: 2026-09-08T22:22:35Z

### L-027 — When a conditional-write guard exists specifically to defend an atomic read-modify-write race between concurrent callers, write at least one test that issues genuinely concurrent (Promise.all) calls against the same document — a sequential-call test can pass even after the atomic filter's guarding condition is deleted, because an earlier non-atomic read-check silently absorbs the sequential case.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `db-transitions` · harmful: 0
- features: payments-asaas
- evidence: packages/db/src/paymentTransitions.ts:105 (mutant #5, validation.md Discrimination Sensor) (db-transitions)
- last seen: 2026-09-09T22:35:43Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
