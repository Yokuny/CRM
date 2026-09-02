# Foundation: Tenancy & Auth — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/foundation-tenancy-auth/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Gerado por decisão direta do usuário (repo sem `package.json` na raiz e sem nenhum teste — não havia o que amostrar). Guidelines encontradas: nenhuma (`AGENTS.md`/`CLAUDE.md`/CI ainda não existem neste repo). Runner: **Vitest 4** (AD-015), em `projects` na raiz.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain / service (regras de negócio, helpers puros) | unit | Todas as branches; 1:1 com AC do spec; todo edge case listado | `packages/**/*.unit.test.ts`, `apps/*/src/**/*.unit.test.ts` | `pnpm vitest run --project unit` |
| Middleware / repositório (toca `packages/db` via `MongoMemoryServer`) | integration | Caminhos-chave de query + tratamento de erro; todo índice declarado é provado | `packages/db/src/**/*.int.test.ts`, `apps/crm-api/src/**/*.int.test.ts` | `pnpm vitest run --project integration` |
| Rota / controlador (`crm-api`, `ai-gateway`) | e2e | Toda rota em escopo: happy path + edge listado + erro | `apps/*/src/**/*.e2e.test.ts` | `pnpm vitest run --project e2e` |
| Componente de UI (`apps/web`) | unit | Render + validação + leitura de `message` do `ApiResponse` | `apps/web/src/**/*.unit.test.tsx` | `pnpm vitest run --project unit` |
| Registry / limite de import (AD-010) | structural | Os 2 invariantes: todo schema Zod registrado; nenhum `mongoose` fora de `packages/db` | `tests/structural/*.structural.test.ts` | `pnpm vitest run --project structural` |
| Entity / config (schemas de tipo, tsconfig, biome, docker-compose) | none | — (build gate only) | — | build gate only |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks só com `unit` e/ou `structural` (sem Mongo real) | `pnpm vitest run --project unit --project structural` |
| Full | Após tasks com `integration` e/ou `e2e` (precisa de `MongoMemoryServer`) | `pnpm vitest run` (roda os 4 projects) |
| Build | Ao fechar uma fase, ou em tasks só de config/entity | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` |

**Tools por task (confirmado com o usuário):** MCP: `NONE` em todas as 30 tasks — nesta sessão não há MCP de código conectado (Context7 indisponível). Skill: `NONE` em todas — nenhuma skill do projeto (`tlc-spec-driven`, `grill-with-docs`) se aplica a código de implementação. WebSearch fica disponível ad-hoc só quando a API de uma lib pinada (Express 5, Mongoose 9, Zod 4, Vitest 4, `express-rate-limit` v8) for incerta — nunca por padrão.

---

## Execution Plan

Fases ordenadas e sequenciais; tasks dentro de uma fase executam em ordem.

### Phase 1: Workspace & Toolchain
```
T1 → T2 → T3
```

### Phase 2: packages/contracts
```
T4 → T5 → T6
```

### Phase 3: packages/db
```
T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 4: crm-api — middlewares e boot
```
T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 5: crm-api — rotas de plataforma, convite, auth
```
T21 → T22 → T23 → T24 → T25
```

### Phase 6: ai-gateway esqueleto + web mínimo
```
T26 → T27 → T28 → T29 → T30
```

---

## Task Breakdown

### T1: Root workspace + pinned toolchain

**What**: `package.json` raiz + `pnpm-workspace.yaml` (`packages: ['apps/*','packages/*']`); `typescript@5.9.3` pinado como devDependency raiz; `bcrypt` e `mongodb-memory-server` liberados para build nativo no pnpm 11 (confirmar a sintaxe exata do campo — `onlyBuiltDependencies` vs `allowBuilds` — via WebSearch se incerto).
**Where**: `package.json`, `pnpm-workspace.yaml`
**Depends on**: None
**Reuses**: `DentalEase-BackEnd/pnpm-workspace.yaml:1` (padrão de liberar build de addon nativo)
**Requirement**: FND-18 (toolchain que sustenta fail-fast); Risk "bcrypt exige aprovação de build"

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `pnpm install` roda sem erro na raiz vazia
- [x] `typescript` pinado em `5.9.3` exato (não `^5.9.3`)
- [x] `bcrypt` e `mongodb-memory-server` compilam sem prompt manual

**Tests**: none
**Gate**: build (`pnpm install`)
**Commit**: `chore(workspace): init pnpm workspace with pinned toolchain`

---

### T2: tsconfig + Biome + Vitest projects + skeletons

**What**: `tsconfig.base.json` (strict, NodeNext); `biome.json`; `vitest.config.ts` raiz com `projects: [unit, integration, e2e, structural]`; `package.json`+`tsconfig.json`+`src/index.ts` vazios para os 5 workspaces (`apps/crm-api`, `apps/ai-gateway`, `apps/web`, `packages/contracts`, `packages/db`), todos `exports: './src/index.ts'` (source-first, sem build em dev).
**Where**: `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `apps/*/package.json`, `packages/*/package.json`
**Depends on**: T1
**Reuses**: nenhum (config nova); segue a decisão "Consumo entre packages: source-first" do Tech Decisions do design
**Requirement**: FND-18, AD-015

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `pnpm -r exec tsc --noEmit` passa nos stubs vazios
- [x] `pnpm biome check .` passa
- [x] `pnpm vitest run` roda sem erro com 0 arquivos (`passWithNoTests` habilitado nos 4 projects)

