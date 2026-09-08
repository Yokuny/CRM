# Inbox Realtime Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.
The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation,
adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/inbox-realtime/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling + project guidelines. Guidelines found:
> `.specs/STATE.md` (AD-017 — test convention: Vitest `projects` named
> `unit`/`integration`/`e2e`/`structural`, files suffixed accordingly, no separate
> `__test__` dir), `vitest.config.ts` (exact `include` globs and per-project setup),
> root `package.json` (`check` script = Build gate). No `CLAUDE.md` at repo root or
> `apps/crm-api`; `apps/web/CLAUDE.md` documents front-end testing conventions
> (route/component tests need a `@tanstack/react-router` mock, no `<RouterProvider>`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `authenticateSession` (extracted from `authentication.middleware.ts`) | integration | All branches (missing token, invalid jwt, no session, device mismatch, inactive user, success) — floor set by the existing `authentication.middleware.int.test.ts` | `apps/crm-api/src/middlewares/authentication.middleware.int.test.ts` (existing, extended) | `pnpm vitest run --project integration` |
| WS pure helpers (cookie parsing, room `Map` join/leave/broadcast) | unit | All branches: missing cookie, malformed cookie, join/leave/broadcast-to-empty-room | `apps/crm-api/src/ws/inboxSocket.unit.test.ts` (new) | `pnpm vitest run --project unit` |
| WS full connect/auth/subscribe/broadcast round-trip | e2e | Happy path (auth ok, subscribe, receives broadcast) + every edge case: bad/missing cookie (closed with 4401), subscribe to foreign tenant's room is a structural no-op, disconnect cleans up rooms | `apps/crm-api/src/ws/inboxSocket.e2e.test.ts` (new) | `pnpm vitest run --project e2e` |
| `inboxPoller` (`pollOnce`/`startInboxPoller`) | integration | Key paths: finds new messages only for connected tenants, advances cursor, broadcasts to both room levels, tick failure is caught+logged (mirrors `outboxConsumer.int.test.ts`/`idleTakeoverSweep.int.test.ts`) | `apps/crm-api/src/workers/inboxPoller.int.test.ts` (new) | `pnpm vitest run --project integration` |
| `apps/crm-api/src/server.ts` (StartOptions/StartHandle refactor) | integration | Wiring smoke test only — `httpServer`/`stopWorkers` returned and stoppable, WS+poller constructed; deep behavior already covered by the two rows above (mirrors existing `server.int.test.ts`, which already covers the boot-fail branch) | `apps/crm-api/src/server.int.test.ts` (existing, extended) | `pnpm vitest run --project integration` |
| Repository (`conversation.repository.ts`: `listConversations`, `getMessages`, `takeover` rewrite, `resendMessage`, `getMessageMedia`) | integration | Key query paths (filters, pagination, tenant scoping, claim race, clone, media lookup) + error handling (not-found, already-assigned, media unavailable) — 1:1 to every INBOX AC touching data access | `apps/crm-api/src/repositories/conversation.repository.int.test.ts` (existing, extended) | `pnpm vitest run --project integration` |
| `metaMediaClient.ts` | unit | Both methods (`getMediaUrl`, `downloadMedia`), success + non-2xx failure (mirrors `metaClient.unit.test.ts`) | `apps/crm-api/src/providers/metaMediaClient.unit.test.ts` (new) | `pnpm vitest run --project unit` |
| Router/Controller (`conversation.router.ts` + `conversation.controller.ts` + `conversation.service.ts`, as a wired unit) | e2e | All routes in scope: happy path + every listed edge case + error/failure paths (403/404/409/400/502) — service/controller have no dedicated unit test file in this codebase (existing convention: thin translation layer, tested through the router) | `apps/crm-api/src/routers/conversation.router.e2e.test.ts` (existing, extended) | `pnpm vitest run --project e2e` |
| `apps/web` query layer (`query/conversation.ts`, `query/message.ts`) | unit | Mirrors `query/customer.unit.test.ts`: query key factories, query string building, success/failure branches of `queryFn` | `apps/web/src/query/{conversation,message}.unit.test.ts` (new) | `pnpm vitest run --project unit` |
| `apps/web` hook (`hooks/useInboxSocket.ts`) | unit | Connect, reconnect-with-backoff, message dispatch into TanStack Query cache, disconnect cleanup — `WebSocket` global mocked | `apps/web/src/hooks/useInboxSocket.unit.test.ts` (new) | `pnpm vitest run --project unit` |
| `apps/web` routes/components (`routes/_private/inbox/**`) | unit | Rendering + interaction branches per AC: composer toggles free-text vs. `wa.me` by window state, takeover conflict toast, resend button only on `failed`, media card fetch-on-demand + error state, queue filters | `apps/web/src/routes/_private/inbox/**/*.unit.test.tsx` (new) | `pnpm vitest run --project unit` |
| Entity/config (`package.json` deps, env — no schema/model change) | none | — (build gate only) | — | build gate only |

## Gate Check Commands

> Generated from `package.json` + `vitest.config.ts` + AD-017. Confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `pnpm vitest run --project unit --project structural` |
| Full | After tasks with e2e/integration tests | `pnpm vitest run` |
| Build | After phase completion (or config/entity-only tasks) | `pnpm run check` (= `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins,
and tasks within a phase execute in order.

### Phase 1: Foundation

```
T1 → T2
```

### Phase 2: WebSocket layer

```
T3 → T4
```

### Phase 3: Poller worker

```
T5
```

### Phase 4: Server wiring

```
T6
```

### Phase 5: GET /conversations (fila)

```
T7 → T8
```

### Phase 6: GET /conversations/:id/messages (thread)

```
T9 → T10
```

### Phase 7: Takeover claim-conditional

```
T11 → T12
```

### Phase 8: Reenvio de mensagem failed

```
T13 → T14
```

### Phase 9: Preview de mídia sob demanda

```
T15 → T16 → T17
```

### Phase 10: Front-end — camada de dados

```
T18 → T19 → T20
```

### Phase 11: Front-end — telas do Inbox

```
T21 → T22 → T23 → T24 → T25 → T26
```

---

## Task Breakdown

### T1: Adicionar dependências (`ws`, `@types/ws`, `cookie`)

**What**: Adicionar `ws` + `cookie` como dependências de runtime e `@types/ws` como
devDependency em `apps/crm-api/package.json`; rodar install.
**Where**: `apps/crm-api/package.json`
**Depends on**: None
**Reuses**: nenhum — primeira dependência WS do monorepo (roadmap confirma "zero
dependência `ws`")
**Requirement**: INBOX-04, INBOX-07 (infraestrutura habilitadora)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `ws`, `cookie` em `dependencies`; `@types/ws` em `devDependencies`
- [x] `pnpm install` resolve sem conflito de lockfile
- [x] `pnpm run check` continua limpo (nenhum código novo ainda, só dependência)

**Tests**: none
**Gate**: build

**Commit**: `chore(crm-api): add ws, cookie and @types/ws dependencies`

---

### T2: Extrair `authenticateSession` de `createAuthMiddleware`

**What**: Extrair a validação de sessão (jwt→hash→`Session`→device match→`User`/`Tenant`)
para uma função pura `authenticateSession(token, deviceInfo, deps): Promise<TenantUser>`;
`validToken` vira um wrapper fino que extrai `token`/`deviceInfo` do `Request` e chama essa
função.
**Where**: `apps/crm-api/src/middlewares/authentication.middleware.ts`
**Depends on**: T1
**Reuses**: 100% da lógica atual de `createAuthMiddleware` (design.md, Componente 1) — só
reorganizada, nenhuma regra nova
**Requirement**: INBOX (pré-requisito do handshake WS, ver design.md Componente 2)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `authenticateSession` exportada, mesma assinatura do design.md
- [x] `validToken` (mesmo comportamento observável de antes) delega pra ela
- [x] Toda mensagem/evento de log existente (`session.replay`, `session.device_mismatch`)
      preservada
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Testes existentes de `authentication.middleware.int.test.ts` continuam verdes +
      novos casos cobrindo `authenticateSession` chamada diretamente (fora do Express)

**Tests**: integration
**Gate**: full

**Commit**: `refactor(crm-api): extract authenticateSession from validToken middleware`

---

### T3: Helpers puros do WS — cookie parsing e registro de salas

**What**: Funções puras exportadas de `apps/crm-api/src/ws/inboxSocket.ts`:
`extractHandshakeCookie(header: string | undefined): string | undefined` (usa `cookie.parse`)
e um `createRoomRegistry()` com `join(room, socket)`/`leave(room, socket)`/
`broadcast(room, event)`/`socketsIn(room)`, guardado em `Map<string, Set<WebSocket>>`.
**Where**: `apps/crm-api/src/ws/inboxSocket.ts`
**Depends on**: T1
**Reuses**: nenhum código existente — infraestrutura nova; shape do evento
(`InboxWsEvent`) definido no design.md, Componente 2
**Requirement**: INBOX-04, INBOX-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `extractHandshakeCookie` extrai `refreshToken` de um header `cookie` cru, `undefined`
      quando ausente/malformado
- [x] `createRoomRegistry()` suporta join/leave/broadcast (broadcast em sala vazia não lança)
- [x] `leave` remove o socket de todas as salas que participava (usado no `close` da conexão)
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(crm-api): add WS cookie parsing and room registry helpers`

---

### T4: `createInboxSocketServer` — handshake autenticado + broadcast

**What**: `createInboxSocketServer(httpServer, authDeps): InboxSocketServer` — anexa um
`WebSocketServer` (`ws`) ao `httpServer` recebido; no evento `connection`, extrai o cookie
(T3), chama `authenticateSession` (T2), fecha com código `4401` em falha ou entra na sala
`tenant:<tenantId>` em sucesso; trata mensagens `{type:'subscribe'|'unsubscribe',
conversationId}` pra entrar/sair de `tenant:<id>:conversation:<id>`; expõe
`broadcastToTenant`/`broadcastToConversation`/`getConnectedTenantIds`/`close`.
**Where**: `apps/crm-api/src/ws/inboxSocket.ts`
**Depends on**: T3
**Reuses**: `authenticateSession` (T2), `createRoomRegistry` (T3)
**Requirement**: INBOX-04, INBOX-07, INBOX-19 (log de conexão/desconexão)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Handshake com cookie válido conecta e entra na sala do tenant
- [x] Handshake sem cookie ou com sessão inválida fecha com código `4401`, nenhuma sala
      é conjunta
- [x] `subscribe`/`unsubscribe` entram/saem da sala `tenant:<id>:conversation:<id>`
- [x] `broadcastToConversation` só entrega a sockets na sala certa (mesmo tenant e
      conversation); `broadcastToTenant` entrega a todos do tenant, ignora outros tenants
- [x] Desconexão remove o socket de todas as salas (sem leak de referência)
- [x] Log estruturado (`ws.connected`/`ws.disconnected`/`ws.auth_failed`, mesmo formato
      `JSON.stringify({event...})` já usado no projeto)
- [x] Gate check passa: `pnpm vitest run --project e2e` — teste sobe um `http.Server` real
      em porta efêmera (`.listen(0)`), conecta um cliente `ws` de verdade

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): wire authenticated WS server with tenant/conversation rooms`

---

### T5: `inboxPoller` — tick único de fan-out

**What**: `pollOnce(socketServer, since): Promise<Date>` — busca
`Message.find({updatedAt:{$gt:since}, Tenant:{$in: socketServer.getConnectedTenantIds()}})`,
para cada mensagem chama `broadcastToConversation` (`message.new`) e, buscando a
`Conversation` correspondente, `broadcastToTenant` (`conversation.updated` com
`lastActivityAt`/`unread` recalculados); retorna o novo cursor. `startInboxPoller(socketServer,
intervalMs=2000)` — mesmo molde `setInterval`+catch+log de `startOutboxConsumer`.
**Where**: `apps/crm-api/src/workers/inboxPoller.ts`
**Depends on**: T4
**Reuses**: padrão exato de `apps/ai-gateway/src/workers/outboxConsumer.ts`/
`idleTakeoverSweep.ts` (tick isolado testável, `{stop}` handle)
**Requirement**: INBOX-04, INBOX-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pollOnce` só considera tenants com socket conectado (injeta um fake
      `InboxSocketServer` no teste, sem WS real — mesmo padrão de `createClient` fake em
      `outboxConsumer.int.test.ts`)
- [x] Nova `Message` gera `broadcastToConversation` (payload com o `Message` inteiro,
      exceto binário) e `broadcastToTenant` (payload leve)
- [x] Cursor `since` avança mesmo quando não há mensagem nova (nunca reprocessa a mesma
      janela)
- [x] Falha no tick (erro de banco simulado) é capturada e logada, próximo tick roda
      normalmente
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): add inboxPoller worker for live message fan-out`

---

### T6: Refatorar `server.ts` — `StartOptions`/`StartHandle`

**What**: Espelhar `apps/ai-gateway/src/server.ts`: capturar o `httpServer` de
`app.listen()`, construir `createInboxSocketServer(httpServer, authDeps)` e
`startInboxPoller(socketServer, opts.pollerIntervalMs)`, devolver
`{httpServer, stopWorkers}` (`stopWorkers` para o poller e fecha o WS server). `opts.port`
segue permitindo porta efêmera (`0`) pros testes.
**Where**: `apps/crm-api/src/server.ts`
**Depends on**: T5
**Reuses**: `authDeps` já existente em `app.ts`/`server.ts` (precisa ser exportado ou
reconstruído aqui — decisão de implementação: mover a construção de `authDeps` para um
módulo compartilhado entre `app.ts` e `server.ts`, evitando duplicar as 4 funções de
acesso a banco)
**Requirement**: INBOX (wiring — habilita INBOX-04/07 em produção)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `start()` retorna `{httpServer, stopWorkers}`, mesma forma de `ai-gateway`
- [x] `stopWorkers()` para o poller E fecha o WS server, sem processo pendurado
- [x] Boot-fail (`Mongo indisponível`) continua saindo com `process.exit(1)` — teste
      existente não regride
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `refactor(crm-api): wire InboxSocketServer and inboxPoller into server startup`

---

### T7: `listConversations` — repository

**What**: `listConversations(tenantId, filters: {mode?, assignee?}, pagination): Promise<{items, total}>`
— tenant-scoped, filtra por `mode`/`assignee` quando presentes, pagina, calcula `unread`
(`lastInboundAt > lastActivityAt`) e o estado da janela de 24h em memória por item
(sem campo novo, mesma decisão do Discuss).
**Where**: `apps/crm-api/src/repositories/conversation.repository.ts`
**Depends on**: T1 (independe de T2-T6 — pode rodar em paralelo lógico, mas a fase roda em
sequência por convenção do protocolo)
**Reuses**: `tenantScoped`, `withDbTiming` (já existentes no arquivo)
**Requirement**: INBOX-01, INBOX-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Retorna só conversas do tenant da sessão (outro tenant nunca aparece)
- [x] Filtro por `mode` e por `assignee` funcionam isolados e combinados
- [x] `unread` bate com `lastInboundAt > lastActivityAt` nos casos true/false/ambos ausentes
- [x] Paginação (`page`/`limit`) reflete no `total` e no corte de `items`
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): add listConversations repository with mode/assignee filters`

