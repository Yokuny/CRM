# kanban-tool Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is
the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review,
Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.** (Nota
operacional: nesta sessão a skill não aparece no listing por estar em `.claude/skill/` em vez de
`.claude/skills/` — ler `SKILL.md`+`references/` manualmente, mesma situação já registrada em
`.specs/STATE.md` Handoff.)

---

**Design**: `.specs/features/kanban-tool/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Gerado a partir do código existente — confirmar antes do Execute. Guidelines encontradas:
> nenhum `AGENTS.md`/`CONTRIBUTING.md` específico de teste; convenção vem de `.specs/STATE.md`
> AD-017 (Vitest `projects` nomeados, arquivos por sufixo) e de amostras reais: `professional.
> model.int.test.ts`, `professional.repository.int.test.ts`, `professional.service.unit.test.ts`,
> `professional.router.e2e.test.ts`, `createProfessional.schema.unit.test.ts`, e o padrão de
> mock de `@tanstack/react-router` em `apps/web/CLAUDE.md`. `professional.controller.ts` não tem
> teste dedicado no repo — é exercitado só pelo `*.router.e2e.test.ts` do módulo, então
> "Controller" abaixo reflete essa convenção já em uso (não é um gap a inventar defesa nova).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Model (`packages/db/src/models/*.model.ts`) | integration | Cria/valida documento; obrigatoriedade de campos required; índice não quebra escrita | `packages/db/src/models/*.model.int.test.ts` | `pnpm vitest run --project integration` |
| Contract schema (`packages/contracts/src/schemas/*.schema.ts`) | unit | Todo caso válido/inválido citado no spec (limites de tamanho, regex de cor, refine de coluna) | `packages/contracts/src/schemas/*.schema.unit.test.ts` | `pnpm vitest run --project unit` |
| Repository (`apps/crm-api/src/repositories/*.repository.ts`) | integration | Todo caminho de query usado pelos services (inclusive a aggregation de `listBoards` e o guard `existsInColumn`) + tenant-scoping (id de outro tenant não retorna nada) | `apps/crm-api/src/repositories/*.repository.int.test.ts` | `pnpm vitest run --project integration` |
| Service (`apps/crm-api/src/services/*.service.ts`) | unit | Todos os branches; 1:1 com as ACs do spec (KAN-01..KAN-29); todo Edge Case listado | `apps/crm-api/src/services/*.service.unit.test.ts` | `pnpm vitest run --project unit` |
| Controller (`apps/crm-api/src/controllers/*.controller.ts`) | none (direto) | Exercitado só pelo `*.router.e2e.test.ts` do mesmo módulo — mesma convenção já usada por `professional.controller.ts`/`order.controller.ts` (nenhum tem teste próprio) | — | build gate only |
| Router/e2e (`apps/crm-api/src/routers/*.router.ts`) | e2e | Toda rota do escopo: happy path + edge case listado + erro (403/404/400 de cada AC) | `apps/crm-api/src/routers/*.router.e2e.test.ts` | `pnpm vitest run --project e2e` |
| Frontend query (`apps/web/src/query/*.ts`) | unit | Toda query/mutation: sucesso, erro de API (`res.success===false`), chave de invalidação | `apps/web/src/query/*.unit.test.ts` | `pnpm vitest run --project unit` |
| Frontend route/componente (`apps/web/src/routes/**/*.tsx`) | unit | Render + estado vazio/loading + a interação principal da tela (criar, arrastar, abrir painel) + 1 caminho de erro visível | `apps/web/src/routes/**/*.unit.test.tsx` | `pnpm vitest run --project unit` |
| `packages/db/src/index.ts` (export barrel) | none | — | — | build gate only |

## Gate Check Commands

> Gerado a partir de `.specs/STATE.md` AD-017 e `package.json` (raiz) — confirmar antes do
> Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de task só com teste unit | `pnpm vitest run --project unit --project structural` |
| Full | Depois de task com teste integration/e2e | `pnpm vitest run` |
| Build | Fim de fase, ou task só de config/model/export | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` (= `pnpm run check`) |

---

## Execution Plan

Fases são ordenadas e rodam sequencialmente — cada fase completa antes da próxima começar, e as
tasks dentro de uma fase rodam em ordem.

### Phase 1: Dados e contratos

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Regra de negócio (backend)

```
T6 → T7 → T8 → T9
```

### Phase 3: HTTP (backend)

```
T10 → T11 → T12 → T13
```

### Phase 4: Front-end

```
T14 → T15 → T16 → T17 → T18 → T19 → T20
```