**Tests**: none
**Gate**: build (`pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`)
**Commit**: `chore(workspace): scaffold tsconfig, biome, vitest projects and app/package skeletons`

---

### T3: docker-compose + .env.example

**What**: `docker-compose.yml` com serviço `mongo` standalone (sem replica set — decisão do design, ver Risk "MongoMemoryServer sem replica set"); `.env.example` cobrindo todas as chaves que o schema `env` (T13) vai exigir.
**Where**: `docker-compose.yml`, `.env.example`
**Depends on**: T1
**Reuses**: variáveis usadas em `.../src/config/db.config.ts`
**Requirement**: FND-18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `docker compose config` valida sem erro
- [ ] `.env.example` cobre 100% das chaves que `envSchema` (T13) vai exigir — revisitar depois de T13

**Tests**: none
**Gate**: build (`docker compose config`)
**Commit**: `chore(workspace): add docker-compose for mongo and .env.example`

---

### T4: Response pattern helpers

**What**: `type ApiResponse<T>` + `respObj`, `badRespObj`, `returnData`, `returnMessage` em `packages/contracts/src/response/`.
**Where**: `packages/contracts/src/response/index.ts`
**Depends on**: T2
**Reuses**: `.../src/helpers/responsePattern.helper.ts`
**Requirement**: base de `ApiResponse` para toda a feature; FND-10/AC4 (front lê `message`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] 4 helpers exportados com tipos genéricos corretos para `success`/`data`/`message`
- [x] `badRespObj` nunca inclui campo de stack/erro cru

**Tests**: unit — cada helper testado no caso de sucesso e de erro
**Gate**: quick
**Commit**: `feat(contracts): add ApiResponse type and response pattern helpers`

---

### T5: Tipos compartilhados e schemas pequenos

**What**: `type Role = 'admin' | 'gestor' | 'operador'`; `type TenantUser = { tenant?: string; user: string; role: Role[]; isPlatformAdmin: boolean }`; `idSchema` (ObjectId hex 24 chars); `inviteTokenParamSchema`.
**Where**: `packages/contracts/src/index.ts`, `packages/contracts/src/schemas/`
**Depends on**: T2
**Reuses**: nenhum (tipos novos da feature)
**Requirement**: FND-05 (forma de `TenantUser`), FND-08 (`Role`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Tipos exportados do barrel de `packages/contracts`
- [x] `idSchema` rejeita string que não seja hex de 24 chars

**Tests**: none (Entity/config layer — build gate only)
**Gate**: build
**Commit**: `feat(contracts): add Role, TenantUser types and id/param schemas`

---

### T6: schemaRegistry + schemas de entrada + TENANT_FORBIDDEN_KEYS

**What**: `provisionTenantSchema`, `createInviteSchema`, `acceptInviteSchema`, `signinSchema` — todos `.strict()`; `TENANT_FORBIDDEN_KEYS = ['tenant','tenantid','tenant_id','orgid','org_id','clinic','company']`; `schemaRegistry: ReadonlyArray<{name: string; schema: ZodType}>` registrando os 4.
**Where**: `packages/contracts/src/schemas/*.schema.ts`, `packages/contracts/src/registry.ts`
**Depends on**: T4, T5
**Reuses**: estilo de `src/schemas/*.schema.ts` do DentalEase
**Requirement**: FND-07, FND-11; semente do teste estrutural do AD-010

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Os 4 schemas rejeitam qualquer campo extra (incl. `Tenant`/`tenantId`/`orgId`) via `.strict()`
- [x] Os 4 aparecem em `schemaRegistry`

**Tests**: unit — 1 teste por schema afirmando rejeição de campo forjado (FND-07) + 1 happy path por schema
**Gate**: quick
**Commit**: `feat(contracts): add input schemas, schemaRegistry and TENANT_FORBIDDEN_KEYS`

---

### T7: Conexão Mongo + infra de teste

**What**: `connect(uri: string): Promise<void>` / `disconnect(): Promise<void>` em `packages/db`; `globalSetup.ts` (sobe `MongoMemoryServer` standalone) e `clearCollections()` helper, wireados no project `integration` do Vitest.
**Where**: `packages/db/src/connection.ts`, `packages/db/tests/setup/globalSetup.ts`, `packages/db/tests/helpers/db.helper.ts`
**Depends on**: T2
**Reuses**: `.../src/config/db.config.ts`, `.../tests/setup/globalSetup.ts`, `.../tests/helpers/db.helper.ts`
**Requirement**: base do fail-fast provado no boot (T20)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `connect(uri inválida)` rejeita a Promise (não lança síncrono)
- [x] `globalSetup` sobe o `MongoMemoryServer` e injeta a URI antes de qualquer teste do project `integration`
- [x] `clearCollections()` limpa todas as collections entre testes

**Tests**: none aqui — infra é validada implicitamente por T8-T11 rodando contra ela
**Gate**: build
**Commit**: `feat(db): add mongo connection and MongoMemoryServer test infra`

---

### T8: Tenant model

**What**: Schema `Tenant` (`name` 3..120, `document` só dígitos, `status`) + índice `{document:1}` unique + `transitionTenantStatus(id, from, to)` via `findOneAndUpdate({_id, status: from})`.
**Where**: `packages/db/src/models/tenant.model.ts`
**Depends on**: T7
**Reuses**: forma de `src/database/*.database.ts` (`timestamps: true`)
**Requirement**: FND-01, FND-19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Índice único em `document` provado (segundo insert com mesmo `document` rejeita)
- [x] `provisioned → active` aceito; transição fora da máquina de estados retorna `null` (guarda é a query)

**Tests**: integration (`MongoMemoryServer`) — índice único + transição válida/inválida (FND-19)
**Gate**: full
**Commit**: `feat(db): add Tenant model with unique index and guarded transitions`

---

### T9: User model

**What**: Schema `User` (`name` 3..80, `email` lowercase+trim, `password` bcrypt cost 10, `Tenant?`, `role: Role[]`, `isPlatformAdmin` default false, `active` default true) + índice `{email:1}` unique + validação `Tenant` obrigatório ⟺ `!isPlatformAdmin`.
**Where**: `packages/db/src/models/user.model.ts`
**Depends on**: T7
**Reuses**: forma de `src/database/user.database.ts`; padrão `toDomain`/`DbUser → DomainUser` (ObjectId não escapa)
**Requirement**: FND-01/AC4, AD-016

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] E-mail duplicado rejeitado pelo índice único (case-insensitive por normalização no `pre-save`)
- [x] Criar `User` sem `Tenant` e sem `isPlatformAdmin: true` falha a validação de schema

