# Foundation: Tenancy & Auth Validation

**Date**: 2026-09-03
**Spec**: `.specs/features/foundation-tenancy-auth/spec.md`
**Diff range**: `main...feature/foundation-tenancy-auth` (46 commits; 30 tasks + 6 tasks.md bookkeeping commits + 10 orchestrator fix/housekeeping commits)
**Verifier**: independent sub-agent (author ≠ verifier) — **iteration 2** of the fix→re-verify loop. Fresh read of spec/design/tasks/code; iteration 1's `validation.md` (FAIL, 2 gaps: FND-13, FND-17-partial) was read only as historical context, not as ground truth — every claim below was re-derived from the current tree and re-run live.

---

## Task Completion

All 30 tasks in `tasks.md` are marked `[x]`. Iteration 1 already verified the one-commit-per-task history; this iteration re-confirms the two fix commits made since:

| Commit | What | Verified |
| --- | --- | --- |
| `3cdd825` | FND-13 fix: `platform.service.ts::inviteToTenant` calls `platformRepository.revokePendingInvites` before `createInvite`; router test rewritten to prove reuse (not 409) | ✅ Re-derived from spec/design, re-run live, mutation-killed (see below) |
| `fbb3719` | FND-17 fix: new `apps/crm-api/src/metrics/db.metric.ts` (`dbReqResTime` Histogram + `withDbTiming` wrapper), wired into all 14 exported repository functions (platform/invite/auth); drops a stale `SPEC_DEVIATION` comment in `tenant-isolation.int.test.ts` | ✅ Re-derived, all 14 call sites checked individually, re-run live, mutation-killed (see below) |
| `ed174f4` | Docs only — records iteration-1 lessons in `.specs/LESSONS.md` | ✅ No code impact |

**Note (non-blocking commit-hygiene nit)**: `3cdd825` alone imports `../metrics/db.metric.js`, which is only created one commit later in `fbb3719` — so `3cdd825` in isolation does not typecheck (`git show 3cdd825:apps/crm-api/src/metrics/db.metric.ts` → does not exist at that commit). This breaks the project's own "one commit, one coherent unit" convention if someone were to check out `3cdd825` alone or bisect through it. It does **not** affect the current `HEAD` (both commits are applied together and the gate is clean — verified below), so it is not a functional gap, but it is worth flagging for future fix commits: land the shared dependency first, or squash.

| Phase | Tasks | Status |
| --- | --- | --- |
| 1 — Workspace & Toolchain | T1-T3 | ✅ Done |
| 2 — packages/contracts | T4-T6 | ✅ Done |
| 3 — packages/db | T7-T12 | ✅ Done |
| 4 — crm-api middlewares & boot | T13-T20 | ✅ Done |
| 5 — crm-api routes | T21-T25 | ✅ Done |
| 6 — ai-gateway + web | T26-T30 | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

Only FND-13 and FND-17 are re-derived from zero in this iteration (per orchestrator instruction); all other 25 ACs/dimensions carried a solid, unchanged evidence trail from iteration 1 and were spot-checked live rather than re-derived line-by-line (see "Sanity spot-check" below).

### FND-13 (idempotência/reenvio de convite) — re-derived from zero

**Spec-defined outcome** (spec.md Edge Cases: "WHEN o convite é reenviado para um e-mail com convite `pending` THEN o sistema SHALL invalidar o token anterior e emitir um novo, nunca deixar dois válidos"; design.md Data Models §Invite, "Reenvio (FND-13)": `updateMany({Tenant, email, status:'pending'}, {status:'revoked'})` then create the new one, guaranteed by the partial unique index that at most one `pending` exists per `(Tenant, email)`).

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| Resend to an e-mail with an existing `pending` invite | Old invite → `revoked`; new invite → `pending`; exactly 1 `pending` survives for the `(Tenant, email)` pair; response is 201 (reissue), never 409 | `apps/crm-api/src/routers/platform.router.e2e.test.ts:195-229` — `expect(second.status).toBe(201)` (:214), `expect(second.body.data.id).not.toBe(first.body.data.id)` (:215), `expect(oldInvite?.status).toBe('revoked')` (:218), `expect(newInvite?.status).toBe('pending')` (:221), `expect(pendingForPair).toBe(1)` (:228) where `pendingForPair = await Invite.countDocuments({Tenant, email, status:'pending'})` (:223-227) | ✅ PASS |
| Implementation matches design's prescribed mechanism | `revokePendingInvites` runs before `createInvite`, using `updateMany({Tenant, email, status:'pending'}, {$set:{status:'revoked'}})` | `apps/crm-api/src/repositories/platform.repository.ts:31-34` (`revokePendingInvites`); called at `apps/crm-api/src/services/platform.service.ts:42` before the `createInvite` try-block at `:48-63` | ✅ PASS |

