# ai-gateway Validation

**Date**: 2026-09-07
**Spec**: `.specs/features/ai-gateway/spec.md`
**Diff range**: `d6df6da..HEAD` (branch `feature/ai-gateway`, merge-base confirmed via `git merge-base main feature/ai-gateway`)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh read of spec/design/tasks, evidence re-derived from source and test files directly (own reads + 4 parallel research sub-agents, each independently citing `file:line`), discrimination sensor run personally by the Verifier.

---

## Task Completion

All 48 tasks (T1–T47 + T24B) are marked `[x]` in `tasks.md`. Spot-checked a broad sample directly against source (not trusting the checkmarks):

| Task | Status | Notes |
| --- | --- | --- |
| T1 (crypto helper) | ✅ Done | `packages/db/src/crypto.helper.ts` matches Done-when exactly; confirmed live via sensor mutation 5 (authTag check) |
| T2–T6 (models + export) | ✅ Done | `channel.model.ts`/`conversation.model.ts`/`message.model.ts`/`aiSession.model.ts` read directly — indexes, sub-schemas, claim helpers all match design.md's Data Models section |
| T13 (TOOL_DEFINITIONS + structural guard) | ✅ Done | `toolDefinitions.ts` has exactly 4 entries; `tests/structural/toolInputSchema.structural.test.ts` has a genuine self-check (a synthetic tenant-field schema is proven caught) before asserting the real 4 are clean |
| T14–T17 (tool executors) | ✅ Done | All 4 read directly — tenant scoping via `tenantScoped(...)` present in every query |
| T18 (ingest) | ✅ Done | Confirmed dedup, Channel resolution, turnLock poll/ceiling, `checkConversationMode`; documented `SPEC_DEVIATION` at `ingest.ts:17-23` read and assessed |
| T24 / T24B (runTurn + lock-release fix) | ✅ Done | Fix genuinely present: `releaseTurnLock` on `human_mode`, `dispatchFixedReply` on `guard_rejected` — both independently reproduced as sensor mutations (see below) and both killed |
| T25 (env config) | ✅ Done | `apps/ai-gateway/src/config/env.config.ts` — 5 new vars, named-missing-var errors |
| T26 (metaClient) | ✅ Done | 2-step media flow, token decrypted per call, typed `MetaApiError` |
| T29–T31 (workers) | ✅ Done | Atomic claim (killed by sensor mutation 6), reaper `wamid`-guard, idle sweep — all read directly |
| T33–T40 (Channel/Conversation routers) | ✅ Done | Verified via direct `file:line` citations (own reads + sub-agent) — `isAdmin`/`checkRole` gates, tenant-scoped queries, e2e coverage |
| T43–T47 (golden set + P2 audio) | ✅ Done | `evals/**/*.int.test.ts` confirmed wired into `vitest.config.ts`'s `integration` project (`vitest.config.ts:65`); `package.json:9` has the `evals` script; audio path confirmed to never persist the binary |

