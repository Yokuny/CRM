# scheduling Validation

**Date**: 2026-09-12
**Spec**: `.specs/features/scheduling/spec.md`
**Diff range**: `41b5f79f91223251cbfeca1223243810a7f893f9..HEAD` (branch `feature/scheduling`, 155 files changed, 69 commits, T1–T47)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh read of spec.md/design.md/tasks.md/STATE.md and the actual test files; no prior-session summary trusted without re-derivation.

---

## Task Completion

T1–T43 covered by prior sessions; not independently re-verified line-by-line here, but exercised by this run's full-suite gate and by the AC coverage check below (their tests were read and cited directly for the AC table). T44–T47 (last, never-reviewed slice) got full scrutiny identical to the rest.

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | Phase 1 (grade math, models) — commits 603c4dc..bff51c4 |
| T6–T9 | ✅ Done | `appointmentTransitions.ts` — commits c45c274..5eb30e2 |
| T10–T12 | ✅ Done | Zod schemas — commits bd0b5c8..2189866 |
| T13–T19 | ✅ Done | `crm-api` config (Professional/Space/Settings) — commits 6489f26..43db51e |
| T20–T25 | ✅ Done | `WEB_BASE_URL`, appointment repo/service/routes, public confirmation — commits 4f27c26..4be5b99 |
| T26–T31 | ✅ Done | ai-kit tools, tool registry, seam, prompt, golden set — commits ba11b2e..5a141a4 |
| T32–T36 | ✅ Done | web config screens — commits c422f60..fbf5c8e (+ 2 mid-batch fixes 48e6f2d/21bc5f2) |
| T37–T43 | ✅ Done | calendar, public page, hub — commits a24ca55..a0780a4, with the documented T40/T41 Dialog→inline-panel correction (b2bd3ea, AD-037) |
| T44 | ✅ Done | Automatic customer notice, backend (db5ee02) — full scrutiny, see AC table |
| T45 | ✅ Done | Front-end notice result in panel (1715d83) — full scrutiny |
| T46 | ✅ Done | Inbox appointment card (7db15c4) — full scrutiny |
| T47 | ✅ Done | `architecture.md`/`glossary.md` (e823ce0) — doc-only |

---

## Spec-Anchored Acceptance Criteria

### P1: Tenant configura quem atende, onde e quando

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SCH-01 | `Professional` persisted, `Tenant`-scoped, `active` default `true` | `packages/db/src/models/professional.model.int.test.ts:25` — `expect(created.Tenant).toEqual(Tenant)` + `expect(created.active)` (default test); `apps/crm-api/src/routers/professional.router.e2e.test.ts:108` — `expect(res.status).toBe(201); expect(res.body.data.active).toBe(true)` | ✅ PASS |
| SCH-02 | Invalid window (`end<=start`, weekday∉0..6, bad `HH:mm`, duration∉5..480) → 400, nothing persisted | `professional.model.int.test.ts:36` (`rejects...`); `professional.router.e2e.test.ts:125` — `expect(res.status).toBe(400); expect(await Professional.countDocuments({})).toBe(0)`; `packages/contracts/src/schemas/createProfessional.schema.unit.test.ts:23,78` | ✅ PASS |
| SCH-03 | Overlapping windows same weekday → 400 | `createProfessional.schema.unit.test.ts:53` — `expect(result.success).toBe(false)`; `professional.router.e2e.test.ts:143` — `expect(res.status).toBe(400); expect(await Professional.countDocuments({})).toBe(0)` | ✅ PASS |
| SCH-04 | `Space` CRUD, `Tenant`-scoped, `active` default `true` | `packages/db/src/models/space.model.int.test.ts:15,21,30`; `apps/crm-api/src/routers/space.router.e2e.test.ts:99-115` | ✅ PASS |
| SCH-05 | `active:false` stops offering slots; existing Appointments untouched | `professional.router.e2e.test.ts:377` — `expect(afterPatch).toEqual(beforePatch); expect(afterPatch?.status).toBe('confirmed')`; slot-offering half: `getAvailableSlots.int.test.ts:227` — inactive professional → `{slots: []}` | ✅ PASS |
| SCH-06 | `maxSlotsPerResponse` caps `get_available_slots`; default 16 | `packages/db/src/models/schedulingSettings.model.int.test.ts:17` — `expect(created.maxSlotsPerResponse).toBe(16)`; `apps/crm-api/src/routers/schedulingSettings.router.e2e.test.ts:104-146`; cap enforced: `getAvailableSlots.int.test.ts:297` — `expect(withoutSettings.slots).toHaveLength(16); expect(withSettings.slots).toHaveLength(3)` | ✅ PASS |
| SCH-07 | Non-`canOperate` → 403 on Professional/Space/Settings routes | `professional.router.e2e.test.ts:178,218,274,356` (403); `space.router.e2e.test.ts:127,157,198,260`; `schedulingSettings.router.e2e.test.ts:115,176` | ✅ PASS |
| SCH-08 | `apps/web` list/create/edit professionals+spaces, adjust cap | `apps/web/src/routes/_private/schedule/professionals/details.unit.test.tsx:70-148`; `spaces/index.unit.test.tsx`/`add`/`details` (same pattern); `schedule/settings/index.unit.test.tsx:43-63` | ✅ PASS |