This closes the exact gap iteration 1 found: the test no longer merely checks "status changed" — it asserts the old invite's `status` field is literally `'revoked'`, the new one is `'pending'`, and a `countDocuments` query proves exactly one `pending` document exists for the pair (the invariant the design calls out explicitly). Ran in isolation: `pnpm vitest run apps/crm-api/src/routers/platform.router.e2e.test.ts -t "reissues the invite"` → **1 passed**.

### FND-17 (métrica de latência por operação de banco) — re-derived from zero

**Spec-defined outcome** (spec.md dimension: "métrica de latência por operação de banco"; design.md Integration Points: `prom-client` with `reqResTime` (HTTP) **and** `dbReqResTime` (per DB operation) — "só o instrumento, sem dashboard"; design.md Requirement→Component: "FND-17 | `dbReqResTime`, `reqResTime`, log estruturado de anomalia | unit: anomalia de auth emite evento com campos esperados").

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| `dbReqResTime` Histogram exists, wraps DB operations, records `success` label | A reusable timer instrument, not a per-call reimplementation | `apps/crm-api/src/metrics/db.metric.ts:7-11` (`Histogram({name:'db_operation_duration_seconds', labelNames:['operation','success']})`), `:13-23` (`withDbTiming` wrapper: starts timer, records `success:'true'`/`'false'`, re-throws on failure) | ✅ PASS |
| Unit test proves the wrapper actually records both outcomes | success → `success:'true'` sample; failure → `success:'false'` sample, and the rejection still propagates | `apps/crm-api/src/metrics/db.metric.unit.test.ts:5-14` (`expect(sample).toBeDefined()` for `test.success`/`true`), `:16-28` (`.rejects.toThrow('boom')` + `success:'false'` sample) | ✅ PASS |
| All exported repository functions across the 3 repos are actually instrumented (not just the wrapper tested in isolation) | Real DB operations — not just a synthetic test of the wrapper — go through the timer | Verified by direct inspection of all 14 call sites (listed below); every exported function in the 3 repositories wraps its body in `withDbTiming(...)` | ✅ PASS |

**14 call sites confirmed** (grep + full file read, no exported function skipped):
- `apps/crm-api/src/repositories/platform.repository.ts`: `createTenant` (:6), `findUserByEmailInTenant` (:12), `revokePendingInvites` (:32), `createInvite` (:37), `markInviteSent` (:51) — 5
- `apps/crm-api/src/repositories/auth.repository.ts`: `findUserByEmail` (:12), `findUserView` (:22), `findTenantView` (:30), `createSession` (:44) — 4
- `apps/crm-api/src/repositories/invite.repository.ts`: `findInviteWithTenantByHash` (:20), `acceptInviteAtomic` (:37), `activateTenant` (:58), `createUserFromInvite` (:69), `createSession` (:87) — 5

5 + 4 + 5 = 14, matching the commit message's claim exactly. Ran in isolation: `pnpm vitest run apps/crm-api/src/metrics/db.metric.unit.test.ts` → **2 passed**.

This closes the exact gap iteration 1 found: `grep -rn "dbReqResTime"` across the repo previously returned zero matches; it now returns the Histogram definition plus 14 real repository call sites (via the `withDbTiming` wrapper) instrumenting actual DB operations, not just an isolated wrapper test.

### All other ACs/dimensions — sanity spot-check (not re-derived from zero, per orchestrator instruction — unchanged since iteration 1)

Ran the following as a regression sanity check rather than full re-derivation, since none of this code changed in the two fix commits:

| Story/dimension | Spot-check | Result |
| --- | --- | --- |
| FND-05/06 (db-verified session, device-mismatch revocation) | `pnpm vitest run apps/crm-api/src/middlewares/authentication.middleware.int.test.ts` | ✅ 9/9 passed |
| FND-07/09 (cross-tenant isolation, forged-tenant-field rejection) | `pnpm vitest run apps/crm-api/tests/integration/tenant-isolation.int.test.ts` | ✅ passed (part of the 3-file, 21-test run below) |
| FND-15 (concurrent invite accept) | `pnpm vitest run apps/crm-api/src/routers/invite.router.e2e.test.ts` | ✅ passed (part of the 3-file, 21-test run below) |

Combined spot-check run: `pnpm vitest run apps/crm-api/src/middlewares/authentication.middleware.int.test.ts apps/crm-api/tests/integration/tenant-isolation.int.test.ts apps/crm-api/src/routers/invite.router.e2e.test.ts` → **3 files passed, 21 tests passed, 0 failed**. No regression detected. The remaining 22 ACs/dimensions retain the `file:line` evidence already recorded in iteration 1's report (superseded by this file) and are re-executed automatically as part of the full gate run below.