No task found blocked or partial. 39 new test files + 4 extended (no test files deleted — `git diff --name-status d6df6da..HEAD | grep '\.test\.ts$'` shows 39 `A`, 4 `M`, 0 `D`).

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ PASS (spec-defined outcome matched by a real assertion) · ❌ GAP (evidence-or-zero: no citable proof, or a real behavioral shortfall) · ⚠️ Spec-precision gap (spec.md's own Assumptions table marks the exact numeric default "não confirmado" — behavior passes, the literal constant is not a confirmed product decision).

### P1: Channel provisioning

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-01 | Token persisted encrypted, bound to session Tenant | `apps/crm-api/src/routers/channel.router.e2e.test.ts:122-124` — `const persisted = await Channel.findOne(...); expect(persisted?.accessTokenEnc.ciphertext).not.toBe('EAABsecret-token-value-12345'); expect(persisted?.Tenant.toString()).toBe(tenant.id);` (raw DB doc inspected directly, per spec's own Independent Test) | ✅ PASS |
| AIG-02 | Duplicate `phoneNumberId` (any tenant) → 409, nothing created | `channel.router.e2e.test.ts:136-137` — `expect(res.status).toBe(409); expect(await Channel.countDocuments({phoneNumberId})).toBe(1);` + unique index proven at `channel.model.int.test.ts:48-56` | ✅ PASS |
| AIG-03 | Forged `Tenant`/`tenantId`/`orgId` ignored | `createChannel.schema.unit.test.ts:43-51` (`.strict()` rejects all 3 keys); `channel.router.e2e.test.ts:150-151` — `expect(res.status).toBe(400); expect(await Channel.countDocuments()).toBe(0);` | ✅ PASS |
| AIG-04 | Non-admin → 403, no data touched | `channel.router.e2e.test.ts:168-170` — `expect(asGestor.status).toBe(403); expect(asOperador.status).toBe(403); expect(await Channel.countDocuments()).toBe(0);` | ✅ PASS |

### P1: Webhook + ingest

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-05 | `GET` handshake → 200, raw `hub.challenge`, no JSON | `apps/ai-gateway/src/routers/webhook.router.e2e.test.ts:121-130` — `expect(res.status).toBe(200); expect(res.text).toBe('challenge-123');` | ✅ PASS |
| AIG-06 | Missing/invalid signature → 401, nothing processed | `webhook.router.e2e.test.ts:144-156` — `expect(res.status).toBe(401); expect(await Message.countDocuments({})).toBe(0);` + `webhookSignature.middleware.unit.test.ts:77-98` (`timingSafeEqual` proven, not `===`) | ✅ PASS |
| AIG-07 | Same `wamid` twice → exactly 1 `Message` | `webhook.router.e2e.test.ts:225-230` and `ingest.int.test.ts:107-112` — `expect(second.resolved && second.isDuplicate).toBe(true); expect(await Message.countDocuments({wamid:'wamid-dup'})).toBe(1);` — also independently confirmed by discrimination sensor (mutation 4) | ✅ PASS |
| AIG-08 (200 + no persist) | Unresolved `phone_number_id` → 200, no Message/Conversation | `webhook.router.e2e.test.ts:158-166`; `ingest.int.test.ts:92-97` — `expect(result).toEqual({resolved:false}); expect(await Message.countDocuments({})).toBe(0);` | ✅ PASS |
| AIG-08 (log unresolved) | System SHALL log the event as "não resolvido" | **No evidence found.** `grep` of `ingest.ts`/`webhook.router.ts` shows no `console.*` call on the `resolved:false` path. No test asserts a log call either. | ❌ GAP |
| AIG-09 | Text → `Message{in,text}` on a Conversation (created once, reused) | `ingest.int.test.ts:72-89,115-133` — `expect(second.conversation._id.toString()).toBe(first.conversation._id.toString()); expect(await Conversation.countDocuments({})).toBe(1);` | ✅ PASS |
| AIG-12 | `mode:'human'` → only persists, loop never runs | `runTurn.int.test.ts:138-176` — `expect(result).toEqual({outcome:'human_mode'}); expect(client.createMessage).not.toHaveBeenCalled();` — independently confirmed by discrimination sensor (mutation 2, the T24B bug reproduced live) | ✅ PASS |
| AIG-32 | `mode==='human'` never calls the model | Same test/assertion as AIG-12 | ✅ PASS |
| AIG-44 (observability) | Structured logs on: guard rejection, tool error, Meta send failure (each retry+final), `wamid` dedup hit, turnLock-occupied hit | **No evidence found for any of the 5.** Repo-wide `grep -rn "console\." packages/ai-kit/src apps/ai-gateway/src` (excluding tests) returns only: `server.listening`, `server.boot_failed`, 3× `*.tick_failed` (worker crash only), and `turn_lock_ceiling_exceeded` (fires only when the poll ceiling is exceeded, not on every lock-occupied hit). `guardInput.ts`, `guardOutput.ts`, `loop.ts` (tool errors silently become `{error}`), and `outboxConsumer.ts`'s `markFailed`/retry path have zero log calls. No test in the repo spies on `console.*` for any of these 5 categories. | ❌ GAP |

### P1: Loop, guards, Anel A tools

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-10 | Oversized text → fixed reply, no model call | `guardInput.int.test.ts:45-54` — `expect(result).toEqual({ok:false, fixedReply:TOO_LONG_REPLY});`; no-model-call proven at pipeline level, `runTurn.int.test.ts:190` | ⚠️ Spec-precision gap on `MAX_INPUT_TEXT_LENGTH=4096` (`guardInput.ts:12-17` — comment itself admits this is unconfirmed; spec.md never states an input-size number, only the 1600 *output* limit is externally confirmed). Behavior fully proven. |
| AIG-11 (numeric gate + atomic bump) | 20 msgs/60s per `(Tenant,Customer)`, atomic | `guardInput.int.test.ts:69-99` — 20 allowed, 21st rejected (`expect(rejected).toEqual({ok:false,fixedReply:RATE_LIMITED_REPLY})`); concurrent-bump test (`Promise.all`, `okCount===1`) | ⚠️ Spec-precision gap on 20/60s (spec.md Assumptions: "não confirmado") — mechanism itself is solid. |
| AIG-11 ("at most 1 fixed warning per 60s window") | Excess messages persist but SHALL NOT trigger more than 1 warning per window | **Not implemented.** `runTurn.ts:87-90` calls `dispatchFixedReply` unconditionally on every `guard_rejected` outcome — confirmed by `grep -rn "dispatchFixedReply"`: exactly one call site, no last-warned timestamp/dedup state anywhere in `Conversation`/`guardInput.ts`. A burst of N excess messages in the same window produces N queued fixed-reply `Message`s, not 1. No test exercises more than one excess message (`guardInput.int.test.ts:69-82` only sends a single 21st message). | ❌ GAP (real behavioral shortfall, not just a precision gap) |
| AIG-13 | `system` frozen, byte-identical across tenants/turns | `contextBuild.int.test.ts:39-51` — `expect(resultA.system).toBe(resultB.system); expect(resultA.system).not.toContain('Empresa A');`; `:53-60` — identical across 2 calls, same tenant | ✅ PASS |
| AIG-14 | Only 4 Anel A tools; no tenant/channel/conversation key in any `input_schema` | `tests/structural/toolInputSchema.structural.test.ts:33-42` — `expect(TOOL_DEFINITIONS).toHaveLength(4); ...; expect(offending).toEqual([]);` (self-check proven first); runtime double-check `loop.int.test.ts:101-129` (forged `tenantId` in tool input ignored) | ✅ PASS |
| AIG-15 | `get_process_template` — current version, own tenant only | `getProcessTemplate.int.test.ts:57-82` — fields+stages of current version; `{error}` for another tenant's same-named key | ✅ PASS |
| AIG-16 | `find_or_create_customer` reuses most-recently-updated, creates only if none | `findOrCreateCustomer.int.test.ts:40-76` — `expect(result).toEqual({customerId:mostRecent._id.toString(),created:false});` with explicit `updatedAt` control; `:96-117` never reuses another tenant's phone | ✅ PASS |
| AIG-17 | `open_process` — current templateVersion, `stage=stages[0]` | `openProcess.int.test.ts:74-90` — `expect(result).toEqual({processId:expect.any(String),stage:'novo'}); expect(created?.templateVersion).toBe(1);` | ✅ PASS |
| AIG-18 | Forged `customerId` (other tenant) → `{error}`, nothing created | `openProcess.int.test.ts:106-119` — `expect(result).toEqual({error:expect.any(String)}); expect(await Process.countDocuments({})).toBe(0);` — independently confirmed by discrimination sensor (mutation 1) | ✅ PASS |
| AIG-19 | `set_process_fields` validates against the Process's OWN version snapshot | `setProcessFields.int.test.ts:117-140` — template bumped to v2 (new required field), Process stays on v1 snapshot → old values still validate `{ok:true}` | ✅ PASS |
| AIG-20 | Iteration ceiling → fallback (partial text or fixed phrase), never hangs | `loop.int.test.ts:148-186` — partial-text case (`expect(result.reply).toBe('ainda buscando os dados...')`) and no-text case (fixed fallback) | ✅ PASS |

### P1: guard.output, persist, dispatch, concurrency

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-21 | >1600 chars → truncate at safe (sentence-end) boundary | `guardOutput.unit.test.ts:16-38` — sentence-end truncation and word-boundary fallback, both proven | ✅ PASS |
| AIG-22 | 24-hex ObjectId redacted; 23/25-char strings untouched (false-positive check) | `guardOutput.unit.test.ts:40-56` — all 3 cases (24 redacted, 23 and 25 untouched) | ✅ PASS |
| AIG-23 | Persist `Message{out}` (post-guard text) + update `AiSession` (history+summary) | `persist.int.test.ts:56-109` — status/text on creation; rolling-summary trigger at the 20+10 threshold, cap enforced | ✅ PASS |
| AIG-24 | Insert as `{status:'queued'}`; same process NEVER calls Meta | `persist.ts:72-81` (status set at creation); `persist.ts:105-107` (`dispatch` only calls `releaseTurnLock` — zero Meta-client import anywhere in the file, confirmed structurally) | ✅ PASS |
| AIG-25 | Two messages of the same Conversation serialize (never 2 simultaneous loops) | `ingest.int.test.ts:136-158` (poll-then-claim proof) + `:181-193` — real `Promise.all` of 2 concurrent claims, `expect(claimedCount).toBe(1)` — independently confirmed by discrimination sensor (mutation 6, on the analogous outbox claim) | ✅ PASS |

### P1: Outbox (claim, window, wamid, retry, reaper)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-26 | Atomic claim; 2 concurrent consumers never claim the same message | `apps/ai-gateway/src/workers/outboxConsumer.int.test.ts:86-89` — real `Promise.all` race, `expect(claimedCount).toBe(1);` — independently confirmed by discrimination sensor (mutation 6) | ✅ PASS |
| AIG-27 | Free text outside 24h window rejected, never calls Meta; template always accepted | `outboxConsumer.int.test.ts:92-145` — `expect(sendText).not.toHaveBeenCalled(); expect(updated?.status).toBe('failed');`; template-outside-window case passes | ✅ PASS |
| AIG-28 | `wamid` recorded strictly BEFORE `status:'sent'` | `outboxConsumer.int.test.ts:219-227` — real call-order spy: `expect(updateOneSpy).toHaveBeenCalledTimes(2); firstUpdate.$set.wamid === 'wamid-order-proof'; secondUpdate.$set.status === 'sent';` | ✅ PASS |
| AIG-29 | 3 attempts, backoff, terminal `failed`, no auto-resend | `outboxConsumer.int.test.ts:147-207` — 3rd-attempt-succeeds and always-fails cases, both proven | ⚠️ Spec-precision gap on exact "3/1s/3s/9s" (spec.md Assumptions: "não confirmado"). Behavior (retry-then-terminal, no resend) fully proven. |
| AIG-30 | `sending` stuck >60s → `queued`; NEVER when `wamid` already recorded | `apps/ai-gateway/src/workers/reaper.int.test.ts:37-67` — reaped case and `wamid`-protected case both proven | ⚠️ Spec-precision gap on exact "60s" (spec.md Assumptions: "não confirmado"). The `wamid`-protection guarantee (the load-bearing safety property) is fully proven. |

### P1: Takeover + manual send

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-31 | Takeover → `mode:'human'` + `assignee` | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:57-70`; e2e `conversation.router.e2e.test.ts:155-169` | ✅ PASS |
| AIG-33 | Idle 30min, no operator action → auto-revert to `bot` | `apps/ai-gateway/src/workers/idleTakeoverSweep.int.test.ts:27-55` — reverts + clears `assignee`; fresh conversations untouched | ⚠️ Spec-precision gap on exact "30min" (spec.md Assumptions: "não confirmado"). Behavior fully proven. |
| AIG-34 | Manual release before timeout → `bot` immediately | `conversation.repository.int.test.ts:87-98`; e2e `conversation.router.e2e.test.ts:204-221` | ✅ PASS |
| AIG-35 | Cross-tenant takeover/release → 403/404, nothing changes | `conversation.repository.int.test.ts:72-83,100-110`; e2e `conversation.router.e2e.test.ts:282-334` (all 3 endpoints) — nothing altered in any case | ✅ PASS |
| AIG-36 | Manual `text`/template → `Message{out,queued}` on correct Conversation/Tenant | `conversation.repository.int.test.ts:126-160`; e2e `conversation.router.e2e.test.ts:225-278` | ✅ PASS |
| AIG-37 | Free text outside window rejected BEFORE enqueue | `conversation.repository.int.test.ts:114-124` — `expect(await Message.countDocuments(...)).toBe(0);` — independently confirmed by discrimination sensor (mutation 3, both directions caught) | ✅ PASS |
| AIG-38 | Operator-enqueued message follows the identical claim/send/reaper path as the bot's (no origin-based branching) | Code inspection: `outboxConsumer.ts`'s `claimQueuedMessage` filters only on `{direction:'out',status:'queued'}` — no `origin`/`source` discriminator exists anywhere in `message.model.ts`, so structurally there is one code path. **But no test chains the two together**: `outboxConsumer.int.test.ts` only seeds messages via `Message.create` directly, never via `createOutboundMessage`/the manual-send endpoint; `conversation.router.e2e.test.ts` never calls `processNextOutboxMessage`. Repo-wide `grep` for `processNextOutboxMessage`/`claimQueuedMessage` confirms this. | ❌ GAP (evidence-or-zero — true by code inspection, not proven by test) |

### P1: Golden set

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-39 | Per scenario: assert tool called, with which args, no tool outside Anel A offered | `evals/cases/happyPath.int.test.ts:168-186` — `expectTool(...)` (3 calls, right order) + `expectNoTool(...)` (6 out-of-ring tools, none offered nor called) | ✅ PASS |
| AIG-40 | Structural sweep fails on any tenant-shaped key in the 4 `input_schema` | `tests/structural/toolInputSchema.structural.test.ts:38-42` | ✅ PASS |
| AIG-41 (tool + Conversation) | No tool, no Conversation crosses 2 mirrored tenants | `apps/crm-api/tests/integration/tenant-isolation.int.test.ts:635-671` (find_or_create_customer never reuses mirrored-phone Customer across tenants); `evals/cases/tenantIsolation.int.test.ts:139-148` (Conversation count/ownership per tenant) | ✅ PASS |
| AIG-41 (AiSession) | No AiSession crosses 2 mirrored tenants | **No direct test found.** `tenant-isolation.int.test.ts`'s T42 extension (lines 584-673) covers only `GET /channels/current` + `find_or_create_customer` — despite `tasks.md`'s own "What" text (line 1297-1299) naming `Channel/Conversation/Message/AiSession`, the realized Done-when (lines 1308-1315) narrowed to Channel + one tool, and that narrower scope is exactly what was implemented. `AiSession` is structurally 1:1 with `Conversation` (unique index, `Tenant` set on insert) and `Conversation` is always resolved through a tenant-scoped `Channel`/`Customer` lookup, so a cross-tenant `AiSession` collision is architecturally implausible — but per evidence-or-zero, no test asserts this specific claim, so it counts as NOT covered. | ❌ GAP (low functional risk, real evidence gap) |
| AIG-42 | Same webhook payload 2x on real harness → exactly 1 Message | `evals/cases/wamidDedup.int.test.ts:74-83` — `expect(second).toEqual({outcome:'duplicate'}); expect(await Message.countDocuments({wamid})).toBe(1); expect(client.createMessage).toHaveBeenCalledTimes(1);` | ✅ PASS |
| AIG-43 | CI gate = 100% deterministic, no red eval merges | `vitest.config.ts:65` (`evals/**/*.int.test.ts` in the `integration` project); `package.json:9` (`"evals"` script) both confirmed real. **But no CI pipeline exists anywhere in the repo** — no `.github/workflows/`, no `.gitlab-ci.yml`, no equivalent, confirmed by direct search. This is a pre-existing, project-wide condition (no prior feature — `foundation-tenancy-auth`/`dynamic-field-engine`/`crm-core`/`crm-web-shell` — set up CI either); it is not unique to `ai-gateway` and no task in this feature's own `tasks.md` scoped setting one up. | ❌ GAP (systemic, project-level — not this feature's fault to fix, flagged for STATE.md-level follow-up rather than a feature-specific fix task) |
| Edge case: prompt injection | Defense structural, doesn't depend on prompt; no Anel-B tool runs, no cross-tenant leak, no ObjectId leak | `evals/cases/promptInjection.int.test.ts:71-159` — 2 scenarios: forged `customerId` (0 `Process` created, `expectNoLeak`) and fake Anel-B tool call (surface stays fixed to 4 tools, no "aprovado" in reply) | ✅ PASS |

### P2: Audio (Whisper)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AIG-45 | 2-step Meta download → Whisper; binary never stored | `apps/ai-gateway/src/providers/metaClient.unit.test.ts:64-84` (2-step flow proven); `packages/ai-kit/src/ingest.int.test.ts:208-238` — `expect(JSON.stringify(persisted)).not.toContain(audioBuffer.toString('base64'));` (direct negative proof) | ✅ PASS |
| AIG-46 | Successful transcription → same path as typed text | `guardInput.int.test.ts:120-149` — identical size/rate-limit assertions for `transcribedText` as for typed text | ✅ PASS |
| AIG-47 | Transcription failure → same unsupported-type fallback, never crashes | `guardInput.int.test.ts:151-157`; `ingest.int.test.ts:240-285` (Whisper error and Meta-download error, both never throw) | ✅ PASS |
| AIG-48 (image/document/location) | Persist pointer, no download, fixed fallback | `ingest.int.test.ts:310-334` — `it.each(['image','document','location'])` — pointer persisted, `downloadAudio`/`transcribe` never called | ✅ PASS |
| AIG-48 (sticker/video + caption) | Same pointer-persist guarantee SHALL apply to sticker/video too; pointer SHALL include caption when present | **Not implemented.** `apps/ai-gateway/src/routers/webhook.router.ts:48-56` — `mapMessageType` recognizes only `text\|audio\|image\|document\|location` (sticker/video silently become `'unsupported'`); `extractMediaId` reads only `audio.id\|image.id\|document.id` — no `sticker`/`video` field is ever read, so a sticker/video message's Meta pointer is dropped entirely, not merely left undownloaded. `caption` (declared on `MessageMedia`, `message.model.ts:10`) is never populated anywhere in the codebase (confirmed by repo-wide grep) — a dead field. No test exercises sticker, video, or caption. | ❌ GAP |

**Status**: ❌ Gaps present (7 real gaps: AIG-08 half, AIG-11 half, AIG-38, AIG-41 half, AIG-43, AIG-44, AIG-48 half) — plus 4 spec.md-native spec-precision gaps (AIG-10, AIG-29, AIG-30, AIG-33), which are not implementation failures.

**Tally**: 37/48 ACs matched spec outcome cleanly · 4 spec-precision gaps flagged (spec.md's own unconfirmed defaults) · 7 real gaps found.

---

## Edge Cases (spec.md)

- [x] Malformed Meta payload (missing `wamid`/`messages[]`) → 200, no persist: **PASS** (`webhook.router.e2e.test.ts:168-193`). "log the rejected payload" half: **NOT implemented/tested** — same family as AIG-44.
- [x] Channel token expired/revoked → 3 failed attempts → terminal `failed`, no further auto-retry: **PASS**, proven by AIG-29's test.
- [x] Same Customer, different Channel → treated as distinct Conversation (`{Channel,Customer}` compound unique index), doesn't corrupt data: **PASS by construction** — `conversation.model.ts:58` (`{Channel:1,Customer:1}` unique), never actively exercised by a dedicated test but architecturally guaranteed by the schema (v1 constraint of 1 Channel/tenant makes this edge case dormant in practice, exactly as spec.md itself notes: "não é cenário ativamente suportado nesta rodada, mas não deve corromper dado").
- [x] `open_process` with nonexistent/archived `templateKey` → tool error, no `Process` created: **PASS** — `openProcess.ts:17` (`if (!template || template.archived) return {error:...}`), covered by `openProcess.int.test.ts:120-126`.
- [x] Reaper no-op when nothing stale: **PASS** — `reaper.int.test.ts` (no-op case).
- [x] Prompt injection defense structural, not prompt-dependent: **PASS** — see AIG-39/golden-set row above.

---

## Discrimination Sensor

**Sensor depth**: P0/critical-path tier (≥5 mutations required — 6 performed, exceeding the minimum). All mutations applied directly to the real files via `Edit`, tested, then restored via `git checkout -- <file>`; `git diff --stat` confirmed empty (clean tree) after every single mutation before proceeding to the next.

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `packages/ai-kit/src/tools/openProcess.ts:19` | Removed `tenantScoped(...)` from the `Customer` lookup (`Customer.findOne({Tenant:ctx.tenantId,_id:input.customerId})` → `Customer.findOne({_id:input.customerId})`) — the exact AD-010 tenant-isolation property | ✅ Killed — `openProcess.int.test.ts` "returns {error} and creates nothing when customerId belongs to ANOTHER tenant (forged)" failed: a `Process` was created using the other tenant's customer instead of erroring |
| 2 | `packages/ai-kit/src/runTurn.ts:70-73` | Removed `await releaseTurnLock(conversationId);` from the `human_mode` branch — reproducing the exact T24B bug | ✅ Killed — `runTurn.int.test.ts` "mode:'human' only persists..." failed: `turnLock` was `{holder,claimedAt}` instead of `null`, and a follow-up claim attempt would have blocked forever |
| 3 | `apps/crm-api/src/repositories/conversation.repository.ts:80` | Flipped `windowExpiresAt.getTime() > Date.now()` → `< Date.now()` in `isWithinWindow` | ✅ Killed — 2 tests failed: a free-text send OUTSIDE the window was wrongly accepted (should have thrown `OutsideWindowError`), and a free-text send INSIDE the window was wrongly rejected |
| 4 | `packages/db/src/models/message.model.ts:66` | Removed `unique: true` from the `wamid` field | ✅ Killed — `ingest.int.test.ts`'s dedup test timed out: with dedup broken, the 2nd `ingest()` call for the same `wamid` fell through to the `turnLock` claim step (normally short-circuited by the dedup check) and hung waiting for a lock the 1st call never released within the test's timeout — a genuine, if indirect, test failure proving the regression |
| 5 | `packages/db/src/crypto.helper.ts:41` | Removed `decipher.final()` from the `decrypt` concat (GCM auth-tag verification only happens in `final()`) | ✅ Killed — `crypto.helper.unit.test.ts` "throws when the authTag is tampered" failed: tampered ciphertext decrypted silently instead of throwing |
| 6 | `apps/ai-gateway/src/workers/outboxConsumer.ts:22-28` | Replaced the atomic `Message.findOneAndUpdate(...)` claim with a non-atomic `findOne` + separate `updateOne` | ✅ Killed — 2 tests failed: the concurrent-claim test got `claimedCount===2` instead of `1` (the exact race the atomic claim exists to prevent), and the `wamid`-before-`sent` ordering test's `updateOneSpy` call count shifted by the extra `updateOne` |

**Result**: 6/6 killed — ✅ PASS (discrimination sensor). No survivors, no fix tasks needed from the sensor itself.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — no abstractions beyond what tasks.md asked for; the deliberate small duplications (`extractText` in both `loop.ts`/`persist.ts`, thin Customer/Process reads in `ai-kit` vs `crm-api`) are explicitly justified in comments and match the Design's own "duplicate a thin slice" decision |
| Surgical changes | ✅ — diff is 100% new files/new code in this feature's own scope (`packages/ai-kit`, `packages/db` new models, `apps/ai-gateway`, 2 new `apps/crm-api` modules); no unrelated file touched |
| No scope creep | ✅ — Anel B, catalog tools, replay, inbox UI all correctly absent, matching Out of Scope |
| Matches existing patterns | ✅ — `tenantScoped`, `checkRole`/`isAdmin`, `respObj`/`CustomError`, `transitionTenantStatus`-style query-embedded guards, AD-017 test suffix convention all reused faithfully |
| Spec-anchored outcome check | ⚠️ — 37/48 ACs match spec outcome with a precise assertion; 7 do not (see gaps above) |
| Per-layer Coverage Expectation met | ✅ mostly — domain logic (tools, guards, pipeline stages) has close to 1:1 AC mapping; routers cover happy+edge+error; the one systematic exception is the missing observability layer (AIG-44) which has no test layer at all, and AIG-38's missing cross-layer chain test |
| Every test maps to a spec requirement | ✅ — no unclaimed/extraneous tests found across the 4 independent research passes + own direct reads |
| Documented guidelines followed | ✅ — AD-017 (Vitest project/suffix convention), AD-010 (structural tenant-leak test), AD-008 (frozen `system`, model constant) all correctly applied |

---

## Gate Check

- **Gate command**: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` (Build gate, AD-017)
- **`tsc --noEmit`**: clean, exit 0 (run standalone to confirm, since the chained command's exit code was determined by the `biome check` step)
- **`biome check .`**: 1 error + 9 warnings — **both are the accepted pre-existing baseline**:
  - `.specs/lessons.json` formatting error — confirmed via `git log --oneline d6df6da -- .specs/lessons.json`: last touched by `076cfe5` (`crm-web-shell` Execute complete), predates this feature's first commit; machine-owned by `scripts/lessons.py`, never hand-edited by this feature.
  - 9 `noExplicitAny` warnings in `apps/web/src/routes/_private/customers/index.tsx` + `kanban/index.unit.test.tsx` — confirmed via `git log` on those exact files: last touched by `076cfe5` (`crm-web-shell`), never touched by this feature.
- **`vitest run`**: **728 tests passed, 0 failed** (117 test files, `54.70s`)
- **Net of the 2 accepted baseline items**: ✅ Build gate PASSES.
- **Test count before feature**: 497 (per `crm-web-shell`'s own `validation.md`, the last-known passing count directly before this feature's merge-base)
- **Test count after feature**: 728
- **Delta**: +231 new tests (matches 39 new test files + 4 extended files; 0 deleted)
- **Skipped tests**: none found (`it.skip`/`describe.skip` grep across the diff surface returned no hits)
- **Failures**: none (net of accepted baseline)

---

## Fix Plans

### Fix 1: AIG-11 — rate-limit warning not throttled to 1-per-window
- **Root cause**: `runTurn.ts:87-90` calls `dispatchFixedReply` unconditionally on every `guard_rejected` outcome; no "already warned this window" state exists on `Conversation` or elsewhere.
- **Fix task**: Add a `lastRateLimitWarningAt` (or reuse `rateWindowStart`) check before calling `dispatchFixedReply` for the rate-limit branch specifically (the size-limit branch has no such "per window" requirement in spec.md and should keep firing every time) — skip the dispatch (still return `guard_rejected` to the caller) when a warning was already sent within the current `rateWindowStart` window.
- **Verify**: extend `runTurn.int.test.ts`'s rate-limit rejection test to send a 2nd and 3rd excess message in the same window and assert only 1 `Message{out}` total was queued.
- **Priority**: Major (explicit, unambiguous spec.md behavioral requirement; currently the customer receives one queued reply per excess message during a flood, which is the flood-amplification exactly the guard exists to prevent).

### Fix 2: AIG-44 — observability entirely unimplemented
- **Root cause**: none of the 5 required structured-log categories (guard rejection, tool error, Meta send failure/retry, `wamid` dedup hit, turnLock-occupied hit) were ever added; only coarse infra logs (boot/listening/tick-failed) exist.
- **Fix task**: add `console.log(JSON.stringify({event:...}))` calls (same pattern as `server.ts`) at: `guardInput.ts`'s two rejection returns, `loop.ts`'s `executeTool` catch block, `outboxConsumer.ts`'s `sendWithRetry` catch + `markFailed`, `ingest.ts`'s duplicate-detected branch, and `ingest.ts`'s turnLock-already-claimed branch (currently silent — only the ceiling-exceeded case logs).
- **Verify**: spy on `console.log`/`console.error` in a representative test for each of the 5 categories and assert the `event` field's value.
- **Priority**: Major (this is its own dimension in spec.md's "Varredura de dimensões implícitas" table and its own P1 line, AIG-44 — fully unaddressed, not partially).

### Fix 3: AIG-48 — sticker/video pointer dropped, `caption` dead field
- **Root cause**: `webhook.router.ts`'s `mapMessageType`/`extractMediaId` only recognize `text|audio|image|document|location`; sticker/video fall through to `'unsupported'` with no pointer, and no code path anywhere ever reads/sets `caption`.
- **Fix task**: extend `mapMessageType` to recognize `sticker`/`video` (still routing them to the guard's unsupported-type fallback, per spec — only the *persistence* needs to change, not the response), extend `extractMediaId` to also read `message.sticker?.id ?? message.video?.id`, and read/pass a `caption` field where the Meta payload provides one (typically `document.caption`/`video.caption`/`image.caption`).
- **Verify**: extend `ingest.int.test.ts`'s `it.each(['image','document','location'])` to include `'sticker'` and `'video'`, and add a case asserting `persisted?.media?.caption` when the fake payload includes a caption.
- **Priority**: Major for the sticker/video half (spec.md explicitly lists these 5 types together with identical treatment); Minor for the `caption` half (no test or product signal yet requires it, but it's a fully dead field).

### Fix 4: AIG-38 — no test proof of the shared claim/send/reaper path for operator-enqueued messages
- **Root cause**: not a code gap (no origin discriminator exists, single consumer path) — a coverage gap. No test creates a message via `createOutboundMessage`/the manual-send endpoint and then drives it through the real `processNextOutboxMessage`.
- **Fix task**: add one integration test that calls `conversationRepository.createOutboundMessage(...)` (or hits `POST /conversations/:id/messages` through `buildApp()`), then calls `processNextOutboxMessage` directly and asserts it reaches `status:'sent'`/`'failed'` exactly like a bot-produced message would.
- **Priority**: Minor (functionally almost certainly already correct by construction; this is a coverage/evidence gap, not a behavioral one).

### Fix 5: AIG-41 — no AiSession-specific cross-tenant test
- **Root cause**: T42's realized scope (Channel + `find_or_create_customer`) is narrower than the AC's literal text ("nenhuma tool, nenhuma Conversation e nenhum AiSession cruza dado").
- **Fix task**: add one assertion in the T42 extension (or a new golden-set case) creating mirrored `AiSession`s for 2 tenants and asserting a query scoped to tenant A's `Conversation` never returns tenant B's `AiSession`.
- **Priority**: Minor (structurally guaranteed by the 1:1 `Conversation` relationship and tenant-scoped `Conversation` creation; this closes an evidence gap, not a known defect).

### Fix 6: AIG-43 — no CI pipeline exists (systemic, pre-existing)
- **Root cause**: project-wide — no `.github/workflows/` or equivalent has ever existed, across all 4 prior features too. Not something this feature's task list ever scoped.
- **Fix task**: NOT a fix task for this feature. Recommend routing to `.specs/STATE.md` as a new project-level decision (e.g., "AD-031: set up CI enforcing the Build gate on every PR") for the user to prioritize independently of `ai-gateway`'s own completion.
- **Priority**: informational only — does not block this feature's own PASS/FAIL determination in isolation, but is recorded here per evidence-or-zero since AIG-43's literal text does reference CI.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| AIG-01 | Design/Pending | ✅ Verified |
| AIG-02 | Design/Pending | ✅ Verified |
| AIG-03 | Design/Pending | ✅ Verified |
| AIG-04 | Design/Pending | ✅ Verified |
| AIG-05 | Design/Pending | ✅ Verified |
| AIG-06 | Design/Pending | ✅ Verified |
| AIG-07 | Design/Pending | ✅ Verified |
| AIG-08 | Design/Pending | ❌ Needs Fix (logging half missing) |
| AIG-09 | Design/Pending | ✅ Verified |
| AIG-10 | Design/Pending | ⚠️ Verified — spec-precision gap (input-size constant unconfirmed) |
| AIG-11 | Design/Pending | ❌ Needs Fix (per-window warning throttle not implemented; numeric gate itself is a spec-precision gap) |
| AIG-12 | Design/Pending | ✅ Verified |
| AIG-13 | Design/Pending | ✅ Verified |
| AIG-14 | Design/Pending | ✅ Verified |
| AIG-15 | Design/Pending | ✅ Verified |
| AIG-16 | Design/Pending | ✅ Verified |
| AIG-17 | Design/Pending | ✅ Verified |
| AIG-18 | Design/Pending | ✅ Verified |
| AIG-19 | Design/Pending | ✅ Verified |
| AIG-20 | Design/Pending | ✅ Verified |
| AIG-21 | Design/Pending | ✅ Verified |
| AIG-22 | Design/Pending | ✅ Verified |
| AIG-23 | Design/Pending | ✅ Verified |
| AIG-24 | Design/Pending | ✅ Verified |
| AIG-25 | Design/Pending | ✅ Verified |
| AIG-26 | Design/Pending | ✅ Verified |
| AIG-27 | Design/Pending | ✅ Verified |
| AIG-28 | Design/Pending | ✅ Verified |
| AIG-29 | Design/Pending | ⚠️ Verified — spec-precision gap (retry/backoff numbers unconfirmed) |
| AIG-30 | Design/Pending | ⚠️ Verified — spec-precision gap (60s stale threshold unconfirmed) |
| AIG-31 | Design/Pending | ✅ Verified |
| AIG-32 | Design/Pending | ✅ Verified |
| AIG-33 | Design/Pending | ⚠️ Verified — spec-precision gap (30min idle timeout unconfirmed) |
| AIG-34 | Design/Pending | ✅ Verified |
| AIG-35 | Design/Pending | ✅ Verified |
| AIG-36 | Design/Pending | ✅ Verified |
| AIG-37 | Design/Pending | ✅ Verified |
| AIG-38 | Design/Pending | ❌ Needs Fix (no end-to-end test evidence) |
| AIG-39 | Design/Pending | ✅ Verified |
| AIG-40 | Design/Pending | ✅ Verified |
| AIG-41 | Design/Pending | ❌ Needs Fix (AiSession-specific isolation evidence missing) |
| AIG-42 | Design/Pending | ✅ Verified |
| AIG-43 | Design/Pending | ❌ Needs Fix (no CI pipeline exists — systemic/pre-existing, not unique to this feature) |
| AIG-44 | Design/Pending | ❌ Needs Fix (observability entirely unimplemented) |
| AIG-45 | Design/Pending | ✅ Verified |
| AIG-46 | Design/Pending | ✅ Verified |
| AIG-47 | Design/Pending | ✅ Verified |
| AIG-48 | Design/Pending | ❌ Needs Fix (sticker/video pointer dropped; caption dead field) |

---

## Summary

**Overall**: ❌ Not Ready (FAIL) — 7 real gaps found against 48 requirements; sensor and build gate are both clean.

**Spec-anchored check**: 37/48 ACs matched spec outcome cleanly · 4 spec-precision gaps flagged (spec.md's own unconfirmed defaults, not implementation failures) · 7 real gaps

**Sensor**: 6/6 mutations killed (P0 tier, exceeds the ≥5 minimum)

**Gate**: 728 passed, 0 failed (tsc clean, biome clean net of 2 accepted pre-existing baseline items)

**What works**: The entire tenant-isolation spine (AD-010) — the feature's single highest-stakes property — is solid: proven by structural test, by 3 real cross-tenant integration tests, by the golden set's prompt-injection defense, and by a live discrimination mutation that was caught immediately. `turnLock` concurrency (including the T24B fix), the 24h window guard, `wamid` dedup, and crypto integrity are all independently proven live via fault injection, not just static test reading. The outbox's atomic claim, retry/terminal-failure, and reaper-never-touches-sent-messages guarantees are all solidly tested. Takeover/release/manual-send and the golden set's happy-path/dedup/isolation scenarios are all genuine, harness-real proofs (not mocks of the harness itself).

**Issues found**:
1. AIG-11's "at most 1 warning per window" is unimplemented — real behavioral gap, not cosmetic (see Fix 1).
2. AIG-44 (observability) is entirely unimplemented — a full P1 dimension with zero code and zero tests (see Fix 2).
3. AIG-48's sticker/video/caption handling is incomplete — pointer silently dropped for 2 of 5 listed types (see Fix 3).
4. AIG-38 and AIG-41 (AiSession) are evidence gaps (structurally sound, untested) — lower priority (see Fixes 4-5).
5. AIG-43 (CI pipeline) is a pre-existing, project-wide condition, not unique to this feature — routed as a STATE.md-level follow-up, not a feature fix task (see Fix 6).
6. AIG-08's "log the unresolved event" half is unimplemented — folded into Fix 2's remit (part of the same observability gap).

**Next steps**: Route Fixes 1-5 as fix tasks to an implementer (bounded to the standard 3 fix→re-verify iterations); escalate Fix 6 to the user as a STATE.md-level decision independent of this feature's own completion.