---

## Task Breakdown

### T1: Model `Board`

**What**: Criar `Board` (Mongoose) com `Tenant`, `name`, `description?`, `columns[]` embutido
(`_id`,`label`,`order`,`color?`), índice `{Tenant,updatedAt}`; exportar `Board`/`BoardDocument`
de `packages/db/src/index.ts`.
**Where**: `packages/db/src/models/board.model.ts`, `packages/db/src/index.ts` (export)
**Depends on**: None
**Reuses**: `packages/db/src/models/professional.model.ts` (formato Tenant+timestamps+índice)
**Requirement**: KAN-01, KAN-02, KAN-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `Board`/`BoardDocument` exportados por `packages/db/src/index.ts`
- [ ] `columns[].color` valida regex `#RRGGBB` quando presente (Mongoose `match`)
- [ ] Índice `{Tenant:1,updatedAt:-1}` declarado
- [ ] Gate check passa: `pnpm vitest run` (full — model tem teste integration)
- [ ] Contagem de testes: ≥4 (cria board com colunas; rejeita sem `Tenant`; rejeita `columns[].label` vazio; aceita `color` ausente)

**Tests**: integration
**Gate**: full

**Commit**: `feat(kanban): add Board model with embedded columns`

**Status**: ✅ Done — commit `f9f3359`

---

### T2: Model `Card`

**What**: Criar `Card` (Mongoose, collection própria) com `Tenant`,`board`,`column`,`title`,
`description?`,`position`,`customer?`,`process?`,`order?`,`assignee?`; índice
`{Tenant,board,column,position}`; exportar de `packages/db/src/index.ts`.
**Where**: `packages/db/src/models/card.model.ts`, `packages/db/src/index.ts` (export)
**Depends on**: None
**Reuses**: `packages/db/src/models/order.model.ts` (referências `ObjectId` opcionais)
**Requirement**: KAN-13, KAN-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `Card`/`CardDocument` exportados por `packages/db/src/index.ts`
- [ ] Todos os 4 campos de referência (`customer`,`process`,`order`,`assignee`) opcionais, sem `required`
- [ ] Índice `{Tenant:1,board:1,column:1,position:1}` declarado
- [ ] Gate check passa: `pnpm vitest run`
- [ ] Contagem de testes: ≥4 (cria card só com título; cria com as 4 referências; rejeita sem `board`/`column`; rejeita `title` vazio)

**Tests**: integration
**Gate**: full

**Commit**: `feat(kanban): add Card model as its own collection`

**Status**: ✅ Done — commit `fa6e2aa`

---

### T3: Contratos de Board (`createBoardSchema`, `updateBoardSchema`)

**What**: Zod schemas de criar/editar board — `name` (3..80), `description?` (≤500),
`columns` (array, mínimo 1, cada `{label 1..60, color? hex}`) no create; `updateBoardSchema` só
`name?`/`description?` (colunas mudam pelas rotas de coluna, não aqui).
**Where**: `packages/contracts/src/schemas/createBoard.schema.ts`,
`packages/contracts/src/schemas/updateBoard.schema.ts`, `packages/contracts/src/index.ts` (export)
**Depends on**: None
**Reuses**: `packages/contracts/src/schemas/createProfessional.schema.ts` (formato `.strict()`)
**Requirement**: KAN-01, KAN-02, KAN-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `createBoardSchema` rejeita `columns: []` (KAN-02)
- [ ] `createBoardSchema`/`updateBoardSchema` exportados por `packages/contracts/src/index.ts`
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥6 (válido completo; `columns` vazio rejeitado; `name` curto/longo rejeitado; `color` fora do regex rejeitado; update só com `description`; update rejeita campo desconhecido)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add board create/update contracts`

**Status**: ✅ Done — commit `05772f7`

---

### T4: Contratos de coluna (`createColumnSchema`, `updateColumnSchema`, `reorderColumnsSchema`)

**What**: `createColumnSchema` (`label`,`color?`), `updateColumnSchema` (`label?`,`color?`),
`reorderColumnsSchema` (`columnIds: string[]`, cada um `objectIdField`, mínimo 1 item).
**Where**: `packages/contracts/src/schemas/createColumn.schema.ts`,
`packages/contracts/src/schemas/updateColumn.schema.ts`,
`packages/contracts/src/schemas/reorderColumns.schema.ts`, `packages/contracts/src/index.ts`
**Depends on**: None
**Reuses**: `objectIdField`/`validObjectID` (mesmo helper de `packages/contracts`, ver
`createAppointment.schema.ts` para o padrão de referência a id)
**Requirement**: KAN-07, KAN-08, KAN-09, KAN-10, KAN-11, KAN-12, KAN-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Os 3 schemas exportados por `packages/contracts/src/index.ts`
- [ ] `reorderColumnsSchema` rejeita array vazio
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥6 (create válido; create sem `label` rejeitado; update parcial válido; `color` inválido rejeitado; reorder válido; reorder vazio rejeitado)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add column contracts (create/update/reorder)`