---

### T8: `GET /conversations` — service, controller, router

**What**: Query schema local (`z.object({mode,assignee,page,limit}).strict()`, mesmo
workaround `Object.defineProperty` de `validListCustomersQuery`), `conversationService.listConversations`
(delega ao repository), controller, e a rota `GET /` em `conversation.router.ts` com
`canOperate`.
**Where**: `apps/crm-api/src/{repositories/conversation.repository.ts (só leitura, sem
mudança nesta task) , services/conversation.service.ts, controllers/conversation.controller.ts,
routers/conversation.router.ts}`
**Depends on**: T7
**Reuses**: `validListCustomersQuery` workaround (`customer.router.ts:29-42`), `canOperate`
já definido em `conversation.router.ts`
**Requirement**: INBOX-01, INBOX-02, INBOX-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GET /conversations` responde 200 com a lista paginada pro tenant da sessão
- [x] Sem papel `canOperate` → 403, sem tocar dados
- [x] Filtros de query aceitos e repassados ao repository
- [x] Gate check passa: `pnpm vitest run --project e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add GET /conversations endpoint`

---

### T9: `getMessages` — repository

**What**: `getMessages(tenantId, conversationId, pagination): Promise<{items, total} | null>`
— `null` quando a conversa não existe/é de outro tenant; mensagens em ordem cronológica,
mídia só com o ponteiro (`mediaId`/`mime`/`caption`).
**Where**: `apps/crm-api/src/repositories/conversation.repository.ts`
**Depends on**: T7
**Reuses**: índice já existente `{Tenant,Conversation,createdAt}` em `message.model.ts`
**Requirement**: INBOX-05, INBOX-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mensagens retornadas em ordem cronológica, paginadas
- [x] `Conversation` de outro tenant ou inexistente retorna `null`
- [x] Mensagem `image`/`document`/`audio`/`location` nunca inclui campo de binário —
      só o shape de `MessageMedia`
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): add getMessages repository with paginated history`