**Tests**: integration — índice único de e-mail + validação condicional Tenant/isPlatformAdmin (AD-016)
**Gate**: full
**Commit**: `feat(db): add User model with unique email index and tenant/admin invariant`

---

### T10: Invite model

**What**: Schema `Invite` (`Tenant`, `email`, `role`, `tokenHash`, `status`, `expiresAt`, `invitedBy`, `sentAt?`) + 3 índices (`{tokenHash:1}` unique, `{Tenant:1,email:1}` unique com `partialFilterExpression: {status:'pending'}`, `{Tenant:1,status:1}`) + `hashToken(token): string` (sha256).
**Where**: `packages/db/src/models/invite.model.ts`
**Depends on**: T7, T8, T9
**Reuses**: forma de `src/database/*.database.ts`
**Requirement**: FND-02, FND-13; FND-16 (parte lógica de expiração — sem TTL, por design)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Dois `insert` de convite `pending` para o mesmo par `Tenant+email` — o segundo falha pelo índice parcial
- [x] `hashToken` determinístico (mesmo input → mesmo hash)
- [x] Nenhum índice TTL declarado (verificado por não-presença — é a decisão do design)

**Tests**: integration — índice parcial único provado com 2 inserts; `hashToken` puro testado em unit dentro do mesmo arquivo de teste do model (camada mais alta = integration)
**Gate**: full
**Commit**: `feat(db): add Invite model with partial unique index and token hashing`

---

### T11: Session model

**What**: Schema `Session` (`user`, `Tenant?`, `tokenHash`, `deviceInfo`, `expiresAt`) + 3 índices (`{tokenHash:1}` unique, `{user:1}`, `{expiresAt:1}` com `expireAfterSeconds: 0`).
**Where**: `packages/db/src/models/session.model.ts`
**Depends on**: T7, T9
**Reuses**: nenhum direto — collection separada é divergência deliberada do `refreshToken[]` embutido do DentalEase (ver design.md, seção Data Models)
**Requirement**: FND-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `listIndexes()` mostra o índice TTL em `expiresAt` com `expireAfterSeconds: 0`
- [x] `deleteMany({user})` remove todas as sessões daquele usuário

**Tests**: integration — índice TTL existe (FND-16); `deleteMany({user})` remove N sessões de um usuário e nenhuma de outro
**Gate**: full
**Commit**: `feat(db): add Session model with TTL index`

---

### T12: Barrel + tenantScoped + syncIndexes

**What**: `packages/db/src/index.ts` exportando `connect/disconnect/Tenant/User/Invite/Session/syncIndexes`; `tenantScoped<F extends {Tenant: string}>(filter: F): F` — semente do `TenantScopedRepo` (AD-010, consumido pelo `ai-kit` na feature 9).
**Where**: `packages/db/src/index.ts`, `packages/db/src/tenantScoped.ts`
**Depends on**: T8, T9, T10, T11
**Reuses**: nenhum (novo)
**Requirement**: AD-010 (semente estrutural)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Chamar `tenantScoped` com um filtro sem `Tenant` é erro de **tipo** (`// @ts-expect-error` comprova)
- [x] `syncIndexes()` chama `createIndexes` dos 4 models

**Tests**: unit — teste de tipo (compilação falha sem `Tenant` no filtro) + teste de runtime do passthrough (filtro válido retorna idêntico)
**Gate**: quick
**Commit**: `feat(db): export barrel with tenantScoped type guard and syncIndexes`

---

### T13: env + cookie config

**What**: `env` validado por Zod (`safeParse` no import; falha nomeia a variável ausente); `cookieOptions`/`clearCookieOptions`.
**Where**: `apps/crm-api/src/config/env.config.ts`, `apps/crm-api/src/config/cookie.config.ts`
**Depends on**: T2
**Reuses**: `.../src/config/env.config.ts`, `.../src/config/cookie.config.ts` (portado literal)
**Requirement**: FND-18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Remover uma variável obrigatória do `.env` de teste faz o parse falhar citando o **nome** dela
- [ ] Env completo (do `.env.example` de T3) faz o parse passar

