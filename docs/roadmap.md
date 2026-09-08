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
| 6 | `inbox-realtime` | 🔜 | — | — |
| 7 | `catalog-orders` | ⬜ | — | — |
| 8 | `payments-asaas` | ⬜ | — | — |
| 9 | `scheduling` | ⬜ | — | — |
| 10 | `kanban-tool` | ⬜ | — | — |
| 11 | `ops-hardening` | ⬜ | — | — |

Baseline atual: **739 testes passando**, `tsc --noEmit` limpo, `biome check .` limpo,
CI rodando o Build gate em todo push/PR ([AD-031](../.specs/STATE.md)).

> As features 6 a 11 tiveram nome e escopo derivados dos ADRs ainda não implementados e dos
> itens adiados nos "Out of Scope" das specs 1–5. A numeração "de 11" já era usada no
> `STATE.md` desde a feature 1, mas a lista nunca havia sido escrita — este arquivo é essa lista.

---

## Entregue

### 1. `foundation-tenancy-auth` ✅

Multi-tenancy, autenticação e RBAC. `Tenant`, `User`, `Invite`, `Session`;
convite → definição de senha → login; sessão de token único verificada no banco
([AD-014](../.specs/STATE.md)); `isPlatformAdmin` fora de tenant ([AD-016](../.specs/STATE.md));
seed idempotente do primeiro admin de plataforma ([AD-018](../.specs/STATE.md)).

### 2. `dynamic-field-engine` ✅

`packages/field-engine` isomórfico + `FieldTemplate`/`FieldTemplateVersion`.
Definição e valor separados ([AD-003](../.specs/STATE.md)), snapshot imutável por versão,
`diffFields` classificando mudança aditiva vs. destrutiva, migração com guarda de slot de versão.

### 3. `crm-core` ✅

`Customer` e `Process` com valores de campo dinâmico, listagem, filtro por `status`,
ordenação e rotas `/partial`. Instrumentação `dbReqResTime` nos repositórios.

### 4. `crm-web-shell` ✅

`apps/web` com TanStack Router file-based ([AD-030](../.specs/STATE.md)), ShadCN, render
recursivo de campo dinâmico, telas de Customer (lista, kanban por `status`, add, details)
e de Process (lista, add, details).

### 5. `ai-gateway` ✅

Webhook Meta com assinatura HMAC, dedup por `wamid`, resolução `phone_number_id → Channel → Tenant`,
harness `ingest → guard.input → context.build → loop → guard.output → persist → dispatch`
com `claude-haiku-4-5`, `turnLock` por conversa, outbox com claim atômico + reaper,
janela de 24h, idle takeover sweep, golden set determinístico no CI.

---

## Superfície de tools (ADR-0004 / ADR-0009)

Fixa e idêntica entre tenants. 4 de 10 implementadas.

| Anel | Tool | Status | Nasce na feature |
|---|---|---|---|
| A | `get_process_template` | ✅ | 5 |
| A | `find_or_create_customer` | ✅ | 5 |
| A | `open_process` | ✅ | 5 |
| A | `set_process_fields` | ✅ | 5 |
| A | `search_products` | ⬜ | 7 |
| A | `get_order_status` | ⬜ | 7 |
| A | `get_available_slots` | ⬜ | 9 |
| A | `book_appointment` | ⬜ | 9 |
| B | `create_order` | ⬜ | 7 |
| B | `issue_payment_link` | ⬜ | 8 |

---

## A fazer

### 6. `inbox-realtime` 🔜

Superfície humana da conversa. Hoje o bot atende e ninguém do time enxerga: o takeover
existe como endpoint, sem tela.

**O que já existe:** `Conversation`, `Message`, `AiSession`, `Channel`; `POST /conversations/:id/takeover`,
`/release` e `/messages` ([conversation.router.ts](../apps/crm-api/src/routers/conversation.router.ts));
`lastInboundAt` / `windowExpiresAt` no `Conversation`; idle sweep devolvendo a conversa ao bot.

**O que falta:**
- WebSocket no `crm-api` alimentado por poller (~2s) que só varre tenants com socket conectado
  ([AD-006](../.specs/STATE.md)) — **nenhuma linha existe hoje**, nem dependência `ws` em nenhum `package.json`