---

### T10: `GET /conversations/:id/messages` — service, controller, router

**What**: Query schema local de paginação, `conversationService.getMessages` traduzindo
`null` para 404 (mesmo idioma de `sendManualMessage`), controller, rota `GET /:id/messages`
com `canOperate`.
**Where**: `apps/crm-api/src/{services,controllers,routers}/conversation.*`
**Depends on**: T9
**Reuses**: idioma 404 já usado em `sendManualMessage`/`ConversationNotFoundError`
**Requirement**: INBOX-05, INBOX-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GET /conversations/:id/messages` responde 200 com histórico paginado
- [x] `id` de outro tenant/inexistente → 404
- [x] Sem `canOperate` → 403
- [x] Gate check passa: `pnpm vitest run --project e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add GET /conversations/:id/messages endpoint`

---

### T11: `takeover` — claim condicional (repository)

**What**: Reescrever `takeover(id, tenantId, userId)` pra
`findOneAndUpdate({_id, Tenant, $or:[{mode:'bot'},{assignee:userId}]}, {$set:{mode:'human',
assignee:userId, lastActivityAt:new Date()}})` — `null` quando a conversa existe mas está
com outro `assignee` (distinto de "não existe", tratado por quem chama).
**Where**: `apps/crm-api/src/repositories/conversation.repository.ts`
**Depends on**: T7
**Reuses**: mesmo padrão de `claimTurnLock`/`claimQueuedMessage` (design.md, Tech Decisions)
**Requirement**: INBOX-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Conversa livre (`mode:'bot'`) → sucesso, `mode:'human'`, `assignee` setado
- [x] Mesmo `assignee` chamando de novo → sucesso idempotente (nenhuma mudança de estado
      inesperada)
- [x] Conversa em `human` com OUTRO `assignee` → `null` (nunca sobrescreve)
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): make takeover a conditional claim (free or same assignee)`

