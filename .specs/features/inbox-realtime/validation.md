# Inbox Realtime Validation

**Date**: 2026-09-08
**Spec**: `.specs/features/inbox-realtime/spec.md`
**Diff range**: `main..HEAD` (`005ec9d..1ca864e`, 38 commits, 44 files changed, +5507/-244)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh agent, no context inherited from the 4 implementation workers.

---

## Task Completion

All 26 tasks (T1–T26) in `tasks.md` are marked `[x]` on every Done-when line. Verified by
reading the file directly (not trusting prior marking) and cross-checking each task's
claimed deliverable against the actual diff (`git diff --stat main..HEAD`) and commit log
(`git log --oneline main..HEAD`, 38 commits = 26 feature commits + batch-boundary
`docs(tasks)`/`docs(state)` commits + 2 incidental `style(crm-api)`/`fix(crm-api)` commits).

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `ws`/`cookie`/`@types/ws` added, `apps/crm-api/package.json` |
| T2   | ✅ Done | `authenticateSession` extracted, `authentication.middleware.ts` |
| T3   | ✅ Done | `extractHandshakeCookie`/`createRoomRegistry`, `inboxSocket.ts` |
| T4   | ✅ Done | `createInboxSocketServer`, e2e real-socket test passes |
| T5   | ✅ Done | `inboxPoller.ts`, cursor/tick-failure covered |
| T6   | ✅ Done | `server.ts` wires socket server + poller, `stopWorkers` |
| T7   | ✅ Done | `listConversations` repository |
| T8   | ✅ Done | `GET /conversations` |
| T9   | ✅ Done | `getMessages` repository |
| T10  | ✅ Done | `GET /conversations/:id/messages` |
| T11  | ✅ Done | `takeover` claim-conditional rewrite |
| T12  | ✅ Done | 409 named-conflict + release regression |
| T13  | ✅ Done | `resendMessage` repository |
| T14  | ✅ Done | `POST /:id/messages/:messageId/resend` |
| T15  | ✅ Done | `metaMediaClient` |
| T16  | ✅ Done | `getMessageMedia` repository |
| T17  | ✅ Done | `GET /:id/messages/:messageId/media` |
| T18  | ⚠️ Done, with a declared deviation | `conversationQuery(id)` was never built — see Fix Plans |
| T19  | ✅ Done | `query/message.ts` |
| T20  | ✅ Done | `useInboxSocket.ts` |
| T21  | ✅ Done | inbox route skeleton |
| T22  | ✅ Done | `conversation-queue.tsx` |
| T23  | ✅ Done | `thread.tsx` |
| T24  | ✅ Done | `media-card.tsx` |
| T25  | ✅ Done | `composer.tsx` |
| T26  | ✅ Done | `takeover-badge.tsx` |

No task is blocked or partially implemented in the sense of missing Done-when checkboxes.
T18 is functionally complete against its own (self-corrected) Done-when list, but its
Done-when text itself documents a deviation from what the task originally specified
(`conversationQuery(id)`) — flagged below and in Fix Plans, not swept under "Done".

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row below cites `file:line` + the literal assertion. Where the
spec defines a precise outcome, the assertion is checked against that exact value, not
just "an assertion exists."

### P1: Operador vê a fila de conversas ao vivo (4 ACs)

| # | Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | `GET /conversations` returns paginated, tenant-scoped list with id/customer/mode/assignee/lastActivityAt/unread/window state | Fields present, computed `unread`/window state, scoped to session tenant | `apps/crm-api/src/repositories/conversation.repository.ts:94-106` (`toListItem`) + `apps/crm-api/src/repositories/conversation.repository.int.test.ts:366-390` — `expect(item?.windowOpen).toBe(true)` / `expect(expiredItem?.windowOpen).toBe(false)` + `:530-543` (router e2e) — `expect(res.body.data.items.map(...)).toEqual([conversation._id.toString()])` | ✅ PASS |
| 2 | Filter by `mode` and/or `assignee` returns only matching conversations | Exact filtered subset, AND semantics when combined | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:307-327` — combines mode+assignee, asserts exact id set; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:556-573` — `expect(res.body.data.items.map(...)).toEqual([humanConversation._id.toString()])` | ✅ PASS |
| 3 | Caller without `canOperate` gets 403, no data | `403`, no `data` field | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:545-554` — `expect(res.status).toBe(403); expect(res.body.data).toBeUndefined()` | ✅ PASS |
| 4 | New Message (in/out) triggers a WS event within ~2s that updates the queue without a full `GET /conversations` refetch | `conversation.updated` broadcast to `tenant:<id>`, applied into cache, no network refetch | `apps/crm-api/src/workers/inboxPoller.int.test.ts:141-189` — `expect(socketServer.broadcastToTenant).toHaveBeenCalledWith(tenant, expectedEvent)`; `apps/web/src/hooks/useInboxSocket.unit.test.tsx:116-132` — asserts cache mutated via `setQueriesData`, no `getMock`/fetch call | ✅ PASS |

### P1: Operador abre uma conversa e vê o histórico ao vivo (4 ACs)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | `GET /:id/messages` returns paginated messages, chronological order | Ascending `createdAt` order | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:435-463` — `expect(...).toEqual([messages[0]..., messages[1]...])` in creation order; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:577-614` — `expect(res.body.data.items.map(...)).toEqual([first._id, second._id])` | ✅ PASS |
| 2 | `id` not found or another tenant → 404 | `404` | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:616-640` — `expect(res.status).toBe(404)` (both branches) | ✅ PASS |
| 3 | media message types return only the pointer, never binary | Response shape limited to `mediaId`/`mime`/`caption` | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:516-534` — `expect(Object.keys(item?.media ?? {}).sort()).toEqual(['caption','mediaId','mime'])` | ✅ PASS |
| 4 | New message pushed live to the open thread | Message appended to cache without a new GET | `apps/web/src/hooks/useInboxSocket.unit.test.tsx:92-114` — `expect(cached.items.map(m=>m.id)).toEqual(['m1','m2'])`; `apps/web/src/routes/_private/inbox/@components/thread.unit.test.tsx:117-145` — `expect(getMock).toHaveBeenCalledTimes(1)` after the cache push | ✅ PASS |

### P1: Operador assume e libera uma conversa com segurança sob concorrência (5 ACs)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | Free conversation (`mode:'bot'`) → `takeover` sets `mode:'human'`, `assignee` | Exact state transition | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:57-72` — `expect(persisted?.mode).toBe('human')`; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:156-170` | ✅ PASS |
| 2 | Same assignee re-calling `takeover` → idempotent success, no error | `200`, no state corruption | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:86-99`; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:203-220` — `expect(res.status).toBe(200)` | ✅ PASS |
| 3 | Different operator on an already-`human` conversation → rejected, names the current assignee, never overwrites | `409` + assignee's real name in message; `assignee` field untouched | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:100-114` — `expect(result).toBeNull()`; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:222-249` — `expect(res.status).toBe(409); expect(res.body.message).toContain(currentAssignee.name)` | ✅ PASS |
| 4 | Any `canOperate` → `release` unconditionally returns to `mode:'bot'`, `assignee:null`, regardless of current assignee | Exact state, no ownership check | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:138-151`; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:272-297` — release succeeds when caller ≠ assignee, `expect(persisted?.assignee).toBeFalsy()` | ✅ PASS |
| 5 | UI visibly shows `mode` and, when `human`, the assignee's **name** | Spec text: "o nome do assignee" (the operator's actual name) | `apps/web/src/routes/_private/inbox/@components/takeover-badge.tsx:74-84` (own `SPEC_DEVIATION` comment) — shows `t('inbox.assignee.you')`/`t('inbox.assignee.other')` ("Você"/"Outro operador"), never the real name, because `GET /conversations` only exposes `assignee` as a raw `User` ObjectId and no user-directory endpoint is in scope (`apps/web/src/routes/_private/inbox/@components/conversation-queue.tsx:21-32`); the real name only surfaces in the unrelated 409-conflict toast (`conversation.service.ts:105` resolves `User.name` server-side) | ❌ GAP (spec-precision mismatch, self-documented) |

### P1: Operador envia mensagem manual, respeitando a janela de 24h (3 ACs)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | Window open → free text enabled, calls `POST /:id/messages {text}` | Exact payload/call | `apps/web/src/routes/_private/inbox/@components/composer.unit.test.tsx:45-58` — `expect(postMock).toHaveBeenCalledWith('/conversations/c1/messages', { text: 'Olá cliente' })` | ✅ PASS |
| 2 | Window closed → text disabled, `wa.me/<phone>` button shown, no send call | Link `href` exact, no free text input, `postMock` not called | `apps/web/src/routes/_private/inbox/@components/composer.unit.test.tsx:60-73` — `expect(link).toHaveAttribute('href', 'https://wa.me/5511999999999'); expect(postMock).not.toHaveBeenCalled()` | ✅ PASS |
| 3 | Backend still rejects free text outside the window with 400, no regression | `400`, `OutsideWindowError`, no Message created | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:320-335` — `expect(res.status).toBe(400); expect(await Message.countDocuments(...)).toBe(0)` | ✅ PASS |