**Status**: ✅ All 27 P1 ACs/dimensions now covered — the 2 gaps from iteration 1 (FND-13, FND-17) are closed with precise spec-anchored evidence; the other 25 remain PASS (re-run live, no regression). No spec-precision gaps.

---

## Edge Cases (spec.md)

Re-checked the two edge cases iteration 1 flagged as failing/partial:

| Edge Case | Handled? | Evidence |
| --- | --- | --- |
| Convite reenviado invalida token anterior, nunca dois válidos | ✅ (was ❌) | `platform.router.e2e.test.ts:195-229` — old invite `revoked`, new `pending`, exactly 1 `pending` survives |
| SMTP indisponível → persiste, 202, expõe reenvio | ✅ (was ⚠️ Partial) | Persist+202: `platform.router.e2e.test.ts:176-193`. "Expõe reenvio" is now a real path: calling the same invite endpoint again (the only "resend" surface the design defines) reissues rather than permanently blocking — proven by the FND-13 test above |

The other 5 edge cases were unaffected by the fix commits and retain their iteration-1 evidence (aceite concorrente, Mongo down at boot, cookie-absent+Authorization-present, missing env var, e-mail case-insensitivity) — all previously ✅, re-run clean as part of the full gate below.

---

## Gate Check (MANDATORY — run live by this Verifier, iteration 2)

