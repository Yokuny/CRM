# Catalog Orders Specification

## Problem Statement

O `ai-gateway` (feature 5) já atende clientes no WhatsApp com IA, mas a superfície de
tools hoje só sabe conversar sobre `Process`/`Customer` — não existe catálogo nem pedido
no sistema (`Product`/`Order`: zero linhas de código hoje). O Anel B inteiro
([AD-009](../../STATE.md)) está travado: nenhuma tool de dinheiro foi implementada porque
não havia nenhum domínio real pra testar contra. Sem esta feature, o bot não consegue
vender nada — só coletar dados de processo.

## Goals

- [ ] Tenant cadastra produtos no catálogo (nome, preço, estoque) pela UI.
- [ ] Cliente pesquisa produtos e consulta o status do próprio pedido pela conversa de
      WhatsApp, sem que a IA jamais cite um preço que não veio de um resultado de tool
      desta rodada.
- [ ] Cliente monta um pedido pela conversa; o pedido nasce `pending_approval` e só vira
      `confirmed` com confirmação explícita do cliente **e** liberação do operador — nunca
      com só uma das duas.
- [ ] Operador aprova ou rejeita pedidos pendentes do tenant, de qualquer conversa, sem
      que dois pedidos concorrentes vendam a mesma última unidade em estoque.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Item | Motivo |
| --- | --- |
| Cobrança real / link de pagamento (Asaas) | Feature 8 (`payments-asaas`). `Order confirmed` nesta rodada não gera nenhuma cobrança — é só o estado de negócio "pedido fechado" |
| Edição de itens (produto/quantidade) de um `Order` já criado | Não discutido no Discuss — fora de escopo. Só existem criar (duas chamadas), aprovar e rejeitar |
| Expiração automática de `Order pending_approval` | Decidido no Discuss: fica pendente indefinidamente nesta rodada. Ver Assumptions e Deferred Ideas em `context.md` |
| `sku` único / catálogo com variações (cor, tamanho) via field-engine | Decidido no Discuss: `Product` tem schema fixo, não usa o motor de campos dinâmicos (AD-019) — sem necessidade real hoje |
| Design rico da tela "Pedidos" (kanban, filtros avançados) | Decidido no Discuss: P1 entrega uma tabela simples funcional; melhoria de design é ideia futura |
| Notificação em tempo real (WebSocket) de novo `Order pending_approval` | O WS da feature 6 só empurra `Message` nova; nenhum evento novo é adicionado ao payload existente nesta rodada |
| Desconto, cupom, frete no pedido | Não mencionado no roadmap, fora do MVP |
| Multi-moeda | Preço assumido em BRL (inteiro em centavos), sem campo de moeda por tenant |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Shape do `Product` | Schema fixo (name, sku, description, price em centavos, stock, active) | Decidido no Discuss | sim |
| Representação de preço | Inteiro em centavos | Decidido no Discuss | sim |
| Estoque rastreado no P1 | Sim | Decidido no Discuss | sim |
| Momento da reserva de estoque | Só na confirmação (não no `pending_approval`) | Decidido no Discuss | sim |
| Falha de estoque no momento da confirmação | `Order` permanece `pending_approval`, motivo de erro exposto ao operador, sem decremento parcial | Decidido no Discuss | sim |
| Captura da confirmação do cliente | `create_order` em duas chamadas, mesma `idempotencyKey`, `customerConfirmed` muda de `false`→`true` na 2ª | Decidido no Discuss | sim |
| Escopo do guard de preço em `guard.output` | Só tool results deste turno (`loopResult.rawTurn`) | Decidido no Discuss | sim |
| Paginação de `search_products`/`get_order_status` | Top-N fixo sem paginação; `get_order_status` aceita `orderId` opcional (default: pedido mais recente da conversa) | Decidido no Discuss | sim |
| Quem aprova/rejeita um `Order` | Qualquer operador do tenant com a mesma permissão já usada nos endpoints existentes (`canOperate`), não só o `assignee` da conversa | Decidido no Discuss | sim |
| Onde a aprovação aparece na UI | Card inline na thread da conversa **e** uma tela nova simples "Pedidos" (lista com filtro por status) | Decidido no Discuss | sim |
| Rejeição de pedido no P1 | Sim — `status:'rejected'`, motivo opcional, transição terminal | Decidido no Discuss | sim |
| Expiração automática de `pending_approval` | Não, nesta rodada | Decidido no Discuss | sim |
| Cadastro de `Product` pela UI | Sim — telas simples de lista/adicionar/editar no P1 | Decidido no Discuss | sim |
| Unicidade de `sku` | Não é exigida — campo livre/opcional, `Product` é identificado por `_id` | Não foi levantado como requisito no Discuss; adicionar uma constraint de unicidade não pedida é escopo extra não justificado | não confirmado — baixo risco, fácil de apertar depois |
| Moeda | BRL implícito, sem campo de moeda | Nenhuma menção a suporte multi-tenant de moeda em nenhum ADR/roadmap; mesmo contexto (Brasil) da integração Meta/Asaas já decidida | não confirmado — baixo risco |
| Limites de quantidade por item em `create_order` | Inteiro positivo, mínimo 1; Design escolhe um teto razoável (ex.: 100) só pra rejeitar entrada absurda, não uma regra de negócio | Dimensão "validação de entrada" da varredura implícita — precisa de algum limite, mas o valor exato não foi discutido | não confirmado — Design decide o teto exato |
| Papel exigido nos novos endpoints (`Product`, `Order`, aprovar/rejeitar) | Mesmo `canOperate` (`admin`\|`gestor`\|`operador`) dos endpoints já existentes | Reuso direto da convenção já ativa (`checkRole`), mesmo padrão já usado no `ai-gateway`/`inbox-realtime` | não confirmado — reuso de convenção, baixo risco |