- Leitura: `GET /conversations` (fila, não lidas, filtro por `mode`/assignee) e `GET /conversations/:id/messages` (paginado)
- Telas de Inbox no `apps/web`: fila, thread, composer, indicador de `mode` bot/human, takeover/release
- Reenvio manual de `Message` com `status: failed` — adiado explicitamente pela feature 5
- Envio de template HSM quando a janela de 24h estiver fechada

**Decisões já tomadas (Discuss, 2026-09-08):**

| Questão | Decisão |
|---|---|
| Auth do WebSocket | Cookie httpOnly do [AD-014](../.specs/STATE.md) validado no handshake — sem ticket de conexão, sem access token separado |
| Escopo do push | Só mensagens novas. Mudança de `mode` e transição de `status` de envio não são empurradas nesta rodada |
| Janela de 24h na UI | Sem campo novo: a UI deriva o estado de `windowExpiresAt`/`lastInboundAt`, que o `ai-gateway` já grava, mais os `createdAt`/`updatedAt` do `timestamps: true` |

**Ainda aberto (levar para o Discuss/Specify):** de onde vem o nome do template HSM (a plataforma
não integra a API de gestão de templates da Meta); como a UI renderiza mídia recebida
(só o ponteiro da Meta é guardado, nunca o binário); atribuição de conversa por operador e
corrida de dois takeovers simultâneos; comportamento do poller com múltiplas instâncias do `crm-api`.

**Dependências:** nenhuma.

### 7. `catalog-orders` ⬜

Catálogo e pedidos — destrava o Anel B inteiro.

- Models `Product` e `Order` (nenhum existe hoje)
- Tools `search_products` e `get_order_status` (Anel A)
- Anel B: `create_order` nascendo `pending_approval`, confirmação explícita do cliente **e**
  liberação do operador, transição `pending_approval → confirmed` ([AD-009](../.specs/STATE.md))
- Regra pendente de `guard.output`: "preço só de tool result desta conversa" — a feature 5 a
  adiou por não ter nenhuma tool que retornasse preço

**Dependências:** 6 (a liberação do operador acontece no Inbox).

### 8. `payments-asaas` ⬜

- Integração Asaas com chave por tenant criptografada em repouso ([AD-012](../.specs/STATE.md))
- Webhook com resolução de tenant e conciliação
- Tool `issue_payment_link` (Anel B) — nunca chamada antes da confirmação

**Dependências:** 7 (`Order`).

### 9. `scheduling` ⬜

- Model de agenda (`Event`/`Appointment`) — adiado explicitamente no `crm-core`
- Tools `get_available_slots` e `book_appointment` (Anel A)
- Telas de agenda no `apps/web`

**Dependências:** 6.

### 10. `kanban-tool` ⬜

Kanban livre como ferramenta à parte ([AD-011](../.specs/STATE.md)): models `Board`/`Card`,
card referenciando um `Process` opcionalmente. **Não confundir** com o kanban de `Customer`
agrupado por `status` que a feature 4 já entregou — são dois modelos de coluna distintos
(ver [`glossary.md`](glossary.md), *Board/Card*).

**Dependências:** nenhuma — pode subir na fila se a prioridade mudar.

### 11. `ops-hardening` ⬜

Dívida transversal que só faz sentido com tráfego real:

- Replay de conversas reais anonimizadas antes de promover prompt ([AD-013](../.specs/STATE.md)) —
  hoje só existe o golden set determinístico
- Retenção/LGPD de dado de conversa — marcada `N/A explícito` na varredura da feature 5
- Dashboards sobre o `prom-client` já instrumentado (`dbReqResTime`, latência HTTP por rota)
- Deploy e pin de versão de Node na CI (hoje `lts/*`, sem precedente de pin — ver [AD-031](../.specs/STATE.md))
- Cache de prompt: só liga acima de 4096 tokens; revisar ao trocar `claude-haiku-4-5` por `claude-opus-5` ([AD-008](../.specs/STATE.md))

**Dependências:** features com uso real em produção.
