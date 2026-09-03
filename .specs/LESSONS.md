# Lessons — Hand-Maintained Fallback

> **No-script fallback in effect.** This repo has neither `scripts/lessons.py` nor
> `.specs/lessons.json` (greenfield — never initialized). Per `tlc-spec-driven/references/lessons.md`
> § "Fallback when code execution is unavailable", this file is maintained **by hand**,
> following the same rules the script would enforce: grounded entries only (every entry
> traces to a real `validation.md` signal), `candidate` → `confirmed` only after the *same*
> lesson recurs across **2 distinct features**, prune stale candidates. This path is
> degraded bookkeeping — treat entries as best-effort, not machine-verified.

**Status legend**: `candidate` = seen in 1 feature so far, not yet trusted as guidance · `confirmed` = corroborated across ≥2 distinct features, safe to apply · `quarantined` = penalized twice, ignore.

---

### L-001 — candidate

- **Signal**: `ac_gap` (FND-13 — Foundation: Tenancy & Auth `validation.md`)
- **Source**: `apps/crm-api/src/services/platform.service.ts:42-57`; `apps/crm-api/src/routers/platform.router.e2e.test.ts:195-214`
- **Scope**: idempotency / invite-resend / repositories
- **Lesson**: For a "repeated request against existing pending state must invalidate-and-reissue" requirement, write the test to assert the reissue outcome (old token now rejected, new token works, exactly one live record) — a test that instead asserts a 409-on-duplicate locks in rejection as the contract and hides that reuse was never built.
- **Seen in**: foundation-tenancy-auth (1/2 features toward promotion)

### L-002 — candidate

- **Signal**: `ac_gap` (FND-17 partial — Foundation: Tenancy & Auth `validation.md`)
- **Source**: `.specs/features/foundation-tenancy-auth/design.md` (Integration Points + Requirement→Component rows citing `dbReqResTime`); absent from implementation (`grep -rn "dbReqResTime"` across the repo returns zero matches)
- **Scope**: tasks-authoring / observability / instrumentation
- **Lesson**: When design.md commits to a specific per-operation instrument that is only named inside another component's Dependencies/Reuses column (not given a Requirement→Component row of its own with a task), give it an explicit task during Tasks authoring — instrumentation mentioned only as a side-detail of a different task is easy to drop silently between Design and Tasks, and no task's Done-when criterion will ever catch the omission.
- **Seen in**: foundation-tenancy-auth (1/2 features toward promotion)

### L-003 — candidate

- **Signal**: `gate_fail`-adjacent / detection gap (Vitest suite passed 123/123 while the authenticated flow was broken at real runtime — discovered only by the orchestrator's manual smoke test, not by any automated test; independently re-confirmed live by this Verifier)
- **Source**: `apps/crm-api/src/middlewares/authentication.middleware.ts:4`, `apps/crm-api/src/services/auth.service.ts:4`, `apps/crm-api/src/services/invite.service.ts:4` (all fixed in commit `aec2a83`, from `import * as jwt from 'jsonwebtoken'` to `import jwt from 'jsonwebtoken'`)
- **Scope**: build/runtime / ESM-CJS interop / auth
- **Lesson**: Run at least one manual smoke test against the real running process (not only the test runner) for any module that imports a CommonJS package via `import * as X from 'pkg'` — Vite/esbuild's transform (used by Vitest) synthesizes named exports for CJS interop that `cjs-module-lexer` cannot statically detect at real Node ESM runtime, so a 100%-passing suite can still ship with the imported functions `undefined` in production.
- **Seen in**: foundation-tenancy-auth (1/2 features toward promotion)

---

## Confirmed (promoted, ≥2 distinct features)

_(none yet — this is the first feature recorded in this fallback file)_