### P2: Operador reenvia uma mensagem que falhou (4 ACs)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | UI shows "Reenviar" button only on `failed` messages | Button rendered only for `status:'failed'` | `apps/web/src/routes/_private/inbox/@components/thread.unit.test.tsx:82-115` — `expect(renderFailedAction).toHaveBeenCalledTimes(1); expect(renderFailedAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }))` | ✅ PASS |
| 2 | Click "Reenviar" → new `Message{status:'queued'}` with same content, original untouched | Two distinct docs, clone content matches, original unchanged | `apps/crm-api/src/repositories/conversation.repository.int.test.ts:554-570` — `expect(clone.id).not.toBe(original.id); expect(persistedOriginal?.status).toBe('failed')`; `apps/crm-api/src/routers/conversation.router.e2e.test.ts:375-392` | ✅ PASS |
| 3 | Original stays visible with "Falhou" badge; new attempt appears as a new bubble below | Badge persists, never removed | `apps/web/src/routes/_private/inbox/@components/thread.unit.test.tsx:58-80` — `expect(screen.getByText('Falhou')).toBeInTheDocument()` after render with `status:'failed'` | ✅ PASS |
| 4 | Caller without `canOperate` → 403 | `403`, no Message created | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:429-442` — `expect(res.status).toBe(403); expect(await Message.countDocuments({})).toBe(1)` | ✅ PASS |

### P2: Operador vê preview de mídia recebida sob demanda (4 ACs)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|---|
| 1 | Card shows icon/mime/caption + button, no automatic Meta call | `fetch` not called on render | `apps/web/src/routes/_private/inbox/@components/media-card.unit.test.tsx:38-44` — `expect(fetch).not.toHaveBeenCalled()` | ✅ PASS |
| 2 | Click fetches on demand via new `crm-api` route, decrypts token, resolves Meta media, returns binary, never persists | 200, correct `Content-Type`, raw bytes | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:704-734` — `expect(res.headers['content-type']).toContain('image/png'); expect((res.body as Buffer).toString()).toBe('imagem-bytes')`; `apps/crm-api/src/repositories/conversation.repository.int.test.ts:662-685` | ✅ PASS |
| 3 | Media unavailable/expired → readable error, UI doesn't break | `502` + exact readable message; UI shows error text | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:736-757` — `expect(res.status).toBe(502); expect(res.body.message).toBe('Não foi possível carregar essa mídia agora')`; `apps/web/src/routes/_private/inbox/@components/media-card.unit.test.tsx:78-90` | ✅ PASS |
| 4 | Caller without `canOperate` → 403, no Meta call | `403`, `fetch` never called | `apps/crm-api/src/routers/conversation.router.e2e.test.ts:759-772` — `expect(res.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled()` | ✅ PASS |

**Status**: 23/24 ACs matched the spec's precise outcome. 1 GAP flagged (Takeover/AC5,
self-documented `SPEC_DEVIATION`, see Fix Plans). 0 vague/unclaimed spec-precision gaps —
every AC above has a specific value/state being asserted, not a generic "no error"
assertion.

---

## Edge Cases