**Tests**: unit — env sem 1 variável → mensagem nomeia a variável; env completo → ok
**Gate**: quick
**Commit**: `feat(crm-api): add zod-validated env and cookie config`

---

### T14: Middlewares de validação

**What**: `validBody(schema)`, `validParams(schema)`, `validQuery(schema)` — Zod 4 (`error.issues`, não `.errors`), agrega todos os issues numa única mensagem, chama `next()` **uma única vez**.
**Where**: `apps/crm-api/src/middlewares/validation.middleware.ts`
**Depends on**: T2
**Reuses**: `.../src/middlewares/validation.middleware.ts` (interface portada, corpo reescrito)
**Requirement**: FND-11; Risk "Zod 4 renomeou `.errors`→`.issues`"; Risk "`next()` chamado dentro do `for`"

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Body com 2 campos inválidos retorna 400 com **uma** mensagem agregando os 2
- [ ] Nenhum `ERR_HTTP_HEADERS_SENT` (só 1 chamada de `next(err)` por request)

**Tests**: unit — 2 campos inválidos → 1 chamada de `next(err)` com issues agregados; schema válido → `next()` sem erro
**Gate**: quick
**Commit**: `feat(crm-api): add validBody/validParams/validQuery middlewares`

---

### T15: errorHandler + responseTime

**What**: `errorHandler(err, req, res, next)` + `CustomError`; `responseTime` (prom-client `reqResTime`, latência HTTP).
**Where**: `apps/crm-api/src/middlewares/errorHandler.middleware.ts`, `apps/crm-api/src/middlewares/responseTime.middleware.ts`
**Depends on**: T4
**Reuses**: `.../src/middlewares/errorHandler.middleware.ts`
**Requirement**: FND-17 (métrica), erro não previsto → 500

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Erro não tratado responde 500 com `badRespObj`; stack só no log estruturado, nunca no corpo da resposta
- [ ] `responseTime` registra a métrica por request

**Tests**: unit — erro genérico → 500 + corpo sem stack; log estruturado chamado com `requestId`
**Gate**: quick
**Commit**: `feat(crm-api): add errorHandler and responseTime middlewares`

---

### T16: extractToken + createAuthMiddleware

**What**: `extractToken(req)` — função pura, cookie `refreshToken` OU header `Authorization: Bearer`, corrigindo o bug `&&`/`||` da referência; `createAuthMiddleware(deps: AuthDeps)` → `{validToken}` fazendo `jwt.verify` + `findSessionByHash(sha256(token))` + checagem de `deviceInfo` (mismatch → `deleteMany({user})` + 401 + log) + `getUserById`/`getTenantById` + monta `req.tenantUser = {tenant, user, role[], isPlatformAdmin}`.
**Where**: `apps/crm-api/src/middlewares/authentication.middleware.ts`
**Depends on**: T8, T9, T11
**Reuses**: `.../src/middlewares/authentication.middleware.ts` (forma da fábrica com provider injetado; corpo reescrito — Risks 1, 2 e 4 do design)
**Requirement**: FND-05, FND-06, FND-17; Risk 1 (credencial em log), Risk 2 (`&&`/`||`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Nenhum `console.log` do header `Authorization`, token ou `deviceInfo` completo
- [ ] `extractToken` correto nos 4 casos (ausente, scheme errado, partes erradas, válido) + o caso do spec: cookie ausente + `Authorization` presente
- [ ] `user-agent` divergente do da sessão derruba **todas** as sessões do usuário (`deleteMany`) e loga `{event: 'session.device_mismatch', userId}`
- [ ] Sessão ausente do banco responde 401 e loga `{event: 'session.replay', userId}`

**Tests**: integration (inclui as 5 unidades de `extractToken` no mesmo arquivo — camada mais alta do task vence) — FND-05 (`tenantUser` do banco), FND-06 (device mismatch), FND-17 (campos do evento)
**Gate**: full
**Commit**: `feat(crm-api): add createAuthMiddleware with db-verified session and device binding`

---

### T17: Middlewares de autorização

**What**: `checkRole(allowed: Role[])` + `isAdmin`/`isGestor`/`isOperador`; `platformAdminOnly` (403 antes do controller); `tenantAssignmentCheck` (424).
**Where**: `apps/crm-api/src/middlewares/authorization.middleware.ts`, `apps/crm-api/src/middlewares/tenantAssign.middleware.ts`
**Depends on**: T5
**Reuses**: `.../src/middlewares/authorization.middleware.ts`, `.../src/middlewares/clinicAssign.middleware.ts` (mesma semântica, mesmo 424)
**Requirement**: FND-01/AC3, FND-05/AC4, FND-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Matriz papel×rota cobre os 3 papéis (`admin`, `gestor`, `operador`)
- [ ] `tenantAssignmentCheck` responde 424 exatamente quando `req.tenantUser.tenant` está ausente
- [ ] `platformAdminOnly` responde 403 antes de qualquer chamada ao controller

**Tests**: unit — matriz papel×rota (FND-08); 424 sem Tenant vinculado (FND-05/AC4); 403 sem `isPlatformAdmin` (FND-01/AC3)
**Gate**: quick
**Commit**: `feat(crm-api): add checkRole, platformAdminOnly and tenantAssignmentCheck middlewares`

---

### T18: Rate limits

**What**: `signinRateLimit`, `inviteRateLimit` — `express-rate-limit` v8, `keyGenerator` síncrono combinando e-mail normalizado + IP.
**Where**: `apps/crm-api/src/middlewares/rateLimit.middleware.ts`
**Depends on**: T2
**Reuses**: `.../src/middlewares/platform-subscription-guard.middleware.ts` (padrão de uso do `express-rate-limit` v8 com `keyGenerator`)
**Requirement**: FND-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] N+1 tentativas do mesmo e-mail (dentro da janela) respondem 429 com mensagem legível em pt-BR