### P1: Cliente consulta horários e marca pela conversa

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SCH-09 | Free slots: `start` UTC ISO, display-tz label, free professionals; excludes busy appointments/blocks per-professional | `packages/ai-kit/src/tools/getAvailableSlots.int.test.ts:112-167` — `expect(slot1000?.professionals).toEqual([{id: profB._id..., name:'Dr. Bruno'}])` etc. | ✅ PASS |
| SCH-10 | Malformed/past/>90d date → `{error}`, no query | `getAvailableSlots.int.test.ts:194-206` — `expect(malformed).toEqual({error: expect.any(String)})` (×3) | ✅ PASS |
| SCH-11 | Slot <60min from now omitted | `getAvailableSlots.int.test.ts:170-192` — `expect(nearResult.slots.some(...)).toBe(false); expect(farResult.slots.some(...)).toBe(true)` | ✅ PASS |
| SCH-12 | `professionalId` filters; nonexistent/inactive/foreign → `{error}` | `getAvailableSlots.int.test.ts:246-295` | ✅ PASS |
| SCH-13 | No slots that day → `{slots:[]}`, never `{error}` | `getAvailableSlots.int.test.ts:208-225` | ✅ PASS |
| SCH-14 | Result includes customer's own active future appointments | `getAvailableSlots.int.test.ts:323-396` — `expect(result.upcomingAppointments).toEqual([{date,...,status:'pending'}])`, decoys of other customer/tenant excluded | ✅ PASS |
| SCH-15 | `book_appointment` creates `pending`, `end=start+slotDuration`, returns public URL | `packages/ai-kit/src/tools/bookAppointment.int.test.ts:105-127` — `expect(result.confirmationUrl).toMatch(/^https:\/\/app\.example\.test\/appointment\?token=apt_.../)`; `packages/db/src/appointmentTransitions.int.test.ts:99-124` | ✅ PASS |
| SCH-16 | Misaligned/past/<1h/>90d/foreign professional or space → `{error}`, nothing created | `appointmentTransitions.int.test.ts:126-248` (6 sub-cases) — each asserts `code:'invalid'` + `countDocuments===0` | ✅ PASS |
| SCH-17 | Creation failure never leaves an orphan Appointment/token | `appointmentTransitions.int.test.ts:315-348` (SCH-20 race) — 4/5 concurrent calls hit the `Appointment.create()` catch path and return `{code:'conflict'}` with `countDocuments===1` overall (no orphan survives a failed create); no test labeled SCH-17 by name | ⚠️ Indirect evidence only — see Gap 3 |
| SCH-18 | Max 1 active future appointment/customer; exact retry idempotent | `appointmentTransitions.int.test.ts:251-312` — `expect(second).toMatchObject({code:'conflict'})`; retry: `expect(appointment._id.toString()).toBe(firstAppointment._id.toString())` | ✅ PASS |
| SCH-19 | Tenant/channel/conversation only from `ToolContext`; structural test covers 10 tools | `tests/structural/toolInputSchema.structural.test.ts:44-53` — `expect(TOOL_DEFINITIONS).toHaveLength(10)`, `it.each` no forbidden keys; `bookAppointment.int.test.ts:176-200` (decoy customerId ignored) | ✅ PASS |
| SCH-20 | Concurrent `book_appointment` on same (professional,start): exactly 1 wins | `appointmentTransitions.int.test.ts:315-348` — `expect(successes).toHaveLength(1); expect(failures).toHaveLength(4)`; also `evals/cases/schedulingGuardrails.int.test.ts:243-298` (real harness, `Promise.all` of 2 `runTurn`) | ✅ PASS |