**Status**: ✅ Done — commit `73458e0`

---

### T5: Contratos de card (`createCardSchema`, `updateCardSchema`, `moveCardSchema`)

**What**: `createCardSchema` (`title` 1..120, `description?` ≤2000, `column` objectId,
`customer?`/`process?`/`order?`/`assignee?` objectId); `updateCardSchema` = `createCardSchema`
sem `column`, tudo `.partial()`; `moveCardSchema` (`column` objectId, `position` int ≥0).
**Where**: `packages/contracts/src/schemas/createCard.schema.ts`,
`packages/contracts/src/schemas/updateCard.schema.ts`,
`packages/contracts/src/schemas/moveCard.schema.ts`, `packages/contracts/src/index.ts`
**Depends on**: None
**Reuses**: `packages/contracts/src/schemas/createProfessional.schema.ts` (formato geral)
**Requirement**: KAN-13, KAN-14, KAN-15, KAN-16, KAN-18, KAN-19, KAN-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `updateCardSchema` NUNCA aceita `column`/`position` (campo ausente do tipo, garantindo KAN-16 no nível de contrato)
- [ ] Os 3 schemas exportados por `packages/contracts/src/index.ts`
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥7 (create só título+coluna; create com as 4 referências; título vazio rejeitado; update parcial válido; update com `column` é ignorado/rejeitado pelo `.strict()`; move válido; move com `position` negativo rejeitado)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add card contracts (create/update/move)`

**Status**: ✅ Done — commit `cd915a7`

---

### T6: `board.repository.ts`

**What**: `createBoard`, `findById`, `listBoards` (1 aggregation com `$lookup` em `cards` +
`$group` para contagem, evita N+1), `updateBoard`, `deleteBoard`, `addColumn`, `updateColumn`
(via `arrayFilters`), `reorderColumns`, `removeColumn` (via `$pull`) — todos `tenantScoped`.
**Where**: `apps/crm-api/src/repositories/board.repository.ts`
**Depends on**: T1
**Reuses**: `apps/crm-api/src/repositories/professional.repository.ts` (tenantScoped+withDbTiming)
**Requirement**: KAN-01, KAN-03, KAN-04, KAN-06, KAN-07, KAN-08, KAN-09, KAN-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `listBoards` faz exatamente 1 query Mongo (aggregation), não N+1 — verificado pelo teste com ≥3 boards
- [ ] `findById`/`updateBoard`/`deleteBoard` retornam `null`/`0` para um `_id` de outro tenant (nunca lançam, nunca vazam)
- [ ] Gate check passa: `pnpm vitest run`
- [ ] Contagem de testes: ≥9

**Tests**: integration
**Gate**: full

**Commit**: `feat(kanban): add board repository`

**Status**: ✅ Done — commit `4349246` (formatting follow-up: `32e417d`)

---

### T7: `card.repository.ts`

**What**: `createCard`, `listByBoard` (populate seletivo: `customer.name`,`process.stage`+
`template.name`,`order.totalPrice`+`status`,`assignee.name`), `findById`, `updateCard`,
`moveCard`, `deleteCard`, `existsInColumn`, `deleteAllByBoard` — todos `tenantScoped`.
**Where**: `apps/crm-api/src/repositories/card.repository.ts`
**Depends on**: T2
**Reuses**: `apps/crm-api/src/repositories/order.repository.ts` (populate seletivo de referência)
**Requirement**: KAN-13, KAN-16, KAN-17, KAN-18, KAN-19, KAN-24, KAN-25, KAN-26, KAN-27, KAN-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `listByBoard` nunca devolve `values`(Process)/`password`/`email`(User) — só os campos de exibição citados
- [ ] `existsInColumn` retorna `true`/`false` corretamente com 0/1/N cards na coluna
- [ ] `deleteAllByBoard` remove todos os cards do board e nenhum de outro board
- [ ] Gate check passa: `pnpm vitest run`
- [ ] Contagem de testes: ≥10

**Tests**: integration
**Gate**: full

**Commit**: `feat(kanban): add card repository with selective populate`

**Status**: ✅ Done — commit `0ee9bc8`

---

### T8: `board.service.ts`

**What**: `createBoard` (rejeita 0 colunas), `listBoards`, `getBoardById`
(`BoardNotFoundError`), `updateBoard`, `deleteBoard` (cascata: `board.repository.deleteBoard` +
`card.repository.deleteAllByBoard`), `addColumn`/`updateColumn`/`reorderColumns`/`removeColumn`
(`removeColumn` chama `card.repository.existsInColumn` e rejeita coluna não-vazia OU última
coluna restante).
**Where**: `apps/crm-api/src/services/board.service.ts`
**Depends on**: T6, T7
**Reuses**: `apps/crm-api/src/services/professional.service.ts` (erro tipado `XNotFoundError`)
**Requirement**: KAN-01, KAN-02, KAN-04, KAN-06, KAN-07, KAN-08, KAN-09, KAN-10, KAN-11, KAN-12, KAN-22

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `removeColumn` rejeita quando `existsInColumn` retorna `true` (KAN-10)
- [ ] `removeColumn` rejeita quando `board.columns.length === 1` (KAN-11)
- [ ] `deleteBoard` chama `deleteAllByBoard` DEPOIS de confirmar o board apagado (ordem testada)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: 1:1 com KAN-01,02,04,06,07,08,09,10,11,12,22 (≥11)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add board service with column invariants`

