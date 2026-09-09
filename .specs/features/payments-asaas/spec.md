# payments-asaas Specification

## Problem Statement

`catalog-orders` (feature 7) unlocked the Anel B financial write path: a customer can now build
and confirm an `Order` over WhatsApp, and an operator can approve it. But a `confirmed` Order has
no way to actually collect money — the sales loop stops one step short of being useful in
production. `payments-asaas` closes that loop: it lets the model issue a real PIX charge for a
confirmed Order (via Asaas, the chosen gateway, [AD-012](../../STATE.md)), tracks that charge to
paid/expired via webhook + a reconciliation safety net, and gives the operator read visibility
into payment status — without ever letting a charge be requested before the Order is genuinely
confirmed ([AD-009](../../STATE.md)).

## Goals

- [ ] The model can issue one PIX charge for a `confirmed` Order and relay the copy-paste
      payload/QR to the customer, with the request rejected structurally (not by prompt) for any
      Order that isn't `confirmed`.
- [ ] A payment's confirmation reaches the system via Asaas webhook (tenant-resolved, deduped,
      rank-guarded against out-of-order delivery) with a polling reconciliation job as a backstop
      for missed webhooks.
- [ ] An unpaid charge past its window is automatically expired, releasing the Order's reserved
      stock, without any operator action required.
- [ ] Each tenant configures its own Asaas API key once (encrypted at rest, validated live,
      environment auto-detected), reusing the exact crypto/mask pattern already proven for the
      WhatsApp Channel token ([AD-005](../../STATE.md)/AIG-01).
- [ ] Operators see payment status (pending/paid/expired) next to the Order, read-only.

## Out of Scope

Explicitly excluded from this feature. Documented to prevent scope creep — confirmed with the
user during Discuss (2026-09-09).

