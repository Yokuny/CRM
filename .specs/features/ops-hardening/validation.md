# Ops-Hardening Validation

**Date**: 2026-09-13
**Spec**: `.specs/features/ops-hardening/spec.md`
**Diff range**: `2f3e2bc..HEAD` (branch `feature/ops-hardening`, 15 commits, 23 files changed, +1203/-7)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh read of spec/design/tasks/diff, no prior context inherited

---

## Task Completion

| Task | Status  | Commit    | Notes |
| ---- | ------- | --------- | ----- |
| T1   | ✅ Done | `7af1ef5` | ci.yml + package.json engines, verified |
| T2   | ✅ Done | `bd75e2a` | `GET /metrics`, verified |
| T3   | ✅ Done | `1639fd5` | Grafana dashboard JSON, verified |
| T4   | ✅ Done | `8b50870` | env flag, verified |
| T5   | ✅ Done | `3913ce4` | `purgeExpiredConversations`, verified |
| T6   | ✅ Done | `5567034` | `startRetentionPurge`, verified |
| T7   | ✅ Done | `35df4f6` | server wiring, verified |
| T8   | ✅ Done | `cad32ad` | `evaluateThreshold`, verified |
| T9   | ✅ Done | `c58b5f8` | CLI wiring, verified (see OPS-13/16 coverage note below) |
| T10  | ✅ Done | `8551e00` | vitest.config.ts glob, verified |
| T11  | ✅ Done | `9b0fff9` | `anonymizeTranscript`, verified |
| T12  | ✅ Done | `afa2a1c` | `runReplay`, verified |
| T13  | ✅ Done | `2437a97` | replay CLI entrypoint, verified |

