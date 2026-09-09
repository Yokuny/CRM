# payments-asaas Validation

**Date**: 2026-09-09
**Spec**: `.specs/features/payments-asaas/spec.md`
**Diff range**: `5eb85748d262ac2cc9c535068ac33148fd728df2..HEAD` (45 commits)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

All 31 tasks (T1–T31) show every "Done when" checkbox as `[x]` in `tasks.md`. Spot-checks against
actual code (not just checkboxes):

| Task | Status | Spot-check |
| ---- | ------ | ---------- |
| T6 | ✅ Done | `paymentTransitions.ts:74` rank-guard logic confirmed present and correct (`current.status === 'pending' \|\| STATUS_RANK[mapped] > STATUS_RANK[current.status]`); `expireOrderPayment` atomic `findOneAndUpdate` filter confirmed at `:105`. |
| T18 | ✅ Done | `issuePaymentLink.ts` gate order confirmed: order lookup → `status !== 'confirmed'` check (line 73) BEFORE any `Payment`/`AsaasIntegration`/Asaas-client touch. |
| T22 | ✅ Done | `asaasWebhook.router.ts` dedup via `AsaasEvent.create` unique-index + E11000 catch (lines 52–78); rank-guard delegated entirely to `applyAsaasPaymentStatus`, never re-implemented. |
| T29/T30/T31 | ✅ Done | `order.router.ts` status enum includes `payment_expired`; `order.repository.ts` read-only `Payment.findOne`/`.find()` enrichment (no write call found by grep); `apps/web` badge renders 3 states + absent case. |
| T31 finding | ✅ Legitimate | `order-card.tsx` genuinely untouched (`git diff <merge-base>..HEAD -- '**/order-card.tsx'` empty) — documented rationale (query hard-filtered to `pending_approval`, a status that structurally never has a `Payment`) is sound, not a silently-skipped AC. |

**Overall**: ✅ All 31 tasks Done, no partials.

---

## Spec-Anchored Acceptance Criteria

Spec.md defines **18 acceptance criteria** across 5 user stories (not 1:1 with the 15 `PAY-ID`s —
several `PAY-ID`s in the Requirement Traceability table cover 2+ ACs of the same story, e.g.
PAY-06 covers Story-2 AC1+AC2, PAY-11 covers Story-3 AC1+AC2, PAY-13 covers Story-4 AC1+AC2).