---

### T12: Conflito de takeover nomeado — service, controller

**What**: `conversationService.takeoverConversation` distingue "não existe" (404, já
existente) de "já assumida por outro" (repository retornou `null` mas a `Conversation`
existe): busca a `Conversation` de novo pra achar o `assignee` atual, carrega
`User.name`, lança `ConversationAlreadyAssignedError(assigneeName)`; controller traduz
para 409. `release` sem mudança (regressão coberta: qualquer `canOperate` continua
liberando qualquer conversa).
**Where**: `apps/crm-api/src/services/conversation.service.ts`,
`apps/crm-api/src/controllers/conversation.controller.ts`
**Depends on**: T11
**Reuses**: padrão de erro tipado + tradução HTTP já usado em
`ConversationNotFoundError`/`OutsideWindowError`
**Requirement**: INBOX-08, INBOX-09 (regressão)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Operador diferente tentando assumir recebe 409 com o nome do `assignee` atual na
      mensagem
- [x] Mesmo operador re-clicando "assumir" recebe 200 (idempotente)
- [x] `POST /:id/release` continua incondicional pra qualquer `canOperate` (regressão —
      teste explícito cobrindo INBOX-09)
- [x] Gate check passa: `pnpm vitest run --project e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): return 409 naming the current assignee on takeover conflict`

