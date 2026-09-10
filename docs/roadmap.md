# Roadmap

Sequência das 11 features do projeto, o que cada uma entregou e o que falta.
Decisões formais em [`docs/adr/`](adr/README.md); estado de execução e log de decisões
em [`.specs/STATE.md`](../.specs/STATE.md); specs por feature em [`.specs/features/`](../.specs/features/).

**Legenda:** ✅ entregue e verificada · 🔜 próxima · ⬜ planejada

---

## Quadro geral

| # | Feature | Status | Requisitos | Entregue em |
|---|---|---|---|---|
| 1 | `foundation-tenancy-auth` | ✅ | 22 (`FND-01..22`) | `main` |
| 2 | `dynamic-field-engine` | ✅ | 20 (`FLD-*`) | `main` |
| 3 | `crm-core` | ✅ | 18 (`CORE-*`) | `main` (squash, PR #2) |
| 4 | `crm-web-shell` | ✅ | 17 (`WEB-*`) | `main` (squash, PR #3) |
| 5 | `ai-gateway` | ✅ | 48 (`AIG-01..48`) | `main` (squash, PR #4) |
| 6 | `inbox-realtime` | ✅ | 19 (`INBOX-01..19`) | `main` (PR #5) |
| 7 | `catalog-orders` | ✅ | 27 (`CAT-01..27`) | `main` (PR #6 plano, PR #7 execução) |
| 8 | `payments-asaas` | ✅ | 15 (`PAY-01..15`) | `main` (PR #8) |
| 9 | `scheduling` | 🔜 | — | — |
| 10 | `kanban-tool` | ⬜ | — | — |
| 11 | `ops-hardening` | ⬜ | — | — |

Baseline atual: **1212 testes passando**, `tsc --noEmit` limpo, `biome check .` limpo,
CI rodando o Build gate em todo push/PR ([AD-031](../.specs/STATE.md#ad-031)).

> As features 6 a 11 tiveram nome e escopo derivados dos ADRs ainda não implementados e dos
> itens adiados nos "Out of Scope" das specs 1–5. A numeração "de 11" já era usada no
> `STATE.md` desde a feature 1, mas a lista nunca havia sido escrita — este arquivo é essa lista.

---

## Entregue

### 1. `foundation-tenancy-auth` ✅

Multi-tenancy, autenticação e RBAC. `Tenant`, `User`, `Invite`, `Session`;
convite → definição de senha → login; sessão de token único verificada no banco
([AD-014](../.specs/STATE.md#ad-014)); `isPlatformAdmin` fora de tenant ([AD-016](../.specs/STATE.md#ad-016));
seed idempotente do primeiro admin de plataforma ([AD-018](../.specs/STATE.md#ad-018)).

### 2. `dynamic-field-engine` ✅

`packages/field-engine` isomórfico + `FieldTemplate`/`FieldTemplateVersion`.
Definição e valor separados ([AD-003](../.specs/STATE.md#ad-003)), snapshot imutável por versão,
`diffFields` classificando mudança aditiva vs. destrutiva, migração com guarda de slot de versão.

### 3. `crm-core` ✅

`Customer` e `Process` com valores de campo dinâmico, listagem, filtro por `status`,
ordenação e rotas `/partial`. Instrumentação `dbReqResTime` nos repositórios.

### 4. `crm-web-shell` ✅

`apps/web` com TanStack Router file-based ([AD-030](../.specs/STATE.md#ad-030)), ShadCN, render
recursivo de campo dinâmico, telas de Customer (lista, kanban por `status`, add, details)
e de Process (lista, add, details).

### 5. `ai-gateway` ✅

Webhook Meta com assinatura HMAC, dedup por `wamid`, resolução `phone_number_id → Channel → Tenant`,
harness `ingest → guard.input → context.build → loop → guard.output → persist → dispatch`
com `claude-haiku-4-5`, `turnLock` por conversa, outbox com claim atômico + reaper,
janela de 24h, idle takeover sweep, golden set determinístico no CI.

### 6. `inbox-realtime` ✅

WebSocket (`ws`) no `crm-api`, alimentado por poller global ~2s ([AD-006](../.specs/STATE.md#ad-006)),
com fan-out por salas `tenant:<id>`/`tenant:<id>:conversation:<id>`. Leitura (`GET /conversations`,
`GET /conversations/:id/messages`), `takeover` reescrito como claim condicional com conflito
nomeado (409), reenvio de `Message failed` como clone, proxy de mídia sob demanda da Meta.
Telas de Inbox no `apps/web` (fila, thread, composer com fallback `wa.me` para janela fechada,
badge de takeover/release, preview de mídia). Verificado em 2 iterações do Verifier — 2 gaps
reais corrigidos (nome do assignee, resync de cache no reconnect WS), 6/6 mutações do sensor
de discriminação mortas.

### 7. `catalog-orders` ✅

Catálogo e pedidos, que destravaram o Anel B.

- **Models**: `Product` com schema fixo, fora do field-engine (preço inteiro em centavos,
  `stock`, `active`); `Order` com itens em snapshot (nome e preço do momento da criação).
- **`crm-api`**: CRUD de produtos; listagem, aprovação e rejeição de pedidos.
- **Tools**: `search_products` e `get_order_status` (Anel A); `create_order` (Anel B,
  idempotente por chave — a 1ª chamada cria o pedido `pending_approval`, a 2ª registra a
  confirmação do cliente).
- **Transição**: o pedido só vira `confirmed` com confirmação do cliente **e** aprovação do
  operador. Quem completar a segunda condição dispara a reserva atômica de estoque, com rollback
  compensatório se algum item faltar. A lógica vive uma vez só em
  `packages/db/src/orderTransitions.ts` ([AD-033](../.specs/STATE.md#ad-033)); os dois serviços
  escrevem em `orders`, cada um na sua fatia ([AD-032](../.specs/STATE.md#ad-032)).
- **`guard.output`**: todo valor em R$ sem lastro em tool result do mesmo turno vira `[removido]`.
- **UI**: telas de Produtos e Pedidos no `apps/web`, mais o card de pedido pendente inline no Inbox.

Verifier PASS na 1ª iteração: 27/27 critérios, 3/3 mutações do sensor mortas.

### 8. `payments-asaas` ✅

Cobrança Pix de pedido `confirmed` via Asaas ([AD-012](../.specs/STATE.md#ad-012),
[AD-034](../.specs/STATE.md#ad-034)).

- **Integração por tenant**: `/asaas-integrations` no `crm-api` valida a chave ao vivo, detecta
  o ambiente (sandbox ou produção) pelo prefixo, criptografa em repouso, registra o webhook no
  Asaas e devolve a chave mascarada na leitura. Ainda não há tela para isso no `apps/web`.
- **Tool `issue_payment_link`** (Anel B): gate estrutural, só emite para `Order confirmed`;
  idempotente por pedido (nunca uma 2ª cobrança); cria o cliente no Asaas sob demanda
  (`Customer.asaasCustomerId`); devolve o Pix copia-e-cola e o QR Code. `get_order_status`
  passou a trazer o status do pagamento.
- **Webhook** no `ai-gateway` (`/webhooks/asaas/:webhookToken`): token opaco por tenant na URL
  mais o header `asaas-access-token` comparado por hash; dedup por `AsaasEvent`; o status nunca
  regride; responde 200 mesmo quando o processamento falha (o evento fica `failed`).
- **Worker de reconciliação**: retenta eventos `failed`, consulta no Asaas todo `Payment pending`
  e expira os pendentes há mais de 24h, devolvendo o estoque e movendo o pedido para
  `payment_expired` (`packages/db/src/paymentTransitions.ts`).
- **UI**: badge de pagamento na tela de Pedidos.

Verifier PASS: 18/18 ACs. O sensor de discriminação deixou 1 mutante vivo em 5 (o filtro
atômico de `expireOrderPayment`, sem teste concorrente), fechado com um teste `Promise.all`.

---

## Superfície de tools (ADR-0004 / ADR-0009)

Fixa e idêntica entre tenants. 8 de 10 implementadas.

| Anel | Tool | Status | Nasce na feature |
|---|---|---|---|
| A | `get_process_template` | ✅ | 5 |
| A | `find_or_create_customer` | ✅ | 5 |
| A | `open_process` | ✅ | 5 |
| A | `set_process_fields` | ✅ | 5 |
| A | `search_products` | ✅ | 7 |
| A | `get_order_status` | ✅ | 7 (status de pagamento na 8) |
| A | `get_available_slots` | ⬜ | 9 |
| A | `book_appointment` | ⬜ | 9 |
| B | `create_order` | ✅ | 7 |
| B | `issue_payment_link` | ✅ | 8 |

---

## A fazer

### 9. `scheduling` 🔜

- Model de agenda (`Event`/`Appointment`), adiado explicitamente no `crm-core` (Deferred Ideas
  do [`context.md`](../.specs/features/crm-core/context.md))
- Tools `get_available_slots` e `book_appointment` (Anel A)
- Telas de agenda no `apps/web`

Adicionar as duas tools exige atualizar as asserções que fixam o tamanho da superfície (o teste
estrutural e os golden sets `happyPath`/`promptInjection`), como aconteceu na feature 8. Se a IA
e o operador forem escrever na agenda, o precedente é a divisão por write-path
([AD-032](../.specs/STATE.md#ad-032)) com a transição compartilhada em `packages/db`
([AD-033](../.specs/STATE.md#ad-033)).

**Ainda aberto (levar para o Discuss):** relação entre `Appointment` e o tipo de `Process`
"agendamento" que o [`glossary.md`](glossary.md) já cita como exemplo; de onde vem a
disponibilidade (por tenant, por operador ou por recurso); fuso horário e duração do slot;
corrida de dois clientes pelo mesmo horário; cancelamento e remarcação; lembrete antes do
horário (fora da janela de 24h exige template HSM, [ADR-0005](adr/0005-meta-cloud-api.md)).

**Dependências:** 6 (já entregue).

### 10. `kanban-tool` ⬜

Kanban livre como ferramenta à parte ([AD-011](../.specs/STATE.md#ad-011)): models `Board`/`Card`,
card referenciando um `Process` opcionalmente. **Não confundir** com o kanban de `Customer`
agrupado por `status` que a feature 4 já entregou — são dois modelos de coluna distintos
(ver [`glossary.md`](glossary.md), *Board/Card*).

**Dependências:** nenhuma — pode subir na fila se a prioridade mudar.

### 11. `ops-hardening` ⬜

Dívida transversal que só faz sentido com tráfego real:

- Replay de conversas reais anonimizadas antes de promover prompt ([AD-013](../.specs/STATE.md#ad-013)) —
  hoje só existe o golden set determinístico
- Retenção/LGPD de dado de conversa — marcada `N/A explícito` na varredura da feature 5
- Dashboards sobre o `prom-client` já instrumentado (`dbReqResTime`, latência HTTP por rota)
- Deploy e pin de versão de Node na CI (hoje `lts/*`, sem precedente de pin — ver [AD-031](../.specs/STATE.md#ad-031))
- Cache de prompt: só liga acima de 4096 tokens; revisar ao trocar `claude-haiku-4-5` por `claude-opus-5` ([AD-008](../.specs/STATE.md#ad-008))

**Dependências:** features com uso real em produção.

---

## Adiado sem feature atribuída

Itens que as features 7 e 8 tiraram de escopo (ver "Out of Scope" de cada `spec.md`) ou
deixaram pendentes, e que ainda não têm lugar no roadmap:

- **Pagamento**: boleto e cartão (hoje só Pix); reemitir cobrança depois de expirar; ações do
  operador sobre a cobrança (reenviar, cancelar, marcar como paga); tratar estorno e chargeback
  (hoje o status só é registrado); aviso automático ao cliente quando o pagamento cai (fora da
  janela de 24h exige template HSM); tela de configuração do Asaas no `apps/web`.
- **Pedidos**: editar itens de um pedido já criado; expirar `pending_approval` sozinho; avisar
  por WebSocket quando chega pedido novo; desconto, cupom e frete.
- **Limpeza**: `itemsMatch` duplicado entre `packages/db/src/orderTransitions.ts` e
  `packages/ai-kit/src/tools/createOrder.ts` (achado não bloqueante do Verifier da feature 7).