**Status**: ✅ Done — commit `385b56a`

---

### T9: `card.service.ts`

**What**: `createCard` (valida `column` existe no board — KAN-15 — e cada referência opcional
pertence ao Tenant via `.exists()` — KAN-14), `listCardsByBoard`, `updateCard` (nunca aceita
`column`/`position`), `moveCard` (valida `column` — KAN-21), `deleteCard`.
**Where**: `apps/crm-api/src/services/card.service.ts`
**Depends on**: T6, T7
**Reuses**: `apps/crm-api/src/services/order.service.ts` (valida referência cross-collection antes
de gravar)
**Requirement**: KAN-13, KAN-14, KAN-15, KAN-16, KAN-17, KAN-18, KAN-19, KAN-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `createCard` rejeita `customer`/`process`/`order`/`assignee` de outro tenant ou inexistente (4 casos testados)
- [ ] `createCard`/`moveCard` rejeitam `column` que não existe no `board.columns` (mock de `board.repository.findById`)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: 1:1 com KAN-13,14,15,16,17,18,19,21 (≥8, mais os 4 casos de referência)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add card service with cross-tenant reference validation`

**Status**: ✅ Done — commit `7655cba`

---

### T10: `board.controller.ts`

**What**: `createBoard`, `listBoards`, `getBoardById`, `updateBoard`, `deleteBoard`, `addColumn`,
`updateColumn`, `reorderColumns`, `removeColumn` — extrai `req.tenantUser.tenant`, traduz
`BoardNotFoundError`→404.
**Where**: `apps/crm-api/src/controllers/board.controller.ts`
**Depends on**: T8
**Reuses**: `apps/crm-api/src/controllers/professional.controller.ts` (molde idêntico)
**Requirement**: KAN-01, KAN-02, KAN-03, KAN-04, KAN-06, KAN-07, KAN-08, KAN-09, KAN-10, KAN-11, KAN-12, KAN-22

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Todo handler segue `try{...}catch(e){next(e)}`, sem lógica de negócio no controller
- [ ] `BoardNotFoundError` vira `CustomError(...,404)`
- [ ] Gate check passa: `pnpm -r exec tsc --noEmit && pnpm biome check .` (sem teste próprio — ver matriz)
- [ ] Nenhum teste próprio (exercitado por T12)

**Tests**: none (ver Test Coverage Matrix — controller é exercitado só pelo e2e do router)
**Gate**: build

**Commit**: `feat(kanban): add board controller`

---

### T11: `card.controller.ts`

**What**: `createCard`, `listCards`, `updateCard`, `moveCard`, `deleteCard` — mesma forma do T10.
**Where**: `apps/crm-api/src/controllers/card.controller.ts`
**Depends on**: T9
**Reuses**: `apps/crm-api/src/controllers/professional.controller.ts`
**Requirement**: KAN-13, KAN-14, KAN-15, KAN-16, KAN-17, KAN-18, KAN-19, KAN-21, KAN-24, KAN-25, KAN-26, KAN-27, KAN-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Todo handler segue `try{...}catch(e){next(e)}`, sem lógica de negócio no controller
- [ ] Gate check passa: `pnpm -r exec tsc --noEmit && pnpm biome check .`
- [ ] Nenhum teste próprio (exercitado por T13)

**Tests**: none (ver Test Coverage Matrix)
**Gate**: build

**Commit**: `feat(kanban): add card controller`

---

### T12: `board.router.ts` (board + colunas) e registro em `app.ts`

**What**: Router com `POST/GET /boards`, `GET/PATCH/DELETE /boards/:id` (`DELETE` com `isAdmin`),
`POST /boards/:id/columns`, `PATCH /boards/:id/columns/reorder` (ANTES de `:columnId` na ordem de
declaração), `PATCH/DELETE /boards/:id/columns/:columnId`; `validToken`+`tenantAssignmentCheck`+
`canOperate` em tudo, exceto `DELETE /boards/:id` (`isAdmin`); registrar
`app.use('/boards', createBoardRouter({ validToken }))` em `apps/crm-api/src/app.ts`.
**Where**: `apps/crm-api/src/routers/board.router.ts`, `apps/crm-api/src/app.ts` (registro)
**Depends on**: T10
**Reuses**: `apps/crm-api/src/routers/professional.router.ts` (formato `createXRouter({validToken})`); `isAdmin` de `authorization.middleware.ts`
**Requirement**: KAN-01, KAN-02, KAN-03, KAN-04, KAN-05, KAN-06, KAN-07, KAN-08, KAN-09, KAN-10, KAN-11, KAN-12, KAN-22, KAN-23, KAN-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `PATCH /boards/:id/columns/reorder` declarada ANTES de `PATCH /boards/:id/columns/:columnId` (senão o Express trataria `reorder` como um `columnId`)
- [ ] `DELETE /boards/:id` com role `gestor`/`operador` (sem `admin`) responde 403 (KAN-23)
- [ ] `GET/PATCH /boards/:id` de outro tenant responde 404 (KAN-06)
- [ ] Usuário sem nenhum `role` responde 403 em qualquer rota (KAN-05)
- [ ] Gate check passa: `pnpm vitest run`
- [ ] Contagem de testes: 1:1 com KAN-01,02,03,04,05,06,07,08,09,10,11,12,22,23,29 (≥16, happy+edge+erro)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(kanban): add board router with column sub-routes and mount in app`

