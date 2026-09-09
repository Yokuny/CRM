# Catalog Orders Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with a skill named `tlc-spec-driven`: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem
path. The skill is the source of truth for the full flow (per-task cycle, sub-agent
delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated by name, read `./tlc-spec-driven/SKILL.md` and
`references/{implement,sub-agents,coding-principles}.md` manually in full before
proceeding** (same operational note already recorded for this repo in the Handoff section
of `.specs/STATE.md` — the skill's files live in `./tlc-spec-driven/` but are not
registered under `.claude/skills/`).

---

**Design**: `.specs/features/catalog-orders/design.md`
**Status**: Draft — aguardando aprovação do usuário (Execute ainda não iniciado)

---

## Test Coverage Matrix

> Gerado a partir do código (`packages/ai-kit`, `apps/crm-api`, `apps/web`) e das
> diretrizes já documentadas — confirmar antes do Execute. Diretrizes encontradas:
> [AD-017](../../STATE.md) (convenção de `projects`/sufixos/comandos de gate),
> `apps/web/CLAUDE.md` (padrão de teste de rota — mock de `@tanstack/react-router`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Models Mongoose (`Product`, `Order`) — entidade/schema | none | Build gate only (mesma convenção de `process.model.ts`/`channel.model.ts`, sem teste dedicado de schema) | `packages/db/src/models/{product,order}.model.ts` | build gate only |
| `orderTransitions.ts` (`packages/db`) — máquina de estados, toca Mongo real | integration | Todos os branches: confirmação bem-sucedida, falha atômica de estoque com rollback, chamada sobre `Order` terminal (no-op), `items` divergente rejeitado — 1:1 com CAT-12/13/14/15/16/17/21/22/23/24 | `packages/db/src/orderTransitions.int.test.ts` | `pnpm vitest run --project integration` |
| `packages/contracts` — schemas Zod novos | unit | Todo campo obrigatório/formato inválido testado (molde `createProcess.schema.unit.test.ts`) | `packages/contracts/src/schemas/*.unit.test.ts` | `pnpm vitest run --project unit` |
| Repository (`apps/crm-api`, `product`/`order`) | integration | Caminhos de query principais + erro (não encontrado, outro tenant) | `apps/crm-api/src/repositories/{product,order}.repository.int.test.ts` | `pnpm vitest run --project integration` |
| Service (`apps/crm-api`, `product`/`order`) | unit | Todos os branches; 1:1 com os ACs de validação/erro tipado (CAT-04, CAT-21..24) | `apps/crm-api/src/services/{product,order}.service.unit.test.ts` | `pnpm vitest run --project unit` |
| Controller/Router (`apps/crm-api`, `product`/`order`) | e2e | Toda rota nova: caminho feliz + edge + erro (400/403/404/409), mesmo padrão de `conversation.router.e2e.test.ts` | `apps/crm-api/src/routers/{product,order}.router.e2e.test.ts` | `pnpm vitest run --project e2e` |
| Tool handlers (`packages/ai-kit/src/tools/{searchProducts,getOrderStatus,createOrder}.ts`) | integration | Todos os branches; 1:1 com CAT-07..17, mesmo padrão de `getProcessTemplate.int.test.ts`/`openProcess.int.test.ts` | `packages/ai-kit/src/tools/{searchProducts,getOrderStatus,createOrder}.int.test.ts` | `pnpm vitest run --project integration` |
| `guard.output` — regra de preço | unit | Todos os branches: preço presente no turno passa, preço ausente é redigido, ocorrência logada — molde `guardOutput.unit.test.ts` existente | `packages/ai-kit/src/guardOutput.unit.test.ts` (estendido) | `pnpm vitest run --project unit` |
| `runTurn.ts` — fiação de `rawTurn` pro `guard.output` | integration | Confirma que um preço reportado por uma tool desta rodada passa, e um preço fabricado é redigido, na integração real do harness | `packages/ai-kit/src/runTurn.int.test.ts` (estendido, se existir; senão novo) | `pnpm vitest run --project integration` |
| `tests/structural/toolInputSchema.structural.test.ts` | structural | `EXPECTED_TOOL_NAMES`/contagem atualizados; sweep de chave proibida cobre as 3 tools novas (mecanismo já genérico, sem lógica nova) | `tests/structural/toolInputSchema.structural.test.ts` | `pnpm vitest run --project structural` |
| Golden set (`evals/cases/`) | integration | 1 caso novo cobrindo o fluxo de duas chamadas do `create_order` + a regra de preço do `guard.output` (consequência explícita de AD-009 — mesmo espírito do caso já previsto para `issue_payment_link`) | `evals/cases/createOrderGuardrails.int.test.ts` | `pnpm run evals` (`vitest run --project integration evals/`) |
| Rotas/componentes `apps/web` (Produtos, Pedidos, card do Inbox) | unit | Render + interação por tela/componente novo, mock de `@tanstack/react-router` (padrão de `apps/web/CLAUDE.md`) | `apps/web/src/routes/_private/{products,orders}/**/*.unit.test.tsx`, `apps/web/src/routes/_private/inbox/@components/order-card.unit.test.tsx` | `pnpm vitest run --project unit` |
| Camada de dados `apps/web` (`query/product.ts`, `query/order.ts`) | unit | Molde de `query/customer.unit.test.ts`/`query/conversation.unit.test.ts` | `apps/web/src/query/{product,order}.unit.test.ts` | `pnpm vitest run --project unit` |

## Gate Check Commands

> Gerado do código (AD-017) — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks só com testes unit/structural | `pnpm vitest run --project unit --project structural` |
| Full | Após tasks com testes integration/e2e | `pnpm vitest run` |
| Build | Ao fechar cada fase, ou tasks só de config/entidade | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` (== `pnpm run check`) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins,
and tasks within a phase execute in order.

### Phase 1: Foundation — models e transição compartilhada (`packages/db`)

```
T1 → T2 → T3
```

### Phase 2: Contracts

```
T4
```

### Phase 3: Catálogo — CRUD de `Product` (`apps/crm-api`)

```
T5 → T6 → T7
```

### Phase 4: Pedidos — leitura/aprovação/rejeição (`apps/crm-api`)

```
T8 → T9 → T10
```

### Phase 5: Tools Anel A (`packages/ai-kit`)

```
T11 → T12
```

### Phase 6: Tool Anel B + registro completo da superfície

```
T13 → T14
```

### Phase 7: Guard de preço (`guard.output`)

```
T15 → T16
```

### Phase 8: Golden set

```
T17
```

### Phase 9: Tela de catálogo (`apps/web`)

```
T18 → T19 → T20 → T21
```

### Phase 10: Tela de Pedidos (`apps/web`)

```
T22 → T23
```

### Phase 11: Card inline no Inbox (`apps/web`)

```
T24 → T25
```

---

## Task Breakdown

### T1: Criar model `Product`

**What**: Schema Mongoose fixo (`name`, `sku?`, `description?`, `price` em centavos,
`stock`, `active`), índice `{Tenant:1, active:1}`.
**Where**: `packages/db/src/models/product.model.ts` (+ export no barrel do pacote)
**Depends on**: None
**Reuses**: `packages/db/src/models/channel.model.ts` (molde de schema fixo)
**Requirement**: CAT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ProductDocument`/`Product` exportados
- [x] `Tenant` obrigatório (`ObjectId`, `ref:'Tenant'`), `timestamps:true`
- [x] `active` com `default:true`
- [x] Gate check passa: `pnpm -r exec tsc --noEmit && pnpm biome check .`

**Tests**: none
**Gate**: build

---

### T2: Criar model `Order`

**What**: Schema Mongoose (`items[]` com snapshot, `status`, `idempotencyKey`,
`customerConfirmed`, `operatorApproved`, `approvedBy/At`, `rejectedBy/At/Reason`,
`confirmFailureReason`), índice único `{Tenant:1, conversation:1, idempotencyKey:1}` e
`{Tenant:1, status:1, createdAt:-1}`.
**Where**: `packages/db/src/models/order.model.ts` (+ export no barrel do pacote)
**Depends on**: None
**Reuses**: `packages/db/src/models/process.model.ts` (molde de schema com sub-documento)
**Requirement**: CAT-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrderDocument`/`Order`/`OrderStatus`/`OrderItem` exportados, conforme `design.md`
- [x] Índice único de `idempotencyKey` por `(Tenant, conversation)` criado
- [x] Gate check passa: `pnpm -r exec tsc --noEmit && pnpm biome check .`

**Tests**: none
**Gate**: build

---

### T3: Implementar `orderTransitions.ts` (AD-033)

**What**: `setCustomerConfirmed`, `setOperatorApproved`, `tryConfirmOrder`, `rejectOrder`
— única implementação da máquina de estados de `Order`, compartilhada pelos dois apps.
**Where**: `packages/db/src/orderTransitions.ts`
**Depends on**: T1, T2
**Reuses**: `tenantScoped()` (`packages/db/src/tenantScoped.ts`)
**Requirement**: CAT-14, CAT-15, CAT-16, CAT-17, CAT-21, CAT-22, CAT-23, CAT-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `setCustomerConfirmed`: valida `items` idêntico ao gravado, marca
      `customerConfirmed:true`, chama `tryConfirmOrder` se `operatorApproved` já é `true`
- [x] `setOperatorApproved`: marca `operatorApproved:true`/`approvedBy`/`approvedAt`,
      chama `tryConfirmOrder` se `customerConfirmed` já é `true`
- [x] `tryConfirmOrder`: reserva atomicamente estoque por item (`findOneAndUpdate`
      condicional `stock >= quantity`); em falha de qualquer item, desfaz (`$inc` positivo)
      os já reservados nesta tentativa, grava `confirmFailureReason`, mantém
      `pending_approval`; em sucesso total, `status:'confirmed'`
- [x] `rejectOrder`: `status:'rejected'` terminal, sem tocar estoque
- [x] Toda função em `Order`/`Product` já terminal ou inexistente retorna `{error}` sem
      mutar nada
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Contagem de testes: pelo menos 8 (confirmação dupla condição em qualquer ordem,
      falha de estoque com rollback, `items` divergente, key sem `Order` prévio, chamada
      sobre terminal, rejeição) — 14 testes escritos

**Tests**: integration
**Gate**: full

---

### T4: Criar schemas Zod (`createProduct`, `updateProduct`, `rejectOrder`)

**What**: Três schemas `.strict()` novos em `packages/contracts`.
**Where**: `packages/contracts/src/schemas/{createProduct,updateProduct,rejectOrder}.schema.ts`
**Depends on**: None
**Reuses**: `packages/contracts/src/schemas/createProcess.schema.ts` (molde `.strict()`)
**Requirement**: CAT-04, CAT-23

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `createProductSchema`: `name` obrigatório, `price`/`stock` inteiros `>=0`, `sku`/
      `description` opcionais, `active` opcional
- [x] `updateProductSchema`: mesmos campos, todos opcionais
- [x] `rejectOrderSchema`: `reason` opcional (string)
- [x] Tipos inferidos exportados (`CreateProduct`, `UpdateProduct`, `RejectOrder`)
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T5: `product.repository.ts`

**What**: `createProduct`, `listProducts` (paginado, filtro `name`/`active`), `findById`,
`updateProduct`.
**Where**: `apps/crm-api/src/repositories/product.repository.ts`
**Depends on**: T1
**Reuses**: `apps/crm-api/src/repositories/process.repository.ts` (padrão `toRecord`/
`tenantScoped`/`withDbTiming`)
**Requirement**: CAT-01, CAT-02, CAT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Toda query envolvida em `tenantScoped({Tenant: tenantId, ...})`
- [x] Toda chamada envolvida em `withDbTiming('product.<método>', ...)`
- [x] `listProducts` suporta filtro por `name` (regex case-insensitive) e `active`
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

---

### T6: `product.service.ts`

**What**: Validação de negócio (`price`/`stock` negativos, `name` vazio →
`ProductValidationError`), `ProductNotFoundError`.
**Where**: `apps/crm-api/src/services/product.service.ts`
**Depends on**: T5
**Reuses**: `apps/crm-api/src/services/process.service.ts` (padrão de erro tipado)
**Requirement**: CAT-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `price < 0` ou `stock < 0` ou `name` vazio → `ProductValidationError`, sem chamar o
      repository
- [x] `Product` inexistente/outro tenant → `ProductNotFoundError`
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T7: `product.controller.ts` + `product.router.ts` + montagem em `app.ts`

**What**: `POST /products`, `GET /products`, `PATCH /products/:id`, todos atrás de
`canOperate`.
**Where**: `apps/crm-api/src/controllers/product.controller.ts`,
`apps/crm-api/src/routers/product.router.ts`, `apps/crm-api/src/app.ts` (modificado)
**Depends on**: T6, T4
**Reuses**: `apps/crm-api/src/routers/customer.router.ts` (`validListCustomersQuery` —
mesmo workaround de `req.query` do Express 5), `respObj`/`badRespObj`
**Requirement**: CAT-01, CAT-02, CAT-03, CAT-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ProductValidationError`→400, `ProductNotFoundError`→404, sem `canOperate`→403
- [x] `app.use('/products', createProductRouter({validToken}))` montado
- [x] Gate check passa: `pnpm vitest run --project e2e`
- [x] Contagem de testes: pelo menos 6 (create feliz, create inválido, list, patch feliz,
      patch inválido, sem permissão) — 9 testes escritos

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add Product CRUD endpoints`

---

### T8: `order.repository.ts`

**What**: `listOrders` (paginado, filtro `status`/`conversation`, popula `customer.name`),
`findById`.
**Where**: `apps/crm-api/src/repositories/order.repository.ts`
**Depends on**: T2
**Reuses**: `apps/crm-api/src/repositories/conversation.repository.ts` (padrão de
listagem paginada + populate)
**Requirement**: CAT-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `listOrders` filtra por `status` (default nenhum — todos) e `conversation` opcional
- [x] `customer.name` populado na listagem (uso da tela de Pedidos e do card inline)
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

---

### T9: `order.service.ts`

**What**: `listOrders`, `approveOrder` (chama `orderTransitions.setOperatorApproved`),
`rejectOrder` (chama `orderTransitions.rejectOrder`), erros tipados
`OrderNotFoundError`/`OrderAlreadyTerminalError`.
**Where**: `apps/crm-api/src/services/order.service.ts`
**Depends on**: T8, T3
**Reuses**: `apps/crm-api/src/services/conversation.service.ts` (padrão de erro tipado +
tradução; mesmo espírito de `ConversationAlreadyAssignedError`)
**Requirement**: CAT-18, CAT-21, CAT-22, CAT-23, CAT-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `approveOrder`/`rejectOrder` sobre `Order` inexistente/outro tenant →
      `OrderNotFoundError`
- [x] `approveOrder`/`rejectOrder` sobre `Order` já `confirmed`/`rejected` →
      `OrderAlreadyTerminalError`
- [x] `approveOrder` bem-sucedido retorna o `Order` atual mesmo quando a reserva de
      estoque falha (sem lançar erro nesse caso — ver `design.md`, Tech Decisions)
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T10: `order.controller.ts` + `order.router.ts` + montagem em `app.ts`

**What**: `GET /orders`, `POST /orders/:id/approve`, `POST /orders/:id/reject`, todos
atrás de `canOperate` (qualquer operador do tenant, não só o `assignee` da conversa).
**Where**: `apps/crm-api/src/controllers/order.controller.ts`,
`apps/crm-api/src/routers/order.router.ts`, `apps/crm-api/src/app.ts` (modificado)
**Depends on**: T9, T4
**Reuses**: `apps/crm-api/src/routers/conversation.router.ts` (tradução service→409 no
controller)
**Requirement**: CAT-18, CAT-21, CAT-23, CAT-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `OrderNotFoundError`→404, `OrderAlreadyTerminalError`→409, sem `canOperate`→403
- [x] `app.use('/orders', createOrderRouter({validToken}))` montado
- [x] Gate check passa: `pnpm vitest run --project e2e`
- [x] Contagem de testes: pelo menos 7 (list, approve feliz, approve com falha de
      estoque, approve sobre terminal, reject feliz, reject sobre terminal, sem
      permissão) — 10 testes escritos

**Tests**: e2e
**Gate**: full

**Commit**: `feat(crm-api): add Order listing, approve and reject endpoints`

---

### T11: Tool `search_products`

**What**: Handler `(input, ctx) => {products: [...]}`, top-5 `Product`s `active` do
`Tenant`, filtro por `name` (regex) se `query` informado.
**Where**: `packages/ai-kit/src/tools/searchProducts.ts`
**Depends on**: T1
**Reuses**: `packages/ai-kit/src/tools/getProcessTemplate.ts` (padrão de handler —
`tenantScoped`, nunca `throw`, sempre `{error}`/dado)
**Requirement**: CAT-07, CAT-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Retorna só `Product`s `active:true` do `Tenant` do `ToolContext`
- [x] Sem `query`, retorna os 5 mais recentes/relevantes; com `query`, filtra por `name`
- [x] Nenhum match → lista vazia, nunca `{error}`
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

---

### T12: Tool `get_order_status`

**What**: Handler `(input, ctx) => OrderSummary | {error}` — `orderId` opcional, escopado
à `conversation` do `ToolContext`.
**Where**: `packages/ai-kit/src/tools/getOrderStatus.ts`
**Depends on**: T2
**Reuses**: `packages/ai-kit/src/tools/getProcessTemplate.ts`
**Requirement**: CAT-09, CAT-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `orderId` informado mas de outra `conversation`/`Tenant` → `{error}`, sem vazar dado
- [x] `orderId` omitido → `Order` mais recente da `conversation`, ou `{error}` se nenhum
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

---

### T13: Tool `create_order` (Anel B, duas chamadas)

**What**: Handler `(input, ctx) => OrderSummary | {error}` — 1ª chamada cria
`pending_approval`; 2ª chamada (`customerConfirmed:true`, mesma `idempotencyKey`) marca
confirmação do cliente no mesmo documento via `orderTransitions.setCustomerConfirmed`.
**Where**: `packages/ai-kit/src/tools/createOrder.ts`
**Depends on**: T1, T2, T3
**Reuses**: `packages/ai-kit/src/tools/openProcess.ts` (cria documento a partir de input
validado), `orderTransitions.ts`
**Requirement**: CAT-12, CAT-13, CAT-14, CAT-15, CAT-16, CAT-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] 1ª chamada: item com `productId` inexistente/`active:false` ou `quantity` fora de
      `1..100` → `{error}`, nenhum `Order` criado
- [x] 1ª chamada válida: `Order` `pending_approval`, `customerConfirmed:false`, snapshot
      de `name`/`unitPrice` por item, `totalPrice` calculado
- [x] 2ª chamada (`customerConfirmed:true`) com `items` idêntico → atualiza o MESMO
      `Order` (nunca cria um segundo)
- [x] 2ª chamada com `items` divergente → `{error}`, `Order` original intocado
- [x] `customerConfirmed:true` sem `Order pending_approval` correspondente → `{error}`
- [x] Chamada (1ª ou 2ª forma) sobre `idempotencyKey` de `Order` já terminal → retorna o
      estado atual, sem mutar
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Contagem de testes: pelo menos 8 (cobrindo todos os `Done when` acima) — 11 testes
      escritos

**Tests**: integration
**Gate**: full

---

### T14: Registrar as 3 tools novas + atualizar teste estrutural

**What**: Adicionar `search_products`/`get_order_status`/`create_order` a
`TOOL_DEFINITIONS` (JSON Schema literal, AD-004 — sem `tenant`/`channel`/`conversation`
no `input_schema`, AD-010) e ao `switch` de `executeTool`; atualizar
`toolInputSchema.structural.test.ts`.
**Where**: `packages/ai-kit/src/tools/toolDefinitions.ts`, `packages/ai-kit/src/loop.ts`,
`tests/structural/toolInputSchema.structural.test.ts`
**Depends on**: T11, T12, T13
**Reuses**: sweep genérico de chave proibida já existente no teste estrutural
**Requirement**: CAT-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `TOOL_DEFINITIONS` tem as 3 entradas novas, `input_schema` sem `tenant`/`channelId`/
      `conversationId`
- [x] `executeTool` despacha os 3 nomes novos pros handlers de T11/T12/T13
- [x] `EXPECTED_TOOL_NAMES` e `toHaveLength(4)`→`toHaveLength(7)` atualizados
- [x] Gate check passa: `pnpm vitest run --project unit --project structural`

**Tests**: structural
**Gate**: quick

**Commit**: `feat(ai-kit): register catalog and order tools (Ring A + Ring B)`

---

### T15: Estender `guard.output` — regra de preço (AD-009)

**What**: `guardOutput(reply, toolResultsThisTurn)` — extrai preços permitidos dos
`tool_result`s do turno (convertendo centavos→reais), redige valor monetário na resposta
que não bate com nenhum, loga a ocorrência.
**Where**: `packages/ai-kit/src/guardOutput.ts`
**Depends on**: None
**Reuses**: `OBJECT_ID_REGEX`/`REDACTED_PLACEHOLDER`/`truncateAtSafeBoundary` (molde de
regex+substituição+log já existente no mesmo arquivo)
**Requirement**: CAT-25, CAT-26

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Valor monetário na resposta que bate com um preço presente nos `tool_result`s do
      turno passa sem alteração
- [x] Valor monetário que não bate é redigido (mesmo padrão do placeholder de ObjectId)
- [x] Toda redação é logada (mesmo padrão de log já usado no harness)
- [x] Assinatura antiga (`guardOutput(reply)`) removida — toda chamada atualizada
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T16: Fiar `rawTurn` do `runTurn.ts` pro `guard.output`

**What**: `runTurn.ts` passa os `tool_result`s do turno (`loopResult.rawTurn`) pra
`guardOutput`, em vez de só a `string` da resposta.
**Where**: `packages/ai-kit/src/runTurn.ts`
**Depends on**: T15, T14
**Reuses**: `loopResult.rawTurn` (já existe, hoje só usado por `persist()`)
**Requirement**: CAT-25

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `guardOutput(reply, ...)` chamado com os `tool_result`s reais deste turno
- [x] Teste de integração cobrindo uma conversa simulada com `search_products` (preço
      real passa) e uma resposta simulada com preço fabricado (é redigida)
- [x] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(ai-kit): wire this-turn tool results into guard.output price rule`

---

### T17: Caso de golden set — `create_order` + guard de preço

**What**: Novo caso em `evals/cases/` afirmando (a) `create_order` nasce
`pending_approval` e só confirma com as duas condições, (b) a IA nunca cita, na resposta
final, um preço fora dos tool results do turno — consequência explícita de AD-009,
generalizada de `issue_payment_link` pra `create_order`.
**Where**: `evals/cases/createOrderGuardrails.int.test.ts`
**Depends on**: T14, T16
**Reuses**: `evals/cases/promptInjection.int.test.ts`/`tenantIsolation.int.test.ts`
(estrutura de caso), `evals/runner/expectTool.ts`/`expectNoLeak.ts`
**Requirement**: CAT-25, CAT-26, CAT-27

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Caso afirma que `create_order` não confirma sem as duas condições
- [x] Caso afirma que nenhum preço fora do tool result do turno aparece na resposta final
- [x] Gate check passa: `pnpm run evals`

**Tests**: integration
**Gate**: full

**Commit**: `test(evals): add golden set case for create_order guardrails`

---

### T18: `query/product.ts`

**What**: Hooks TanStack Query — `productsQuery`, `createProductMutation`,
`updateProductMutation`.
**Where**: `apps/web/src/query/product.ts`
**Depends on**: T7
**Reuses**: `apps/web/src/query/customer.ts` (molde de query+mutation)
**Requirement**: CAT-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `productsQuery` server-driven (paginação/filtro via parâmetros, AD-028)
- [x] Mutations invalidam `productsQuery` no sucesso
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T19: Tela de listagem de `Product`

**What**: `products/index.tsx` — `<DataTable>` server-driven (AD-028), sem hub (2
destinos: lista+add, mesmo padrão de `processes/index.tsx`).
**Where**: `apps/web/src/routes/_private/products/index.tsx`
**Depends on**: T18
**Reuses**: `apps/web/src/routes/_private/processes/index.tsx` (mesma forma: lista direto
em `index.tsx`, sem hub), `@/components/ui/data-table.js`, `t()`
**Requirement**: CAT-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `<Card asPage>` com `staticData.title`
- [x] `<DataTable>` `manualPagination`/`manualSorting`/`manualFiltering` (AD-028)
- [x] Toda string visível via `t()`
- [x] Gate check passa: `pnpm vitest run --project unit` (com mock de
      `@tanstack/react-router`, `apps/web/CLAUDE.md`)

**Tests**: unit
**Gate**: quick

---

### T20: Tela de criação de `Product`

**What**: `products/add/index.tsx` — formulário `react-hook-form`+`zodResolver`
(`createProductSchema`).
**Where**: `apps/web/src/routes/_private/products/add/index.tsx`
**Depends on**: T18
**Reuses**: `apps/web/src/routes/_private/processes/add/index.tsx`, `Form/FormField/...`
(`@/components/ui/form.js`)
**Requirement**: CAT-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Formulário valida com `createProductSchema` (`packages/contracts`)
- [x] Submissão bem-sucedida navega de volta pra listagem
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T21: Tela de edição de `Product`

**What**: `products/details.tsx` — `search:{id}` (AD-030, nunca `$id`), formulário de
edição com `updateProductSchema`.
**Where**: `apps/web/src/routes/_private/products/details.tsx`
**Depends on**: T18
**Reuses**: `apps/web/src/routes/_private/customers/details.tsx`/
`processes/details.tsx`
**Requirement**: CAT-03, CAT-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Carrega `Product` por `search.id`, edita `stock`/`active`/demais campos
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add Product catalog CRUD screens`

---

### T22: `query/order.ts`

**What**: Hooks TanStack Query — `ordersQuery` (filtro `status`/`conversation`),
`approveOrderMutation`, `rejectOrderMutation`.
**Where**: `apps/web/src/query/order.ts`
**Depends on**: T10
**Reuses**: `apps/web/src/query/conversation.ts`
**Requirement**: CAT-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ordersQuery` server-driven, filtro por `status` via parâmetro
- [x] Mutations invalidam `ordersQuery` (e, quando aplicável, a query do card do Inbox de
      T24) no sucesso
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T23: Tela "Pedidos" (fila + histórico)

**What**: `orders/index.tsx` — tabela simples (sem design rico, decisão registrada em
`context.md`), filtro por `status` via `search`, ações Aprovar/Rejeitar por linha quando
`pending_approval`.
**Where**: `apps/web/src/routes/_private/orders/index.tsx`
**Depends on**: T22
**Reuses**: `@/components/ui/data-table.js` (AD-028), `t()`
**Requirement**: CAT-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Filtro por `status` (default `pending_approval`, também mostra `confirmed`/
      `rejected` como histórico)
- [x] Botões Aprovar/Rejeitar visíveis só em linhas `pending_approval`
- [x] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add Pedidos queue and history screen`

---

### T24: Componente `order-card.tsx`

**What**: Card mostrando o `Order pending_approval` de uma `Conversation`, com
Aprovar/Rejeitar — mesmo padrão visual de `takeover-badge.tsx`.
**Where**: `apps/web/src/routes/_private/inbox/@components/order-card.tsx`
**Depends on**: T22
**Reuses**: `apps/web/src/routes/_private/inbox/@components/takeover-badge.tsx`
**Requirement**: CAT-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Usa `ordersQuery({conversation, status:'pending_approval'})` (T22)
- [ ] Nenhum `Order` pendente → componente não renderiza nada (sem estado vazio ruidoso)
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

---

### T25: Montar `order-card.tsx` na thread do Inbox

**What**: `thread.tsx` renderiza `order-card.tsx` quando a `Conversation` aberta tem
pedido pendente.
**Where**: `apps/web/src/routes/_private/inbox/@components/thread.tsx` (modificado)
**Depends on**: T24
**Reuses**: composição já existente de `thread.tsx` (feature 6)
**Requirement**: CAT-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `order-card.tsx` aparece na thread quando há `Order pending_approval` daquela
      `conversation`
- [ ] Gate check passa: `pnpm vitest run --project unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): show pending order card inline in Inbox thread`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4
Phase 3:  T5 ──→ T6 ──→ T7
Phase 4:  T8 ──→ T9 ──→ T10
Phase 5:  T11 ──→ T12
Phase 6:  T13 ──→ T14
Phase 7:  T15 ──→ T16
Phase 8:  T17
Phase 9:  T18 ──→ T19 ──→ T20 ──→ T21
Phase 10: T22 ──→ T23
Phase 11: T24 ──→ T25
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent
(or batch worker) works one task at a time, in order. 25 tasks total, 11 phases — packs
into ~4 task-budgeted batches (~7 tasks each, whole phases) at Execute time; **not
decided or started in this session**.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Criar model `Product` | 1 arquivo, 1 schema | ✅ Granular |
| T2: Criar model `Order` | 1 arquivo, 1 schema | ✅ Granular |
| T3: `orderTransitions.ts` | 1 arquivo, 4 funções cohesivas de uma única máquina de estados | ✅ Granular (cohesivo) |
| T4: Schemas Zod novos | 3 arquivos pequenos, mesmo padrão mecânico | ✅ Granular (cohesivo) |
| T5: `product.repository.ts` | 1 arquivo, 1 componente | ✅ Granular |
| T6: `product.service.ts` | 1 arquivo, 1 componente | ✅ Granular |
| T7: `product.controller/router` + `app.ts` | 2 arquivos + 1 linha de wiring, 1 endpoint set cohesivo | ✅ Granular (cohesivo, wiring exigido pelo próprio teste e2e) |
| T8: `order.repository.ts` | 1 arquivo, 1 componente | ✅ Granular |
| T9: `order.service.ts` | 1 arquivo, 1 componente | ✅ Granular |
| T10: `order.controller/router` + `app.ts` | 2 arquivos + wiring, 1 endpoint set cohesivo | ✅ Granular (cohesivo) |
| T11: Tool `search_products` | 1 arquivo, 1 função | ✅ Granular |
| T12: Tool `get_order_status` | 1 arquivo, 1 função | ✅ Granular |
| T13: Tool `create_order` | 1 arquivo, 1 função (duas formas de chamada da mesma tool) | ✅ Granular |
| T14: Registrar tools + teste estrutural | 3 arquivos pequenos, 1 ato de registro cohesivo | ✅ Granular (cohesivo) |
| T15: `guard.output` — regra de preço | 1 arquivo, 1 função | ✅ Granular |
| T16: Fiar `rawTurn` no `runTurn.ts` | 1 arquivo, 1 mudança de chamada | ✅ Granular |
| T17: Caso de golden set | 1 arquivo | ✅ Granular |
| T18: `query/product.ts` | 1 arquivo | ✅ Granular |
| T19: Tela de listagem de `Product` | 1 arquivo (rota) | ✅ Granular |
| T20: Tela de criação de `Product` | 1 arquivo (rota) | ✅ Granular |
| T21: Tela de edição de `Product` | 1 arquivo (rota) | ✅ Granular |
| T22: `query/order.ts` | 1 arquivo | ✅ Granular |
| T23: Tela "Pedidos" | 1 arquivo (rota) | ✅ Granular |
| T24: `order-card.tsx` | 1 arquivo (componente) | ✅ Granular |
| T25: Montar `order-card.tsx` na thread | 1 arquivo modificado | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (início da Fase 1) | ✅ Match |
| T2 | None | (início da Fase 1, paralelo lógico a T1, sequencial no diagrama) | ✅ Match |
| T3 | T1, T2 | Fase 1: T1→T2→T3 | ✅ Match |
| T4 | None | Fase 2: T4 isolado | ✅ Match |
| T5 | T1 | Fase 3: T5→T6→T7 (T1 é de fase anterior) | ✅ Match |
| T6 | T5 | Fase 3: T5→T6→T7 | ✅ Match |
| T7 | T6, T4 | Fase 3: T5→T6→T7 (T4 é de fase anterior) | ✅ Match |
| T8 | T2 | Fase 4: T8→T9→T10 (T2 é de fase anterior) | ✅ Match |
| T9 | T8, T3 | Fase 4: T8→T9→T10 (T3 é de fase anterior) | ✅ Match |
| T10 | T9, T4 | Fase 4: T8→T9→T10 (T4 é de fase anterior) | ✅ Match |
| T11 | T1 | Fase 5: T11→T12 (T1 é de fase anterior) | ✅ Match |
| T12 | T2 | Fase 5: T11→T12 (T2 é de fase anterior) | ✅ Match |
| T13 | T1, T2, T3 | Fase 6: T13→T14 (T1/T2/T3 são de fases anteriores) | ✅ Match |
| T14 | T11, T12, T13 | Fase 6: T13→T14 (T11/T12 são de fase anterior) | ✅ Match |
| T15 | None | Fase 7: T15→T16 | ✅ Match |
| T16 | T15, T14 | Fase 7: T15→T16 (T14 é de fase anterior) | ✅ Match |
| T17 | T14, T16 | Fase 8: T17 isolado (deps de fases anteriores) | ✅ Match |
| T18 | T7 | Fase 9: T18→T19→T20→T21 (T7 é de fase anterior) | ✅ Match |
| T19 | T18 | Fase 9: T18→T19→T20→T21 | ✅ Match |
| T20 | T18 | Fase 9: T18→T19→T20→T21 | ✅ Match |
| T21 | T18 | Fase 9: T18→T19→T20→T21 | ✅ Match |
| T22 | T10 | Fase 10: T22→T23 (T10 é de fase anterior) | ✅ Match |
| T23 | T22 | Fase 10: T22→T23 | ✅ Match |
| T24 | T22 | Fase 11: T24→T25 (T22 é de fase anterior) | ✅ Match |
| T25 | T24 | Fase 11: T24→T25 | ✅ Match |

Nenhuma task depende de uma task de fase posterior — todas as dependências apontam pra
trás ou dentro da mesma fase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Model (entidade) | none | none | ✅ OK |
| T2 | Model (entidade) | none | none | ✅ OK |
| T3 | `orderTransitions.ts` (domínio, toca Mongo) | integration | integration | ✅ OK |
| T4 | Schemas Zod | unit | unit | ✅ OK |
| T5 | Repository | integration | integration | ✅ OK |
| T6 | Service | unit | unit | ✅ OK |
| T7 | Controller/Router (maior exigência entre as camadas tocadas) | e2e | e2e | ✅ OK |
| T8 | Repository | integration | integration | ✅ OK |
| T9 | Service | unit | unit | ✅ OK |
| T10 | Controller/Router | e2e | e2e | ✅ OK |
| T11 | Tool handler | integration | integration | ✅ OK |
| T12 | Tool handler | integration | integration | ✅ OK |
| T13 | Tool handler | integration | integration | ✅ OK |
| T14 | Definições de tool + teste estrutural | structural | structural | ✅ OK |
| T15 | `guard.output` | unit | unit | ✅ OK |
| T16 | `runTurn.ts` (fiação) | integration | integration | ✅ OK |
| T17 | Golden set | integration | integration | ✅ OK |
| T18 | Camada de dados `apps/web` | unit | unit | ✅ OK |
| T19 | Rota/componente `apps/web` | unit | unit | ✅ OK |
| T20 | Rota/componente `apps/web` | unit | unit | ✅ OK |
| T21 | Rota/componente `apps/web` | unit | unit | ✅ OK |
| T22 | Camada de dados `apps/web` | unit | unit | ✅ OK |
| T23 | Rota/componente `apps/web` | unit | unit | ✅ OK |
| T24 | Componente `apps/web` | unit | unit | ✅ OK |
| T25 | Componente `apps/web` (modificado) | unit | unit | ✅ OK |

Nenhuma violação — nenhuma task usa "testado em outra task" como justificativa; toda
task com camada de código que exige teste na matriz já inclui esse teste no próprio
`Done when`.

---

## MCPs e Skills

Nenhum MCP de projeto e nenhuma skill adicional (além da própria `tlc-spec-driven`, que
governa o Execute) foi identificado como necessário nesta varredura — todo task usa
ferramentas padrão de leitura/escrita/execução. **Esta pergunta ("para cada task, qual
ferramenta usar?") deve ser reconfirmada com o usuário no início do Execute**, per o
processo da skill — não decidida nesta sessão de planejamento, que termina aqui.