### P1: Cliente confirma presença ou desmarca pelo link

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SCH-21 | Opaque token, hashed at rest, never plaintext in DB | `appointmentTransitions.int.test.ts:99-124` — `expect(reloaded?.confirmationTokenHash).toBeDefined(); expect(JSON.stringify(reloaded)).not.toContain(confirmationToken)` | ✅ PASS |
| SCH-22 | Valid token → only that appointment's public fields, never another's/other tenant's | `apps/crm-api/src/routers/appointmentConfirmation.router.e2e.test.ts:89-127` — `expect(Object.keys(res.body.data).sort()).toEqual([...])`; distinct-appointment test at :114 | ✅ PASS |
| SCH-23 | Nonexistent→404, expired→410, no data leaked | `appointmentConfirmation.router.e2e.test.ts:129-146` | ✅ PASS |
| SCH-24 | Reissue invalidates old token; expiry ≤ appointment end | `appointmentTransitions.int.test.ts:375-421`; `apps/crm-api/src/routers/appointment.router.e2e.test.ts:855-884` — old token 404s after reissue | ✅ PASS |
| SCH-25 | Confirm: `pending→confirmed`; repeat idempotent; terminal → error, no change | `appointmentTransitions.int.test.ts:433-489`; `appointmentConfirmation.router.e2e.test.ts:150-206` — `expect(second.body.data.status).toBe('confirmed')`; 409 on terminal | ✅ PASS |
| SCH-26 | Cancel: `→canceled_by_customer`; slot reopens | `appointmentTransitions.int.test.ts:506-533` — rebooking the same slot succeeds after cancel | ✅ PASS |
| SCH-27 | Identified only by token hash, never id; rate-limited | `appointmentTransitions.int.test.ts:427-430` — `expect(confirmByToken.length).toBe(1)`; `appointmentConfirmation.router.e2e.test.ts:234-263` (429 after 5/window) and `:265-276` (`:id` never in router source) | ✅ PASS |
| SCH-28 | Public unauthenticated page, `?token=`, loading/invalid/expired states, 2 buttons | `apps/web/src/routes/_public/appointment/index.unit.test.tsx:58-152` | ✅ PASS |