| Feature | Reason |
| ------- | ------ |
| Boleto / cartão de crédito billing types | User confirmed PIX-only for P1 — smallest UX (QR/copy-paste fits inline in a WhatsApp message; boleto/cartão need a redirect link and a different response shape). Deferred to a future feature. |
| Automatic WhatsApp notification on payment confirmation | User confirmed no auto-notification for P1 — an outbound message here could fall outside the AD-005 24h window and require a Meta-approved HSM template, which is its own feature-sized scope. Customer asks "já caiu?" and the model answers via the extended `get_order_status` tool result instead. |
| Operator manual actions on a charge (resend link, cancel, mark-paid-by-cash) | User confirmed read-only for P1 — Orders/Inbox show status only, no new operator-triggered mutation. |
| Asaas subscriptions, split payments, boleto/card tokenization | Confirmed superset features in the DentalEase reference (`services/asaas.service.ts` subscription methods) that this Order-payment flow doesn't need — a one-off charge per confirmed Order never recurs. |
| Refund / chargeback handling | Asaas can report `REFUNDED`/`CHARGEBACK_*` events; this feature records the raw + mapped status for visibility only — no automated stock re-reservation, no notification, no operator action wired to these statuses. |
| Re-issuing a charge after expiration | An expired Payment is terminal for this feature (`Order.status: 'payment_expired'`) — nothing in this feature lets the model or operator issue a second charge for the same Order. |
| Multiple simultaneous currencies / non-BRL | Asaas and this codebase's `Product.price`/`Order.totalPrice` are BRL-only already (catalog-orders); unchanged here. |
| Platform-level Asaas billing (the CRM billing its own tenants) | The DentalEase reference has a second, unrelated "platform webhook" concern (its own SaaS subscription billing) — out of scope; this feature is only about a tenant's *customers* paying that tenant. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear. The four
highest-leverage product decisions were resolved directly with the user (2026-09-09, recorded in
full in [`context.md`](context.md)); the remaining items below are agent defaults, logged per the
Discuss scope-guardrail ("declined/undiscussed gray areas become assumptions").

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Payment methods for P1 | PIX only | User decision (context.md) | y |
| Unpaid-charge policy | Reconciliation job expires + releases stock automatically | User decision (context.md) | y |
| Customer notification on payment received | None automatic in P1; answered on-demand via `get_order_status` | User decision (context.md) | y |
| Operator actions on a charge | Read-only in P1 | User decision (context.md) | y |
| Expiration window (how long an unpaid PIX charge is tolerated before auto-expiring) | 24h from `Payment` creation | Not explicitly discussed. Matches a real-time chat sales funnel (a customer who hasn't paid within a day has likely moved on); independent of Asaas's own PIX QR validity (up to 12 months) — our own business clock, not Asaas's. Configurable later without a schema change if this proves wrong. | n |
| Reconciliation worker tick interval | Every 5 minutes | Not explicitly discussed. Low-frequency concern (unlike the 2s Inbox poller, AD-006) — this codebase's only other interval precedent is the 30s-default `reaper.ts`; 5 minutes balances promptness against needless Asaas API polling load, and is a plain constant, trivially tunable. | n |
| Does the CRM self-register the webhook with Asaas (like the DentalEase reference), or expect manual dashboard setup per tenant? | Self-register (mirrors reference: generate a per-tenant opaque `webhookToken` + `authToken`, call Asaas's webhook-config endpoint at integration-save time) | Not explicitly discussed. AD-012 says "the complete integration already exists in DentalEase" — self-registration is what makes tenant resolution deterministic and avoids an operator misconfiguring a webhook URL by hand. | n |
| Does creating/rotating the Asaas integration key validate live against the Asaas API before saving? | Yes (mirrors reference: `GET /customers?limit=1` with the new key; reject the save on 401) | Not explicitly discussed. Catches a copy-paste-wrong-key mistake at configuration time instead of at the first real charge attempt (which would silently fail a customer-facing flow). | n |
| Sandbox vs. production environment selection | Auto-detected from the API key's prefix (`$aact_prod_` vs. else), never a separate form field | Confirmed against Asaas's own documentation (WebSearch, `docs.asaas.com/docs/chaves-de-api`) and the DentalEase reference (`detectAsaasEnvironment`) — this is how Asaas keys actually work, not a product choice. | n (technical fact, not a product decision) |
| What happens to an Order whose Payment later receives a `REFUNDED`/`CHARGEBACK_*` Asaas event | `Payment.status` records it (`refunded`/`canceled`) for visibility; `Order.status` is untouched (no automatic reversal) | Declined gray area (see Out of Scope: Refund/chargeback handling) — no requirement asks for automated handling, and inventing a reversal policy here would be scope creep beyond a confirmed Order that already shipped/was fulfilled in the operator's mental model. | n |
| Multiple `issue_payment_link` calls for the same Order before any Payment exists | Idempotent — returns the same, single created Payment; never creates a second charge for the same Order (DB-level unique index on `Payment.order` is the backstop, matching the `Order.idempotencyKey` precedent from catalog-orders) | Not explicitly discussed, but directly follows the AD-024/AD-033 idempotent-write precedent already established for `Order`/`FieldValueStore`. | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Cliente paga um pedido confirmado via PIX ⭐ MVP

**User Story**: As a customer chatting on WhatsApp, I want to receive a PIX charge for my
confirmed order so that I can pay immediately without leaving the conversation.

**Why P1**: Without this, `catalog-orders`' entire Anel B flow (build → confirm → approve) ends at
"confirmed" with no way to actually collect money — the feature this unlocks is the actual
business point of Anel B.

**Acceptance Criteria**:

1. WHEN the model calls `issue_payment_link` for an `Order` whose `status` is `'confirmed'` and
   that has no existing `Payment` yet THEN the system SHALL create one PIX charge via Asaas,
   persist a `Payment` record (`status: 'pending'`), and return the PIX copy-paste payload
   (`pixPayload`) and the charge total (`totalPrice`) to the model.
2. WHEN the model calls `issue_payment_link` for an `Order` whose `status` is **not** `'confirmed'`
   (`pending_approval`, `rejected`, or `payment_expired`) THEN the system SHALL reject the call
   with `{error}` and create no `Payment`, no Asaas API call, regardless of anything the
   conversation text claims (structural gate, never a prompt-level check — same guarantee already
   proven for `create_order`, catalog-orders CAT-25/26/27).
3. WHEN the model calls `issue_payment_link` again for an `Order` that already has a `Payment`
   THEN the system SHALL return the **existing** `Payment`'s current status/payload, never create
   a second charge for the same Order.
4. WHEN the tenant has no `active` Asaas integration configured THEN `issue_payment_link` SHALL
   return `{error}` without attempting any Asaas API call.
5. WHEN the customer asks about payment status in a later turn THEN the model SHALL be able to
   answer using the (extended) `get_order_status` tool result — no new tool is needed for reads.

**Independent Test**: Seed a `confirmed` Order with a fake `AsaasClient` injected; call
`issue_payment_link`, assert a `Payment` is created with the PIX payload from the fake client and
that a second call returns the same `Payment` without a second fake-client invocation.

---

### P1: Confirmação de pagamento chega via webhook, com rede de segurança ⭐ MVP

**User Story**: As the system, I want Asaas's payment confirmation to reach the correct tenant's
data reliably, even if a webhook delivery is lost, duplicated, or arrives out of order.

**Why P1**: A payment gateway integration that can silently miss a "paid" event is worse than not
having one — the operator would believe a real payment never happened.

**Acceptance Criteria**:

1. WHEN Asaas calls the webhook URL for a tenant with a valid `asaas-access-token` header (hash
   matching that tenant's registered webhook secret) THEN the system SHALL process the event
   against that tenant's data.
2. WHEN the webhook is called with a missing/invalid tenant token in the URL, or a header that
   doesn't match the resolved tenant's stored hash, THEN the system SHALL respond `401` and touch
   no data.
3. WHEN the same Asaas event id is delivered more than once THEN the system SHALL process it
   exactly once (dedup), matching the `wamid` dedup precedent (AIG-07).
4. WHEN a webhook event reports a lower-rank status than what's already stored (e.g., a stale
   `PENDING` arriving after a `CONFIRMED` was already processed, per Asaas's own documented
   at-least-once/no-order-guarantee delivery) THEN the system SHALL NOT downgrade the stored
   `Payment.status`.
5. WHEN webhook processing throws for any reason THEN the system SHALL still respond `200` (to
   avoid an Asaas retry storm) and log the failure — recovery happens via the reconciliation job
   (P1 story below), matching the exact error-containment pattern already used by the Meta webhook
   handler (`webhook.router.ts`'s `handleIncoming` catch).
6. WHEN the reconciliation job runs THEN, for every tenant with an `active` Asaas integration, it
   SHALL (a) retry any previously-failed webhook event, and (b) poll Asaas directly for every
   `pending` `Payment` as a safety net for a webhook Asaas never delivered.

**Independent Test**: Simulate two webhook calls with the same event id — assert the second is a
no-op; simulate a `CONFIRMED` event followed by a stale `PENDING` — assert the stored status stays
`paid`.

---

### P1: Cobrança não paga expira e libera o estoque automaticamente ⭐ MVP

**User Story**: As an operator, I want an Order whose payment was never completed to stop holding
reserved stock hostage indefinitely, without having to notice and cancel it by hand.

**Why P1**: `tryConfirmOrder` (catalog-orders, AD-033) already decrements `Product.stock` the
moment an Order becomes `confirmed` — if the customer never pays, that stock is unsellable to
anyone else until something releases it. The user explicitly chose automatic expiry over manual
follow-up (context.md).

**Acceptance Criteria**:

1. WHEN a `Payment` has been `pending` for more than the expiration window (24h from creation,
   assumption above) and is still unpaid at the time the reconciliation job runs THEN the system
   SHALL mark it `expired`, release every reserved item's stock back to `Product.stock` (same
   per-item `$inc` mechanics as `tryConfirmOrder`'s existing rollback), and set `Order.status` to
   `'payment_expired'`.
2. WHEN a `Payment` reaches `paid` (webhook or reconciliation) before the expiration window elapses
   THEN it SHALL never be expired, regardless of how the reconciliation job's timing overlaps.
3. WHEN an Order is already `payment_expired` THEN it SHALL be filterable/visible as its own status
   value in the existing Orders list (`GET /orders?status=`), distinct from `rejected` (which an
   operator explicitly declined, never reserved stock) and from `confirmed`.

**Independent Test**: Create a `Payment` with a `createdAt` older than the expiration window; run
the reconciliation job; assert `Product.stock` is restored and `Order.status === 'payment_expired'`.

---

### P1: Tenant configura sua própria chave Asaas ⭐ MVP

**User Story**: As a tenant admin, I want to configure my own Asaas API key once, so that charges
issued for my customers settle into my own Asaas account.

**Why P1**: Without this, there is no per-tenant credential to encrypt, no webhook to resolve, and
no charge can ever be created — this is the precondition for every other story in this feature.

**Acceptance Criteria**:

1. WHEN an admin submits an Asaas API key THEN the system SHALL validate it live against the
   Asaas API, encrypt it at rest (reusing `packages/db/src/crypto.helper.ts`, AD-012), auto-detect
   `sandbox`/`production` from the key's own prefix, and register a per-tenant webhook with Asaas.
2. WHEN an admin submits an invalid/revoked key THEN the system SHALL reject the save with an
   error, persisting nothing.
3. WHEN an admin reads the current integration THEN the system SHALL return the key **masked**
   (last 4 characters only, same `maskSecret` convention as the Channel token) — the plaintext key
   is never returned by any endpoint after creation.

**Independent Test**: Submit a key against a fake Asaas client that returns 401 — assert nothing is
persisted; submit a valid one — assert the stored document has `apiKeyEnc` (never plaintext) and
the read endpoint returns a masked value.

---

### P2: Operadores veem o status do pagamento no CRM

**User Story**: As an operator, I want to see whether a confirmed Order's payment is pending, paid,
or expired without leaving the Orders/Inbox screens.

**Why P2**: Read visibility matters for operational trust in the new flow, but the flow is
functionally complete (P1) without any `apps/web` change — this is the smallest possible
UI-visible slice, kept separate so P1 can ship/verify independently of frontend work.

**Acceptance Criteria**:

1. WHEN an operator views the Orders list or an Order's inline card in the Inbox THEN the system
   SHALL show the associated Payment's status (`pending`/`paid`/`expired`) if one exists, read-only.

**Independent Test**: Seed a `confirmed` Order with a `Payment`, load the Orders screen, assert the
status badge matches.

---

## Edge Cases

- WHEN `issue_payment_link` is called with an `orderId` that doesn't exist, or belongs to a
  different tenant/conversation, THEN the system SHALL return `{error}` — same defense-in-depth
  idiom already used by `create_order`'s conversation/tenant mismatch check (never leaks another
  tenant's data).
- WHEN the Asaas API call to create the charge fails (network error, 5xx, 429) THEN the system
  SHALL retry with the same backoff policy documented by Asaas/proven in the DentalEase reference
  (2 retries, exponential backoff) and, if still failing, return `{error}` with **no** `Payment`
  persisted — the next customer request naturally retries from scratch (no orphaned partial state).
- WHEN the Asaas API call succeeds for the charge but the follow-up PIX QR Code fetch fails THEN
  the system SHALL still persist the `Payment` or (best-effort) — `pixEncodedImage`/`pixPayload`
  may be absent, but `asaasChargeId`/`status` are never lost (mirrors the reference's best-effort
  QR fetch).
- WHEN a `Customer` has no `asaasCustomerId` yet THEN `issue_payment_link` SHALL create one via
  Asaas on first use for that customer and persist it for reuse by any future charge.
- WHEN the reconciliation job's Asaas-API-polling step fails for one tenant THEN it SHALL not
  block reconciliation for any other tenant (independent per-tenant try/catch, mirrors the
  reference's `reconcile()` structure).
- WHEN a webhook event's `payload` doesn't carry a stable event id THEN the system SHALL fall back
  to a synthesized dedup key (`event:asaasChargeId:asaasStatus`) — a weaker guarantee (two
  genuinely distinct events with an identical type/charge/status would collide), accepted as a
  documented limitation matching the reference's own fallback.
- WHEN the webhook payload includes fields this system doesn't recognize, or omits fields expected
  present, THEN the system SHALL NOT throw on unknown/missing fields — Asaas's own documentation
  states webhook payloads evolve over time and consuming systems must tolerate this.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status | Task(s) |
| --- | --- | --- | --- | --- |
| PAY-01 | P1: Cliente paga via PIX | Tasks | In Tasks | T18, T20, T26 |
| PAY-02 | P1: Cliente paga via PIX (gate estrutural) | Tasks | In Tasks | T18, T26, T27, T28 |
| PAY-03 | P1: Cliente paga via PIX (idempotência) | Tasks | In Tasks | T18, T26 |
| PAY-04 | P1: Cliente paga via PIX (sem integração ativa) | Tasks | In Tasks | T18 |
| PAY-05 | P1: Cliente paga via PIX (leitura via get_order_status) | Tasks | In Tasks | T19 |
| PAY-06 | P1: Webhook + rede de segurança (auth/tenant resolution) | Tasks | In Tasks | T21, T22, T23 |
| PAY-07 | P1: Webhook + rede de segurança (dedup) | Tasks | In Tasks | T22 |
| PAY-08 | P1: Webhook + rede de segurança (rank guard) | Tasks | In Tasks | T6, T22 |
| PAY-09 | P1: Webhook + rede de segurança (200 sempre, log de falha) | Tasks | In Tasks | T22 |
| PAY-10 | P1: Webhook + rede de segurança (job de reconciliação) | Tasks | In Tasks | T24, T25 |
| PAY-11 | P1: Cobrança expira e libera estoque | Tasks | In Tasks | T6, T24 |
| PAY-12 | P1: Cobrança expira e libera estoque (novo status de Order) | Tasks | Implementing | T5, T6 |
| PAY-13 | P1: Tenant configura chave Asaas (validação + criptografia + webhook) | Tasks | Implementing | T7, T8, T9, T10, T11, T12 |
| PAY-14 | P1: Tenant configura chave Asaas (mascaramento na leitura) | Tasks | Implementing | T10, T11, T12 |
| PAY-15 | P2: Status de pagamento visível no CRM | Tasks | In Tasks | T29, T30, T31 |

**ID format:** `PAY-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 15 total, 15 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] A customer can go from "confirmed order" to "PIX QR received in the chat" without any
      operator action beyond the approval that already happened in `catalog-orders`.
- [ ] No `issue_payment_link` call ever creates a charge for a non-`confirmed` Order, verified by a
      golden-set case (AD-009 spirit, mirroring CAT-25/26/27).
- [ ] An unpaid charge past its window always results in released stock and a distinguishable
      Order status, with zero operator action.
- [ ] A tenant's Asaas API key is never observable in plaintext by any HTTP response after the
      moment it's first submitted.