**Tests**: integration — supertest com N+1 chamadas contra um app mínimo montando só o rate limiter
**Gate**: full
**Commit**: `feat(crm-api): add signin and invite rate limiters`

---

### T19: MailProvider

**What**: Porta `MailProvider` (`send(to, subject, body): Promise<{sent: boolean}>`) + implementações `nodemailer` e `log` (dev/test).
**Where**: `apps/crm-api/src/providers/mail/`
**Depends on**: T2
**Reuses**: nenhum literal — porta abstrata nova; referência não tinha essa camada
**Requirement**: FND-12, FND-18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Transporte `nodemailer` mockado rejeitando → `send` retorna `{sent: false}`, nunca lança
- [ ] `log` sempre retorna `{sent: true}` e escreve no log estruturado

**Tests**: unit — `log` determinístico; `nodemailer` com transporte mockado rejeitando não lança
**Gate**: quick
**Commit**: `feat(crm-api): add MailProvider port with nodemailer and log implementations`

---

### T20: Boot — buildApp/start + /health

**What**: `buildApp(): Express` (cookie-parser, cors com origem explícita + `credentials: true`, json body, `responseTime`, `errorHandler` global) sem `listen`, testável via supertest; `start(): Promise<void>` (valida env → `connect` → `syncIndexes` → `listen`, `catch` explícito → `process.exit(1)`); `GET /health`.
**Where**: `apps/crm-api/src/app.ts`, `apps/crm-api/src/server.ts`
**Depends on**: T7, T13, T14, T15
**Reuses**: padrão de exit de `.../src/config/db.config.ts`
**Requirement**: FND-18; Risk "`dbConnect` faz throw mas boot não garante saída"

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Mongo indisponível no `start()` termina o processo com código 1 e log explícito
- [ ] `buildApp()` é testável via supertest sem abrir porta
- [ ] `GET /health` responde `{success: true, data: {...}}`

**Tests**: unit (env/exit com `connect` mockado rejeitando) + integration (`/health` real contra `MongoMemoryServer`) — camada mais alta vence
**Gate**: full
**Commit**: `feat(crm-api): add buildApp/start boot sequence with fail-fast and health route`

---

### T21: Módulo platform

**What**: `platform.repository/service/controller/router` — `POST /platform/tenants` → 201 `{id}`; `POST /platform/tenants/:id/invites` → 201, ou 202 se o e-mail falhar.
**Where**: `apps/crm-api/src/{routers,controllers,services,repositories}/platform.*`
**Depends on**: T8, T10, T17, T18, T19, T20
**Reuses**: fluxo `emailValidation` do `auth.service.ts` (sem rollback quando o envio falha — o convite fica e é reenviável)
**Requirement**: FND-01, FND-02, FND-12, FND-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Usuário sem `isPlatformAdmin` recebe 403 e nada é criado
- [ ] E-mail já convidado no mesmo Tenant responde 409 sem convite duplicado
- [ ] SMTP fora → 202 e convite persistido com `sentAt` ausente

**Tests**: e2e — 201+403 (FND-01), `Invite` com hash/papel `admin`/`expiresAt`+7d (FND-02), 202 com SMTP mockado falhando (FND-12), 429 no rate limit (FND-14)
**Gate**: full
**Commit**: `feat(crm-api): add platform routes for tenant provisioning and admin invite`

---

### T22: Módulo invite (público)

**What**: `invite.repository/service/controller/router` — `GET /invites/:token` → `{tenantName, email}` sem autenticação; `POST /invites/:token/accept` → cria `User`, marca `accepted`, abre sessão.
**Where**: `apps/crm-api/src/{routers,controllers,services,repositories}/invite.*`
**Depends on**: T9, T10, T16, T20
**Reuses**: `signup` do `auth.service.ts` (validação de estado antes de criar usuário)
**Requirement**: FND-03, FND-13, FND-15, FND-16 (parte lógica)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Token expirado, `accepted` ou inexistente respondem 410 com mensagens **distintas**, nunca ecoando o e-mail
- [ ] Aceite concorrente (`Promise.all` de dois `accept` do mesmo token) cria exatamente 1 usuário; o perdedor recebe 410

**Tests**: e2e — aceite cria user+cookie (FND-03/AC2), reuso→410 distinguindo expirado/inválido (FND-03/AC3), 2 aceites concorrentes → 1 user + 1×410 (FND-15)
**Gate**: full
**Commit**: `feat(crm-api): add public invite routes with peek and concurrent-safe accept`

---

### T23: Módulo auth