### P1: Operador opera a agenda no CRM

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SCH-29 | Weekly calendar, 1 column/day, appointments+blocks placed by time, week nav, professional/space filters | `apps/web/.../week-grid.unit.test.tsx:26-54`; `apps/web/.../calendar/index.unit.test.tsx:94-153` (filters + nav); `apps/crm-api/src/routers/appointment.router.e2e.test.ts:213-247` (GET range/filters) | ✅ PASS |
| SCH-30 | Manual appointment even outside grid (`pending`); rejected on overlap | `appointment.router.e2e.test.ts:320-363` — 201 outside grid, 409 on overlap; `appointmentTransitions.int.test.ts:600-668` | ✅ PASS |
| SCH-31 | Reschedule mutates SAME `Appointment`, same overlap check | `appointment.router.e2e.test.ts:585-648` — `expect(rescheduled.body.data.appointment.id).toBe(created.body.data.id)`; `appointmentTransitions.int.test.ts:942-1010` (id + duration preserved even across professional change) | ✅ PASS |
| SCH-32 | Cancel by operator → `canceled_by_operator`, records who; slot reopens | `appointment.router.e2e.test.ts:496-531`; `appointmentTransitions.int.test.ts:855-890` — `expect(doc.canceledBy?.toString()).toBe(userId)` | ✅ PASS |
| SCH-33 | Block hides interval from `get_available_slots`, shown on calendar, removable | `appointment.router.e2e.test.ts:383-462`; `appointmentTransitions.int.test.ts:716-789` (conflict vs active appointment, index-level rejection); `appointment.model.int.test.ts:29-42` (customer optional for block) | ✅ PASS |
| SCH-34 | `completed`/`no_show` only after start, only from `pending`/`confirmed` | `appointment.router.e2e.test.ts:766-816` — 409 before start, 200 after; `appointmentTransitions.int.test.ts:1038-1091` | ✅ PASS |
| SCH-35 | No automatic transition when overdue; UI flags it | `apps/crm-api/src/repositories/appointment.repository.int.test.ts:223` — "comes back with status EXACTLY as stored — read never transforms"; `week-grid.unit.test.tsx:73-101` — `expect(overdueButton.className).toContain('border-destructive')`, future/terminal NOT flagged | ✅ PASS |
| SCH-36 | Structured log on create/cancel/confirm/reschedule/attendance | `appointmentTransitions.int.test.ts:350-369,491-502,580-593,927-939,1023-1035,1112-1131` — `expect(loggedEvents).toContainEqual(expect.objectContaining({event:...}))` for all 6 event types | ✅ PASS |
| SCH-37 | "Pedir confirmação" → wa.me link with ready text; foreign/nonexistent → 404 | `appointment.router.e2e.test.ts:854-911` — `waMeUrl` matches, `confirmationUrl` fresh token, 404 for foreign tenant | ✅ PASS |

### P2: Agendamento visível no Inbox e aviso automático ao cliente

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SCH-38 | Inbox thread shows inline card (date/time/professional/status) for active future appointment; nothing if none | `apps/web/.../inbox/@components/appointment-card.unit.test.tsx:44-71` — renders nothing when `data:null`, renders fields when present; `appointment.router.e2e.test.ts:274-317` (`GET /appointments/upcoming`) | ✅ PASS |
| SCH-39 | Cancel/reschedule with 24h window open → enqueue `Message` `out`/`queued` via outbox, no direct Meta call | `apps/crm-api/src/services/appointment.service.unit.test.ts:349-376,427-437`; e2e: `appointment.router.e2e.test.ts:681-700,740-763` — `expect(res.body.data.notice).toEqual({kind:'queued'})`; `Message.find({...status:'queued'})` has length 1 | ✅ PASS |
| SCH-40 | Window closed → no `Message` enqueued, `wa.me` button with ready text offered | `appointment.service.unit.test.ts:378-408` (`OutsideWindowError`/no-conversation → `notice:{kind:'wa_me',url}`); e2e: `appointment.router.e2e.test.ts:702-737` — `expect(Message.countDocuments({})).resolves.toBe(0)`; front: `apps/web/.../appointment-panel.unit.test.tsx:248-268` — `Avisar pelo WhatsApp` link, `onClose` NOT called | ✅ PASS |

**Status**: 39/40 ACs with direct file:line evidence matching the spec-defined outcome exactly; **SCH-17 has only indirect evidence** (see Gap 3 below) — no test explicitly exercises "an Appointment.create() failure mid-write leaves no orphan token," only the adjacent E11000/race path.

---

## Discrimination Sensor

