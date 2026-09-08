# Inbox Realtime Validation

**Date**: 2026-09-08 (iteration 1) / 2026-09-08 (iteration 2 — same day, later session)
**Spec**: `.specs/features/inbox-realtime/spec.md`
**Diff range (iteration 1)**: `main..HEAD` (`005ec9d..1ca864e`, 38 commits, 44 files changed, +5507/-244)
**Diff range (iteration 2, extended)**: `main..HEAD` (`005ec9d..a254ab5`, 44 commits, 45 files
changed). **Fix-only range**: `23d4a75..a254ab5` (2 fix commits `8695bb9`/`b78a91c` + 1
`docs(state)` handoff commit; `git diff --stat 23d4a75..HEAD` touches exactly 11 files: the 2
fix commits' 10 source/test files + `.specs/STATE.md`, nothing else — confirms no unrelated
regression surface).
**Verifier**: independent sub-agent (author ≠ verifier) — fresh agent each iteration, no
context inherited from the implementation workers or from the prior Verifier run.

---

## Iteração 2 — Re-verificação dos Fixes (2026-09-08)

Fresh Verifier, no memory of iteration 1's reasoning — re-derived both fixes independently
from the diff and re-ran the full gate + a new discrimination sensor targeted at the fixed
code. **Verdict: both gaps are genuinely closed — ✅ PASS, no open gaps.**

### Fix 1 (Major — Takeover/AC5, assignee name) — ✅ CLOSED

- **Backend**: `apps/crm-api/src/services/conversation.service.ts:50-67` —
  `resolveAssigneeName` (used by `takeoverConversation:126` and `releaseConversation:138`)
  and `attachAssigneeNames` (used by `listConversations:73-83`) both resolve the real
  `User.name` via `findUserView` (same function already used for the 409 conflict message),
  and are wired into all three endpoints (`GET /conversations`, `POST /:id/takeover`,
  `POST /:id/release`).
- **Frontend**: `apps/web/src/routes/_private/inbox/@components/conversation-queue.tsx:21-27`
  and `takeover-badge.tsx:74-79` now render `conversation.assigneeName` directly, replacing
  the `t('inbox.assignee.you')`/`t('inbox.assignee.other')` placeholder (and the now-unused
  `sessionQuery` dependency was removed from both).
- **Non-shallow evidence** (real value, not a placeholder existence check):
  - `apps/crm-api/src/routers/conversation.router.e2e.test.ts:262-263` —
    `expect(res.body.data.assigneeName).toBe(user.name); expect(res.body.data.assigneeName).not.toBe(user.id)` (takeover)
  - `apps/crm-api/src/routers/conversation.router.e2e.test.ts:629-631` —
    `expect(humanItem?.assigneeName).toBe(assigneeOperator.name); ...not.toBe(assigneeOperator.id); expect(botItem?.assigneeName).toBeUndefined()` (GET /conversations)
  - `apps/web/src/routes/_private/inbox/@components/conversation-queue.unit.test.tsx:87-100` —
    `expect(await screen.findByText('Ana')).toBeInTheDocument()` / `:113-129` —
    `expect(await screen.findByText('Carlos')).toBeInTheDocument()` (two distinct real names, not a fixed placeholder)
  - `apps/web/src/routes/_private/inbox/@components/takeover-badge.unit.test.tsx:118-121` —
    `expect(await screen.findByText('Ana')).toBeInTheDocument()`
- **Sensor confirmation**: two fresh mutations (below) killed by these exact tests — the
  assertions target the literal name value, not just "a name exists."

### Fix 2 (Minor — Edge Case 1, WS reconnect resync) — ✅ CLOSED

- **Code**: `apps/web/src/hooks/useInboxSocket.ts:123-126` — the `open` handler now calls
  `queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })` unconditionally,
  and `queryClient.invalidateQueries({ queryKey: messageKeys.listsForConversation(conversationIdRef.current) })`
  when a thread is open, immediately after resubscribing.