---

### T13: `resendMessage` — repository

**What**: `resendMessage(tenantId, conversationId, messageId): Promise<MessageRecord>` —
carrega a `Message` original (deve ser `status:'failed'`, senão erro tipado), cria um NOVO
documento com o mesmo `direction`/`type`/`text`|`templateName`/`templateLanguage`/
`templateParams`, `status:'queued'`, sem `wamid`/`claimedBy`/`claimedAt`/`error`. O
documento original nunca é modificado.
**Where**: `apps/crm-api/src/repositories/conversation.repository.ts`
**Depends on**: T7
**Reuses**: mesmo shape de criação de `createOutboundMessage`
**Requirement**: INBOX-14, INBOX-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Message` original permanece `status:'failed'`, intocada, após o reenvio
- [x] Novo documento criado com `status:'queued'`, mesmo conteúdo, `_id` diferente
- [x] Reenviar uma `Message` que não está `failed` lança erro tipado (`MessageNotFailedError`)
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): add resendMessage repository cloning a failed Message`

---

### T14: `POST /:id/messages/:messageId/resend` — service, controller, router

**What**: Rota nova em `conversation.router.ts`, controller e service traduzindo
`MessageNotFoundError`→404 e `MessageNotFailedError`→400, `canOperate`.
**Where**: `apps/crm-api/src/{services,controllers,routers}/conversation.*`
**Depends on**: T13
**Reuses**: `canOperate` já definido no router
**Requirement**: INBOX-14, INBOX-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /:id/messages/:messageId/resend` cria a nova `Message` e responde 201 com ela
- [x] `Message` inexistente/de outro tenant → 404; status diferente de `failed` → 400
- [x] Sem `canOperate` → 403
- [x] Gate check passa: `pnpm vitest run --project e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add POST /:id/messages/:messageId/resend endpoint`

---

### T15: `metaMediaClient` — cliente Meta Media API só-leitura

**What**: `createMetaMediaClient(channel, encKey)` com `getMediaUrl(mediaId)` e
`downloadMedia(url)`, mesmo shape de 2 etapas de `apps/ai-gateway/src/providers/metaClient.ts`
(duplicação fina deliberada, design.md Risks).
**Where**: `apps/crm-api/src/providers/metaMediaClient.ts`
**Depends on**: T1
**Reuses**: `decrypt` de `@crm/db`; mesmo shape de `MetaApiError`/`getMediaUrl`/
`downloadMedia` de `apps/ai-gateway/src/providers/metaClient.ts:96-113` — comentário
cruzado referenciando o arquivo irmão
**Requirement**: INBOX-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `getMediaUrl` retorna `{url, mimeType}` em sucesso, lança `MetaApiError` em não-2xx
- [ ] `downloadMedia` retorna `Buffer`, lança `MetaApiError` em não-2xx
- [ ] Token decifrado só no escopo da chamada (nunca logado/cacheado em claro)
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(crm-api): add read-only metaMediaClient for on-demand media fetch`

---

### T16: `getMessageMedia` — repository

**What**: `getMessageMedia(tenantId, conversationId, messageId, encKey): Promise<{buffer, mime?}>`
— carrega `Message` (tenant-scoped) + `Channel`, chama `metaMediaClient` (injetável, mesmo
molde de `OutboxConsumerDeps.createClient`), traduz falha em `MetaMediaUnavailableError`.
**Where**: `apps/crm-api/src/repositories/conversation.repository.ts`
**Depends on**: T15
**Reuses**: `channel.service.ts`'s uso de `decrypt`/`env.CHANNEL_ENC_KEY`
**Requirement**: INBOX-17, INBOX-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Mensagem sem mídia ou de outro tenant → erro tipado (404 na camada de cima)
- [ ] Falha da Meta (mockada via cliente injetado) → `MetaMediaUnavailableError`
- [ ] Sucesso retorna o buffer sem nenhuma escrita em disco/banco
- [ ] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(crm-api): add getMessageMedia repository fetching from Meta on demand`

---

### T17: `GET /:id/messages/:messageId/media` — service, controller, router

**What**: Rota nova, controller que escreve a resposta com `res.set('Content-Type',
mime)` + `res.send(buffer)` (nunca `res.json`/`respObj` — é binário), service traduzindo
`MetaMediaUnavailableError`→502, `canOperate`, log estruturado em falha (INBOX-19).
**Where**: `apps/crm-api/src/{services,controllers,routers}/conversation.*`
**Depends on**: T16
**Reuses**: `canOperate` já definido no router
**Requirement**: INBOX-17, INBOX-18, INBOX-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GET /:id/messages/:messageId/media` devolve o binário com `Content-Type` correto
- [ ] Mídia indisponível → 502 com mensagem legível, log estruturado emitido
- [ ] Sem `canOperate` → 403, nenhuma chamada à Meta é feita
- [ ] Gate check passa: `pnpm vitest run --project e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add GET /:id/messages/:messageId/media proxy endpoint`