All 13 tasks done, none blocked/partial.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **OPS-01** CI uses fixed Node version | `node-version: '24'` in `ci.yml`, not `lts/*` | `.github/workflows/ci.yml:17` — `node-version: '24'` (direct inspection) | ✅ PASS |
| **OPS-02** root `package.json` declares compatible `engines.node`, non-blocking | `engines.node` = `>=24 <25`, no `engine-strict` | `package.json:7` — `"node": ">=24 <25"`; empirically confirmed non-blocking: our own `pnpm run check` run printed `[WARN] Unsupported engine: wanted: {"node":">=24 <25"} (current: {"node":"v26.5.0"...})` and proceeded (warning, not failure) | ✅ PASS |
| **OPS-03** `GET /metrics` responds 200 w/ `register.metrics()` body incl. both series | status 200, body contains `db_operation_duration_seconds` and `http_request_duration_seconds` | `apps/crm-api/src/app.e2e.test.ts:38` — `expect(res.status).toBe(200); expect(res.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8'); expect(res.text).toContain('db_operation_duration_seconds'); expect(res.text).toContain('http_request_duration_seconds')` | ✅ PASS |
| **OPS-04** `/metrics` works without `validToken` | 200 with no Authorization/session cookie | `apps/crm-api/src/app.e2e.test.ts:47` — `expect(res.status).toBe(200)` (no auth header/cookie set by the request) | ✅ PASS |
| **OPS-05** `/metrics` before any request through `responseTime` → empty histograms, never error | 200, no populated sample lines, only HELP/TYPE metadata | `apps/crm-api/src/app.e2e.test.ts:26` — `expect(res.status).toBe(200); expect(res.text).not.toMatch(/http_request_duration_seconds_bucket\{/); expect(res.text).not.toMatch(/db_operation_duration_seconds_bucket\{/)`, run as the first test in the file (ordering documented and load-bearing) | ✅ PASS |
| **OPS-06** dashboard JSON imports with ≥3 panels (latency p50/p95, error rate, DB latency) | valid JSON, `panels.length >= 3`, each of the 3 panels present by title+PromQL substring | `apps/crm-api/src/metrics/dashboard.unit.test.ts:17,22,34,43` — asserts `panels.length >= 3` and each panel's `expr` contains `histogram_quantile(0.50`/`0.95`, `status_code=~"5.."`, `by (le, operation)` respectively | ✅ PASS |
| **OPS-07** dashboard import never errors even with zero scrape data | structurally verified: panels reference only the two already-registered metrics | `apps/crm-api/src/metrics/dashboard.unit.test.ts:54` — every metric ref in all panel exprs matches `http_request_duration_seconds_*` or `db_operation_duration_seconds_*` | ✅ PASS (spec explicitly scopes this to structural verification, not a live Grafana import — matches tasks.md T3 Done-when) |
| **OPS-08** flag unset/`"false"` → worker never schedules, nothing deleted | expired `Conversation` survives a full wait past a short interval | `apps/ai-gateway/src/app.e2e.test.ts:109` — `expect(await Conversation.findById(conversation._id).lean()).not.toBeNull()` after waiting past `retentionIntervalMs:10` with `retentionPurgeEnabled` left at env default | ✅ PASS |
| **OPS-09** flag `"true"` → worker runs periodically, hard-deletes expired `Conversation`/`Message`/`AiSession` via pure fn on `createdAt` | boundary at `retentionMs`, `$lt` (not `$lte`) convention | `apps/ai-gateway/src/workers/retentionPurge.int.test.ts:59` — `expect(result.conversations).toBe(1)`, fresh + at-cutoff untouched (fake timers pin the boundary deterministically); wiring-level: `apps/ai-gateway/src/app.e2e.test.ts:144` — real deletion via `start({retentionPurgeEnabled:true,...})` | ✅ PASS |
| **OPS-10** cascade: deleting expired `Conversation` deletes all its `Message`/`AiSession`, no orphans | zero orphaned docs after purge | `apps/ai-gateway/src/workers/retentionPurge.int.test.ts:93` — `expect(result.messages).toBe(3); expect(result.aiSessions).toBe(1); expect(await Message.countDocuments(...)).toBe(0); expect(await AiSession.countDocuments(...)).toBe(0)` (re-queries Mongo state, not just call-check); e2e-level: `apps/ai-gateway/src/app.e2e.test.ts:178-180` re-queries `Conversation`/`Message`/`AiSession` by id after a real worker run | ✅ PASS — payload/conjunction check satisfied (see Sensor §, mutant 3) |
| **OPS-11** nothing expired → `{conversations:0, messages:0, aiSessions:0}`, no throw, idempotent | exact zero-object, safe to re-run | `apps/ai-gateway/src/workers/retentionPurge.int.test.ts:109` — `expect(result).toEqual({conversations:0, messages:0, aiSessions:0})`; idempotency at `:117` — second run on same expired data returns zeros | ✅ PASS |
| **OPS-12** delete error → log (same pattern as `reaper.tick_failed`) and continue, never crash | JSON log event, next tick still succeeds | `apps/ai-gateway/src/workers/retentionPurge.int.test.ts:163` — `expect(loggedEvents).toContainEqual({event:'retentionPurge.tick_failed', message:'Mongo indisponível'})` via `vi.spyOn(Message,'deleteMany').mockRejectedValueOnce`, then confirms deletion still completes on the next tick | ✅ PASS |
| **OPS-13** script computes real token count of `SYSTEM_PROMPT` + all `TOOL_DEFINITIONS.input_schema` | real API composition, not char-estimate | `packages/ai-kit/scripts/auditCacheThreshold.ts:39-45` calls `client.messages.countTokens({model, system: SYSTEM_PROMPT, tools: TOOL_DEFINITIONS, messages: []})` (confirmed by direct code read) — **no automated test exercises this composition**; only `evaluateThreshold` (the threshold decision on an already-obtained number) is unit tested | ⚠️ GAP (evidence-or-zero): zero `file:line` test citation for the counting composition itself — code-inspection only. Consistent with tasks.md's own Test Coverage Matrix ("CLI/composition-root entrypoint... Tests: none — thin wiring, real network"), same precedent as `anthropicClient.ts`'s untested outer boundary |
| **OPS-14** total `>= 4096` → non-zero exit + `cache_control` message | exact boundary at 4096, `>=` semantics | `packages/ai-kit/scripts/auditCacheThreshold.unit.test.ts:11` — `expect(evaluateThreshold(4096)).toEqual({overLimit:true, tokenCount:4096, limit:4096})` | ✅ PASS (decision logic proven exactly at boundary; the outer `process.exit(1)`/message print in `run()` at `auditCacheThreshold.ts:54-55` is code-inspected, not test-executed — same wiring carve-out as OPS-13) |
| **OPS-15** total `< 4096` → exit 0, report exact number | `overLimit:false`, exact `tokenCount` value reported | `packages/ai-kit/scripts/auditCacheThreshold.unit.test.ts:7` — `expect(evaluateThreshold(4095)).toEqual({overLimit:false, tokenCount:4095, limit:4096})` | ✅ PASS (same wiring caveat as OPS-14: `console.log` at `auditCacheThreshold.ts:59` prints the exact count, code-inspected not test-executed) |
| **OPS-16** `countTokens` fails (network/API key) → distinct error, non-zero exit | message must differ from the over-limit message | `packages/ai-kit/scripts/auditCacheThreshold.ts:31-32` (missing key) and `:47-48` (rejected call) produce messages textually distinct from `:54` (over-limit) — confirmed correct by direct code read | ⚠️ GAP (evidence-or-zero): **zero** `file:line` automated test citation — `run()` is not exported/injectable, so no test can simulate a rejected `countTokens` call or missing key. tasks.md's own Test Coverage Matrix documents this as untestable-without-live-network and defers to code review; this is a real, if minor and precedented, coverage gap |
| **OPS-17** replay processes a transcript against real `runTurn`, reports ordered tool calls + final text | exact ordered `{tool,order}[]` + `finalText` string | `evals/replay/runReplay.int.test.ts:100-117` — `expect(report).toEqual({name:'example', status:'baseline_written', toolCalls:[{tool:'find_or_create_customer',order:0},{tool:'open_process',order:1},{tool:'set_process_fields',order:2}], finalText: FINAL_TEXT})` | ✅ PASS |
| **OPS-18** divergence detection vs. baseline, structure only (never LLM-judge/text) | flags tool-name/order divergence, ignores final text | `evals/replay/runReplay.int.test.ts:131-156` — `expect(report.status).toBe('diverged'); expect(report.toolCalls).toEqual([...]); expect(report.baselineToolCalls).toEqual([...]); expect(report.finalText).toBe('Só cadastrei o cliente, nada mais.')` (final text intentionally differs from baseline's text yet is not part of the diverged decision) | ✅ PASS |
| **OPS-19** no baseline exists yet → write current result as baseline, no divergence reported | baseline file written, `status` never `diverged` on first run | `evals/replay/runReplay.int.test.ts:119-126` — `const written = JSON.parse(await readFile(path.join(baselineDir,'example.json'),'utf8')); expect(written).toEqual({toolCalls:[...]})` (reads the actual written file, not just a call-check) | ✅ PASS — payload/conjunction check satisfied |
| **OPS-20** anonymize phone/full-name/CPF-CNPJ → placeholders before any write | exact placeholder substitution, exact strings | `evals/replay/anonymize.unit.test.ts:9,15,21,27` — e.g. `expect(anonymizeTranscript(input)).toBe('Pode me ligar no [TELEFONE] ou no [TELEFONE], tanto faz.')` and 3 more exact-string cases (name, CPF/CNPJ, unchanged) | ✅ PASS (see Sensor §, mutant 4 — regex *order* is not pinned by any test, though functionally inert given the current pattern set) |
| **OPS-21** transcript referencing unknown tool → reported as stale/broken, batch continues | rest of batch still processed | `evals/replay/runReplay.int.test.ts:161-179` — `expect(reports[0]).toEqual({name:'broken-sample', status:'stale', unknownTools:['not_a_real_tool']}); expect(reports[1].status).toBe('baseline_written')` | ✅ PASS |
| **OPS-22** replay runner (`pnpm run replay`) stays outside `pnpm run check` | `cli.ts` never matched by any Vitest `include`, never a `*.test.ts` file | `vitest.config.ts:56-124` — all 4 projects' `include` globs match only `*.unit.test.ts`/`*.int.test.ts`/`*.e2e.test.ts`/`*.structural.test.ts`; `evals/replay/cli.ts` matches none. Empirically confirmed: the full `pnpm vitest run` collected only `anonymize.unit.test.ts` and `runReplay.int.test.ts` from `evals/replay/`, never `cli.ts` | ✅ PASS |

**Status**: 20/22 ACs fully covered with exact-outcome automated test evidence. 2 ACs (OPS-13, OPS-16) have **zero automated test evidence** — code-inspection-confirmed correct, but not evidence-or-zero-covered — a documented, precedented, network-dependent CLI-wiring gap, not a functional defect.

### Edge Cases (spec.md)

| Edge case | Result |
| --- | --- |
| Mongo unavailable during purge tick → log + retry next tick | ✅ Handled — `retentionPurge.int.test.ts:163` |
| `countTokens` network/key failure → distinct error | ⚠️ Code-correct, untested (same as OPS-16 above) |
| Replay transcript references unknown tool → isolated, batch continues | ✅ Handled — `runReplay.int.test.ts:161` |
| `/metrics` called before any traffic → empty histograms, no error | ✅ Handled — `app.e2e.test.ts:26` |

---

## Discrimination Sensor

All mutations applied to the real working tree one at a time, tested, then reverted (`git status --short` confirmed clean before and after the full sequence — no `git stash` needed since edits were reverted individually).

| # | File:line | Mutation | Killed? |
| - | --- | --- | --- |
| 1 | `packages/ai-kit/scripts/auditCacheThreshold.ts:14` | `tokenCount >= limit` → `tokenCount > limit` | ✅ Killed — `auditCacheThreshold.unit.test.ts` boundary test fails (`overLimit:false` received, `true` expected at 4096) |
| 2 | `apps/ai-gateway/src/workers/retentionPurge.ts:16` | `createdAt: {$lt: expiredBefore}` → `{$lte: expiredBefore}` | ✅ Killed — `retentionPurge.int.test.ts` OPS-09 boundary test fails (`result.conversations` 2 received, 1 expected — the at-cutoff `Conversation` gets wrongly purged) |
| 3 | `apps/ai-gateway/src/workers/retentionPurge.ts:24` | Removed `AiSession.deleteMany(...)` call (hardcoded `{deletedCount:0}`) | ✅ Killed — 2 tests fail: OPS-10 (`result.aiSessions` 0 received, 1 expected) and the idempotency test, both via direct Mongo re-query (`AiSession.countDocuments`), confirming the payload/conjunction check is real |
| 4 | `evals/replay/anonymize.ts:23-27` | Swapped replacement order: `PHONE_PATTERN` before `DOCUMENT_PATTERN` (was: document, then phone) | ❌ **Survived** — all 4 `anonymize.unit.test.ts` tests still pass. The two regexes don't overlap on the current fixtures (CPF/CNPJ punctuation never matches `PHONE_PATTERN`), so no test pins the stated replacement order. Functionally inert today, but a genuine discrimination gap: nothing would catch a future pattern change that made the order matter |
| 5 | `evals/replay/runReplay.ts:156` | `if (!sameToolCalls(baseline, toolCalls))` → `if (false)` (never reports divergence) | ✅ Killed — `runReplay.int.test.ts` OPS-18 test fails (`status` `'match'` received, `'diverged'` expected) |

**Sensor depth**: lightweight (5 targeted behavior-level mutations across the feature's core logic)
**Result**: 4/5 killed, 1 survived → flagged as a minor, non-functional gap (see Ranked gaps)

---

## Payload/Conjunction Check (OPS-10, OPS-17, OPS-19)

| AC | Constructed object / side effect | Verified via actual resulting state? |
| --- | --- | --- |
| OPS-10 (cascade delete) | 3-collection delete (`Conversation`/`Message`/`AiSession`) | ✅ Yes — `Message.countDocuments`/`AiSession.countDocuments` re-queried against real Mongo after the purge, both at unit (`retentionPurge.int.test.ts:105-106`) and e2e wiring level (`app.e2e.test.ts:178-180`), not just checking the returned count object |
| OPS-17 (replay report shape) | `ReplayReport` object (`toolCalls[]` + `finalText`) | ✅ Yes — full `toEqual` on the exact object shape/values (`runReplay.int.test.ts:108-117`), not just "a report was produced" |
| OPS-19 (baseline write) | JSON file written to `baselineDir` | ✅ Yes — the actual file is read back with `readFile`+`JSON.parse` and compared (`runReplay.int.test.ts:119-126`), not just asserting a write function was called |

All three conjunction checks are genuine state assertions, not call-only checks.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — each of the 5 components is isolated, no shared abstraction forced (matches design.md's own stated rationale) |
| Surgical changes | ✅ — diff touches exactly the files each task declared in `Where` |
| No scope creep | ✅ — two documented, justified exceptions: exporting `SYSTEM_PROMPT` (T9) and adding `mongodb-memory-server` as root devDependency (T13), both explained inline in tasks.md's Status notes and necessary for the stated `Where` |
| Matches existing patterns | ✅ — `retentionPurge.ts` mirrors `reaper.ts`'s exact shape; `/metrics` mirrors `/health`'s unauthenticated pattern; env flag mirrors `MAIL_PROVIDER` |
| Spec-anchored outcome check | ⚠️ 20/22 — see OPS-13/OPS-16 gap above |
| Per-layer Coverage Expectation met | ✅ for domain logic (1:1 AC mapping); ⚠️ CLI-wiring layer (OPS-13/16) explicitly scoped to code-review-only in tasks.md's own matrix |
| Every test maps to a spec AC/edge case | ✅ — no unclaimed tests found; every `it()` title in scope references an OPS-NN or explicit wiring/idempotency rationale |
| Documented guidelines followed | ✅ — AD-017 (Vitest projects/naming), AD-031 (CI gate = `pnpm run check`), both cited and followed |

---

## Gate Check

- **Gate command**: `pnpm run check` (= `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`), plus standalone `pnpm vitest run`
- **`tsc --noEmit`**: clean, 0 errors across all workspace packages
- **`biome check .`**: 8 errors — **all 8 confirmed pre-existing** (exist at merge-base `2f3e2bc`, untouched by this feature's diff): `.claude/skills/playwright-skill/lib/helpers.js`, `.claude/skills/playwright-skill/run.js`, `.vscode/mcp.json`, `apps/web/src/query/professional.unit.test.ts`, `apps/web/src/query/schedulingSettings.ts`, `apps/web/src/query/space.unit.test.ts`, `packages/contracts/src/schemas/createBoard.schema.ts`, `packages/contracts/src/schemas/createBoard.schema.unit.test.ts`. Zero new biome errors from any ops-hardening file.
- **`pnpm vitest run`**: 250 passed, 1 failed test file (251 total) / 2011 passed, 1 failed test (2012 total). The 1 failure — `apps/web/src/routes/_private/inbox/@components/media-card.unit.test.tsx` (`INBOX-17/AC2`, a `fetch` URL-format mismatch) — **confirmed pre-existing** (exists at merge-base, untouched by this feature's diff — `apps/web` appears nowhere in `git diff --stat 2f3e2bc..HEAD`).
- **Test count before feature**: 1986 (2012 − 26 new tests introduced by this feature, computed from the diff's new/modified test files)
- **Test count after feature**: 2012
- **Delta**: +26 new tests (3 `crm-api/app.e2e.test.ts` + 5 `dashboard.unit.test.ts` + 6 `retentionPurge.int.test.ts` + 2 added to `ai-gateway/app.e2e.test.ts` + 3 `auditCacheThreshold.unit.test.ts` + 4 `anonymize.unit.test.ts` + 3 `runReplay.int.test.ts`)
- **Skipped tests**: none
- **Failures**: 1, pre-existing, outside feature diff surface (see above); `pnpm run check`'s non-zero exit is caused entirely by the 8 pre-existing biome errors (also outside the feature diff surface) — **the feature introduces zero new gate failures**

---

## Fix Plans

None required — no functional defects found. Two optional, non-blocking improvement notes (not required for PASS):

### Note 1: OPS-13/OPS-16 CLI-wiring coverage

- **Observation**: `run()` in `auditCacheThreshold.ts` is not exported/injectable, so the network-failure branch (OPS-16) and the real token-counting composition (OPS-13) have no automated test — only `evaluateThreshold` is tested.
- **Suggested improvement (optional, future work)**: extract the `countTokens` call behind a small injectable seam (mirroring `AnthropicClient`'s `createMessage` pattern) so a fake rejection can be unit-tested, matching spec.md's own Independent Test wording ("mesmo padrão de `AnthropicClient` injetável").
- **Priority**: Minor — not a functional defect; current behavior is correct by code inspection and matches tasks.md's own documented Test Coverage Matrix scope for this layer.

### Note 2: `anonymizeTranscript` regex order

- **Observation**: mutant 4 survived — no test pins the stated replace order (document → phone → name).
- **Suggested improvement (optional, future work)**: add a unit test with a contrived overlapping string (or drop the now-unenforced ordering comment) so a future pattern change that makes order matter is caught.
- **Priority**: Minor — functionally inert today given the current regex set.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| OPS-01 … OPS-22 | Pending | ✅ Verified (all 22; OPS-13/OPS-16 verified with a noted coverage caveat, not a functional gap) |

(applied to `spec.md`'s Requirement Traceability table as part of this same commit — see below)

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/22 ACs matched spec outcome with full automated evidence; 2 (OPS-13, OPS-16) verified correct by code inspection only — flagged, not a functional defect, precedented by the project's own CLI-wiring test-scope carve-out.
**Sensor**: 4/5 mutations killed, 1 survived (anonymize regex order — functionally inert, flagged as minor).
**Gate**: `tsc` clean; `biome` 8/8 errors pre-existing (confirmed outside diff); `vitest` 2011/2012 passed, 1 pre-existing failure (confirmed outside diff). Zero regressions introduced by this feature.

**What works**: All 5 components (CI pin, `/metrics` + dashboard, retention/LGPD worker off-by-default with tested cascade, cache-threshold audit script, replay pipeline scaffolding) are implemented per design.md, matches existing repo patterns (`reaper.ts`, `/health`, `MAIL_PROVIDER`), and every core behavior claim is backed by a real Mongo/file-state assertion, not a call-only check.

**Issues found**: 2 minor, non-blocking coverage notes (see Fix Plans) — no functional defects, no regressions, no missing implementation.

**Next steps**: None required to close this feature. Optional follow-up (not blocking): inject a fake `countTokens` failure seam for OPS-16 automated coverage; add an order-sensitive fixture for `anonymizeTranscript` if the regex set ever grows to overlap.