**Open questions:** nenhuma — tudo resolvido ou logado acima.

---

## Varredura de dimensões implícitas

Escopo Complex: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | CAT-06 (`Product`: price/stock não-negativos, name obrigatório), CAT-13 (`create_order`: item inválido/inexistente/inativo rejeitado, quantidade positiva limitada) |
| Falha / falha parcial | CAT-13 (item inválido não cria `Order`), CAT-22 (reserva atômica tudo-ou-nada — nenhum decremento parcial entre itens) |
| Idempotência / retry / duplicata | CAT-14/CAT-15/CAT-16/CAT-17 (`idempotencyKey` do `create_order` — duas chamadas do mesmo pedido, key reusada com items diferentes, key sem `Order` prévio, key de `Order` já terminal) |
| Fronteiras de auth & rate limit | CAT-09 (`get_order_status` escopado à própria `conversation`, nunca vaza pedido de outro cliente); CAT-11 (`Tenant`/`channelId`/`conversationId` só via `ToolContext`, nunca no `input_schema`); demais endpoints REST exigem `canOperate` (ver Assumptions) |
| Concorrência / ordenação | CAT-21/CAT-22 (checagem+reserva atômica de estoque no exato momento em que as duas condições da transição se completam) |
| Ciclo de vida / expiração | `N/A` explícito — decidido no Discuss: `Order pending_approval` fica pendente indefinidamente nesta rodada (ver Deferred Ideas em `context.md`) |
| Observabilidade | CAT-27 (violação de preço redigida pelo `guard.output` é registrada); demais operações seguem o padrão `withDbTiming` já convencional do projeto — sem requisito novo além disso |
| Falha de dependência externa | `N/A` explícito — esta feature não chama nenhuma dependência externa (Asaas é feature 8; Meta Cloud API não é tocada aqui) |
| Integridade de transição de estado | CAT-12/CAT-14 (`pending_approval` nasce/atualiza), CAT-21/CAT-22 (`→confirmed` exige as duas condições + estoque), CAT-23/CAT-24 (`→rejected`, terminal; ações em `Order` terminal retornam erro sem mudar nada) |