**What**: `auth.repository/service/controller/router` — `POST /auth/signin` → cookie `refreshToken` httpOnly + `{message}`; `GET /auth/session` → `{tenant, user, role[]}`; `issueSession`/`revokeAllSessions` com `await` corrigido.
**Where**: `apps/crm-api/src/{routers,controllers,services,repositories}/auth.*`
**Depends on**: T9, T11, T16, T18, T20
**Reuses**: `signin`/`generateRefreshToken`/`saveRefreshToken` do `auth.service.ts` — com o `await` que falta no original
**Requirement**: FND-04, FND-05; Risk 5 (`saveRefreshToken` sem `await`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `signin` seguido imediatamente de `GET /auth/session` na mesma sequência nunca retorna 401 (prova o `await`)
- [ ] Senha errada → 401
- [ ] `tenantUser` de `GET /auth/session` vem do banco, não do payload do token

**Tests**: e2e — cookie emitido + senha errada→401 (FND-04); signin→session imediato sem 401 (Risk 5); tenantUser populado do banco (FND-05)
**Gate**: full
**Commit**: `feat(crm-api): add auth routes for signin and session with awaited session issuance`

---

### T24: Isolamento entre tenants (dedicado)

**What**: Teste de integração dedicado — dois tenants espelhados (mesmos papéis, dados equivalentes) provando zero cruzamento em qualquer rota tocada até aqui; mais o caso do body com `Tenant`/`tenantId`/`orgId` forjado, ignorado ponta a ponta.
**Where**: `apps/crm-api/tests/integration/tenant-isolation.int.test.ts`
**Depends on**: T21, T22, T23
**Reuses**: nenhum — é o critério de sucesso explícito do spec
**Requirement**: FND-07, FND-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Nenhuma das 3 rotas (platform/invite/auth) devolve registro de tenant diferente do da sessão
- [ ] Body com `Tenant` forjado não altera o tenant resolvido em nenhuma das 3

**Tests**: integration — dois tenants espelhados, zero cruzamento (FND-09); `Tenant` forjado ignorado (FND-07)
**Gate**: full
**Commit**: `test(crm-api): add cross-tenant isolation integration test`

---

### T25: Teste estrutural (AD-010 + limite do Mongoose)

**What**: (1) varre o filesystem por `*.schema.ts`, exige que todo export `ZodType` esteja em `schemaRegistry`; cruza o registry contra `TENANT_FORBIDDEN_KEYS`. (2) varre `apps/**` por `from 'mongoose'` e falha se encontrar — só `packages/db` pode importar.
**Where**: `tests/structural/schema-registry.structural.test.ts`, `tests/structural/mongoose-boundary.structural.test.ts`
**Depends on**: T6, T12
**Reuses**: nenhum (novo) — mitigação direta do Risk "registry apodrece em silêncio" e "nenhum model fora de `packages/db` é invariante sem dono"
**Requirement**: AD-010

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Um schema Zod exportado e não registrado no `schemaRegistry` falha o teste (fixture criado e removido no próprio teste)
- [ ] Um `import ... from 'mongoose'` dentro de `apps/**` falha o teste

**Tests**: structural — os 2 cenários acima
**Gate**: build
**Commit**: `test(structural): add schema-registry and mongoose-boundary structural tests`

---

### T26: ai-gateway esqueleto

**What**: `apps/ai-gateway/src/{app.ts,server.ts}` reaproveitando o padrão `buildApp/start` do `crm-api` (apps distintos, mesmo padrão — não import direto); `GET /health` → `{success:true, data:{service:'ai-gateway', db:'up'}}`.
**Where**: `apps/ai-gateway/src/app.ts`, `apps/ai-gateway/src/server.ts`
**Depends on**: T7, T20
**Reuses**: mesmo padrão `buildApp`/`start` do `crm-api` (T20)
**Requirement**: AD-002 (dois `/health` desde a feature 1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `/health` responde com Mongo conectado (`MongoMemoryServer` no teste)

**Tests**: e2e — `/health` contra `MongoMemoryServer`
**Gate**: full
**Commit**: `feat(ai-gateway): add health-check skeleton service`

---

### T27: apps/web — client.api + session query

**What**: `lib/api/client.api.ts` (`request()` + `GET/POST`, `credentials: 'include'`, retorna `ApiResponse<T>` de `packages/contracts`); `query/session.ts` (`sessionKeys`, `sessionQuery`).
**Where**: `apps/web/src/lib/api/client.api.ts`, `apps/web/src/query/session.ts`
**Depends on**: T4
**Reuses**: `client.api.ts` do front de referência, simplificado — sem o ramo de `accessToken`/Zustand (AD-014)
**Requirement**: FND-10; base do "guarda de rota no front" do Tech Decisions

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `request()` tipa a resposta a partir de `ApiResponse<T>` de `packages/contracts`
- [ ] `sessionQuery` chama `GET /auth/session` com `staleTime` compatível com o guard de rota (T30)

**Tests**: unit — `client.api` com `fetch` mockado (sucesso e erro); `sessionQuery` chama o endpoint certo
**Gate**: quick
**Commit**: `feat(web): add typed api client and session query`

---

### T28: apps/web — tela de login

**What**: `_public/auth/index.tsx` — `react-hook-form` + `@hookform/resolvers` com `signinSchema`, `<Card asPage>`, `t()` em toda string.
**Where**: `apps/web/src/routes/_public/auth/index.tsx`
**Depends on**: T6, T27
**Reuses**: convenções de página do front de referência (`<Card asPage>`, `t()`)
**Requirement**: FND-10/AC2, AC4

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Erro do back-end exibe a `message` do `ApiResponse`, nunca um erro cru
- [ ] Login bem-sucedido redireciona para a área privada

**Tests**: unit de componente — submit válido chama `client.api`; erro do back-end renderiza `message`
**Gate**: quick
**Commit**: `feat(web): add login screen`

---

### T29: apps/web — tela de aceite de convite

**What**: `_public/invite/index.tsx` — token via **search param** (`?token=`, nunca `$id`), exibe nome do tenant + e-mail via `GET /invites/:token`, formulário nome+senha com `acceptInviteSchema`.
**Where**: `apps/web/src/routes/_public/invite/index.tsx`
**Depends on**: T6, T27
**Reuses**: mesma convenção de página do login (T28)
**Requirement**: FND-10/AC1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Token ausente/inválido/expirado mostra a `message` do 410 sem quebrar a tela
- [ ] Token válido mostra nome do tenant + e-mail antes do formulário

**Tests**: unit de componente — render com token válido mostra nome+email; 410 mostra a mensagem certa
**Gate**: quick
**Commit**: `feat(web): add invite acceptance screen`

---

### T30: apps/web — guarda privada + shell

**What**: `_private.tsx` (`beforeLoad` + `ensureQueryData(sessionQuery)`, `redirect` ao login sem loop); `_private/index.tsx` (shell com nome do tenant e papel).
**Where**: `apps/web/src/routes/_private.tsx`, `apps/web/src/routes/_private/index.tsx`
**Depends on**: T27, T28
**Reuses**: `_private.tsx` do front de referência — a verdade da sessão vem de `ensureQueryData`, não de Zustand
**Requirement**: FND-10/AC2, AC3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Sessão revogada/expirada redireciona ao login **uma vez**, sem loop
- [ ] Shell mostra nome do tenant e papel vindos de `GET /auth/session`

**Tests**: unit — guard com `queryClient` mockado (sessão válida passa; inválida redireciona uma vez, não em loop)
**Gate**: quick
**Commit**: `feat(web): add private route guard and authenticated shell`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1  ──→ T2  ──→ T3
Phase 2:  T4  ──→ T5  ──→ T6
Phase 3:  T7  ──→ T8  ──→ T9  ──→ T10 ──→ T11 ──→ T12
Phase 4:  T13 ──→ T14 ──→ T15 ──→ T16 ──→ T17 ──→ T18 ──→ T19 ──→ T20
Phase 5:  T21 ──→ T22 ──→ T23 ──→ T24 ──→ T25
Phase 6:  T26 ──→ T27 ──→ T28 ──→ T29 ──→ T30
```

A sequência dentro de cada fase é ordem de **execução** (um worker por vez, em ordem), não uma cadeia estrita de dependência 1→1 — várias tasks dependem de uma task mais recuada na mesma fase ou de fases anteriores (ver `Depends on` de cada task e o cross-check abaixo), nunca de uma posterior.

**Total: 30 tasks em 6 fases.** A estimativa original do design.md era ~20-24; o breakdown granular (uma task por model/middleware/rota/tela, conforme a regra "uma task = um arquivo/conceito") fechou em 30 — reportando o número real em vez de forçar o encaixe na estimativa. Isso passa de um batch de ~7, então a fase Execute abre com a oferta de sub-agentes (offer-then-confirm) antes de despachar qualquer coisa; ~30 tasks em fases inteiras aponta para ~4-5 workers.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1-T3 | 1 concern de config cada (workspace, toolchain, infra local) | ✅ Granular |
| T4-T6 | 1 concern de contracts cada (helpers, tipos, registry) | ✅ Granular |
| T7 | 1 concern (conexão + infra de teste, cohesivos) | ✅ Granular |
| T8-T11 | 1 model cada | ✅ Granular |
| T12 | 1 concern (barrel + guard de tipo) | ✅ Granular |
| T13-T15 | 1 concern de middleware cada | ✅ Granular |
| T16 | `extractToken` + `createAuthMiddleware` no mesmo arquivo | ⚠️ OK — 2 funções cohesivas no mesmo arquivo, a segunda consome a primeira; separá-las criaria uma task cujo teste depende da outra (ver Resolving Compilation Dependencies) |
| T17 | 3 middlewares de autorização | ⚠️ OK — mesmo grupo do design (`middlewares` component), nenhum testável de forma útil isolado do conceito "autorização" |
| T18-T20 | 1 concern cada | ✅ Granular |
| T21-T23 | repository+service+controller+router de 1 módulo cada | ⚠️ Cohesivo por design — uma rota não é e2e-testável com controller/service/repo isolados; mesclar é a resolução recomendada pelo processo (Resolving Compilation Dependencies), não um desvio da granularidade |
| T24-T26 | 1 concern cada | ✅ Granular |
| T27 | client.api + session query | ⚠️ OK — 2 arquivos pequenos, o segundo consome o primeiro, cohesivos como "camada de dados do front" |
| T28-T30 | 1 tela/guarda cada | ✅ Granular |

Nenhum ❌. As 5 exceções ⚠️ são o caso explícito de "2-3 coisas relacionadas no mesmo módulo = OK se cohesivo" e o caso de "dependência de compilação" do processo de Tasks — nenhuma reflete uma task que deveria ter sido dividida.

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | início da Fase 1 | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T3 (fora da cadeia linear, mesma fase, backward) | ✅ Match |
| T4 | T2 | T2→T3→T4 (fase anterior, backward) | ✅ Match |
| T5 | T2 | fase anterior, backward | ✅ Match |
| T6 | T4, T5 | T4→T5→T6 | ✅ Match |
| T7 | T2 | fase anterior, backward | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T7 | fase 3, backward (não precisa de T8) | ✅ Match |
| T10 | T7, T8, T9 | todos antes na Fase 3 | ✅ Match |
| T11 | T7, T9 | ambos antes na Fase 3 (não precisa de T10) | ✅ Match |
| T12 | T8, T9, T10, T11 | todos antes na Fase 3 | ✅ Match |
| T13 | T2 | fase 2, backward | ✅ Match |
| T14 | T2 | fase 2, backward | ✅ Match |
| T15 | T4 | fase 2, backward | ✅ Match |
| T16 | T8, T9, T11 | fase 3, backward | ✅ Match |
| T17 | T5 | fase 2, backward | ✅ Match |
| T18 | T2 | fase 2, backward | ✅ Match |
| T19 | T2 | fase 2, backward | ✅ Match |
| T20 | T7, T13, T14, T15 | T7 fase 3 backward; T13-T15 antes na Fase 4 | ✅ Match |
| T21 | T8, T10, T17, T18, T19, T20 | fases 3-4, todos backward | ✅ Match |
| T22 | T9, T10, T16, T20 | fases 3-4, todos backward | ✅ Match |
| T23 | T9, T11, T16, T18, T20 | fases 3-4, todos backward | ✅ Match |
| T24 | T21, T22, T23 | todos antes na Fase 5 | ✅ Match |
| T25 | T6, T12 | fases 2-3, backward (não precisa de T21-T24) | ✅ Match |
| T26 | T7, T20 | fases 3-4, backward | ✅ Match |
| T27 | T4 | fase 2, backward | ✅ Match |
| T28 | T6, T27 | T6 fase 2 backward; T27 antes na Fase 6 | ✅ Match |
| T29 | T6, T27 | idem T28 | ✅ Match |
| T30 | T27, T28 | ambos antes na Fase 6 | ✅ Match |

**Regra verificada**: nenhuma task depende de uma task de fase posterior. Toda dependência aponta para trás (mesma fase ou fase anterior) — nenhuma violação.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1-T3 | Entity/config (workspace, toolchain, infra local) | none | none | ✅ OK |
| T4 | Domain (helpers puros) | unit | unit | ✅ OK |
| T5 | Entity/config (tipos, schemas triviais) | none | none | ✅ OK |
| T6 | Domain (schemas com regra `.strict()`) | unit | unit | ✅ OK |
| T7 | Entity/config (conexão + infra) | none | none | ✅ OK |
| T8-T11 | Repositório (`packages/db`, via `MongoMemoryServer`) | integration | integration | ✅ OK |
| T12 | Domain (guard de tipo + passthrough) | unit | unit | ✅ OK |
| T13 | Domain (parse de env) | unit | unit | ✅ OK |
| T14 | Middleware (puro, sem DB) | unit | unit | ✅ OK |
| T15 | Middleware (puro, sem DB) | unit | unit | ✅ OK |
| T16 | Middleware + DB (sessão) | integration (camada mais alta) | integration | ✅ OK |
| T17 | Middleware (puro, sem DB) | unit | unit | ✅ OK |
| T18 | Middleware + estado entre requests | integration | integration | ✅ OK |
| T19 | Domain (provider, transporte mockado) | unit | unit | ✅ OK |
| T20 | Boot (env/exit unit + `/health` integration) | integration (camada mais alta) | integration | ✅ OK |
| T21-T23 | Rota (`crm-api`) | e2e | e2e | ✅ OK |
| T24 | Integração cross-módulo | integration | integration | ✅ OK |
| T25 | Registry/limite de import | structural | structural | ✅ OK |
| T26 | Rota (`ai-gateway`) | e2e | e2e | ✅ OK |
| T27 | Domain (client + query, front) | unit | unit | ✅ OK |
| T28-T30 | Componente de UI | unit | unit | ✅ OK |

Nenhuma violação. Nenhuma task usa "testado em outra task" como justificativa — os 5 casos ⚠️ do Granularity Check (T16, T17, T21-T23, T27) incluem os testes das camadas que mesclam **dentro do próprio task**, na camada mais alta exigida.

---

## Tips

- **Fases são ordenadas** — cada fase completa antes da próxima; tasks rodam em ordem dentro da fase
- **Reuses = economia de token** — sempre referenciar o código de origem
- **Tools por task** — MCP: NONE / Skill: NONE em todas (confirmado com o usuário; ver nota na Test Coverage Matrix)
- **Dependências são portões** — claro o que bloqueia o quê
- **Done when = testável** — se não dá pra verificar, reescreva
- **Requirement ID = rastreável** — toda task remonta a um FND ou a uma decisão registrada
- **Um commit por task** — mensagens já no formato `tipo(escopo): descrição`