---

### T18: `apps/web` — `query/conversation.ts`

**What**: `conversationsQuery(params)`/`conversationQuery(id)` via `queryOptions`, keys
factory, `buildQueryString` — mesmo formato de `query/customer.ts`.
**Where**: `apps/web/src/query/conversation.ts`
**Depends on**: T8, T10 (contrato de resposta precisa existir no backend)
**Reuses**: `query/customer.ts` inteiro como molde
**Requirement**: INBOX-01, INBOX-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `conversationsQuery`/`conversationQuery` tipados, `queryKey` estável por parâmetro
- [ ] `buildQueryString` reflete `mode`/`assignee`/`page`/`limit`
- [ ] `queryFn` lança com a mensagem de `ApiResponse.message` em falha
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add conversation query layer`

---

### T19: `apps/web` — `query/message.ts`

**What**: `messagesQuery(conversationId, params)`, `resendMessage(conversationId,
messageId)`, `mediaUrl(conversationId, messageId)` (helper de URL, não fetch — o
`<img>`/`<a>` do media-card usa direto).
**Where**: `apps/web/src/query/message.ts`
**Depends on**: T10, T14, T17
**Reuses**: mesmo padrão de `query/customer.ts` (`get`/`post` de `lib/api/client.api.ts`)
**Requirement**: INBOX-05, INBOX-06, INBOX-14, INBOX-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `messagesQuery` tipado, paginado
- [ ] `resendMessage` chama `POST .../resend` e invalida a query de mensagens
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add message query layer with resend action`

---

### T20: `apps/web` — `hooks/useInboxSocket.ts`

**What**: Hook que abre um `WebSocket` nativo pro endpoint WS do `crm-api`, reconecta com
backoff simples em queda de conexão, envia `subscribe`/`unsubscribe` quando a thread aberta
muda, e aplica eventos recebidos (`conversation.updated`/`message.new`) no cache do
TanStack Query via `queryClient.setQueryData`/`invalidateQueries`.
**Where**: `apps/web/src/hooks/useInboxSocket.ts`
**Depends on**: T18, T19
**Reuses**: nenhum hook existente — primeiro hook de WS do projeto; usa as `queryKey`s de
T18/T19
**Requirement**: INBOX-04, INBOX-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Conecta, recebe `message.new`/`conversation.updated`, atualiza o cache certo
- [ ] Queda de conexão reconecta com backoff (sem loop apertado)
- [ ] Troca de conversa aberta manda `unsubscribe` da antiga + `subscribe` da nova
- [ ] Gate check passa: `pnpm vitest run --project unit` (com `WebSocket` global mockado)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add useInboxSocket hook for live queue and thread updates`

---

### T21: `apps/web` — esqueleto da rota `inbox`

**What**: `routes/_private/inbox/@interface/inbox.interface.ts` (search schema
`z.object({id: idSchema.optional()}).strict()`) + `index.tsx` com `<Card asPage>`, layout
split (fila à esquerda, thread à direita), conectando `useInboxSocket` no nível da página.
**Where**: `apps/web/src/routes/_private/inbox/`
**Depends on**: T20
**Reuses**: `<Card asPage>` (`components/ui/card.tsx`), convenção de `search:{id}` (AD-030)
**Requirement**: INBOX (esqueleto — habilita as próximas)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Rota registrada (`routeTree.gen.ts` regenerado — `pnpm --filter web run dev` antes
      do `check`)
- [ ] `search.id` seleciona a conversa aberta, ausente = nenhuma thread selecionada
- [ ] Mock de `@tanstack/react-router` conforme `apps/web/CLAUDE.md`
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add inbox route skeleton with queue/thread split layout`

---

### T22: `@components/conversation-queue.tsx`

**What**: `<DataTable>` server-driven (AD-028) sobre `conversationsQuery`, colunas
customer/mode/assignee/lastActivityAt/indicador `unread`/estado da janela, filtros
mode/assignee, navega pra `search:{id}` ao clicar numa linha.
**Where**: `apps/web/src/routes/_private/inbox/@components/conversation-queue.tsx`
**Depends on**: T21
**Reuses**: `<DataTable>` (`components/ui/data-table.tsx`), `<DefaultLoading>`/
`<DefaultEmptyData>`, `t()`
**Requirement**: INBOX-01, INBOX-03, INBOX-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Lista renderiza com paginação/filtro server-driven (nunca corta `data` em memória)
- [ ] Indicador `unread` e badge de `mode` visíveis por linha
- [ ] Clique seleciona a conversa (`search.id`)
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add conversation queue table with live unread indicator`

---

### T23: `@components/thread.tsx`

**What**: Painel de thread — lista `messagesQuery`, renderiza texto/template inline e
delega mídia pro `media-card.tsx`; mensagem `failed` mostra selo + botão de reenvio (ver
T25); recebe atualização ao vivo via `useInboxSocket` (nova mensagem entra sem refetch
completo).
**Where**: `apps/web/src/routes/_private/inbox/@components/thread.tsx`
**Depends on**: T22
**Reuses**: `<DefaultLoading>`/`<DefaultEmptyData>`, `t()`, `formatDate`/
`formatDistanceToNow`
**Requirement**: INBOX-05, INBOX-06, INBOX-07, INBOX-10, INBOX-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Histórico paginado renderiza em ordem cronológica
- [ ] Mensagem `failed` visível com selo, nunca some/substitui após reenvio
- [ ] Nova mensagem via WS aparece sem `refetch` completo da lista
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add conversation thread panel with live message updates`