---

## User Stories

### P1: Operador cadastra produtos no catálogo ⭐ MVP

**User Story**: Como operador, quero cadastrar, listar e editar produtos do meu tenant,
para que o catálogo exista e a IA tenha o que oferecer na conversa.

**Why P1**: Sem `Product` cadastrável, nenhuma outra história desta feature é
demonstrável de ponta a ponta — é a base de tudo.

**Acceptance Criteria**:

1. WHEN um operador autenticado (`canOperate`) chama `POST /products` com
   `{name, sku?, description?, price, stock, active?}` THEN o sistema SHALL criar um
   `Product` escopado ao `Tenant` da sessão, com `active` default `true`.
2. WHEN um operador chama `GET /products` THEN o sistema SHALL retornar uma lista
   paginada, escopada ao `Tenant`, com filtro opcional por nome/`active`.
3. WHEN um operador chama `PATCH /products/:id` THEN o sistema SHALL atualizar os campos
   informados (incluindo `stock`/`active`), sem afetar `Order`s já criados que referenciam
   esse produto (eles guardam um snapshot — ver P1 "Cliente monta um pedido").
4. WHEN `price` ou `stock` recebidos são negativos, ou `name` está ausente/vazio THEN o
   sistema SHALL rejeitar com 400, sem criar/alterar o `Product`.
5. WHEN um usuário sem papel `canOperate` chama qualquer rota de `Product` THEN o sistema
   SHALL responder 403.
6. WHEN o operador acessa a tela de catálogo em `apps/web` THEN SHALL ver lista, formulário
   de adicionar e formulário de editar `Product`, no mesmo padrão de Customer/Process
   (feature 4).

**Independent Test**: cadastrar um produto pela UI, editá-lo, ver a listagem refletir a
mudança, sem tocar em nenhuma outra parte da feature.

---

### P1: Cliente pesquisa produtos e consulta status do pedido pela conversa ⭐ MVP

**User Story**: Como cliente no WhatsApp, quero que a IA me diga quais produtos existem
e o preço, e me informe o status do meu pedido, sem que ela invente nenhum valor.

**Why P1**: É o primeiro contato do cliente com o catálogo — sem isso, `create_order` não
tem como ser alcançado numa conversa real.

**Acceptance Criteria**:

1. WHEN a IA chama `search_products` (Anel A, autônoma) com uma busca opcional por nome
   THEN o sistema SHALL retornar um top-N fixo de `Product`s `active` do `Tenant` da
   `Conversation` (nome, preço em centavos, estoque, descrição), nunca produtos
   `active:false`.
2. WHEN a busca não encontra nenhum produto `active` que bata THEN `search_products`
   SHALL retornar uma lista vazia, nunca `{error}`.
3. WHEN a IA chama `get_order_status` com um `orderId` THEN o sistema SHALL retornar o
   status/itens/total **somente se** esse `Order` pertence à mesma `Conversation` do
   `ToolContext`; caso contrário SHALL retornar `{error}`, sem vazar dado de outro
   cliente.
4. WHEN a IA chama `get_order_status` sem `orderId` THEN o sistema SHALL retornar o
   `Order` mais recente dessa `Conversation`, ou `{error}` se não houver nenhum.
5. WHEN qualquer uma dessas tools é invocada THEN o `Tenant`/`channelId`/`conversationId`
   SHALL vir exclusivamente do `ToolContext` injetado no servidor — nunca do
   `input_schema` (AD-010), e o teste estrutural `toolInputSchema.structural.test.ts`
   SHALL cobrir as duas tools novas.

**Independent Test**: numa conversa simulada, perguntar "quais produtos vocês têm" e ver
a IA citar só produtos reais com preço batendo o cadastro; perguntar o status de um pedido
de outra conversa/tenant e confirmar que a IA não consegue enxergá-lo.