- **Gate command**: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`
- **Result**: `tsc --noEmit` clean (0 errors) · `biome check .` — 120 files checked, no issues · vitest — **37 test files passed (37), 125 tests passed (125), 0 failed**
- **Test count before this iteration's fixes (iteration 1's gate)**: 123 (36 files)
- **Test count after fixes**: 125 (37 files)
- **Delta**: +2 new tests (both in the new `apps/crm-api/src/metrics/db.metric.unit.test.ts`), +1 new test file; the FND-13 test was a rewrite of an existing test (same count, stronger assertions), not a net-new test
- **Skipped tests**: none (`grep` for `.skip(`/`.todo(`/`xit(`/`xdescribe(` across `apps/` and `packages/` returned only two false-positive matches on `process.exit(1)` — confirmed by inspection, no actual skipped test)
- **Failures**: none

---

## Discrimination Sensor

Dedicated sensor for the 2 fix commits under re-verification, run directly on the real tree in scratch/discardable form (no stash/worktree needed — each mutation was applied, tested, and reverted via `Edit` before the next; `git status`/`git diff --stat` confirmed clean after every revert, and again at the end).

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/crm-api/src/services/platform.service.ts:42` | Commented out `await platformRepository.revokePendingInvites(tenantId, data.email);` (reverts FND-13 fix to a no-op) | ✅ Killed — `platform.router.e2e.test.ts` "reissues the invite..." failed: `AssertionError: expected 409 to be 201` (the old blocking behavior returned) |
| 2 | `apps/crm-api/src/metrics/db.metric.ts:13-23` | Replaced `withDbTiming` body with a bare passthrough (`return fn();`, no `startTimer()`/no histogram recording) | ✅ Killed — both tests in `db.metric.unit.test.ts` failed: `AssertionError: expected undefined to be defined` (no metric sample recorded) |

Both mutations reverted immediately after confirming the kill; `git status --short` after revert shows only the pre-existing untracked `validation.md`, and `git diff --stat` is empty — the real tree was never left mutated.

**Sensor depth**: lightweight, targeted at the 2 fix commits under re-verification (per orchestrator instruction — the broader P0-full sensor from iteration 1, covering authorization/concurrency/device-revocation/role-passthrough/expiry-comparison, was not re-run since that code is unchanged, but remains valid evidence from iteration 1)
**Result**: 2/2 killed — ✅ PASS

---

## Code Quality

| Principle | Status | Notes |
| --- | --- | --- |
| No features beyond what was asked | ✅ | Both fixes are scoped exactly to the 2 gaps from iteration 1's Fix Plans; no extra behavior added |
| No abstractions for single-use code | ✅ | `withDbTiming` is a single wrapper reused across 14 call sites — justified, not over-engineered (avoids repeating try/timer/catch 14 times) |
| No unnecessary "flexibility" added | ✅ | — |
| Only touched files required for task | ✅ | `3cdd825` touches 3 files (repository, service, test); `fbb3719` touches 5 files (new metric + test, 2 repositories, 1 stale-comment cleanup in a test file it was already touching contextually) |
| Didn't "improve" unrelated code | ⚠️ | `fbb3719` also removes a stale `SPEC_DEVIATION` comment in `tenant-isolation.int.test.ts` unrelated to FND-17 — small scope bleed, but justified in the commit message (leftover cross-reference from a prior rename) and is a pure comment deletion with zero behavioral risk. Not flagged as a gap. |
| Matches existing patterns/style | ✅ | `withDbTiming` follows the same "wrapper function" pattern as the rest of the repository layer; the FND-13 fix follows the existing repository/service layering exactly |
| Would senior engineer approve? | ✅ | Yes — both fixes are minimal, match the design's own prescribed mechanism, and are proven by strengthened (not just broadened) assertions |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ | FND-13 test spot-checked in full above — asserts field-level state (`revoked`/`pending`) and a count invariant, not just a status code |
| Spec-anchored outcome check (asserted values match spec) | ✅ | Both FND-13 and FND-17 evidence above targets the exact spec/design-prescribed outcome |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ | FND-13 covered at e2e (route) layer per the Test Coverage Matrix; FND-17 covered at unit layer (wrapper) — matches the "Domain / service" row in tasks.md's matrix |
| Every test maps to a spec AC, listed edge case, or Done-when — no unclaimed tests | ✅ | Both new/rewritten tests cite their FND-ID in the test name |
| Documented guidelines followed | ✅ | none — strong defaults applied (unchanged from iteration 1) |

---

## Requirement Traceability Update

| Requirement | Previous Status (iteration 1) | New Status (iteration 2) |
| --- | --- | --- |
| FND-01 | ✅ Verified | ✅ Verified (unchanged, spot-checked) |
| FND-02 | ✅ Verified | ✅ Verified (unchanged) |
| FND-03 | ✅ Verified | ✅ Verified (unchanged) |
| FND-04 | ✅ Verified | ✅ Verified (unchanged) |
| FND-05 | ✅ Verified | ✅ Verified (unchanged, spot-checked live) |
| FND-06 | ✅ Verified | ✅ Verified (unchanged, spot-checked live) |
| FND-07 | ✅ Verified | ✅ Verified (unchanged, spot-checked live) |
| FND-08 | ✅ Verified | ✅ Verified (unchanged) |
| FND-09 | ✅ Verified | ✅ Verified (unchanged, spot-checked live) |
| FND-10 | ✅ Verified | ✅ Verified (unchanged) |
| FND-11 | ✅ Verified | ✅ Verified (unchanged) |
| FND-12 | ✅ Verified | ✅ Verified (unchanged) |
| **FND-13** | ❌ Needs Fix | **✅ Verified** — reissue-on-resend proven at `platform.router.e2e.test.ts:195-229`, mutation-killed |
| FND-14 | ✅ Verified | ✅ Verified (unchanged) |
| FND-15 | ✅ Verified | ✅ Verified (unchanged, spot-checked live) |
| FND-16 | ✅ Verified | ✅ Verified (unchanged) |
| **FND-17** | ⚠️ Needs Fix (partial) | **✅ Verified** — `dbReqResTime`/`withDbTiming` proven at `db.metric.ts`/`db.metric.unit.test.ts`, wired into all 14 repository exports, mutation-killed |
| FND-18 | ✅ Verified | ✅ Verified (unchanged) |
| FND-19 | ✅ Verified | ✅ Verified (unchanged) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 27/27 ACs/dimensions matched spec outcome exactly (25 unchanged since iteration 1 + 2 newly closed: FND-13, FND-17) · 0 gaps · 0 spec-precision gaps
**Sensor**: 2/2 targeted mutations killed this iteration (plus iteration 1's 5/5 P0-full sensor on the unchanged critical path, not re-run but still valid)
**Gate**: 125 passed, 0 failed, 0 skipped (tsc clean, biome clean) — up from 123 in iteration 1, consistent with +2 new tests and 0 deletions

**What works**: Both gaps from iteration 1 are genuinely closed, not just superficially patched — the FND-13 test asserts field-level state and a count invariant (not just a status code), and the FND-17 test proves the wrapper actually records metric samples on both success and failure, with all 14 real repository call sites confirmed wired to it by direct inspection. Both fixes died cleanly under dedicated fault injection. Combined with iteration 1's already-solid evidence for the other 25 ACs/dimensions (re-confirmed via a 3-file/21-test regression spot-check with zero failures), the feature is now fully verified.

**Issues found**: None blocking. One non-blocking commit-hygiene nit: `3cdd825` alone does not typecheck (imports a file only created in the next commit, `fbb3719`) — worth avoiding in future fix sequences (land shared dependencies first, or squash), but does not affect the current `HEAD`, which is clean.

**Next steps**: None required — both fix→re-verify gaps from iteration 1 are closed. No new lesson recorded (per the loop instructions: a genuinely-closed gap with no new signal doesn't warrant a duplicate or additional lesson; iteration 1's 3 lessons in `.specs/LESSONS.md` already cover the FND-13 and FND-17 root causes for future features).