### P1: Cliente paga um pedido confirmado via PIX

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (PAY-01): confirmed Order, no Payment → create PIX charge, persist `Payment(status:'pending')`, return `pixPayload`+`totalPrice` | `Payment` created; result `{status:'pending', totalPrice:5000, pixPayload, pixEncodedImage}` | `packages/ai-kit/src/tools/issuePaymentLink.unit.test.ts:107-158` — `expect(result).toEqual({orderId, status:'pending', billingType:'PIX', totalPrice:5000, pixPayload:'00020126...', pixEncodedImage:'base64img'})` | ✅ PASS |
| AC2 (PAY-02): non-confirmed Order → `{error}`, zero Asaas calls, zero Payment, structural (not prompt) gate | `{error}`; `createPixCharge` never invoked; `Payment.create` never invoked | `packages/ai-kit/src/tools/issuePaymentLink.unit.test.ts:92-105` (it.each over `pending_approval`/`rejected`/`payment_expired`) — `expect(client.createPixCharge).not.toHaveBeenCalled(); expect(paymentCreateMock).not.toHaveBeenCalled()`; structural gate order verified directly in source (`issuePaymentLink.ts:72-73`: order lookup → status check, before any Payment/Integration/Asaas touch); golden-set corroboration at `evals/cases/issuePaymentLinkGuardrails.int.test.ts:118-158` (real `runTurn`, fake client's `createPixCharge` never called, `Payment.countDocuments === 0`) | ✅ PASS |
| AC3 (PAY-03): repeat call for Order with existing Payment → returns existing Payment state, never a 2nd charge | Same `Payment`'s current status/payload returned; zero 2nd Asaas call | `packages/ai-kit/src/tools/issuePaymentLink.unit.test.ts:179-201` — `expect(client.createPixCharge).not.toHaveBeenCalled(); expect(client.ensureCustomer).not.toHaveBeenCalled(); expect(integrationFindOneMock).not.toHaveBeenCalled()` (proves the idempotent path skips the Asaas client AND the integration lookup entirely, not just "DB state is right") | ✅ PASS |
| AC4 (PAY-04): no `active` AsaasIntegration → `{error}`, no Asaas call | `{error}`; zero Asaas calls | `packages/ai-kit/src/tools/issuePaymentLink.unit.test.ts:203-215` (no integration) and `:217-226` (integration exists but `ctx.asaasClient` undefined — same error class) — both assert `client.createPixCharge`/`ensureCustomer` not called, `paymentCreateMock` not called | ✅ PASS |
| AC5 (PAY-05): later "já caiu?" turn answered via extended `get_order_status`, no new tool | `payment` key present with `{status, pixPayload}` when a Payment exists; key **absent** (not `undefined`) when none | `packages/ai-kit/src/tools/getOrderStatus.int.test.ts:101-109` (`expect('payment' in result).toBe(false)`) and `:111-134` (`expect((result).payment).toEqual({status:'paid', pixPayload:'00020126-fake-pix-payload'})`) | ✅ PASS |

### P1: Confirmação de pagamento chega via webhook, com rede de segurança

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (PAY-06): valid `asaas-access-token` matching tenant hash → process against that tenant's data | `200`, `Payment.status` updated, `AsaasEvent` `processed` | `apps/ai-gateway/src/routers/asaasWebhook.router.e2e.test.ts:88-106` — `expect(res.status).toBe(200); expect(updatedPayment?.status).toBe('paid'); expect(event?.status).toBe('processed')` | ✅ PASS |
| AC2 (PAY-06): missing/invalid token or hash mismatch → 401, no data touched | `401`; `AsaasEvent.countDocuments === 0` | `asaasWebhook.router.e2e.test.ts:108-121` — `expect(res.status).toBe(401); expect(await AsaasEvent.countDocuments({})).toBe(0)`; unit-level isolation at `apps/ai-gateway/src/middlewares/asaasWebhookAuth.middleware.unit.test.ts:39,53,66` (unknown token / missing header / hash mismatch, each asserting `next()` never called) | ✅ PASS |
| AC3 (PAY-07): same event id delivered twice → processed exactly once | Second delivery is a no-op; `applyAsaasPaymentStatus` called exactly 1 time across both deliveries | `asaasWebhook.router.e2e.test.ts:123-144` — `expect(applyAsaasPaymentStatusSpy).toHaveBeenCalledTimes(1)` (spy wraps the REAL function via `vi.mock(..., importOriginal)`, not a DB-state-only check) | ✅ PASS |
| AC4 (PAY-08): stale lower-rank status after a higher-rank one already stored → never downgrade | `Payment.status` unchanged after the stale event | `asaasWebhook.router.e2e.test.ts:146-169` (two different event ids, CONFIRMED then stale PENDING, `expect(updatedPayment?.status).toBe('paid')`, `applyAsaasPaymentStatusSpy` called twice — proves the guard, not a dedup skip); exhaustive unit coverage at `packages/db/src/paymentTransitions.int.test.ts:117-235` (8 rank-guard cases: stale PENDING after CONFIRMED, stale OVERDUE after RECEIVED, forward paid→refunded, forward paid→canceled via chargeback, terminal never overwritten by stale CONFIRMED/RECEIVED, same-rank lateral move rejected) | ✅ PASS |
| AC5 (PAY-09): processing throws → still 200, logged, never crashes | `200`; `AsaasEvent` recorded `failed` with error string | `asaasWebhook.router.e2e.test.ts:171-187` (malformed payload with no resolvable `payment.id` → internal `throw new Error('Webhook sem payment.id')` caught, `expect(res.status).toBe(200); expect(event?.status).toBe('failed'); expect(event?.error).toEqual(expect.any(String))`) | ✅ PASS |
| AC6 (PAY-10): reconciliation job retries failed events + polls pending Payments per active tenant | Failed `AsaasEvent` reprocessed (`processed` on success, `attempts++`/error updated on repeat failure); pending Payments polled via `getCharge` | `apps/ai-gateway/src/workers/asaasReconcile.int.test.ts:130-161` (retry success, `getCharge` NOT called for the event-retry path — proves it doesn't re-fetch from Asaas) and `:163-186` (retry failure increments `attempts` to 2, updates `error`) | ✅ PASS |

### P1: Cobrança não paga expira e libera o estoque automaticamente

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (PAY-11/12): Payment pending > 24h, still unpaid at reconciliation → `expired`, stock released, `Order.status:'payment_expired'` | Exact stock delta (`$inc` per item); `Order.status === 'payment_expired'` | `packages/db/src/paymentTransitions.int.test.ts:239-259` — `expect(reloadedA?.stock).toBe(5)` (3+2), `expect(reloadedB?.stock).toBe(2)` (1+1), `expect(reloadedOrder?.status).toBe('payment_expired')`; end-to-end via the worker at `apps/ai-gateway/src/workers/asaasReconcile.int.test.ts:90-108` | ✅ PASS |
| AC2 (PAY-11): Payment reaches `paid` before window elapses → never expired, regardless of reconciliation timing | `Order` stays `confirmed`; stock untouched even past the 24h window | `apps/ai-gateway/src/workers/asaasReconcile.int.test.ts:110-128` (`createdAt` deliberately past the 24h window, but `getCharge` reports `CONFIRMED` → `expect(updatedOrder?.status).toBe('confirmed'); expect(updatedProduct?.stock).toBe(3)`, i.e. the paid-before-expiry race is resolved correctly even when the window has technically elapsed) | ✅ PASS |
| AC3 (PAY-12): `payment_expired` filterable/visible as its own status in `GET /orders?status=` | Only Orders with that exact status returned | `apps/crm-api/src/routers/order.router.e2e.test.ts:147-165` — `expect(res.body.data.items[0].status).toBe('payment_expired')`, plus regression test at `:166+` confirming other filters unaffected | ✅ PASS |

### P1: Tenant configura sua própria chave Asaas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (PAY-13): valid key → validate live, encrypt at rest, auto-detect environment, register webhook | `apiKeyEnc` never plaintext; `environment` matches prefix; `webhookAuthTokenHash === sha256(authToken)` (never raw) | `apps/crm-api/src/services/asaasIntegration.service.unit.test.ts:55-74` (prod prefix→`production`), `:76-89` (else→`sandbox`), `:91-108` (`expect(JSON.stringify(persistedData.apiKeyEnc)).not.toContain(plainKey)`), `:110-122` (`expect(persistedData.webhookAuthTokenHash).toBe(sha256(usedAuthToken))`) | ✅ PASS |
| AC2 (PAY-13): invalid/revoked key → reject save, persist nothing | Rejected with an error status; `createIntegrationMock`/`registerWebhookMock` never called | `asaasIntegration.service.unit.test.ts:43-53` — `expect(registerWebhookMock).not.toHaveBeenCalled(); expect(createIntegrationMock).not.toHaveBeenCalled()`; e2e-level at `apps/crm-api/src/routers/asaasIntegration.router.e2e.test.ts:147` (4xx, nothing persisted) | ✅ PASS |
| AC3 (PAY-14): reading the integration returns the key masked (last 4 chars only), never plaintext after creation | Exact masked format `****XXXX` | `asaasIntegration.service.unit.test.ts:147-159` (`expect(result.apiKey).toBe('****1234')`) and `:163-174` (`getCurrentIntegration`, `expect(result.apiKey).toBe('****-999')`); router-level at `asaasIntegration.router.e2e.test.ts:206` | ✅ PASS |

### P2: Operadores veem o status do pagamento no CRM

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (PAY-15): Orders list / Order detail show associated Payment's status, read-only | `paymentStatus` field present matching the Payment when one exists, absent (not `null`) otherwise; **no write** to `Payment` from this module | `apps/crm-api/src/repositories/order.repository.int.test.ts:72-89` (single order) and `:172-182` (batch/list); AD-034 structural check at `:190-196` — `expect(source).not.toMatch(/Payment\.(updateOne\|updateMany\|create\|findOneAndUpdate\|deleteOne\|deleteMany)\(/)` (reads the actual compiled source, not a mock-call assertion); UI-level at `apps/web/src/routes/_private/orders/index.unit.test.tsx:152-189` (3 distinct badge states + absent case) | ✅ PASS |

**Status**: ✅ All 18 ACs covered, spec-defined outcomes matched exactly. **0 spec-precision gaps** — every AC in spec.md defines a precise, checkable outcome (status code, field value, or call-count), and every corresponding test targets that exact outcome rather than a vaguer proxy.

---

## Discrimination Sensor

Feature is P0-adjacent (payment/financial logic) per the skill's tiering table → expanded sensor
(≥5 manual mutations). All mutations applied via `Edit` directly to the tracked working tree,
confirmed via the corresponding test file, then reverted with `git checkout --` and `git status`
confirmed clean before proceeding to the next mutation.

| # | Mutation | File:line | Description | Killed? |
| - | -------- | --------- | ------------ | ------- |
| 1 | Rank-guard comparison | `packages/db/src/paymentTransitions.ts:74` | Flipped `STATUS_RANK[mapped] > STATUS_RANK[current.status]` → `>=` | ✅ Killed — `paymentTransitions.int.test.ts` "never overwrites a refunded Payment with a same-rank chargeback event" failed (`expected 'canceled' to be 'refunded'`) |
| 2 | Currency conversion | `apps/ai-gateway/src/providers/asaasClient.ts:88` | Changed `centsToReais` divisor from `/100` to `/10` | ✅ Killed — `asaasClient.unit.test.ts` 2 failures (`expect(chargeBody.value).toBe(10.5)` received `105`) |
| 3 | Confirmed-status gate | `packages/ai-kit/src/tools/issuePaymentLink.ts:73` | Inverted `order.status !== 'confirmed'` → `order.status === 'confirmed'` | ✅ Killed — `issuePaymentLink.unit.test.ts` 7 of 11 tests failed (PAY-01/02/03 all broke — happy path now rejected, non-confirmed path now succeeds) |
| 4 | Webhook dedup catch | `apps/ai-gateway/src/routers/asaasWebhook.router.ts:63-78` | Removed the early-return on E11000 duplicate key, made the handler look up and reprocess the existing event instead of no-op | ✅ Killed — `asaasWebhook.router.e2e.test.ts` PAY-07 dedup test failed (`applyAsaasPaymentStatusSpy` called 2 times, expected 1) |
| 5 | Expiry atomic guard | `packages/db/src/paymentTransitions.ts:105` | Removed `status: 'pending' as const` from the atomic `findOneAndUpdate` filter in `expireOrderPayment`, making the update unconditional on the current Mongo document's status | ❌ **Survived** — all 25 `paymentTransitions.int.test.ts` tests AND all 5 `asaasReconcile.int.test.ts` tests still passed |

**Sensor depth**: P0-full (5 manual mutations, expanded tier).
**Result**: 4/5 killed — ⚠️ **1 survived** (see Ranked Gaps below).

### Analysis of survived mutant #5

`expireOrderPayment`'s doc-comment (`paymentTransitions.ts:101-103`) explicitly states the atomic
filter's purpose: *"só um chamador consegue virar pending->expired; uma 2ª chamada concorrente
encontra status:'pending' já não bater e recebe null aqui"* — i.e., it exists specifically to guard
a genuine **race** between two simultaneous callers. The existing "no-op on the second call" test
(`paymentTransitions.int.test.ts:279-296`) calls `expireOrderPayment` twice **sequentially**
(`await`ing the first before starting the second) — by the time the second call's own
`Payment.findOne` read executes, the payment is already `expired` in the DB, so the earlier
`if (payment.status !== 'pending') return payment;` guard (line 96) already short-circuits before
ever reaching the atomic `findOneAndUpdate` — making the atomic filter itself untested. No test
in scope (`paymentTransitions.int.test.ts` or `asaasReconcile.int.test.ts`) issues two **concurrent**
(`Promise.all`) calls against the same Payment to force both callers past the line-96 read-check
before either writes. The mechanism this guard defends against (two reconciliation ticks, or a
webhook delivery racing a reconciliation tick, both reading the same still-`pending` Payment before
either's write lands) is real per the worker's own 5-minute interval and the webhook's independent
trigger, but it is currently unverified by any test.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — `channel.*` mirrored verbatim for `asaasIntegration.*`; `orderTransitions.ts` mechanics reused verbatim for `paymentTransitions.ts`; `webhook.router.ts`'s always-200 pattern reused verbatim |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked "Cliente paga via PIX": every AC has a dedicated, outcome-specific assertion; idempotency test explicitly asserts absence of calls (`ensureCustomer`/`createPixCharge`/`integrationFindOneMock`), not just DB end-state |
| Spec-anchored outcome check: asserted values match spec-defined outcome | ✅ — see table above, 0 gaps |
| Per-layer Coverage Expectation met | ✅ — domain logic (`paymentTransitions.ts`) has exhaustive 1:1 AC mapping (25 tests covering every rank-guard combination + expiry branch); routes (`asaasWebhook.router.ts`, `asaasIntegration.router.ts`, `order.router.ts`) cover happy + edge (401, dup, stale, malformed, non-admin, invalid-key) + error paths |
| Every test in scope maps to a spec AC, listed edge case, or Done-when criterion | ✅ — no unclaimed/speculative tests found in the sampled files |
| Documented project quality/testing guidelines followed | AD-017 (Vitest `projects` convention: unit/integration/e2e/structural, suffix-routed) — followed throughout; no project-level `CONTRIBUTING.md` beyond AD-017/031 |

### Payload/conjunction rule spot-check — `evals/cases/issuePaymentLinkGuardrails.int.test.ts`

Confirmed the golden-set guardrail case applies the payload/conjunction rule correctly, not just a
DB-state check:
- Case 1 (`pending_approval` Order, line 118-158): asserts BOTH `Payment.countDocuments({}) === 0`
  (state) AND `asaasClient.createPixCharge` was never called (call-count/absence) — both checks
  present, neither substituting for the other.
- Case 2 (`confirmed` Order, line 160-223): asserts the created `Payment.value === 5000` (exact
  value, not just existence), AND that `result.reply` contains the real amount (`'R$50,00'`)
  un-redacted through `guardOutput.ts`'s allow-list — a genuine payload-value assertion, not a
  shallow "no error thrown" check.

---

## Edge Cases

All spec.md Edge Cases walked against tests/docs:

- [x] `orderId` doesn't exist / wrong tenant-conversation → `{error}` — `issuePaymentLink.unit.test.ts:81-90`
- [x] Asaas charge-creation fails (retries, then `{error}`, no orphaned Payment) — retry policy tested in `asaasClient.unit.test.ts:202-259`; no-orphan-state tested in `issuePaymentLink.unit.test.ts:228-240`
- [x] Charge succeeds but PIX QR fetch fails → Payment persisted anyway, best-effort — `asaasClient.unit.test.ts:117-153` (both non-ok and throw cases)
- [x] Customer has no `asaasCustomerId` → created via `ensureCustomer`, persisted for reuse — `issuePaymentLink.unit.test.ts:107-158` (creates) and `:160-177` (reuses without re-calling)
- [x] Reconciliation's per-tenant Asaas poll failure doesn't block other tenants — `asaasReconcile.int.test.ts:188-215`
- [x] Webhook event with no stable id → synthesized dedup key `event:chargeId:status`, documented weaker guarantee (accepted per spec.md, not a gap) — `asaasWebhook.router.e2e.test.ts:171-187` confirms the exact synthesized format
- [x] Webhook payload with unknown/missing fields never throws — same test above (missing `payment.id` handled via caught internal error → 200, not an uncaught crash)

---

## Gate Check

- **Gate command**: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`
- **Result**: `tsc --noEmit` — 0 errors. `biome check .` — exit 0, 19 pre-existing warnings (all `lint/suspicious/noExplicitAny` in `apps/web` route files predating this feature's merge-base — confirmed via `git show <merge-base>:apps/web/.../orders/index.tsx | biome check` showing the identical `as any` idiom already present before this feature; zero new warnings introduced). `pnpm vitest run` — **1211 passed, 0 failed, 0 skipped** (168 test files).
- **Test count before feature**: 1211 is also the count reported as the implementers' baseline at feature completion — independently reproduced here by running the gate fresh on the untouched worktree.
- **Test count after feature**: 1211 (matches; this run IS "after the feature" since HEAD already includes all payments-asaas commits — no separate before/after delta was measured by the Verifier since the pre-feature commit isn't independently checked out, but the reported baseline of ~1211 matches exactly, and 0 test files failed/were skipped).
- **Skipped tests**: none.
- **Failures**: none.

---

## Fix Plans (if issues found)

### Fix 1: `expireOrderPayment`'s atomic race-guard is unverified by any concurrency test

- **Root cause**: All existing tests call `expireOrderPayment` sequentially (`await`ing each call).
  The outer read-check (`paymentTransitions.ts:96`, `if (payment.status !== 'pending') return payment;`)
  already short-circuits a second sequential call before the atomic `findOneAndUpdate` filter
  (`:105`) is ever reached, so removing the `status: 'pending'` condition from that filter has zero
  observable effect under sequential test conditions — only a true concurrent race (two callers
  both reading `pending` before either writes) would expose the missing atomicity.
- **Fix task**: Add one integration test to `packages/db/src/paymentTransitions.int.test.ts` that
  issues two concurrent (`Promise.all`) calls to `expireOrderPayment` for the same pending Payment
  and asserts stock is released exactly once (not double-released) — this is the actual invariant
  the atomic filter exists to protect, and the current suite proves the invariant only for the
  sequential case.
- **Priority**: Minor — the guard code itself is present and correct (verified by direct code
  reading); this is a test-coverage gap, not a shipped bug. Low likelihood of triggering in
  practice (a single 5-minute-interval worker + an independent webhook path racing on the exact
  same Payment within the same tick), but the invariant is currently undemonstrated by any test.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| PAY-01 | Implementing | ✅ Verified |
| PAY-02 | Implementing | ✅ Verified |
| PAY-03 | Implementing | ✅ Verified |
| PAY-04 | Implementing | ✅ Verified |
| PAY-05 | Implementing | ✅ Verified |
| PAY-06 | Implementing | ✅ Verified |
| PAY-07 | Implementing | ✅ Verified |
| PAY-08 | Implementing | ✅ Verified |
| PAY-09 | Implementing | ✅ Verified |
| PAY-10 | Implementing | ✅ Verified |
| PAY-11 | Implementing | ✅ Verified (see Fix 1 — code correct, concurrency test coverage recommended) |
| PAY-12 | Implementing | ✅ Verified |
| PAY-13 | Implementing | ✅ Verified |
| PAY-14 | Implementing | ✅ Verified |
| PAY-15 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (one surviving mutant — a test-coverage gap, not a code defect)

**Spec-anchored check**: 18/18 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 4/5 mutations killed, 1 survived (expiry atomic-filter race guard, untested concurrency path)
**Gate**: 1211 passed, 0 failed, 0 skipped; `tsc`/`biome` clean

**What works**: All 31 tasks genuinely implemented and correctly gated. The three highest-consequence
correctness risks in the feature — the PAY-02 structural gate (verified: order-status check runs
before any Payment/Integration/Asaas touch), the cents↔reais conversion (verified: exact `10.5`
assertion for 1050 cents, mutation-killed), and PAY-07 webhook dedup (verified via a real spy on
the actual `applyAsaasPaymentStatus`, not a DB-state proxy) — are all genuinely, non-shallowly
tested. AD-034's read-only boundary is enforced and even has its own structural self-check
(`order.repository.int.test.ts:190-196` regex-greps the module's own source for forbidden write
calls). `order-card.tsx` was legitimately left untouched for a sound, spec-consistent reason, not
silently skipped.

**Issues found**: Fix 1 (above) — `expireOrderPayment`'s atomic concurrency guard has no test that
actually races two concurrent callers; the current "no-op on 2nd call" test is sequential and is
satisfied by an earlier, non-atomic guard instead. This does not block the feature (the guard code
is present and correct) but should be closed with one added concurrency test.

**Next steps**: Add the concurrency test described in Fix 1. Given it is a single, additive test
with no code change required, this does not need a full fix→re-verify cycle — a human/implementer
can add the test and this validation.md can be marked closed without re-running the full Verifier.

---

## Closure (orchestrator, commit `a9c6af7`)

Fix 1 applied exactly as prescribed: one test added to `packages/db/src/paymentTransitions.int.test.ts`
issuing two genuinely concurrent (`Promise.all`) calls to `expireOrderPayment` against the same
`pending` Payment. No production code change — `paymentTransitions.ts`'s atomic guard was already
correct.

**Fix confirmed effective** (equivalent assurance to a re-verify, scoped to this one gap, per this
report's own "Next steps" guidance above):
- New test passes against the real (unmutated) code.
- Manually re-applied the exact mutation from Sensor #5 (removed `status: 'pending' as const` from
  the `findOneAndUpdate` filter, `paymentTransitions.ts:105`) — the new test failed
  (`['expired','expired']` instead of `['expired','pending']`), confirming it now kills the mutant.
  Mutation reverted immediately after (`git checkout --`), working tree confirmed clean.
- Full Build gate re-run: `tsc --noEmit` clean, `biome check .` exit 0, `pnpm vitest run` — 1212/1212
  passing (one transient failure on the first attempt, `platform.router.e2e.test.ts`, confirmed to be
  the pre-existing shared-`MongoMemoryServer` flake documented in AD-031's follow-up note, not related
  to this change — cleared on immediate retry, unrelated file, no changes near it in this diff).

**Sensor result, updated**: 5/5 mutations killed (was 4/5).
**Overall, updated**: ✅ **PASS** — no open gaps. `spec.md`'s Requirement Traceability updated to
✅ Verified for all 15 requirements (PAY-01..15).