---

### P1: Cliente monta e confirma um pedido pela conversa ⭐ MVP

**User Story**: Como cliente no WhatsApp, quero montar um pedido conversando com a IA e
confirmar explicitamente antes dele valer, para não ser cobrado por engano.

**Why P1**: É o coração do Anel B — sem isso, a feature não entrega pedido nenhum.

**Acceptance Criteria**:

1. WHEN a IA chama `create_order` pela primeira vez (sem `customerConfirmed`, ou
   `customerConfirmed:false`) com `{items: [{productId, quantity}], idempotencyKey}`
   THEN o sistema SHALL validar cada `productId` (existe, `active`), validar `quantity`
   (inteiro positivo dentro do limite, ver Assumptions), e SHALL criar um `Order`
   `pending_approval` com `customerConfirmed:false`, um snapshot de `name`/`unitPrice`
   por item e o `totalPrice` calculado, retornando um resumo para a IA relayar ao cliente.
2. WHEN qualquer item de `create_order` referencia um `productId` inexistente ou
   `active:false`, ou uma `quantity` inválida THEN o sistema SHALL retornar `{error}` sem
   criar nenhum `Order`.
3. WHEN a IA chama `create_order` de novo com a **mesma** `idempotencyKey` e
   `customerConfirmed:true` THEN o sistema SHALL localizar o `Order` `pending_approval`
   criado na 1ª chamada e marcar `customerConfirmed:true` **no mesmo documento** — nunca
   criar um segundo `Order`.
4. WHEN a 2ª chamada (`customerConfirmed:true`) traz um conjunto de `items` diferente do
   da 1ª chamada para a mesma `idempotencyKey` THEN o sistema SHALL retornar `{error}` sem
   alterar o `Order` existente.
5. WHEN `create_order` é chamado com `customerConfirmed:true` e nenhuma `idempotencyKey`
   correspondente a um `Order` `pending_approval` existir THEN o sistema SHALL retornar
   `{error}`.
6. WHEN `create_order` é chamado com uma `idempotencyKey` que já aponta para um `Order`
   terminal (`confirmed`/`rejected`) THEN o sistema SHALL retornar o estado atual desse
   `Order`, sem mutar nada (leitura idempotente, não erro).

**Independent Test**: numa conversa simulada, pedir 1 unidade de um produto, ver o `Order`
nascer `pending_approval` no banco; responder "sim, confirmo"; ver o **mesmo** `Order`
virar `customerConfirmed:true`, ainda `pending_approval` (aguardando o operador).

---

### P1: Operador aprova ou rejeita um pedido pendente ⭐ MVP

**User Story**: Como operador, quero ver os pedidos pendentes do meu tenant — de qualquer
conversa — e aprovar ou rejeitar, sabendo que o estoque nunca vende a mesma unidade duas
vezes.

**Why P1**: É a outra metade obrigatória da transição (AD-009) — sem aprovação humana,
nenhum pedido pode virar `confirmed` de verdade.

**Acceptance Criteria**:

1. WHEN um operador (`canOperate`, qualquer um do tenant, não só o `assignee` da
   conversa) chama `GET /orders` com filtro por `status` (default `pending_approval`)
   THEN o sistema SHALL retornar uma lista paginada de `Order`s do `Tenant`.
2. WHEN o operador acessa a tela "Pedidos" em `apps/web` THEN SHALL ver essa lista (tabela
   simples, sem design rico neste P1), com ações Aprovar/Rejeitar por linha quando
   `status:'pending_approval'`.
3. WHEN uma `Conversation` aberta no Inbox (feature 6) tem um `Order` `pending_approval`
   associado THEN a thread SHALL mostrar um card inline com o resumo do pedido e os mesmos
   botões Aprovar/Rejeitar.