---

### T24: `@components/media-card.tsx`

**What**: Card por mensagem de mídia — ícone por tipo + mime + caption + botão "Ver"/
"Baixar" que dispara o fetch sob demanda (`GET .../media`); estado de erro legível quando
a mídia está indisponível.
**Where**: `apps/web/src/routes/_private/inbox/@components/media-card.tsx`
**Depends on**: T23
**Reuses**: `t()`, ícones `lucide-react`
**Requirement**: INBOX-17, INBOX-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Card mostra ícone/mime/caption sem nenhuma chamada automática à Meta
- [ ] Clique em "Ver"/"Baixar" busca o binário sob demanda
- [ ] Falha (502) mostra mensagem de erro sem quebrar a tela
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add on-demand media preview card`

---

### T25: `@components/composer.tsx`

**What**: Campo de texto livre + botão enviar quando a janela de 24h está aberta
(`windowExpiresAt` derivado, sem campo novo); quando fechada, desabilita o texto e mostra
o botão "Abrir no WhatsApp" (`wa.me/<telefone>`, nova aba); inclui o botão de reenvio pra
mensagens `failed` da thread (chama `resendMessage` de T19).
**Where**: `apps/web/src/routes/_private/inbox/@components/composer.tsx`
**Depends on**: T24
**Reuses**: `Form`/`FormField` (`components/ui/form.tsx`) se aplicável, `t()`
**Requirement**: INBOX-11, INBOX-12, INBOX-14, INBOX-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Janela aberta → texto livre habilitado, `POST /:id/messages` chamado ao enviar
- [ ] Janela fechada → texto desabilitado, botão `wa.me` visível, nenhuma chamada de envio
      disparada por ele
- [ ] Botão de reenvio aparece só em mensagens `failed`, cria a nova tentativa (T19) e o
      selo original continua visível (integra com T23)
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add composer with 24h-window-aware wa.me fallback and resend`

---

### T26: `@components/takeover-badge.tsx` + ações de takeover/release

**What**: Badge de `mode` (bot/human) + nome do `assignee`; botões "Assumir"/"Liberar"
chamando os endpoints existentes; toast nomeado em conflito de takeover (409 de T12).
**Where**: `apps/web/src/routes/_private/inbox/@components/takeover-badge.tsx`
**Depends on**: T25
**Reuses**: endpoints já existentes (`POST /:id/takeover`, `/release`), `t()`
**Requirement**: INBOX-08, INBOX-09, INBOX-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Badge mostra `mode` e `assignee` corretamente
- [ ] "Assumir" bem-sucedido atualiza o badge sem refresh manual da página
- [ ] Conflito (409) mostra toast nomeando quem já assumiu, sem quebrar a tela
- [ ] "Liberar" funciona pra qualquer operador (regressão INBOX-09)
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add takeover/release controls with named-conflict toast`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4
Phase 3:  T5
Phase 4:  T6
Phase 5:  T7 ──→ T8
Phase 6:  T9 ──→ T10
Phase 7:  T11 ──→ T12
Phase 8:  T13 ──→ T14
Phase 9:  T15 ──→ T16 ──→ T17
Phase 10: T18 ──→ T19 ──→ T20
Phase 11: T21 ──→ T22 ──→ T23 ──→ T24 ──→ T25 ──→ T26
```