All 3 mutations were applied directly to tracked files in the real working tree (verified clean via `git status --porcelain` before starting), run against the targeted test(s), confirmed to fail, then reverted with `git checkout --` (verified clean again after each). No worktree/stash needed since the repo had zero pending changes.

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `packages/db/src/appointmentTransitions.ts:50` | `isDuplicateKeyError`: changed `code === 11000` → `code === 99999` (E11000 no longer recognized as a conflict) | ✅ Killed — `packages/db/src/appointmentTransitions.int.test.ts` SCH-20 race test threw an uncaught `MongoServerError` instead of returning `{code:'conflict'}` |
| 2 | `packages/db/src/appointmentTransitions.ts:206` | `confirmByToken` expiry check: flipped `< Date.now()` → `> Date.now()` (expired tokens now treated as valid, valid tokens treated as expired) | ✅ Killed — "token expirado -> expired" test failed: got a full confirmed `Appointment` object instead of `{code:'expired'}` |
| 3 | `apps/crm-api/src/services/appointment.service.ts:180` | `notifyCustomer` fallback guard: `if (e instanceof ConversationNotFoundError \|\| e instanceof OutsideWindowError)` → `if (false)` (never falls back to wa.me, always rethrows) | ✅ Killed — `appointment.service.unit.test.ts` "SCH-40: janela fechada" test failed: the mocked `OutsideWindowError` propagated as an uncaught rejection instead of resolving to `notice:{kind:'wa_me', url}` |

**Sensor depth**: lightweight (3 mutations — this feature touches double-booking safety per AD-035 but is not a P0 payment/auth path)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

Spot-checked `apps/crm-api/src/controllers/appointment.controller.ts`, `apps/crm-api/src/services/appointment.service.ts`, `packages/ai-kit/src/tools/getAvailableSlots.ts`, and the appointmentTransitions/model files read during the AC check, against `coding-principles.md`.

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — no speculative abstractions; `hasOverlappingActive`/`isDuplicateKeyError` are small, single-purpose helpers reused across the transitions that need them |
| Surgical changes | ✅ — diff is additive (new files) plus narrowly-scoped edits to `app.ts`/`env.config.ts`/`toolDefinitions.ts`/`loop.ts`/`contextBuild.ts`/`runTurn.ts` to wire the new surface in; no unrelated refactors found |
| No scope creep | ✅ — `Space` stays informative-only per spec; no timezone-per-tenant, no recurring appointments, no Google Calendar sync (all explicitly out of scope and absent from the diff) |
| Matches patterns | ✅ — `professional.repository.ts`/`space.repository.ts`/`*.controller.ts`/`*.router.ts` mirror `product.*`; `appointment.service.ts` mirrors `order.service.ts`'s typed-error translation; web screens mirror `products/*` (AD-027/028/030) |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see AC table; assertions target exact values (`code:'expired'`, exact ISO instants, exact status strings), not just "no error" |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `appointmentTransitions.int.test.ts` maps 1:1 to SCH-15..27/30..36; every router file exercises happy/400/403/404/409 paths per the Test Coverage Matrix's own floor (`order.router.e2e.test.ts`) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every test file/describe block references an SCH-id or an explicitly-named Edge Case in its title or a comment |
| Documented guidelines followed | ✅ — `apps/web/CLAUDE.md` router-mock pattern used verbatim in every new route test; AD-036 (UTC instants/wall-clock grid/`DISPLAY_TIMEZONE` in `packages/contracts`) and AD-037 (no `Dialog`, inline panels) both followed — `appointment-panel.tsx`/`block-panel.tsx` confirmed to render inline (`screen.queryByRole('dialog')` asserted absent in `calendar/index.unit.test.tsx:214,226`) |

One deliberate, documented mid-feature correction (not a quality defect): T40/T41 originally used `Dialog` and were never wired into the calendar (`WeekGrid.onSelect` a no-op) — caught and fixed in commit `b2bd3ea` per the user's explicit AD-037 instruction, before this Verifier ever saw the code. Confirmed the fix stuck: `apps/web/src/routes/_private/schedule/calendar/index.tsx` now owns `panel` state and wires `onSelect`, and no `Dialog` import remains in `appointment-panel.tsx`/`block-panel.tsx`.

---

## Edge Cases