4. WHEN um operador chama `POST /orders/:id/approve` THEN o sistema SHALL registrar essa
   aprovação; SE `customerConfirmed` já é `true` nesse momento, SHALL tentar, atomicamente,
   reservar (decrementar) o estoque de cada item e, se toda a reserva for bem-sucedida,
   SHALL transicionar o `Order` para `confirmed`.
5. SE, no momento em que as duas condições (confirmação do cliente + aprovação do
   operador) se completam — seja aprovar completando por último, seja a 2ª chamada de
   `create_order` completando por último — a reserva atômica falhar para qualquer item
   (estoque insuficiente) THEN o `Order` SHALL permanecer `pending_approval`, com um
   motivo de erro exposto ao operador, e o sistema NÃO SHALL decrementar parcialmente o
   estoque de nenhum item dessa tentativa.
6. WHEN um operador chama `POST /orders/:id/reject` (com `reason` opcional) THEN o sistema
   SHALL marcar `status:'rejected'`, `rejectedBy`, `rejectionReason` — transição terminal,
   sem nenhum ajuste de estoque (nunca foi reservado enquanto pendente).
7. WHEN `approve`/`reject` é chamado sobre um `Order` já terminal (`confirmed`/`rejected`)
   THEN o sistema SHALL responder erro sem mudar nada.

**Independent Test**: criar dois pedidos `pending_approval` que juntos excedem o estoque
de 1 unidade de um produto; confirmar por dois operadores diferentes (sem takeover da
conversa) — só um `Order` consegue virar `confirmed`, o outro permanece `pending_approval`
com o motivo exposto.

---

### P1: `guard.output` impede a IA de citar um preço fabricado ⭐ MVP

**User Story**: Como responsável pelo produto, quero que a IA nunca informe ao cliente um
preço que não veio de uma consulta real ao catálogo/pedido, mesmo que o prompt seja
manipulado.

**Why P1**: É o guardrail central que ADR-0004/glossário já previam desde a feature 5 —
"preço citado só a partir de tool result desta conversa" — e esta é a primeira feature
com uma tool que realmente retorna preço, então é aqui que o guard precisa nascer.

**Acceptance Criteria**:

1. WHEN a resposta final da IA contém um valor monetário que não corresponde a nenhum
   preço presente nos `tool_result`s produzidos neste turno (`search_products`,
   `get_order_status`, `create_order`) THEN `guard.output` SHALL redigir esse valor antes
   do envio ao cliente — mesmo padrão do redaction de ObjectId já existente.
2. WHEN um valor monetário na resposta corresponde a um preço presente nos `tool_result`s
   deste turno THEN `guard.output` SHALL deixá-lo passar sem alteração.
3. WHEN `guard.output` redige um valor THEN o sistema SHALL registrar essa ocorrência para
   observabilidade (mesmo padrão de log já usado no harness).

**Independent Test**: golden-set case que injeta uma resposta simulada com um preço
inventado (sem tool result correspondente) e confirma que o texto final enviado ao cliente
não contém esse valor.

---

## Edge Cases

- WHEN `create_order` é chamado com `items` vazio THEN o sistema SHALL retornar `{error}`
  sem criar `Order`.
- WHEN duas 1ªs chamadas de `create_order` usam por acidente a mesma `idempotencyKey` para
  conjuntos de `items` diferentes THEN a segunda SHALL retornar `{error}`, sem sobrescrever
  a primeira (mesma regra de CAT-14/CAT-15, aplicada também à 1ª chamada).
- WHEN um `Product` é desativado (`active:false`) depois de já estar referenciado por um
  `Order` existente THEN esse `Order` SHALL manter o snapshot (`name`/`unitPrice`) já
  gravado — desativar só afeta buscas futuras (`search_products`), nunca pedidos já
  criados.