- **Non-shallow evidence** (exact queryKey args, not just call count):
  - `apps/web/src/hooks/useInboxSocket.unit.test.tsx:174-181` —
    `expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationKeys.lists() }); expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: messageKeys.listsForConversation('conv-1') })` on a close→backoff→new-socket→open cycle
  - `apps/web/src/hooks/useInboxSocket.unit.test.tsx:184-196` —
    `expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith({ queryKey: conversationKeys.lists() })` when no thread is open (proves the thread key is NOT invalidated when there's nothing to resync — a real conjunction check, not a loose "called at least once")

### Discrimination Sensor — iteration 2 (3 new mutations, scratch state, all reverted)

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `apps/crm-api/src/services/conversation.service.ts:53` | `resolveAssigneeName` forced to `return undefined;` regardless of `findUserView` result | ✅ Killed — `conversation.router.e2e.test.ts` ("responds with the real assignee name...") failed: `expected undefined to be 'Fulano de Tal'` |
| 2 | `apps/crm-api/src/services/conversation.service.ts:66` | `attachAssigneeNames` made a no-op (`return items;`, dropping the `assigneeName` map) | ✅ Killed — `conversation.router.e2e.test.ts` ("includes the real assignee name...") failed: `expected undefined to be 'Operadora Responsável'` |
| 3 | `apps/web/src/hooks/useInboxSocket.ts:123-126` | Removed both `invalidateQueries` calls from the `open` handler | ✅ Killed — both new `useInboxSocket.unit.test.tsx` reconnect-resync tests failed with `Number of calls: 0` |

**Result**: 3/3 new mutations killed (6/6 across both iterations, once combined with
iteration 1's 3). No surviving mutants. All mutations applied via `Edit` on the real tree
and reverted with `git checkout --` immediately after each run; `git status --short` and
`git diff --stat` confirmed empty before moving to the next mutation and at the end of the
sensor pass.

### Gate Check — iteration 2

- **Command**: `pnpm run check` (same Build gate as iteration 1).
- **Result**: exit `0`, **879 tests passed, 0 failed, 0 skipped**, 131 files (874 iteration-1
  baseline + 3 Fix 1 tests + 2 Fix 2 tests = 879, matching the implementer's reported count).
- **Flake note**: one interim re-run (not the run of record) showed 1 failure in
  `apps/crm-api/tests/integration/tenant-isolation.int.test.ts` ("GET /field-templates/:id/versions/:version responds 404 for tenant B") — re-running that file alone passed cleanly
  (12/12), and a clean full `pnpm run check` re-run immediately after also passed 879/879.
  This is the pre-existing, already-documented flake from the shared `MongoMemoryServer`
  instance across the `integration`/`e2e` Vitest projects (`.specs/STATE.md`, Trade-off
  note under AD-017/AD-031; also flagged during the original Execute batch 3). The failing
  test belongs to `crm-web-shell`'s field-templates feature (`WEB-14`), entirely outside
  this feature's diff surface — not a regression introduced by either fix.
- **No other ACs regressed**: `git diff --stat 23d4a75..HEAD` touches only the 11 files
  listed above; no file outside the Fix 1/Fix 2 scope was modified, so the other 22 ACs
  validated in iteration 1 (whose code was untouched) stand without needing re-derivation.

### Iteration 2 verdict

**Overall**: ✅ Ready — both gaps from iteration 1 are closed with non-shallow,
value-specific evidence; the new discrimination-sensor mutations targeting exactly the
fixed code are all killed; the gate is green (879/879); no unrelated files were touched.
Fix 3 (advisory-only, `conversationQuery(id)` naming mismatch in tasks.md) required no
code change in iteration 1 and remains unchanged — it was never a spec.md AC violation.

**Ranked gaps**: none. Feature is ready to merge.

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
| 5 | UI visibly shows `mode` and, when `human`, the assignee's **name** | Spec text: "o nome do assignee" (the operator's actual name) | ~~`apps/web/src/routes/_private/inbox/@components/takeover-badge.tsx:74-84` (iteration 1, now stale) — showed `t('inbox.assignee.you')`/`t('inbox.assignee.other')` placeholder~~ **Iteration 2 (Fix 1, `8695bb9`) — closed**: `apps/crm-api/src/services/conversation.service.ts:50-67` resolves `assigneeName` server-side (`findUserView`, same fn as the 409 message) for `GET /conversations`/`takeover`/`release`; `apps/web/.../conversation-queue.tsx:21-27` + `takeover-badge.tsx:74-79` render it directly. Proof with real values (not placeholders): `conversation.router.e2e.test.ts:262-263` — `expect(res.body.data.assigneeName).toBe(user.name)`; `:629-631` — `expect(humanItem?.assigneeName).toBe(assigneeOperator.name)`; `conversation-queue.unit.test.tsx:87-100`/`:113-129` — `expect(await screen.findByText('Ana'))`/`findByText('Carlos')`; `takeover-badge.unit.test.tsx:118-121` — `findByText('Ana')` | ✅ PASS (iteration 2) |

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

**Status (iteration 1)**: 23/24 ACs matched the spec's precise outcome. 1 GAP flagged
(Takeover/AC5, self-documented `SPEC_DEVIATION`, see Fix Plans). 0 vague/unclaimed
spec-precision gaps — every AC above has a specific value/state being asserted, not a
generic "no error" assertion.

**Status (iteration 2, current)**: **24/24 ACs matched the spec's precise outcome.**
Takeover/AC5 closed by Fix 1 (`8695bb9`) — see the updated row above and the "Iteração 2"
section at the top of this file for full evidence.

---

## Edge Cases

| # | Edge Case | `file:line` + assertion | Result |
|---|---|---|---|
| 1 | WS client loses connection → UI reconnects automatically **and** resyncs via normal `GET` (never stuck showing stale data without indication) | Reconnect: `apps/web/src/hooks/useInboxSocket.unit.test.tsx:134-150` — new socket instance created after backoff delay. **Iteration 2 (Fix 2, `b78a91c`) — resync now closed**: `apps/web/src/hooks/useInboxSocket.ts:123-126` — the `open` handler now calls `queryClient.invalidateQueries({queryKey: conversationKeys.lists()})` unconditionally and `invalidateQueries({queryKey: messageKeys.listsForConversation(...)})` when a thread is open. Proof with exact args (not just call count): `useInboxSocket.unit.test.tsx:174-181` — `expect(invalidateSpy).toHaveBeenCalledWith({queryKey: conversationKeys.lists()}); expect(invalidateSpy).toHaveBeenCalledWith({queryKey: messageKeys.listsForConversation('conv-1')})`; `:184-196` — `expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith({queryKey: conversationKeys.lists()})` when no thread is open (proves the thread key is correctly NOT invalidated absent an open thread) | ✅ Fully handled (iteration 2) |
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

**Iteration 2 update**: 3 additional mutations targeted specifically at Fix 1/Fix 2 — all
3/3 killed. See the "Iteração 2" section at the top of this file for the mutation table.
**Combined total: 6/6 mutations killed across both iterations.**

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
| Spec-anchored outcome check | ✅ (24/24, iteration 2) | See AC table — was 23/24 (Takeover AC5 gap) in iteration 1, closed by Fix 1 |
| Per-layer Coverage Expectation met | ✅ | Domain logic (repository) has 1:1 AC mapping with dedicated `it()` blocks; router/e2e layer covers happy + edge (403/404/409/400/502) for every route in scope |
| Every test maps to a spec AC/edge case/Done-when — no unclaimed tests | ✅ | Sampled test files consistently cite `INBOX-NN`/`spec.md`/`AC` references in test names |
| Documented guidelines followed | ✅ | `.specs/STATE.md` AD-017 (Vitest `unit`/`integration`/`e2e`/`structural` projects, suffix convention) and `apps/web/CLAUDE.md` (route/component `@tanstack/react-router` mock, `t()`/`formatDate` usage, `<DataTable>` server-driven) both followed exactly |

❌ No "No" answers found in the sampled files.

---

## Gate Check

**Iteration 1** (superseded numbers, kept for history):
- **Gate command**: `pnpm run check` (`pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`) — the Build gate from `tasks.md`.
- **Result**: exit code `0`. 874 tests passed, 0 failed, 0 skipped, across 131 test files. Biome reported 9 pre-existing `noExplicitAny` warnings in `apps/web/src/routes/_private/customers/list/index.tsx` (a file untouched by this feature's diff) — warnings, not errors; they do not fail `biome check`.
- **Test count before feature**: 740 tests / 118 files (measured via an isolated `git worktree add <scratch> main` + `pnpm install` + `pnpm vitest run`, never touching the real working tree).
- **Test count after feature**: 874 tests / 131 files.
- **Delta**: +134 tests / +13 new test files, 0 tests removed.
- **Test Integrity Check**: `git diff --numstat main..HEAD` shows zero deletions in every test file touched by this feature (existing test files — `authentication.middleware.int.test.ts`, `conversation.repository.int.test.ts`, `conversation.router.e2e.test.ts`, `server.int.test.ts` — only gained lines; no assertion was weakened or removed).
- **Skipped tests**: none.
- **Failures**: none.

**Iteration 2** (current numbers):
- **Gate command**: same (`pnpm run check`), re-run independently 3 times.
- **Result**: exit code `0` on the run of record. **879 tests passed, 0 failed, 0 skipped,
  across 131 test files.** Same 9 pre-existing, out-of-scope Biome `noExplicitAny`
  warnings (untouched file) — do not fail the gate.
- **Test count before this fix batch**: 874 tests / 131 files (iteration 1's after-count).
- **Test count after this fix batch**: 879 tests / 131 files.
- **Delta**: +5 new tests (3 for Fix 1, 2 for Fix 2), 0 tests removed, 0 test files added
  (all 5 new tests live in existing files).
- **Test Integrity Check**: `git diff --numstat 23d4a75..HEAD` on test files shows only
  additions in `conversation.router.e2e.test.ts`/`useInboxSocket.unit.test.tsx`, plus two
  pre-existing assertions rewritten (documented in Fix 1 above: `conversation-queue.unit.test.tsx`/`takeover-badge.unit.test.tsx` previously asserted the placeholder text
  "Você"/"Outro operador"/"Carlos"-equivalent generic label; now assert the real injected
  name — a legitimate strengthening tied directly to closing the gap, not a weakening).
- **Skipped tests**: none.
- **Failures on the run of record**: none. One interim re-run hit the pre-existing
  `MongoMemoryServer`-sharing flake in an unrelated `crm-web-shell` test — see the
  "Iteração 2" section above for detail; isolated re-run of that file passed 12/12.

---

## Fix Plans

**Status update (iteration 2, 2026-09-08): Fix 1 and Fix 2 below are both ✅ CLOSED.**
Verified independently with `file:line` evidence in the "Iteração 2" section at the top of
this file — not just re-stated from the implementer's commit messages. Fix 3 remains
advisory-only (no code change was ever required).

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
| INBOX-10 | P1: Takeover/release seguro | Pending | ✅ Verified (iteration 2 — Fix 1 `8695bb9` closed the gap, see updated AC5 row above) |
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

### Iteration 1 (superseded — kept for history)

**Overall**: ⚠️ Issues (PASS with 2 gaps flagged — consistent with this repo's precedent of
shipping a P1 feature with minor, well-understood gaps rather than blocking on them, see
`crm-web-shell`'s "PASS (2 minor gaps flagged)").

**Spec-anchored check**: 23/24 ACs matched the spec's precise outcome; 1 gap (Takeover
AC5 — assignee name).
**Sensor**: 3/3 mutations killed.
**Gate**: 874 passed, 0 failed, 0 skipped (exit 0).

**Issues found**:
1. Takeover/release UI shows a generic "Você"/"Outro operador" label instead of the
   assignee's real name in the queue and badge (only the 409 toast carries the real
   name) — Fix 1 above.
2. WS reconnect does not trigger a `GET` resync of the queue/thread caches — Fix 2 above.
3. (Advisory only) `conversationQuery(id)` from tasks.md/T18 was never built; functionally
   compensated for, but worth tightening in future task authoring — Fix 3 above.

### Iteration 2 (current — final verdict)

**Overall**: ✅ Ready. Both gaps from iteration 1 are closed with non-shallow,
value-specific evidence (real names asserted, exact `invalidateQueries` args asserted) and
a fresh discrimination sensor targeted at the exact fixed lines — no gaps remain open.

**Spec-anchored check**: 24/24 ACs matched the spec's precise outcome (was 23/24; Fix 1
closed Takeover/AC5).
**Sensor**: 6/6 mutations killed across both iterations (3 iteration 1 + 3 iteration 2).
**Gate**: 879 passed, 0 failed, 0 skipped (exit 0) — re-run 3 times for confirmation; one
interim run hit the pre-existing, already-documented `MongoMemoryServer`-sharing flake in
an unrelated `crm-web-shell` test file, isolated and confirmed unrelated to this feature.

**What works**: Live queue + thread over WebSocket (poller-driven, ~2s cadence, tenant-
scoped rooms), claim-conditional takeover with named 409 conflict and unconditional
release (concurrency-safe, mutation-tested), takeover/release/queue now show the
assignee's real name everywhere (Fix 1), WS reconnect resyncs both queue and open-thread
caches via `invalidateQueries` (Fix 2), 24h-window-aware composer with `wa.me` fallback
(uses phone verbatim, no normalization), failed-message resend as an independent clone
(original provably immutable, mutation-tested), on-demand media proxy with no persistence
and a readable 502 on Meta failure, structured WS/media observability logs.

**Issues found**: none open.
1. ~~Takeover/release UI shows a generic label instead of the real name~~ — ✅ CLOSED (Fix 1, `8695bb9`).
2. ~~WS reconnect does not resync via GET~~ — ✅ CLOSED (Fix 2, `b78a91c`).
3. (Advisory only, no code change ever required) `conversationQuery(id)` from tasks.md/T18
   naming mismatch — unchanged, informational for future task authoring.

**Next steps**: None required for this feature — ready for merge/PR. Fix 3 remains a
process note only (future `tasks.md` authoring hygiene), not a blocker.