| # | Edge Case | `file:line` + assertion | Result |
|---|---|---|---|
| 1 | WS client loses connection → UI reconnects automatically **and** resyncs via normal `GET` (never stuck showing stale data without indication) | Reconnect: `apps/web/src/hooks/useInboxSocket.unit.test.tsx:134-150` — new socket instance created after backoff delay. **Resync: no evidence.** `apps/web/src/hooks/useInboxSocket.ts:111-129` — the `open` handler only re-sends `subscribe`; no `invalidateQueries`/`refetchQueries` call anywhere in the hook or in `index.tsx`/`thread.tsx`/`conversation-queue.tsx` (`grep -rn "invalidateQueries" apps/web/src/routes/_private/inbox apps/web/src/hooks/useInboxSocket.ts` → 0 hits inside the reconnect path) | ❌ NOT fully handled — reconnect works, explicit resync does not |
| 2 | Two operators with the same thread open (no takeover) both receive the same new-message events — no exclusive read | `apps/crm-api/src/ws/inboxSocket.ts:64-69` — `broadcast()` iterates every socket in the room's `Set` and calls `.send()` on each, unconditionally. No dedicated 2-same-tenant-same-room test exists (`inboxSocket.e2e.test.ts`'s multi-client test uses two *different* tenants to prove isolation, not two sockets sharing one room) | ⚠️ Handled by implementation (structural guarantee), not directly exercised by a test |
| 3 | Conversation with no messages yet → empty state, no error | `apps/web/src/routes/_private/inbox/@components/thread.unit.test.tsx:29-35` — `expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeInTheDocument()` | ✅ Handled correctly |
| 4 | Resending the same failed Message more than once → each click produces an independent new clone, no cap | `apps/crm-api/src/repositories/conversation.repository.ts:290-291` — the only guard (`if (original.status !== 'failed') throw`) reads the **original** document, which the function never mutates (confirmed by the discrimination-sensor mutation below); therefore a second call with the same `messageId` is provably unaffected by the first. No test literally calls `resendMessage` twice on the same id | ⚠️ Handled by implementation (code-level guarantee), not directly exercised by a test |
| 5 | Customer phone in a `wa.me`-unfriendly format → button uses the value verbatim, no normalization | `apps/web/src/routes/_private/inbox/@components/composer.unit.test.tsx:75-85` — `expect(link).toHaveAttribute('href', 'https://wa.me/+55 (11) 99999-9999')` | ✅ Handled correctly |

---

## Discrimination Sensor

Sensor ran on the real working tree in a scratch state: each mutation was applied with
`Edit`, the relevant test slice was run, the failure was confirmed, and the file was
restored to the exact committed state (`git diff --stat` empty after each revert, and
after the full sequence). No commit was created for any mutation. Chosen mutations target
the two highest-risk areas called out by the task (concurrency/security: takeover claim)
plus one data-integrity guarantee (resend must never mutate the original).

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `apps/crm-api/src/repositories/conversation.repository.ts:51` | Removed the `$or:[{mode:'bot'},{assignee:userId}]` guard from the `takeover` claim query (claim always succeeds regardless of current assignee) | ✅ Killed — `conversation.repository.int.test.ts` ("never overwrites a Conversation already assigned to a DIFFERENT operator") and `conversation.router.e2e.test.ts` ("responds 409 naming the current assignee...") both failed as expected |
| 2 | `apps/crm-api/src/repositories/conversation.repository.ts:95` | Flipped `lastInboundAt.getTime() > lastActivityAt.getTime()` to `<` in the `unread` computation | ✅ Killed — both `listConversations` unread tests in `conversation.repository.int.test.ts` failed (`expected false to be true` / `expected true to be false`) |
| 3 | `apps/crm-api/src/repositories/conversation.repository.ts:291` | Added `await Message.updateOne({_id: original._id}, {$set:{status:'queued'}})` before cloning in `resendMessage`, so the original document also flips state | ✅ Killed — `conversation.repository.int.test.ts` ("...leaving the original failed Message untouched") failed (`expected 'queued' to be 'failed'`) |