- WHEN o `phone`/dado do `Customer` de uma `Conversation` some ou o `Tenant` do `Order`
  não bate mais com o `ToolContext` (nunca deveria acontecer, mas por defesa em
  profundidade) THEN qualquer tool desta feature SHALL retornar `{error}`, nunca vazar
  dado de outro tenant.
- WHEN o operador tenta aprovar/rejeitar um `Order` que não existe ou é de outro `Tenant`
  THEN o sistema SHALL responder 404, mesmo idioma já usado em `customer.service.ts`/
  `conversation.service.ts` (id ausente e id de outro tenant são indistinguíveis).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CAT-01 | P1: Cadastro de catálogo | In Tasks | Implementing |
| CAT-02 | P1: Cadastro de catálogo | In Tasks | Implementing |
| CAT-03 | P1: Cadastro de catálogo | In Tasks | Implementing |
| CAT-04 | P1: Cadastro de catálogo | In Tasks | Implementing |
| CAT-05 | P1: Cadastro de catálogo | In Tasks | Implementing |
| CAT-06 | P1: Cadastro de catálogo | In Tasks | Pending |
| CAT-07 | P1: Busca/status pela conversa | In Tasks | Pending |
| CAT-08 | P1: Busca/status pela conversa | In Tasks | Pending |
| CAT-09 | P1: Busca/status pela conversa | In Tasks | Pending |
| CAT-10 | P1: Busca/status pela conversa | In Tasks | Pending |
| CAT-11 | P1: Busca/status pela conversa | In Tasks | Pending |
| CAT-12 | P1: Montar/confirmar pedido | In Tasks | Implementing |
| CAT-13 | P1: Montar/confirmar pedido | In Tasks | Pending |
| CAT-14 | P1: Montar/confirmar pedido | In Tasks | Implementing |
| CAT-15 | P1: Montar/confirmar pedido | In Tasks | Implementing |
| CAT-16 | P1: Montar/confirmar pedido | In Tasks | Implementing |
| CAT-17 | P1: Montar/confirmar pedido | In Tasks | Implementing |
| CAT-18 | P1: Aprovar/rejeitar pedido | In Tasks | Pending |
| CAT-19 | P1: Aprovar/rejeitar pedido | In Tasks | Pending |
| CAT-20 | P1: Aprovar/rejeitar pedido | In Tasks | Pending |
| CAT-21 | P1: Aprovar/rejeitar pedido | In Tasks | Implementing |
| CAT-22 | P1: Aprovar/rejeitar pedido | In Tasks | Implementing |
| CAT-23 | P1: Aprovar/rejeitar pedido | In Tasks | Implementing |
| CAT-24 | P1: Aprovar/rejeitar pedido | In Tasks | Implementing |
| CAT-25 | P1: Guard de preço | In Tasks | Pending |
| CAT-26 | P1: Guard de preço | In Tasks | Pending |
| CAT-27 | P1: Guard de preço | In Tasks | Pending |

**ID format:** `CAT-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 27 total, 27 mapped to tasks (`.specs/features/catalog-orders/tasks.md`,
T1–T25), 0 unmapped ⚠️

---

## Success Criteria

- [ ] Um tenant cadastra um produto pela UI e, na mesma conversa de WhatsApp simulada, o
      cliente encontra esse produto via `search_products` com o preço correto.
- [ ] Um pedido criado pela conversa nasce `pending_approval` e só vira `confirmed` depois
      de AMBAS as condições (confirmação do cliente + aprovação do operador) — nunca com
      só uma.
- [ ] Dois pedidos concorrentes disputando a última unidade de um produto: exatamente um
      vira `confirmed`, o outro permanece `pending_approval` com motivo exposto — nunca os
      dois "vendem" a mesma unidade.
- [ ] `guard.output` nunca deixa passar, no texto enviado ao cliente, um preço que não
      veio de um `tool_result` deste turno.
- [ ] `pnpm run check` (typecheck + Biome + testes) limpo, mesma gate de todo o projeto
      (AD-017/AD-031).