---

### T13: `board.router.ts` (sub-rotas de card)

**What**: Estender o mesmo `board.router.ts` com `POST/GET /boards/:id/cards`,
`PATCH /boards/:id/cards/:cardId`, `PATCH /boards/:id/cards/:cardId/move`,
`DELETE /boards/:id/cards/:cardId` — todas `canOperate`.
**Where**: `apps/crm-api/src/routers/board.router.ts` (modifica)
**Depends on**: T11, T12
**Reuses**: mesmo arquivo/padrão de T12
**Requirement**: KAN-13, KAN-14, KAN-15, KAN-16, KAN-17, KAN-18, KAN-19, KAN-20, KAN-21, KAN-24, KAN-25, KAN-26, KAN-27, KAN-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Criar card com referência de outro tenant responde 400 (KAN-14), nunca 404 (não revela o id)
- [ ] Mover card pra `column` inexistente no board responde 400 mesmo se o payload "parecer" válido (KAN-21)
- [ ] `GET /boards/:id/cards` devolve `customer.name`/`process.stage`/`order.totalPrice`+`status`/`assignee.name` quando presentes (KAN-24..27) e omite a seção quando ausentes (KAN-28)
- [ ] Gate check passa: `pnpm vitest run`
- [ ] Contagem de testes: 1:1 com KAN-13,14,15,16,17,18,19,21,24,25,26,27,28 (≥14, happy+edge+erro)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(kanban): add card sub-routes to board router`

---

### T14: `apps/web/src/query/board.ts`

**What**: `boardKeys`, `boardsQuery`, `boardQuery(id)`, `boardCardsQuery(boardId)`,
`createBoardMutation`, `updateBoardMutation`, `deleteBoardMutation`, `addColumnMutation`,
`updateColumnMutation`, `reorderColumnsMutation`, `removeColumnMutation`, `createCardMutation`,
`updateCardMutation`, `moveCardMutation`, `deleteCardMutation`.
**Where**: `apps/web/src/query/board.ts`
**Depends on**: T3, T4, T5 (tipos dos contratos usados nas mutations)
**Reuses**: `apps/web/src/query/professional.ts` (molde `queryOptions`+`UseMutationOptions`)
**Requirement**: KAN-01, KAN-03, KAN-04, KAN-07, KAN-08, KAN-09, KAN-12, KAN-13, KAN-16, KAN-17, KAN-18, KAN-19, KAN-20, KAN-22

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Toda mutation invalida a(s) `queryKey` correta(s) no `onSuccess` (lista de boards e/ou detalhe do board e/ou lista de cards, conforme o caso)
- [ ] Toda query/mutation lança `Error` com `res.message` quando `res.success === false`
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥15 (1 sucesso + 1 erro por função exportada)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add board/card TanStack Query hooks`

