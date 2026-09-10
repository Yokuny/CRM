# payments-asaas Context

**Gathered:** 2026-09-09
**Spec:** `.specs/features/payments-asaas/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Let the model issue one PIX charge for a `confirmed` Order (never before), track it to
paid/expired via Asaas webhook + a reconciliation safety net, auto-expire+release-stock on
non-payment, and let a tenant configure its own encrypted Asaas API key. Operator-visible status is
read-only; no other payment method, no automatic customer notification, no operator mutation
action ships in this feature.

---

## Implementation Decisions

This feature's four highest-leverage gray areas were resolved directly with the user via a
concrete-options question set (equivalent in substance to the discuss.md ritual — options were
concrete, each with a stated trade-off, "you decide" available on every question) rather than a
longer open-ended interview, since the roadmap/AD-009/AD-012 already fixed the feature boundary
and the remaining ambiguity was narrow and product-specific.

### Payment methods for P1

- **PIX only.** Boleto and cartão de crédito are explicitly deferred (Out of Scope in spec.md).
- Rationale given: PIX's copy-paste/QR fits inline in a WhatsApp message; the other two billing
  types redirect the customer to an external Asaas checkout link (`invoiceUrl`), a different
  response shape/UX this feature doesn't need to solve yet.

### Unpaid / expired charge policy

- **A reconciliation job automatically expires an unpaid `Payment` past its window and releases
  the Order's reserved stock** — no operator action required, no indefinite pending state.
- This is the decision that requires `Order` to gain a new terminal status (`payment_expired`,
  distinct from `rejected`) and a shared stock-release transition (mirroring `tryConfirmOrder`'s
  rollback mechanics, AD-033 precedent) — both specced as PAY-11/PAY-12.

### Customer notification on payment confirmation

- **No automatic WhatsApp message in P1.** The customer asking "já caiu?" is answered on-demand by
  extending `get_order_status`'s result with payment status — no new tool, no proactive outbound
  message, no interaction with the AD-005 24h window / HSM template question.

### Operator actions in `apps/web`

- **Read-only for P1.** Orders/Inbox show the Payment's status; no resend/cancel/mark-paid action
  ships. Kept as its own P2 story so it can ship independently of the P1 backend flow.

### Agent's Discretion

Everything not explicitly asked above was left to the agent, and is recorded with rationale in
spec.md's Assumptions & Open Questions table rather than repeated here — notably: the 24h
expiration window, the 5-minute reconciliation tick, self-registering the webhook with Asaas
(vs. manual dashboard setup), live key validation at configuration time, and how
refund/chargeback events are recorded (status only, no automated reaction).

### Declined / Undiscussed Gray Areas → Assumptions

None declined outright — the four questions asked covered the areas with real product-visible
trade-offs. Every remaining implementation-level gray area (expiration window length, worker tick
interval, self-registration vs. manual webhook setup, live key validation, refund/chargeback
handling) went undiscussed and is logged as an agent assumption in spec.md's Assumptions & Open
Questions table, each with its own rationale — none silently dropped.

---

## Specific References

The DentalEase reference (`../DentalEase/DentalEase-BackEnd`) is the explicit precedent named by
AD-012 and was read in full for this feature's Design — not a "feels similar" analogy but the
literal source of the webhook-tenant-resolution pattern (per-tenant opaque URL token + hashed
access-token header, not HMAC-of-body), the event-dedup + reconciliation-inbox pattern
(`AsaasEvent`, status-rank guard against out-of-order delivery), and the encrypted-key-at-rest
pattern (the exact same `crypto.helper.ts` already ported into `packages/db`). Design cites the
specific files/lines it reused; this feature deliberately does **not** port the reference's
subscriptions, split-payment, or platform-billing surface — see spec.md Out of Scope.

---

## Deferred Ideas

- Boleto / cartão de crédito billing types (P2/P3 candidate — the reference already supports both,
  ported when the product actually needs the redirect-link UX).
- Automatic WhatsApp payment-confirmation notification (needs its own AD-005 HSM-template
  decision — feature-sized on its own, not a corner of this one).
- Operator manual actions: resend link, cancel charge, mark-paid-by-cash.
- Re-issuing a new charge for an Order whose previous charge expired.
- Asaas subscriptions / recurring billing, split payments, refund automation.
