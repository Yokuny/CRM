# Ops-Hardening Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is
the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review,
Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/ops-hardening/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling. Guidelines found: `.specs/STATE.md` AD-017 (test structure —
> Vitest `projects` named `unit`/`integration`/`e2e`/`structural`, suffix-based file naming, no
> `__test__` directory) and AD-031 (CI gate = `pnpm run check`). No dedicated coverage-depth
> guideline document exists (`AGENTS.md`/`CONTRIBUTING.md` not present) — coverage depth follows
> the strong default (1:1 to spec ACs, every listed edge case tested), floored by the depth of
> the closest existing precedent for each layer (`apps/ai-gateway/src/workers/reaper.int.test.ts`,
> `packages/ai-kit/src/providers/anthropicClient.unit.test.ts`, `evals/cases/happyPath.int.test.ts`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| CI / build config (`ci.yml`, `package.json` `engines`) | none | Build gate only — no runtime logic | `.github/workflows/ci.yml`, `package.json` | `pnpm run check` |
| HTTP route (`GET /metrics`) | e2e | Happy path + no-auth + empty-histogram edge case (mirrors `apps/ai-gateway/src/app.e2e.test.ts`'s `GET /health` style) | `apps/crm-api/src/app.e2e.test.ts` | `pnpm vitest run --project e2e` |
| Static config asset (Grafana dashboard JSON) | unit | Valid JSON + panel-count/content assertion (ties the artifact to OPS-06) | `apps/crm-api/src/metrics/*.unit.test.ts` | `pnpm vitest run --project unit` |
| Worker domain logic (`purgeExpiredConversations`) | integration | All branches; 1:1 to OPS-09/10/11 + boundary edge case (mirrors `reaper.int.test.ts`) | `apps/ai-gateway/src/workers/*.int.test.ts` | `pnpm vitest run --project integration` |
| Worker interval wrapper (`startRetentionPurge`) + composition wiring (`server.ts`) | integration + e2e | Tick/stop behavior (mirrors `reaper.int.test.ts`'s 5th test) + error-log-and-continue (mirrors `outboxConsumer.int.test.ts`'s `vi.spyOn(Model, method)` pattern) + flag on/off wiring (extends `app.e2e.test.ts`'s `start()` block) | `apps/ai-gateway/src/workers/*.int.test.ts`, `apps/ai-gateway/src/app.e2e.test.ts` | `pnpm vitest run --project integration --project e2e` |
| Env config field (`RETENTION_PURGE_ENABLED`) | none | No dedicated test file exists for `ai-gateway`'s `env.config.ts` today (floor); optional field with `.default()` needs no new fail-fast test | `apps/ai-gateway/src/config/env.config.ts` | `pnpm run check` |
| Pure threshold logic (`evaluateThreshold`) | unit | All branches; exact boundary at `4096` (1:1 to OPS-14/15) | `packages/ai-kit/scripts/*.unit.test.ts` | `pnpm vitest run --project unit` |
| CLI/composition-root entrypoint (`auditCacheThreshold.ts` main, `evals/replay/cli.ts`) | none | Thin wiring only (real network + real Mongo/file I/O); logic it calls is covered where it's injectable — mirrors `apps/ai-gateway/src/server.ts`'s untested `isMainModule` line | — | manual run, see task Done-when |
| Anonymization pure function (`anonymizeTranscript`) | unit | All branches; 1:1 to OPS-20 (phone/name/document patterns), synthetic PII only | `evals/replay/*.unit.test.ts` | `pnpm vitest run --project unit` |
| Replay orchestration (`runReplay`) | integration | 1:1 to OPS-17/18/19/21, DI-fake Anthropic client (golden-set style, reuses `evals/runner/expectTool.ts`) | `evals/replay/*.int.test.ts` | `pnpm vitest run --project integration` |
| Vitest config change (add `evals/**/*.unit.test.ts` to `unit` project) | none | Build gate only — verified by the very next task's test actually running | `vitest.config.ts` | `pnpm run check` |

**Coverage Expectation legend applied**: Domain/business logic (worker functions, threshold
logic, anonymization, replay orchestration) → all branches, 1:1 to spec ACs, every listed edge
case. Route → happy path + edge cases already listed in spec. Config/entity/CLI-wiring → none,
build gate only (matches the strong default's own carve-out for this layer type, plus the
project's own precedent of leaving `anthropicClient.ts`'s and `server.ts`'s outermost wiring
untested while their injectable cores are fully covered).

## Gate Check Commands

> Generated from `package.json` (root) and `.specs/STATE.md` AD-017/AD-031.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task with only unit tests | `pnpm vitest run --project unit --project structural` |
| Full | After a task with integration/e2e tests | `pnpm vitest run` |
| Build | After phase completion, or config/entity-only tasks | `pnpm run check` (= `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks
within a phase execute in order.

### Phase 1: CI Node pin

```
T1
```

### Phase 2: Metrics endpoint + dashboard-as-code

```
T2, T3
```

### Phase 3: Retention/LGPD worker (inactive by default)

```
T4, T5 → T6 → T7 (T7 also depends on T4)
```

### Phase 4: Cache threshold audit script

```
T8 → T9
```

### Phase 5: Replay pipeline scaffolding

```
T10 → T11, T12 → T13 (T13 depends on T12)
```

---

## Task Breakdown

### T1: Pin Node version in CI + document it in `package.json`

**What**: Change `.github/workflows/ci.yml`'s `actions/setup-node` step from `node-version: lts/*`
to `node-version: '24'`; add a non-blocking `engines.node` field (`>=24 <25`) to the root
`package.json`.
**Where**: `.github/workflows/ci.yml`, `package.json`
**Depends on**: None
**Reuses**: The `build-gate` job as-is — only the `node-version` value changes (AD-031's Build
gate command stays identical).
**Requirement**: OPS-01, OPS-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ci.yml` reads `node-version: '24'`
- [ ] Root `package.json` declares `"engines": { "node": ">=24 <25" }` without `engine-strict`
      (no `.npmrc` change) — `pnpm install` locally on a different major still succeeds
- [ ] Gate check passes: `pnpm run check`

**Tests**: none
**Gate**: build

**Commit**: `chore(ops): pin CI Node version to 24`

**Status**: ✅ Done — commit `7af1ef5`

---

### T2: `GET /metrics` endpoint on `apps/crm-api`

**What**: Add a `GET /metrics` route to `apps/crm-api/src/app.ts` (next to `/health`) that
responds with `prom-client`'s `register.metrics()` body and correct `Content-Type`, without the
`validToken` middleware. Create `apps/crm-api/src/app.e2e.test.ts` (new file, mirrors
`apps/ai-gateway/src/app.e2e.test.ts`'s structure) with the endpoint's e2e coverage.
**Where**: `apps/crm-api/src/app.ts` (modify), `apps/crm-api/src/app.e2e.test.ts` (new)
**Depends on**: None
**Reuses**: `apps/crm-api/src/app.ts:69` (`/health`'s unauthenticated-route pattern);
`dbReqResTime`/`reqResTime` (already registered on `prom-client`'s default `register` by
`db.metric.ts`/`responseTime.middleware.ts` — no new metric created); `apps/ai-gateway/src/app.e2e.test.ts`
(structure/style to mirror for the new crm-api file).
**Requirement**: OPS-03, OPS-04, OPS-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GET /metrics` responds `200`, `Content-Type: text/plain; version=0.0.4; charset=utf-8`,
      body containing `db_operation_duration_seconds` and `http_request_duration_seconds`
- [ ] Same route works with no `Authorization`/session cookie set (no `validToken`)
- [ ] Calling `/metrics` with zero prior requests still returns `200` (empty histograms, not an
      error)
- [ ] Gate check passes: `pnpm vitest run --project e2e`
- [ ] Test count: 3 new e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(ops): expose GET /metrics on crm-api`

**Status**: ✅ Done — commit `bd75e2a`

---

### T3: Grafana dashboard-as-code JSON

**What**: Create `ops/grafana/crm-api-dashboard.json`, a valid Grafana dashboard model with at
least 3 panels: (a) HTTP latency p50/p95 by route (`histogram_quantile` over
`http_request_duration_seconds_bucket`), (b) HTTP error rate by route
(`status_code=~"5.."` over `http_request_duration_seconds_count`), (c) DB operation latency by
`operation` (`histogram_quantile` over `db_operation_duration_seconds_bucket`). Add a unit test
that reads and validates the file's shape.
**Where**: `ops/grafana/crm-api-dashboard.json` (new), `apps/crm-api/src/metrics/dashboard.unit.test.ts` (new)
**Depends on**: None
**Reuses**: The metric names already registered by `db.metric.ts`/`responseTime.middleware.ts`
(`db_operation_duration_seconds{operation,success}`, `http_request_duration_seconds{method,route,status_code}`)
— no metric renamed or added.
**Requirement**: OPS-06, OPS-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ops/grafana/crm-api-dashboard.json` parses as valid JSON with a top-level `panels` array
      of length >= 3
- [ ] Each of the 3 required panels is present (asserted by title/PromQL substring: latency
      p50/p95 by route, HTTP error rate by route, DB operation latency by operation)
- [ ] Panels use only the two metric names above (no invented series) — importing the file into
      a Grafana instance with zero scraped data does not error (no external metric reference that
      would 400 at import time; this AC is verified structurally by the unit test, not by an
      actual Grafana import)
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: 1 new unit test file, >= 3 assertions, passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ops): add Grafana dashboard-as-code for crm-api metrics`

**Status**: ✅ Done — commit `1639fd5`

---

### T4: `RETENTION_PURGE_ENABLED` env flag

**What**: Add `RETENTION_PURGE_ENABLED: z.enum(['true', 'false']).default('false')` to
`apps/ai-gateway/src/config/env.config.ts`.
**Where**: `apps/ai-gateway/src/config/env.config.ts`
**Depends on**: None
**Reuses**: `MAIL_PROVIDER: z.enum([...]).default('log')` pattern from
`apps/crm-api/src/config/env.config.ts` (same enum-with-default shape).
**Requirement**: OPS-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `env.RETENTION_PURGE_ENABLED` is typed `'true' | 'false'`, defaults to `'false'` when unset
- [ ] No existing test's env fixture needs updating (field is optional with a default)
- [ ] Gate check passes: `pnpm run check`

**Tests**: none
**Gate**: build

**Commit**: `feat(ops): add RETENTION_PURGE_ENABLED env flag`

**Status**: ✅ Done — commit `8b50870`

---

### T5: `purgeExpiredConversations` pure function

**What**: Implement `purgeExpiredConversations(retentionMs: number): Promise<{conversations: number; messages: number; aiSessions: number}>`
in `apps/ai-gateway/src/workers/retentionPurge.ts` — selects `Conversation` ids with `createdAt`
older than `retentionMs`, then deletes in order: `Message` (by `Conversation` in ids) →
`AiSession` (by `Conversation` in ids) → `Conversation` (by `_id` in ids), returning counts.
Export a `TWELVE_MONTHS_MS` constant as the documented default retention period.
**Where**: `apps/ai-gateway/src/workers/retentionPurge.ts` (new),
`apps/ai-gateway/src/workers/retentionPurge.int.test.ts` (new)
**Depends on**: None
**Reuses**: `reapStuckMessages`'s shape (pure function, no internal try/catch — error handling
lives in the interval wrapper, T6) from `apps/ai-gateway/src/workers/reaper.ts`; `Conversation`/`Message`/`AiSession`
from `@crm/db`; the `seedMessage`-style fixture-builder pattern from `reaper.int.test.ts` (adapted
to seed `Conversation`/`Message`/`AiSession`).
**Requirement**: OPS-09, OPS-10, OPS-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A `Conversation` with `createdAt` older than `retentionMs`, plus its `Message`s and
      `AiSession`, are all deleted; a `Conversation` with `createdAt` newer than `retentionMs` is
      untouched (boundary case: exactly at the cutoff is treated as NOT yet expired, matching
      `reapStuckMessages`'s `$lt` convention)
- [ ] Deleting a `Conversation` removes every `Message`/`AiSession` referencing it — none left
      orphaned
- [ ] Running with nothing expired returns `{conversations: 0, messages: 0, aiSessions: 0}`
      without throwing
- [ ] Running the function twice in a row on the same expired data is safe (second run returns
      zeros, no error)
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: 4 new integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(ops): add purgeExpiredConversations retention function`

**Status**: ✅ Done — commit `3913ce4`

---

### T6: `startRetentionPurge` interval worker

**What**: Implement `startRetentionPurge(intervalMs = 86400000, retentionMs = TWELVE_MONTHS_MS): {stop: () => void}`
in the same `retentionPurge.ts`, mirroring `startReaper`'s `setInterval`/`clearInterval`/JSON-log-on-error
shape (`retentionPurge.tick_failed` event name).
**Where**: `apps/ai-gateway/src/workers/retentionPurge.ts` (modify),
`apps/ai-gateway/src/workers/retentionPurge.int.test.ts` (modify)
**Depends on**: T5
**Reuses**: `startReaper`'s exact `setInterval`/`{stop}` handle shape and
`console.error(JSON.stringify({event, message}))` error log format from `reaper.ts`;
`vi.spyOn(Model, 'method')` mocking pattern from `outboxConsumer.int.test.ts` for the error-path
test.
**Requirement**: OPS-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `startRetentionPurge(20, 50)` ticks on the given interval and calls
      `purgeExpiredConversations`; `stop()` halts further ticks (mirrors `reaper.int.test.ts`'s
      "ticks on the given interval and stop() halts further reaping" test, adapted)
- [ ] When a tick's `deleteMany` call rejects (simulated via `vi.spyOn(Message, 'deleteMany').mockRejectedValueOnce(...)`),
      the worker logs a JSON `retentionPurge.tick_failed` event via `console.error` and keeps
      running (verified by a subsequent successful tick after the failed one)
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: 2 new integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(ops): add startRetentionPurge interval worker`

**Status**: ✅ Done — commit `5567034`

---

### T7: Wire retention worker into `apps/ai-gateway` server bootstrap

**What**: Add `retentionPurgeEnabled?: boolean`, `retentionIntervalMs?: number`,
`retentionMs?: number` to `StartOptions`; in `start()`, call
`startRetentionPurge(...)` conditionally on `opts.retentionPurgeEnabled ?? env.RETENTION_PURGE_ENABLED === 'true'`
(always include its `stop()` in `stopWorkers`, as a no-op-safe handle even when never scheduled).
Extend `app.e2e.test.ts`'s `start()` describe block with two new tests.
**Where**: `apps/ai-gateway/src/server.ts` (modify), `apps/ai-gateway/src/app.e2e.test.ts` (modify)
**Depends on**: T6, T4
**Reuses**: The existing `opts.reaperIntervalMs`-style override pattern in `server.ts` (T32's
documented reason: let e2e tests inject short intervals without waiting for production defaults);
the same `start()` describe block in `app.e2e.test.ts`.
**Requirement**: OPS-08 (wiring-level confirmation), OPS-09 (wiring-level confirmation)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `start({ retentionPurgeEnabled: false, ... })` (or omitted, matching the default test env's
      `RETENTION_PURGE_ENABLED` absence) never deletes a seeded expired `Conversation` even after
      waiting past a short interval
- [ ] `start({ retentionPurgeEnabled: true, retentionIntervalMs: 10, retentionMs: 10, ... })`
      deletes a seeded expired `Conversation` (and its `Message`/`AiSession`) after a short wait
- [ ] `handle.stopWorkers()` still closes cleanly with the 4th worker included (no dangling
      timers — reuses the existing test's teardown)
- [ ] Gate check passes: `pnpm run check`
- [ ] Test count: 2 new e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(ops): wire retention purge worker into ai-gateway startup`

**Status**: ✅ Done — commit `35df4f6` (also folds in two gate-only fixes from T3/T6 that only surfaced under the full build gate: a biome format fix in `dashboard.unit.test.ts` and a type-only fix in `retentionPurge.int.test.ts`)

---

### T8: `evaluateThreshold` pure function

**What**: Implement `evaluateThreshold(tokenCount: number, limit = 4096): {overLimit: boolean; tokenCount: number; limit: number}`
in `packages/ai-kit/scripts/auditCacheThreshold.ts`.
**Where**: `packages/ai-kit/scripts/auditCacheThreshold.ts` (new),
`packages/ai-kit/scripts/auditCacheThreshold.unit.test.ts` (new)
**Depends on**: None
**Reuses**: Nothing existing to reuse — this is a new, small pure function; naming/shape mirrors
other injectable-boundary functions in `packages/ai-kit/src/providers/`.
**Requirement**: OPS-14, OPS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `evaluateThreshold(4095)` → `overLimit: false`
- [ ] `evaluateThreshold(4096)` → `overLimit: true` (exact boundary, matches spec's `>= 4096`)
- [ ] `evaluateThreshold(10000)` → `overLimit: true`
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: 3 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ops): add evaluateThreshold pure function for cache audit`

**Status**: ✅ Done — commit `cad32ad`

---

### T9: Cache audit CLI wiring + root script

**What**: Add the CLI body to `auditCacheThreshold.ts`: call
`createAnthropicClient(env.ANTHROPIC_API_KEY).client.messages.countTokens({model, system: SYSTEM_PROMPT, tools: TOOL_DEFINITIONS, messages: []})`
(real SDK call), pass the result to `evaluateThreshold`, print the exact count, exit `0`/non-zero
accordingly; on a `countTokens` rejection, print a message distinct from the over-limit message
and exit non-zero. Add `"audit:cache": "tsx packages/ai-kit/scripts/auditCacheThreshold.ts"` to
root `package.json`.
**Where**: `packages/ai-kit/scripts/auditCacheThreshold.ts` (modify), `package.json` (modify)
**Depends on**: T8
**Reuses**: `SYSTEM_PROMPT` (`packages/ai-kit/src/contextBuild.ts`), `TOOL_DEFINITIONS`
(`packages/ai-kit/src/tools/toolDefinitions.ts`), `createAnthropicClient`
(`packages/ai-kit/src/providers/anthropicClient.ts`) — all imported, none modified; `tsx` (root
devDependency, same invocation style as `"dev": "tsx watch src/server.ts"`).
**Requirement**: OPS-13, OPS-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm run audit:cache` (run manually, with a real `ANTHROPIC_API_KEY` in the environment)
      prints an exact token count well below 4096 and exits `0`
- [ ] Reading the code confirms: a `countTokens` rejection produces a distinct error message
      (network/config) vs. the over-limit message, per OPS-16 (not automatable without live
      network — verified by code review + the T8 unit tests covering the threshold branch)
- [ ] `pnpm run check` still passes (script is not part of `check`, but must type-check and lint)
- [ ] Gate check passes: `pnpm run check`

**Tests**: none (thin CLI wiring; core logic covered by T8)
**Gate**: build

**Commit**: `feat(ops): wire cache threshold audit CLI`

**Status**: ✅ Done — commit `c58b5f8` (also exports `SYSTEM_PROMPT` from `contextBuild.ts`,
which was module-private — a one-keyword addition outside this task's `Where`, required so the
audit script can import the real frozen prompt instead of duplicating it)

---

### T10: Extend `vitest.config.ts` to collect `evals/**/*.unit.test.ts`

**What**: Add `'evals/**/*.unit.test.ts'` to the `unit` project's `include` array in
`vitest.config.ts`, so a no-Mongo unit test under `evals/replay/` is actually collected (today only
`evals/**/*.int.test.ts` is swept, by the `integration` project).
**Where**: `vitest.config.ts` (modify)
**Depends on**: None
**Reuses**: The exact same rationale already documented inline for `evals/**/*.int.test.ts` in the
`integration` project ("evals/ vive fora de packages/\*/apps/\*, sem este glob nenhum project
coletaria os arquivos").
**Requirement**: (infrastructure prerequisite for OPS-20 — no requirement ID of its own)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `unit` project's `include` array contains `'evals/**/*.unit.test.ts'`
- [ ] Gate check passes: `pnpm run check` (still green with `passWithNoTests: true` before T11
      adds the first matching file)

**Tests**: none
**Gate**: build

**Commit**: `chore(ops): collect evals/**/*.unit.test.ts in the unit project`

**Status**: ✅ Done — commit `8551e00`

---

### T11: `anonymizeTranscript` pure function

**What**: Implement `anonymizeTranscript(text: string): string` in `evals/replay/anonymize.ts` —
replaces Brazilian phone patterns, full-name patterns, and CPF/CNPJ patterns with `[TELEFONE]`,
`[NOME]`, `[DOCUMENTO]` respectively.
**Where**: `evals/replay/anonymize.ts` (new), `evals/replay/anonymize.unit.test.ts` (new)
**Depends on**: T10
**Reuses**: Nothing existing — first anonymization utility in the repo; the test file is only
collected because of T10.
**Requirement**: OPS-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A Brazilian phone pattern (e.g. `11987654321`, `(11) 98765-4321`) in the input is replaced
      with `[TELEFONE]`
- [ ] A full-name pattern (two or more capitalized words) is replaced with `[NOME]`
- [ ] A CPF (`000.000.000-00`) or CNPJ (`00.000.000/0000-00`) pattern is replaced with
      `[DOCUMENTO]`
- [ ] Text with none of these patterns passes through unchanged
- [ ] All test fixtures use synthetic, invented PII — never real data
- [ ] Gate check passes: `pnpm vitest run --project unit`
- [ ] Test count: 4 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ops): add anonymizeTranscript for replay pipeline`

**Status**: ✅ Done — commit `9b0fff9`

---

### T12: `runReplay` orchestration function

**What**: Implement `runReplay(transcripts: ReplayTranscript[], deps: {createMessage: AnthropicClient['createMessage']}, baselineDir: string): Promise<ReplayReport[]>`
in `evals/replay/runReplay.ts` — for each transcript, bootstraps a fixture (Tenant/Channel/Customer/FieldTemplate,
molded on `happyPath.int.test.ts`), runs `runTurn` per customer message, collects
`{tool, order}[]` via `collectToolCalls`, and either writes a new baseline file (first run) or
diffs against the existing one (tool name/order only, never exact text) — never aborting the
batch when one transcript references an unknown tool.
**Where**: `evals/replay/runReplay.ts` (new), `evals/replay/runReplay.int.test.ts` (new),
`evals/replay/samples/example.json` (new, minimal synthetic sample used by the test)
**Depends on**: None
**Reuses**: `expectTool`/`collectToolCalls` (`evals/runner/expectTool.ts`); the fixture-bootstrap
pattern and FAKE-client shape from `evals/cases/happyPath.int.test.ts`; `runTurn` (`@crm/ai-kit`);
`MongoMemoryServer` via the existing `packages/db/tests/setup/globalSetup.ts` (already wired to
the `integration` project).
**Requirement**: OPS-17, OPS-18, OPS-19, OPS-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Given a transcript with no existing baseline, `runReplay` writes one under `baselineDir` and
      reports no divergence (OPS-19)
- [ ] Given a transcript whose FAKE client now returns a different tool (name or order) than the
      stored baseline, `runReplay` reports that transcript as diverged, comparing structure only
      (never the exact output text) (OPS-18)
- [ ] Given a transcript referencing a tool name absent from `TOOL_DEFINITIONS`, `runReplay` marks
      that transcript `status: 'stale'` and still processes the remaining transcripts in the batch
      (OPS-21)
- [ ] The report for a normal transcript includes the ordered list of tool calls and the final
      assistant text (OPS-17)
- [ ] Gate check passes: `pnpm vitest run --project integration`
- [ ] Test count: 3 new integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(ops): add runReplay orchestration for replay pipeline`

**Status**: ✅ Done — commit `afa2a1c`

---

### T13: Replay CLI entrypoint + root script

**What**: Implement `evals/replay/cli.ts` — reads `evals/replay/samples/*.json`, connects to Mongo
(ephemeral `MongoMemoryServer` started by the script itself), wires the REAL
`createAnthropicClient(env.ANTHROPIC_API_KEY)`, calls `runReplay` against `evals/replay/baselines/`,
prints a console report, only persists a changed baseline when run with `--update`, and exits
non-zero on unconfirmed divergence. Add `"replay": "tsx evals/replay/cli.ts"` to root
`package.json` (never added to `check`).
**Where**: `evals/replay/cli.ts` (new), `package.json` (modify)
**Depends on**: T12
**Reuses**: `runReplay` (T12), `createAnthropicClient`, `MongoMemoryServer` (already a
devDependency via `packages/db`'s test setup), `connect`/`disconnect` (`@crm/db`).
**Requirement**: OPS-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm run replay` (run manually, with a real `ANTHROPIC_API_KEY`) processes
      `evals/replay/samples/example.json`, prints a report, and writes an initial baseline file
      under `evals/replay/baselines/`
- [ ] `cli.ts` is not a `*.test.ts` file and is not referenced by any `include` in
      `vitest.config.ts` — confirmed by inspection that `pnpm run check` never invokes `tsx`
- [ ] `pnpm run check` still passes (script must type-check and lint, but is not executed by it)
- [ ] Gate check passes: `pnpm run check`

**Tests**: none (thin CLI wiring; core logic covered by T12)
**Gate**: build

**Commit**: `feat(ops): add replay CLI entrypoint`

**Status**: ✅ Done — commit `2437a97` (also adds `mongodb-memory-server` as a root
devDependency, pinned to the same `11.2.0` already used by `packages/db` — `cli.ts` lives outside
any workspace package and could not otherwise resolve it; `package.json` was already in this
task's `Where`, `pnpm-lock.yaml`'s update is the mechanical side effect of `pnpm install`)

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in
order:

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T2   T3
Phase 3:  T4   T5 ──→ T6 ──→ T7
                      ▲             (T7 also depends on T4)
                      │
                     T4 ─────────────┘
Phase 4:  T8 ──→ T9
Phase 5:  T10 ──→ T11    T12 ──→ T13
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch
worker) works one task at a time, in order.

**How phase-based execution works:** 13 tasks total. Packing into ~7-task batches lands cleanly
on phase boundaries: **Batch 1** = Phase 1 + Phase 2 + Phase 3 (1 + 2 + 4 = 7 tasks); **Batch 2**
= Phase 4 + Phase 5 (2 + 4 = 6 tasks). Sub-agent delegation will be offered at Execute time per
the skill's standard offer-then-confirm flow.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Pin Node version in CI | 2 config files, 1 concept (version pin) | ✅ Granular |
| T2: `GET /metrics` endpoint | 1 route + its e2e test | ✅ Granular |
| T3: Grafana dashboard JSON | 1 static asset + its validation test | ✅ Granular |
| T4: `RETENTION_PURGE_ENABLED` env flag | 1 field, 1 file | ✅ Granular |
| T5: `purgeExpiredConversations` | 1 function + its integration tests | ✅ Granular |
| T6: `startRetentionPurge` | 1 function (same file as T5, additive) + its tests | ✅ Granular |
| T7: Wire retention worker into server | 1 composition change + its e2e tests | ✅ Granular |
| T8: `evaluateThreshold` | 1 pure function + its unit tests | ✅ Granular |
| T9: Cache audit CLI wiring | 1 CLI body + 1 package.json script | ✅ Granular |
| T10: Extend `vitest.config.ts` | 1 config line | ✅ Granular |
| T11: `anonymizeTranscript` | 1 pure function + its unit tests | ✅ Granular |
| T12: `runReplay` | 1 orchestration function + its integration tests + 1 sample fixture | ✅ Granular |
| T13: Replay CLI entrypoint | 1 CLI file + 1 package.json script | ✅ Granular |

**Granularity check**: all 13 tasks are single-component/single-function scope, each producing
one cohesive, atomically-committable deliverable. No task touches more than 2-3 closely related
files.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | (no incoming arrow) | ✅ Match |
| T2 | None | (no incoming arrow) | ✅ Match |
| T3 | None | (no incoming arrow) | ✅ Match |
| T4 | None | (no incoming arrow) | ✅ Match |
| T5 | None | (no incoming arrow) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6, T4 | T6 → T7, T4 → T7 | ✅ Match |
| T8 | None | (no incoming arrow) | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | None | (no incoming arrow) | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | (no incoming arrow) | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

**Rules verified**: every `Depends on` has a corresponding diagram arrow; every diagram arrow
corresponds to a declared dependency; no task depends on a later-phase task.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ---------------- | ---------- | ------ |
| T1: Pin Node version | CI/build config | none | none | ✅ OK |
| T2: `GET /metrics` | HTTP route | e2e | e2e | ✅ OK |
| T3: Dashboard JSON | Static config asset | unit | unit | ✅ OK |
| T4: Env flag | Env config field | none | none | ✅ OK |
| T5: `purgeExpiredConversations` | Worker domain logic | integration | integration | ✅ OK |
| T6: `startRetentionPurge` | Worker interval wrapper | integration | integration | ✅ OK |
| T7: Server wiring | Composition wiring | integration + e2e (highest: e2e for the wiring layer itself) | e2e | ✅ OK |
| T8: `evaluateThreshold` | Pure threshold logic | unit | unit | ✅ OK |
| T9: Cache audit CLI | CLI/composition-root entrypoint | none | none | ✅ OK |
| T10: Vitest config | Vitest config change | none | none | ✅ OK |
| T11: `anonymizeTranscript` | Anonymization pure function | unit | unit | ✅ OK |
| T12: `runReplay` | Replay orchestration | integration | integration | ✅ OK |
| T13: Replay CLI | CLI/composition-root entrypoint | none | none | ✅ OK |

**Rules verified**: no task uses "tested in another task" as a justification for `Tests: none` —
every `none` in this table corresponds exactly to a `none` in the Test Coverage Matrix for that
layer, with the rationale (thin composition-root wiring around an already-tested injectable core,
or config with no runtime branch) stated inline in the matrix.

---

## Tools & Skills

No MCP or skill dependency identified for any task — all 13 are plain TypeScript/config edits
using tools already available (Read/Edit/Write/Bash, Vitest, `tsx`, the Anthropic SDK already a
project dependency). If this differs from what you expected, let me know which MCP/skill you'd
like applied to which task before Execute starts.