---

### T15: Hub de boards (`kanban/index.tsx`)

**What**: Lista os boards do tenant (nome, descrição, contagem de cards), `DefaultEmptyData`
quando não há nenhum, `Link` pra `/kanban/add` e pra `/kanban/details?id=`.
**Where**: `apps/web/src/routes/_private/kanban/index.tsx`
**Depends on**: T14
**Reuses**: `Card asPage`/`Item*`/`DefaultEmptyData` (`apps/web/CLAUDE.md`); mock de
`@tanstack/react-router` do mesmo CLAUDE.md
**Requirement**: KAN-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Estado vazio (`DefaultEmptyData`) quando `boardsQuery` devolve lista vazia
- [ ] Cada board da lista linka pra `/kanban/details` com `search:{id}` (AD-030, nunca `$id`)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥3 (loading; vazio; lista com N boards)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add boards hub screen`

---

### T16: Criar board (`kanban/add/index.tsx`)

**What**: Formulário `react-hook-form`+`zodResolver(createBoardSchema)` — `name`,
`description?`, lista de colunas iniciais via `useFieldArray` (mínimo 1, com botão de adicionar).
**Where**: `apps/web/src/routes/_private/kanban/add/index.tsx`
**Depends on**: T14
**Reuses**: `Form/FormField/...` (`apps/web/CLAUDE.md`), `createBoardMutation`
**Requirement**: KAN-01, KAN-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Submeter com 0 colunas mostra erro de validação client-side ANTES de chamar a API (KAN-02)
- [ ] Sucesso navega pro board recém-criado (`/kanban/details?id=`)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥3 (submit válido; submit sem coluna; erro da API exibido)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add create-board form`

---

### T17: Conteúdo do card (`kanban-card-content.tsx`)

**What**: Componente de exibição — título, descrição, badges opcionais de
customer/process/order/assignee (só renderiza o que existe, KAN-28).
**Where**: `apps/web/src/routes/_private/kanban/details/@components/kanban-card-content.tsx`
**Depends on**: T14
**Reuses**: `apps/web/src/routes/_private/customers/kanban/@components/customer-kanban-card-content.tsx` (formato de card content já existente)
**Requirement**: KAN-24, KAN-25, KAN-26, KAN-27, KAN-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Card sem nenhuma referência renderiza só título/descrição, sem seção vazia (KAN-28)
- [ ] Cada uma das 4 referências, quando presente, renderiza seu identificador amigável
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥5 (nenhuma referência; cada uma das 4 isoladamente)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add card content display component`

---

### T18: Painel de card (`card-panel.tsx`)

**What**: Painel inline (AD-037, nunca `Dialog`) de criar/editar card — `title`,`description?`,
seletor de `customer?`/`process?`/`order?`/`assignee?`, `onClose`.
**Where**: `apps/web/src/routes/_private/kanban/details/@components/card-panel.tsx`
**Depends on**: T14
**Reuses**: `apps/web/src/routes/_private/schedule/**/appointment-panel.tsx` (formato de painel
inline, AD-037)
**Requirement**: KAN-13, KAN-14, KAN-16, KAN-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Painel é um `<div>` em fluxo normal, sem `open`/`onOpenChange` — só `onClose` (AD-037)
- [ ] Criar com só título funciona (KAN-13); editar não expõe campo de coluna/posição (KAN-16 é responsabilidade do drag, não deste painel)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥4 (criar mínimo; criar com referências; editar; apagar)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add inline card panel (create/edit/delete)`

---

### T19: Painel de gerenciar colunas (`column-manager-panel.tsx`)