Execution is strictly sequential — there is no intra-phase parallelism. Note: T7/T9/T11/T13/T15
each only truly depend on T1 (they're independent repository additions to the same file);
they're sequenced one-per-phase here to keep each phase's `Tests`/`Gate` and commit scope
single-purpose, not because of a real data dependency between them.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Add ws/cookie deps | 1 file (package.json) | ✅ Granular |
| T2: Extract authenticateSession | 1 function extraction, 1 file | ✅ Granular |
| T3: WS cookie/room helpers | 2 cohesive helpers, 1 file | ✅ Granular (cohesive) |
| T4: createInboxSocketServer | 1 component, 1 file | ✅ Granular |
| T5: inboxPoller | 1 worker, 1 file | ✅ Granular |
| T6: server.ts wiring | 1 file | ✅ Granular |
| T7: listConversations repo | 1 function | ✅ Granular |
| T8: GET /conversations wiring | 1 endpoint | ✅ Granular |
| T9: getMessages repo | 1 function | ✅ Granular |
| T10: GET .../messages wiring | 1 endpoint | ✅ Granular |
| T11: takeover claim rewrite | 1 function | ✅ Granular |
| T12: takeover conflict + release regression | 1 behavior, 2 files | ✅ Granular (cohesive) |
| T13: resendMessage repo | 1 function | ✅ Granular |
| T14: resend endpoint wiring | 1 endpoint | ✅ Granular |
| T15: metaMediaClient | 1 component, 1 file | ✅ Granular |
| T16: getMessageMedia repo | 1 function | ✅ Granular |
| T17: media endpoint wiring | 1 endpoint | ✅ Granular |
| T18: query/conversation.ts | 1 file | ✅ Granular |
| T19: query/message.ts | 1 file | ✅ Granular |
| T20: useInboxSocket | 1 hook | ✅ Granular |
| T21: inbox route skeleton | 1 route file + 1 interface file | ✅ Granular (cohesive) |
| T22: conversation-queue.tsx | 1 component | ✅ Granular |
| T23: thread.tsx | 1 component | ✅ Granular |
| T24: media-card.tsx | 1 component | ✅ Granular |
| T25: composer.tsx | 1 component | ✅ Granular |
| T26: takeover-badge.tsx | 1 component | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start of Phase 1) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | (start of Phase 2, after Phase 1) | ✅ Match |
| T4 | T3 | T3→T4 | ✅ Match |
| T5 | T4 | (start of Phase 3, after Phase 2) | ✅ Match |
| T6 | T5 | (start of Phase 4, after Phase 3) | ✅ Match |
| T7 | T1 | (start of Phase 5, after Phase 4) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T7 | (start of Phase 6, after Phase 5) | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T7 | (start of Phase 7, after Phase 6) | ✅ Match |
| T12 | T11 | T11→T12 | ✅ Match |
| T13 | T7 | (start of Phase 8, after Phase 7) | ✅ Match |
| T14 | T13 | T13→T14 | ✅ Match |
| T15 | T1 | (start of Phase 9, after Phase 8) | ✅ Match |
| T16 | T15 | T15→T16 | ✅ Match |
| T17 | T16 | T16→T17 | ✅ Match |
| T18 | T8, T10 | (start of Phase 10, after Phase 9) | ✅ Match |
| T19 | T10, T14, T17 | T18→T19 | ✅ Match |
| T20 | T18, T19 | T19→T20 | ✅ Match |
| T21 | T20 | (start of Phase 11, after Phase 10) | ✅ Match |
| T22 | T21 | T21→T22 | ✅ Match |
| T23 | T22 | T22→T23 | ✅ Match |
| T24 | T23 | T23→T24 | ✅ Match |
| T25 | T24 | T24→T25 | ✅ Match |
| T26 | T25 | T25→T26 | ✅ Match |

Every dependency points strictly backward or within the same phase; no task depends on a
later phase. T7/T9/T11/T13/T15 depend on T1 only (cross-phase backward reference to
Phase 1, not on the phases immediately preceding them) — allowed since dependencies must
point backward, not necessarily to the immediately prior phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Entity/config (package.json) | none | none | ✅ OK |
| T2 | `authenticateSession` | integration | integration | ✅ OK |
| T3 | WS pure helpers | unit | unit | ✅ OK |
| T4 | WS full connect/broadcast | e2e | e2e | ✅ OK |
| T5 | `inboxPoller` | integration | integration | ✅ OK |
| T6 | `server.ts` wiring | integration | integration | ✅ OK |
| T7 | Repository (`listConversations`) | integration | integration | ✅ OK |
| T8 | Router/Controller (`GET /conversations`) | e2e | e2e | ✅ OK |
| T9 | Repository (`getMessages`) | integration | integration | ✅ OK |
| T10 | Router/Controller (`GET .../messages`) | e2e | e2e | ✅ OK |
| T11 | Repository (`takeover`) | integration | integration | ✅ OK |
| T12 | Router/Controller (takeover conflict) | e2e | e2e | ✅ OK |
| T13 | Repository (`resendMessage`) | integration | integration | ✅ OK |
| T14 | Router/Controller (resend endpoint) | e2e | e2e | ✅ OK |
| T15 | `metaMediaClient` | unit | unit | ✅ OK |
| T16 | Repository (`getMessageMedia`) | integration | integration | ✅ OK |
| T17 | Router/Controller (media endpoint) | e2e | e2e | ✅ OK |
| T18 | `apps/web` query layer | unit | unit | ✅ OK |
| T19 | `apps/web` query layer | unit | unit | ✅ OK |
| T20 | `apps/web` hook | unit | unit | ✅ OK |
| T21 | `apps/web` route/component | unit | unit | ✅ OK |
| T22 | `apps/web` route/component | unit | unit | ✅ OK |
| T23 | `apps/web` route/component | unit | unit | ✅ OK |
| T24 | `apps/web` route/component | unit | unit | ✅ OK |
| T25 | `apps/web` route/component | unit | unit | ✅ OK |
| T26 | `apps/web` route/component | unit | unit | ✅ OK |

No violations — every task's `Tests` field matches the layer's requirement in the Test
Coverage Matrix. No task defers its tests to a later task; where a behavior change spans
repository→service→controller (e.g., T11→T12), the split follows the matrix's own
per-layer test type (repository=integration, router/controller=e2e) rather than deferring
either.