**Sensor depth**: lightweight (3 targeted mutations, as prescribed for a default-tier
feature touching a concurrency-sensitive claim).
**Result**: 3/3 killed — ✅ PASS. No surviving mutants; no fix task required from the
sensor.

---

## Code Quality

Spot-checked one file per layer named in the task: WS (`ws/inboxSocket.ts`), poller
(`workers/inboxPoller.ts`), repository (`repositories/conversation.repository.ts`),
router/controller (`routers/conversation.router.ts` + `controllers/conversation.controller.ts`
+ `services/conversation.service.ts`), web query layer (`query/conversation.ts` +
`query/message.ts`), web components (`composer.tsx`, `thread.tsx`, `takeover-badge.tsx`,
`conversation-queue.tsx`).

| Principle | Status | Note |
| --------- | ------ | ---- |
| No features beyond what was asked | ✅ | No template-catalog UI, no read-receipts, no multi-instance poller coordination — all correctly left out per spec's Out of Scope |
| No abstractions for single-use code | ✅ | `isUnread` duplicated (not shared) between `conversation.repository.ts` and `inboxPoller.ts` — deliberate, matches the project's existing precedent for small single-file predicates (`isWithinWindow`) |
| No unnecessary "flexibility" added | ✅ | `metaMediaClient` is a deliberate, minimal 2-method read-only duplicate of `ai-gateway/providers/metaClient.ts`, matching a design.md-approved precedent, not new config surface |
| Only touched files required for task | ✅ | `git diff --stat main..HEAD` — every file is either a new Inbox file or a targeted extension (`authentication.middleware.ts`, `app.ts`, `server.ts`, `conversation.*`) directly named in tasks.md's "Where" |
| Didn't "improve" unrelated code | ✅ | No unrelated refactors found in the diff outside T2's explicit `authenticateSession` extraction |
| Matches existing patterns/style | ✅ | `validListConversationsQuery`/`validGetMessagesQuery` mirror `validListCustomersQuery`'s `Object.defineProperty` workaround verbatim; `query/conversation.ts` mirrors `query/customer.ts`'s queryOptions/keys-factory shape |
| Would senior engineer approve? | ✅ | Code is well-commented with direct spec/design/context citations, consistent error-typing convention (typed repository errors translated once in the service layer) |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ | Takeover/release story: every AC (1-5) has both a repository-level and (for 1/2/3/4) a router e2e-level test, checking actual persisted state, not just HTTP status |
| Spec-anchored outcome check | ✅ (23/24) | See AC table — 1 flagged gap (Takeover AC5) |
| Per-layer Coverage Expectation met | ✅ | Domain logic (repository) has 1:1 AC mapping with dedicated `it()` blocks; router/e2e layer covers happy + edge (403/404/409/400/502) for every route in scope |
| Every test maps to a spec AC/edge case/Done-when — no unclaimed tests | ✅ | Sampled test files consistently cite `INBOX-NN`/`spec.md`/`AC` references in test names |
| Documented guidelines followed | ✅ | `.specs/STATE.md` AD-017 (Vitest `unit`/`integration`/`e2e`/`structural` projects, suffix convention) and `apps/web/CLAUDE.md` (route/component `@tanstack/react-router` mock, `t()`/`formatDate` usage, `<DataTable>` server-driven) both followed exactly |

❌ No "No" answers found in the sampled files.

---

## Gate Check