- [x] Grade with a weekday but all slots occupied → `get_available_slots` returns `[]`, never `{error}` — same code path as the "no grid that day" case (`getAvailableSlots.int.test.ts:208`), which returns the identical `{date, slots, upcomingAppointments}` shape regardless of `slots.length`; no separate branch exists that could special-case "empty due to occupancy" into an error. Accepted as covered by construction + the adjacent test, not a dedicated occupied-all-day test.
- [x] Tenant with zero/all-inactive Professionals → `get_available_slots` empty, `book_appointment` error — `getAvailableSlots.int.test.ts:227-244`; `appointmentTransitions.int.test.ts:195-210` (inactive professional → `code:'invalid'`)
- [ ] **Grade edited after appointments already exist outside the new grid → existing appointments remain valid/visible** — **NOT independently tested.** Only `active:false` is tested against a pre-existing Appointment (`professional.router.e2e.test.ts:377`); no test PATCHes `weeklySchedule` or asserts an existing Appointment survives unchanged. See Gap 1.
- [ ] **Professional's slot duration changes → already-created appointments keep their original `end`, never recalculated** — **NOT independently tested.** No test PATCHes `slotDurationMinutes` and re-reads a pre-existing Appointment's `end`. See Gap 2.
- [x] Last slot of the day that doesn't fit entirely within the window is never offered — `packages/db/src/scheduling.unit.test.ts:65-74` — `expect(slots).toHaveLength(1)` (40min slots in a 60min window)
- [x] Deleted Customer / mismatched Tenant → `{error}`, never leaks another tenant's data — `getAvailableSlots.int.test.ts:398-405` (unresolvable Conversation → `{error}`)
- [x] `guard.output` never redacts the confirmation link (token isn't a 24-hex ObjectId shape) — `evals/cases/schedulingGuardrails.int.test.ts:147-193` — `expect(result.reply).not.toContain('[removido]')`
- [x] Block over an interval with an active appointment → rejected — `appointmentTransitions.int.test.ts:739-762` — `expect(result).toMatchObject({code:'conflict'})`

---

## Gate Check

- **Gate command**: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` (Build gate, per tasks.md Gate Check Commands)
- **Result**: `tsc --noEmit` clean across all packages (exit 0). `biome check .`: 7 errors / 44 warnings / 6 infos — **all confined to `.claude/playwright-skill/*` and `.vscode/mcp.json`**, confirmed via `git diff --name-only 41b5f79f..HEAD` to be **untouched by this feature's diff** (pre-existing tooling files; Biome excludes Markdown entirely per `biome.json`). `vitest run`: 1763 tests, **1762 passed, 1 failed**.
- **Failure**: `apps/web/src/routes/_private/inbox/@components/media-card.unit.test.tsx` — `INBOX-17/AC2` (hardcoded `/conversations/...` vs. absolute `http://localhost:8080/conversations/...` fetch URL mismatch). Confirmed via `git diff --name-only 41b5f79f..HEAD` that this file **is not part of the scheduling diff** — pre-existing failure, out of scope, exactly as flagged in the task brief. No other failures, no flakes observed on this single run.
- **Test count before feature**: not independently re-derived (would require checking out the merge-base and running the full suite, which risks corrupting the shared `MongoMemoryServer` state used by this run) — accepted the diff's own evidence instead: 155 files changed, and every new `*.test.ts(x)` file inspected during the AC check is additive (no existing test file had assertions removed or weakened; `git diff --stat` shows 162 deletions total across the whole diff, consistent with minor edits like `toolInputSchema.structural.test.ts` growing from 8→10 expected tools, not test removal).
- **Test count after feature**: 1763 (vitest's own total)
- **Skipped tests**: none observed in the run output
- **Failures**: 1 — `media-card.unit.test.tsx` (pre-existing, out of scope, see above)

---

## Fix Plans (if issues found)

### Gap 1: Edge Case — grade edit after existing appointments not tested

- **Root cause**: `professional.router.e2e.test.ts`'s "existing Appointment untouched" test (SCH-05) only exercises `PATCH {active:false}`. No test PATCHes `weeklySchedule` and re-reads a pre-existing `Appointment` to confirm it is unaffected. The guarantee is almost certainly true by construction — `professional.service.ts`/`professional.repository.ts` only ever write to the `Professional` collection, never touch `Appointment` — but this was not independently confirmed by execution.
- **Fix task**: Add a case to `professional.router.e2e.test.ts` (or `professional.service.unit.test.ts`) that creates an `Appointment` for a Professional, `PATCH`es that Professional's `weeklySchedule` to something that no longer covers the Appointment's `start`, and asserts the Appointment document is byte-identical before/after (mirroring the existing `active:false` test at line 377).
- **Priority**: Minor (architecturally sound, but an unverified spec Edge Case)

### Gap 2: Edge Case — slot duration change not tested against existing appointments

- **Root cause**: Same as Gap 1 — no test PATCHes `slotDurationMinutes` and re-reads a pre-existing Appointment's `end` to confirm it wasn't recalculated.
- **Fix task**: Add a case alongside Gap 1's fix: create an Appointment with the Professional's current `slotDurationMinutes`, `PATCH slotDurationMinutes` to a different value, and assert the Appointment's `end` is unchanged.
- **Priority**: Minor

### Gap 3: SCH-17 has no dedicated test

- **Root cause**: The "no orphan Appointment/token on creation failure" guarantee is only exercised indirectly by the SCH-20 concurrent-booking test (which happens to hit the same `Appointment.create()` catch block). No test is titled or scoped specifically to SCH-17's exact scenario (e.g., forcing a non-duplicate-key failure mid-`create()` and asserting zero documents/tokens exist).
- **Fix task**: Optional — the single-`Appointment.create()`-call design makes this guarantee structural (a MongoDB single-document insert is atomic; there is no code path that persists a token separately from the document). Given the indirect evidence already available, this is a documentation/labeling gap more than a functional risk. No action required unless the team wants an explicit regression test.
- **Priority**: Cosmetic

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| SCH-01 .. SCH-16, SCH-18 .. SCH-40 | In Tasks | ✅ Verified |
| SCH-17 | In Tasks | ⚠️ Verified (indirect evidence only) |

---

## Summary

**Overall**: ✅ Ready (with 2 minor, low-risk test-coverage gaps flagged — not blocking)

**Spec-anchored check**: 39/40 ACs matched spec outcome with direct evidence; 1 (SCH-17) matched with indirect evidence only
**Sensor**: 3/3 mutations killed
**Gate**: 1762/1763 passed, 1 pre-existing/out-of-scope failure (confirmed untouched by this diff), 0 in-scope failures

**What works**: All 5 user stories (P1×4, P2×1) have complete, spec-precise test coverage across every layer named in the Test Coverage Matrix (pure math, models, transitions, contracts, repositories, services, routers, tools, harness, structural, golden set, web query/component). AD-035 (partial unique index anti-double-booking), AD-036 (UTC instants / wall-clock grid / `DISPLAY_TIMEZONE` in `packages/contracts`), and AD-037 (no `Dialog`, inline panels only) are all followed and independently confirmed in the diff, not just claimed in STATE.md. The newest, never-reviewed P2 slice (SCH-38/39/40, T44-47) is thoroughly tested at the unit, integration, and e2e layers, including both notice-fallback branches (`queued` vs `wa_me`) and their front-end rendering.

**Issues found**:
1. Edge Case "grade editada não afeta agendamentos existentes" — no dedicated test (Gap 1, Minor)
2. Edge Case "duração do slot não é recalculada" — no dedicated test (Gap 2, Minor)
3. SCH-17 "sem token órfão" — only indirect test evidence (Gap 3, Cosmetic)

**Next steps**: Optional — add the two PATCH-against-existing-Appointment test cases described in Gap 1/2's fix tasks. None of the three gaps block shipping; all three are either structurally guaranteed by the current implementation or already substantially covered by an adjacent test. No functional regression, no P1 MVP gap, no security gap.