**What**: Painel inline (AD-037) — adicionar coluna, renomear, definir cor, reordenar
(drag simples ou botões subir/descer), remover (desabilitado/com erro se a coluna tiver cards ou
for a última).
**Where**: `apps/web/src/routes/_private/kanban/details/@components/column-manager-panel.tsx`
**Depends on**: T14
**Reuses**: `apps/web/src/routes/_private/schedule/**/appointment-panel.tsx` (formato AD-037)
**Requirement**: KAN-07, KAN-08, KAN-09, KAN-10, KAN-11, KAN-12, KAN-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Botão de remover a última coluna restante fica desabilitado OU a tentativa mostra o erro do backend (KAN-11)
- [ ] Remover uma coluna com card(s) mostra o erro do backend sem quebrar a tela (KAN-10)
- [ ] Campo de cor é opcional e aceita hex (KAN-29)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥6 (adicionar; renomear; cor; reordenar; remover vazia com >1 coluna; remover rejeitada)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add inline column manager panel`

---

### T20: Tela do board (`kanban/details.tsx`)

**What**: `search:{id}` (Zod `validateSearch`); `KanbanProvider`/`KanbanBoard`/`KanbanCard`/
`KanbanCards`/`KanbanHeader` (reaproveitados sem mudança) renderizando colunas+cards reais;
`onDragEnd` chama `moveCardMutation` com override otimista local (`pendingMoves`, mesmo padrão de
`customers/kanban/index.tsx`) e reverte em erro (KAN-20); botões pra abrir `card-panel`
(T18)/`column-manager-panel` (T19).
**Where**: `apps/web/src/routes/_private/kanban/details.tsx`
**Depends on**: T14, T17, T18, T19
**Reuses**: `apps/web/src/components/ui/kanban.tsx` (sem mudança); `apps/web/src/routes/_private/customers/kanban/index.tsx` (padrão `pendingMoves`)
**Requirement**: KAN-03 (via `GET /boards/:id`), KAN-06, KAN-18, KAN-19, KAN-20, KAN-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Arrastar um card pra outra coluna chama `moveCardMutation` e reflete a coluna otimisticamente
- [ ] Falha na mutation reverte o card pra coluna de origem e mostra toast de erro (KAN-20)
- [ ] Board de `id` inexistente/outro tenant mostra o tratamento de 404 padrão da tela (mesmo padrão de `details.tsx` de outras features)
- [ ] Gate check passa: `pnpm vitest run --project unit --project structural`
- [ ] Contagem de testes: ≥5 (render com colunas/cards; drag entre colunas sucesso; drag falha e reverte; abrir card-panel; abrir column-manager-panel)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(kanban): add board detail screen with drag-and-drop`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5
Phase 2:  T6 ──→ T7 ──→ T8 ──→ T9
Phase 3:  T10 ──→ T11 ──→ T12 ──→ T13
Phase 4:  T14 ──→ T15 ──→ T16 ──→ T17 ──→ T18 ──→ T19 ──→ T20
```

Execução é estritamente sequencial dentro de cada fase — mesmo quando o `Depends on` de uma task
permite paralelismo teórico (ex.: T15/T16/T17 dependem só de T14), a ordem de execução segue a
ordem numérica declarada acima.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Model Board | 1 model | ✅ Granular |
| T2: Model Card | 1 model | ✅ Granular |
| T3: Contratos de Board | 2 arquivos, 1 conceito (board shape) | ✅ Granular (coesos) |
| T4: Contratos de coluna | 3 arquivos, 1 conceito (column shape) | ✅ Granular (coesos) |
| T5: Contratos de card | 3 arquivos, 1 conceito (card shape) | ✅ Granular (coesos) |
| T6: board.repository.ts | 1 arquivo | ✅ Granular |
| T7: card.repository.ts | 1 arquivo | ✅ Granular |
| T8: board.service.ts | 1 arquivo | ✅ Granular |
| T9: card.service.ts | 1 arquivo | ✅ Granular |
| T10: board.controller.ts | 1 arquivo | ✅ Granular |
| T11: card.controller.ts | 1 arquivo | ✅ Granular |
| T12: board.router.ts (board+coluna) | 1 arquivo (parte 1) + registro em app.ts | ✅ Granular |
| T13: board.router.ts (card) | 1 arquivo (parte 2, mesmo arquivo de T12) | ✅ Granular |
| T14: query/board.ts | 1 arquivo | ✅ Granular |
| T15: kanban/index.tsx | 1 componente | ✅ Granular |
| T16: kanban/add/index.tsx | 1 componente | ✅ Granular |
| T17: kanban-card-content.tsx | 1 componente | ✅ Granular |
| T18: card-panel.tsx | 1 componente | ✅ Granular |
| T19: column-manager-panel.tsx | 1 componente | ✅ Granular |
| T20: kanban/details.tsx | 1 componente (integra T17/T18/T19 já prontos) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (início da Phase 1) | ✅ Match |
| T2 | None | T1 → T2 | ✅ Match (T2 não depende de T1 tecnicamente, mas roda depois na ordem sequencial da fase) |
| T3 | None | T2 → T3 | ✅ Match (idem — ordem sequencial, sem dependência real) |
| T4 | None | T3 → T4 | ✅ Match (idem) |
| T5 | None | T4 → T5 | ✅ Match (idem) |
| T6 | T1 | T5 → T6 (fim Phase 1 → início Phase 2) | ✅ Match |
| T7 | T2 | T6 → T7 | ✅ Match (ordem sequencial; dependência real é T2, já concluída na Phase 1) |
| T8 | T6, T7 | T7 → T8 | ✅ Match |
| T9 | T6, T7 | T8 → T9 | ✅ Match (ordem sequencial; dependência real T6/T7, já concluídas) |
| T10 | T8 | T9 → T10 (fim Phase 2 → início Phase 3) | ✅ Match |
| T11 | T9 | T10 → T11 | ✅ Match |
| T12 | T10 | T11 → T12 | ✅ Match (ordem sequencial; dependência real T10) |
| T13 | T11, T12 | T12 → T13 | ✅ Match |
| T14 | T3, T4, T5 | T13 → T14 (fim Phase 3 → início Phase 4) | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T14 | T15 → T16 | ✅ Match (ordem sequencial; dependência real T14) |
| T17 | T14 | T16 → T17 | ✅ Match (idem) |
| T18 | T14 | T17 → T18 | ✅ Match (idem) |
| T19 | T14 | T18 → T19 | ✅ Match (idem) |
| T20 | T14, T17, T18, T19 | T19 → T20 | ✅ Match |

**Nota**: dentro de cada fase, várias tasks têm como única dependência REAL a primeira task da
própria fase (ex.: T15/T16/T17/T18/T19 dependem só de T14) — a seta sequencial no diagrama reflete
a ORDEM DE EXECUÇÃO (nunca paralela, por regra do processo), não uma dependência de dado adicional
entre elas. Nenhuma task depende de uma task de uma fase POSTERIOR — checado linha a linha acima.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1: Model Board | Model | integration | integration | ✅ OK |
| T2: Model Card | Model | integration | integration | ✅ OK |
| T3: Contratos de Board | Contract schema | unit | unit | ✅ OK |
| T4: Contratos de coluna | Contract schema | unit | unit | ✅ OK |
| T5: Contratos de card | Contract schema | unit | unit | ✅ OK |
| T6: board.repository.ts | Repository | integration | integration | ✅ OK |
| T7: card.repository.ts | Repository | integration | integration | ✅ OK |
| T8: board.service.ts | Service | unit | unit | ✅ OK |
| T9: card.service.ts | Service | unit | unit | ✅ OK |
| T10: board.controller.ts | Controller | none | none | ✅ OK |
| T11: card.controller.ts | Controller | none | none | ✅ OK |
| T12: board.router.ts (board+coluna) | Router/e2e | e2e | e2e | ✅ OK |
| T13: board.router.ts (card) | Router/e2e | e2e | e2e | ✅ OK |
| T14: query/board.ts | Frontend query | unit | unit | ✅ OK |
| T15: kanban/index.tsx | Frontend route | unit | unit | ✅ OK |
| T16: kanban/add/index.tsx | Frontend route | unit | unit | ✅ OK |
| T17: kanban-card-content.tsx | Frontend componente | unit | unit | ✅ OK |
| T18: card-panel.tsx | Frontend componente | unit | unit | ✅ OK |
| T19: column-manager-panel.tsx | Frontend componente | unit | unit | ✅ OK |
| T20: kanban/details.tsx | Frontend route | unit | unit | ✅ OK |

Nenhuma violação — nenhuma task usa `Tests: none` fora do caso previsto pela matriz (Controller).

---

## Post-Execute: verificação visual manual

Confirmado com o usuário: depois do Verifier automático (author≠verifier) rodar e passar,
executar uma verificação visual manual com `.claude/skill/playwright-skill` (ou o path atual da
skill, se já reindexada) nas 3 telas novas — `kanban/index.tsx` (hub), `kanban/add/index.tsx`
(criar board) e `kanban/details.tsx` (colunas, cards, drag-and-drop, painéis de card/coluna) —
mesmo padrão já usado no fim da feature `scheduling`. Não é um gate bloqueante do Verifier; é um
passo adicional de confiança sobre o caminho visual que os testes automatizados não cobrem.