- **Gate command**: `pnpm run check` (`pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`) — the Build gate from `tasks.md`.
- **Result**: exit code `0`. 874 tests passed, 0 failed, 0 skipped, across 131 test files. Biome reported 9 pre-existing `noExplicitAny` warnings in `apps/web/src/routes/_private/customers/list/index.tsx` (a file untouched by this feature's diff) — warnings, not errors; they do not fail `biome check`.
- **Test count before feature**: 740 tests / 118 files (measured via an isolated `git worktree add <scratch> main` + `pnpm install` + `pnpm vitest run`, never touching the real working tree).
- **Test count after feature**: 874 tests / 131 files.
- **Delta**: +134 tests / +13 new test files, 0 tests removed.
- **Test Integrity Check**: `git diff --numstat main..HEAD` shows zero deletions in every test file touched by this feature (existing test files — `authentication.middleware.int.test.ts`, `conversation.repository.int.test.ts`, `conversation.router.e2e.test.ts`, `server.int.test.ts` — only gained lines; no assertion was weakened or removed).
- **Skipped tests**: none.
- **Failures**: none.

---

## Fix Plans

### Fix 1: Takeover/AC5 — UI never shows the assignee's real name outside the 409 toast

- **Root cause**: `GET /conversations` (repository `toListItem`/`toRecord`, `conversation.repository.ts:25-34,97-106`) exposes `assignee` as a raw `User` ObjectId only. No user-directory endpoint is exposed to `apps/web` within this feature's scope (T21-T26 only touch `routes/_private/inbox/**`), so `conversation-queue.tsx`/`takeover-badge.tsx` fall back to a generic "Você"/"Outro operador" label instead of the literal name the spec text asks for. This is a real, self-documented `SPEC_DEVIATION` (`apps/web/src/routes/_private/inbox/@components/conversation-queue.tsx:21-32`, `takeover-badge.tsx:74-84`), not an oversight — the workers reasoned about it and left a trail, but it's still a gap against the literal AC.
- **Fix task**: Expose a minimal user lookup the Inbox screens can use — either (a) have `GET /conversations`/`GET .../takeover`/`.../release` responses include `assigneeName` resolved server-side (same `findUserView` already used for the 409 message in `conversation.service.ts:105`), or (b) add a small `GET /users?ids=...` directory endpoint scoped to `canOperate`. Option (a) is more surgical and reuses existing code.
- **Verify**: extend `conversation.repository.int.test.ts`/`conversation.router.e2e.test.ts` to assert the real name is present in `GET /conversations` items and in the takeover/release response bodies; update `conversation-queue.unit.test.tsx`/`takeover-badge.unit.test.tsx` to assert the actual name string, not "Você"/"Outro operador".
- **Priority**: Major (P1 story, literal spec text unmet, though low user-facing severity since a name-shaped placeholder is shown, not a crash or blank).

### Fix 2: WS reconnect does not resync via GET (Edge Case 1)

- **Root cause**: `useInboxSocket.ts`'s `open` handler (`apps/web/src/hooks/useInboxSocket.ts:111-116`) only re-sends the `subscribe` message on reconnect; it never calls `queryClient.invalidateQueries` for the queue (`conversationKeys.lists()`) or the open thread (`messageKeys.listsForConversation(...)`). Any messages that landed during the outage (e.g., `crm-api` restart) are silently missed until an unrelated refetch happens (window refocus, navigation, etc.) — no code or test ties the WS reconnect event to a data resync, contradicting the spec's explicit edge case text ("...resincronizar via GET... nunca travar mostrando dado desatualizado sem indicação").
- **Fix task**: In the `open` handler of `useInboxSocket.ts`, after resubscribing, call `queryClient.invalidateQueries({queryKey: conversationKeys.lists()})` and, if `conversationIdRef.current` is set, `queryClient.invalidateQueries({queryKey: messageKeys.listsForConversation(conversationIdRef.current)})`.
- **Verify**: extend `useInboxSocket.unit.test.tsx` with a test that simulates a `close` → backoff → new socket → `emitOpen()` cycle and asserts `invalidateQueries`/a refetch call fired for both keys.
- **Priority**: Minor (real gap against a documented edge case, but the base reconnect already works and most sessions will pick up the miss on the next unrelated refetch).

### Fix 3 (advisory, no code change required): `query/conversation.ts`'s `conversationQuery(id)` was never built

- **Root cause**: `tasks.md` (T18) explicitly named `conversationQuery(id)` in the "What" description mirroring `customerQuery(id)`, but no phase in the 26-task plan ever allocates a `GET /conversations/:id` endpoint — `conversation.router.ts` only exposes list + messages. T18's own Done-when list documents the resulting `SPEC_DEVIATION` (`apps/web/src/query/conversation.ts:31-42`) and follows the `query/process.ts` precedent (resolve a single item by filtering the list query's `items`). `index.tsx:13-23` inherits the same deviation with a second, unfiltered `conversationsQuery({limit:100})` call to guarantee the open conversation is resolvable even when the paginated/filtered queue query doesn't contain it.
- **Assessment**: this is a tasks.md-authoring-time inconsistency (a task description promised an artifact the plan's endpoints never supported), not a spec.md AC violation — no spec AC or Independent Test requires a single-conversation endpoint, and the workaround is functionally sound (confirmed by `index.unit.test.tsx:114-124`). No fix task against the current tree; recorded as a lesson only (see below).
- **Priority**: Cosmetic/process (documentation-only signal for future task authoring).

---

## Requirement Traceability Update

| Requirement | Story | Previous Status | New Status |
| ----------- | ----- | ---------------- | ---------- |
| INBOX-01 | P1: Fila ao vivo | Pending | ✅ Verified |
| INBOX-02 | P1: Fila ao vivo | Pending | ✅ Verified |
| INBOX-03 | P1: Fila ao vivo | Pending | ✅ Verified |
| INBOX-04 | P1: Fila ao vivo | Pending | ✅ Verified |
| INBOX-05 | P1: Histórico ao vivo | Pending | ✅ Verified |
| INBOX-06 | P1: Histórico ao vivo | Pending | ✅ Verified |
| INBOX-07 | P1: Histórico ao vivo | Pending | ✅ Verified |
| INBOX-08 | P1: Takeover/release seguro | Pending | ✅ Verified |
| INBOX-09 | P1: Takeover/release seguro | Pending | ✅ Verified |
| INBOX-10 | P1: Takeover/release seguro | Pending | ⚠️ Verified with gap (Fix 1 — assignee name not shown in queue/badge) |
| INBOX-11 | P1: Composer + janela 24h | Pending | ✅ Verified |
| INBOX-12 | P1: Composer + janela 24h | Pending | ✅ Verified |
| INBOX-13 | P1: Composer + janela 24h | Pending | ✅ Verified |
| INBOX-14 | P2: Reenvio de `failed` | Pending | ✅ Verified |
| INBOX-15 | P2: Reenvio de `failed` | Pending | ✅ Verified |
| INBOX-16 | P2: Reenvio de `failed` | Pending | ✅ Verified |
| INBOX-17 | P2: Preview de mídia | Pending | ✅ Verified |
| INBOX-18 | P2: Preview de mídia | Pending | ✅ Verified |
| INBOX-19 | (transversal) Observabilidade | Pending | ✅ Verified |

(Applied directly to `spec.md`'s Requirement Traceability table in the same commit as this report.)

---

## Summary

**Overall**: ⚠️ Issues (PASS with 2 gaps flagged — consistent with this repo's precedent of
shipping a P1 feature with minor, well-understood gaps rather than blocking on them, see
`crm-web-shell`'s "PASS (2 minor gaps flagged)").

**Spec-anchored check**: 23/24 ACs matched the spec's precise outcome; 1 gap (Takeover
AC5 — assignee name).
**Sensor**: 3/3 mutations killed.
**Gate**: 874 passed, 0 failed, 0 skipped (exit 0).

**What works**: Live queue + thread over WebSocket (poller-driven, ~2s cadence, tenant-
scoped rooms), claim-conditional takeover with named 409 conflict and unconditional
release (concurrency-safe, mutation-tested), 24h-window-aware composer with `wa.me`
fallback (uses phone verbatim, no normalization), failed-message resend as an independent
clone (original provably immutable, mutation-tested), on-demand media proxy with no
persistence and a readable 502 on Meta failure, structured WS/media observability logs.

**Issues found**:
1. Takeover/release UI shows a generic "Você"/"Outro operador" label instead of the
   assignee's real name in the queue and badge (only the 409 toast carries the real
   name) — Fix 1 above.
2. WS reconnect does not trigger a `GET` resync of the queue/thread caches — Fix 2 above.
3. (Advisory only) `conversationQuery(id)` from tasks.md/T18 was never built; functionally
   compensated for, but worth tightening in future task authoring — Fix 3 above.

**Next steps**: Route Fix 1 and Fix 2 as fix tasks to an implementer (both are small,
additive changes — no architecture change needed); re-verify after. Fix 3 requires no
code change, only awareness for future `tasks.md` authoring.
