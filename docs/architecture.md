# Arquitetura

Plataforma de CRM com atendimento a clientes por WhatsApp assistido por IA.
Decisões formais em [`docs/adr/`](adr/README.md); vocabulário em [`docs/glossary.md`](glossary.md);
sequência de entrega em [`docs/roadmap.md`](roadmap.md).

---

## Visão geral

```
      WhatsApp (Meta Cloud API) Asaas (Pix)
                 │ webhook         │ webhook
                 ▼                 ▼
        ┌──────────────────────────────┐      ┌──────────────────────┐
        │          ai-gateway          │      │       crm-api        │
        │ ──────────────────────────── │      │ ──────────────────── │
        │ webhooks Meta/Asaas + idemp. │      │ auth + tenancy       │
        │ harness Claude + guardrails  │      │ processos/campos     │
        │ outbox, reaper, idle sweep   │      │ catálogo/pedidos     │
        │ reconciliação Asaas          │      │ config Asaas         │
        └──────────────┬───────────────┘      │ WS inbox + poller    │
                       │                      └──────────┬───────────┘
                       │  mesma connection string        │
                       └────────────────┬────────────────┘
                                        ▼
                                 MongoDB (único)
                                        ▲
                                        │ HTTP + WS
                                 ┌──────┴──────┐
                                 │     web     │
                                 └─────────────┘
```

**Os dois serviços nunca se chamam.** Toda coordenação passa pelo Mongo, com dono único
de escrita por *write-path* — a granularidade é a fatia de escrita, não sempre a
collection inteira. Três collections (`customers`, `processes`, `orders`) já têm os dois
serviços escrevendo, cada um só na sua fatia, e o `stock` de `products` muda pelas
transições compartilhadas de `packages/db` que os dois chamam (ver tabela abaixo,
[AD-032](../.specs/STATE.md#ad-032) e [AD-033](../.specs/STATE.md#ad-033)). O front fala
HTTP e WebSocket apenas com o `crm-api`.

Chamadas para fora: o `ai-gateway` envia mensagens pela Meta Cloud API e cria e consulta
cobranças no Asaas. O `crm-api` só fala com o Asaas quando o admin salva a chave do tenant
(validação e registro do webhook), com um client próprio e pequeno
([AD-034](../.specs/STATE.md#ad-034)).

---

## Workspaces

```
CRM/
├── apps/
│   ├── crm-api/          Express + Mongoose — CRM, tenancy, auth, catálogo/pedidos, config Asaas, inbox (WS)
│   ├── ai-gateway/       Express + Mongoose — webhooks Meta/Asaas, harness, fila de envio, reconciliação
│   └── web/              Vite + React 19 + TanStack Router/Query + ShadCN + Tailwind 4
├── packages/
│   ├── contracts/        Schemas Zod + tipos de domínio (fonte da verdade única)
│   ├── db/               Models Mongoose + conexão + índices + transições compartilhadas
│   ├── field-engine/     Motor de campos dinâmicos — isomórfico
│   └── ai-kit/           Cliente Anthropic, loop de tools, guardrails, montagem de prompt
├── evals/                Golden set determinístico + runner (replay: feature 11)
└── docs/
```

Nenhum app declara model Mongoose próprio — todos vêm de `packages/db`. O mesmo vale para
transição de negócio multi-documento que os dois serviços disparam
(`orderTransitions.ts`, `paymentTransitions.ts`): mora uma vez só em `packages/db`
([AD-033](../.specs/STATE.md#ad-033)).

---

## Propriedade de escrita por collection

Invariante do projeto ([ADR-0002](adr/0002-dois-servicos-um-mongo-sem-chamada-entre-eles.md)),
refinado por [AD-032](../.specs/STATE.md#ad-032): ninguém escreve na fatia do outro.

| Collection | Escreve | Lê |
|---|---|---|
| `messages` (`direction: 'in'`) | `ai-gateway` | ambos |
| `messages` (`direction: 'out'`) | `crm-api` cria como `queued`; `ai-gateway` só transiciona status | ambos |
| `conversations` | `ai-gateway` | ambos |
| `aiSessions` | `ai-gateway` | `ai-gateway` |
| `customers` | `crm-api` (CRUD do operador) e `ai-gateway` (`find_or_create_customer`) — cada um só na sua fatia, ver [AD-032](../.specs/STATE.md) | ambos |
| `processes` | `crm-api` (CRUD do operador) e `ai-gateway` (`open_process`, `set_process_fields`) — cada um só na sua fatia, ver [AD-032](../.specs/STATE.md) | ambos |
| `fieldTemplates`, `fieldTemplateVersions` | `crm-api` | ambos |
| `products` | `crm-api` (CRUD do catálogo). O `stock` também muda pelas transições compartilhadas de `packages/db`: reserva na confirmação do pedido (`orderTransitions.ts`, chamada pelos dois serviços) e devolução na expiração do pagamento (`paymentTransitions.ts`, só o `ai-gateway`) | ambos |
| `orders` | `crm-api` (aprovar/rejeitar) e `ai-gateway` (`create_order`: criação e confirmação do cliente; `payment_expired` pelo worker de reconciliação) — transições centralizadas em `packages/db` (`orderTransitions.ts`, `paymentTransitions.ts`), nunca duplicadas por app, ver [AD-032](../.specs/STATE.md#ad-032)/[AD-033](../.specs/STATE.md#ad-033) | ambos |
| `payments` | `ai-gateway` (`issue_payment_link`, webhook do Asaas, worker de reconciliação), ver [AD-034](../.specs/STATE.md#ad-034) | ambos (`crm-api` só lê, para o badge em Pedidos) |
| `asaasEvents` | `ai-gateway` (webhook do Asaas e worker de reconciliação) | `ai-gateway` |
| `asaasIntegrations` | `crm-api` (configuração da chave pelo admin do tenant) | ambos |
| `tenants`, `users`, `channels` | `crm-api` | ambos |
| `invites` | `crm-api` | `crm-api` |
| `sessions` | `crm-api` | `crm-api` |
| `professionals`, `spaces`, `schedulingSettings` | `crm-api` | ambos |
| `appointments` | `crm-api` (CRUD do operador: criar manual, cancelar, remarcar, bloquear; e a rota **pública** de confirmação) e `ai-gateway` (`book_appointment`) — cada um só na sua fatia; a garantia contra dupla reserva é um índice único parcial no banco, não checagem prévia em código, ver [AD-035](../.specs/STATE.md#ad-035) | ambos |
| `boards` (kanban, feature 10 — ainda não existe) | `crm-api` | `crm-api` |

---

## Fluxos principais

### Mensagem recebida

```
Meta webhook
  → ai-gateway: dedup por wamid
  → resolve phone_number_id → Channel → Tenant
  → guard.input (rate limit, mídia, injeção)
  → conversation.mode === 'human'? → só persiste, não chama modelo
  → context.build (system congelado + dinâmico no turno de usuário + janela de histórico)
  → loop de tools com ToolContext (tenant server-side)
  → guard.output (vazamento, preços, tamanho)
  → persist (messages, aiSession, escritas no CRM)
  → dispatch (insere out como queued)
```

### Operador envia

```
web → crm-api: insere message out { status: 'queued' }
ai-gateway: findOneAndUpdate atômico → 'sending'
  → checa janela de 24h (fora dela, só template aprovado)
  → chama Meta → grava wamid → 'sent'  |  erro → 'failed'
reaper: 'sending' há mais de N segundos → volta a 'queued'
```

### Inbox ao vivo

```
crm-api: poller ~2s sobre messages, updatedAt > lastTick,
         SÓ para tenants com socket conectado
  → fan-out em salas WS tenant:conversation
```

### Pedido e pagamento

```
cliente pede na conversa
  → create_order (1ª chamada) → Order pending_approval
  → cliente confirma → create_order (2ª chamada) → customerConfirmed   ┐ em qualquer
  → operador aprova no crm-api → operatorApproved                     ┘ ordem
  → quem completar a 2ª condição: reserva atômica de estoque → confirmed
      falta estoque → segue pending_approval com confirmFailureReason
  → operador rejeita → rejected (terminal, estoque intocado)

Order confirmed
  → issue_payment_link → cobrança Pix no Asaas → Payment pending
  → webhook Asaas → dedup por AsaasEvent → status aplicado sem regredir → paid
reconciliação (ai-gateway): retenta AsaasEvent failed; consulta todo Payment pending;
  pending há mais de 24h → expired, devolve estoque, Order → payment_expired
```

### Agendamento

```
cliente pede horário na conversa
  → get_available_slots(date, professionalId?)
      grade semanal de cada Professional ativo, menos Appointment
      pending/confirmed e Block do intervalo → slots livres + agendamentos
      futuros do próprio cliente
  → cliente escolhe → book_appointment(professionalId, start, spaceId?)
      índice único parcial {Tenant,professional,start} elege 1 vencedor
      entre reservas concorrentes (E11000 pro perdedor) → Appointment
      pending + token de confirmação; IA devolve o link na mesma resposta

cliente confirma/cancela pelo link público (?token=, sem sessão, por hash)
  → GET/POST /appointment-confirmations/:token
  → confirm: pending → confirmed (idempotente)
  → cancel: → canceled_by_customer, horário liberado

operador na tela de Agenda (crm-api)
  → cria manual (encaixe fora da grade permitido), cancela, remarca, bloqueia
  → cancelar/remarcar com a janela de 24h aberta → aviso automático na
    outbox; fechada → botão wa.me, nenhuma chamada direta à Meta
```

---

## Motor de campos dinâmicos

Definição e valor vivem separados; o render junta os dois
([ADR-0003](adr/0003-definicao-e-valor-separados.md)).

O motor é **genérico por tipo de entidade** (AD-019): as mesmas duas collections servem
`customer` e `process`, discriminadas por `targetType` — um único par, nunca um par por
entidade (AD-020).

```ts
// fieldTemplates — mutável, aponta a versão corrente
{ _id, Tenant, targetType: 'process', key: 'compra', name, currentVersion: 3, archived }
{ _id, Tenant, targetType: 'customer', key: 'default', name, currentVersion: 1, archived }

// fieldTemplateVersions — snapshot IMUTÁVEL
{ _id, Tenant, template, targetType: 'process', version: 3, fields: FieldDef[],
  stages: ['aguardando_pagamento', 'pago', 'concluido'] }

// processes — só os valores
{ _id, Tenant, template: 'compra', templateVersion: 3, Customer,
  stage: 'aguardando_pagamento',
  values: { f1: 'urgente', f2: { assetId, filename, mime, size }, f3: [2, 5] } }

// customers — núcleo fixo mais os valores
{ _id, Tenant, name, phone, document, template, templateVersion: 1,
  values: { status: 'novo' } }
```

Todo Tenant recém-provisionado nasce com um `fieldTemplates` de `targetType: 'customer'`,
`key: 'default'`, versão 1, contendo o campo `status` — seed idempotente, nunca uma rota.
`process` não tem template padrão: o tipo de processo é decisão de negócio do tenant.

### Tipos de campo (v1)

| Tipo | Config | Forma do `value` |
|---|---|---|
| `text` | `multiline`, `min/maxLength`, `pattern` | `string` |
| `number` | `min`, `max`, `integer`, `step` | `number` |
| `currency` | `code`, `precision` | `number` (**inteiro em centavos**) |
| `percent` | `precision` | `number` |
| `boolean` | — | `boolean` |
| `date` / `datetime` | `timezone` | ISO 8601 `string` |
| `select` | `options[]`, `multiple` | `string` \| `string[]` |
| `status` | `options[]` com `key/label/color/order` | `string` |
| `document` | `accept[]`, `maxSizeMb`, `multiple` | `{ assetId, filename, mime, size }` |
| `reference` | `target: customer\|product\|user\|process`, `multiple` | `ObjectId` \| `ObjectId[]` |
| `array` | `of: FieldDef` (**recursivo**) | `Value[]` |
| `group` | `fields: FieldDef[]` | `Record<fieldId, Value>` |

`array` de `group` resolve itens de pedido (produto + qtd + preço por linha).

### API

```ts
hydrate(fields: FieldDef[], values: FieldValues): RenderNode[]   // node = { ...FieldDef, value }
validate(fields: FieldDef[], values: FieldValues): Result        // Zod construído da árvore
toToolSchema(fields: FieldDef[]): JSONSchema                     // vai no tool RESULT
```

No front, um único `<FieldRenderer node>` faz `switch (node.type)` e recorre em
`array`/`group`, em modo `edit` ou `view`.

### Consulta

Wildcard index `{ "values.$**": 1 }` para filtro ad-hoc; índice dedicado para campos que
viram filtro fixo de tela.

### Evolução de template

- **Aditiva** (campo opcional novo, label, ordem, opção nova): bump de versão, sem migração.
- **Destrutiva** (remover campo, trocar tipo, remover opção em uso): passo de migração
  explícito que descarta ou mapeia o valor. Nunca silencioso.

---

## Harness de IA

Pipeline de etapas puras em `packages/ai-kit`:

| Etapa | Responsabilidade |
|---|---|
| `ingest` | Normaliza payload, deduplica por `wamid`, resolve `phone_number_id → Tenant` |
| `guard.input` | Rate limit por contato, tamanho e tipo de mídia, injeção de prompt, blocklist |
| `context.build` | System **congelado** + bloco dinâmico no turno de usuário + janela de histórico com sumário rolante |
| `loop` | Tool runner com `ToolContext` server-side, teto de iterações, `TenantScopedRepo` |
| `guard.output` | Vazamento entre contatos, preço só de tool result do mesmo turno (senão `[removido]`), tamanho, IDs internos |
| `persist` | Mensagens, sessão, escritas no CRM |
| `dispatch` | Insere na outbox |

### Superfície de tools

**Anel A (autônomo):** `get_process_template`, `search_products`,
`find_or_create_customer`, `open_process`, `set_process_fields`, `get_order_status`,
`get_available_slots`, `book_appointment`.

**Anel B (exige aprovação):** `create_order` grava `pending_approval` e só vira `confirmed`
com confirmação explícita do cliente **e** liberação do operador; `issue_payment_link` só
emite cobrança para pedido já `confirmed`. Os dois gates vivem em código, não no prompt.

10/10 tools implementadas — `scheduling` (feature 9) fechou a superfície prevista no
[ADR-0004](adr/0004-superficie-de-tools-fixa.md) com `get_available_slots`/`book_appointment`.

A superfície é fixa e idêntica entre tenants. O schema dinâmico chega por tool *result*
([ADR-0004](adr/0004-superficie-de-tools-fixa.md)).

### Modelo

`claude-haiku-4-5`, sem sufixo de data. Consequências assumidas
([ADR-0008](adr/0008-modelo-claude-haiku-4-5.md)):

- Prompt cache só a partir de 4096 tokens — o prefixo atual não cacheia. A disciplina de
  montagem é mantida para que trocar por `claude-opus-5` ligue o cache sem refatorar.
- Sem `role: "system"` no meio da conversa — o contexto dinâmico vai no turno de usuário,
  **nunca** interpolado no system prompt.
- Thinking desligado no loop de WhatsApp.

---

## Convenção de tempo

Regra do projeto inteiro, nascida em `scheduling` (feature 9,
[AD-036](../.specs/STATE.md#ad-036)) e válida para toda feature futura que grave data/hora:

- **Instante** (ex.: `Appointment.start`/`end`) é sempre gravado em UTC, sem exceção.
- **Regra recorrente** (ex.: a grade semanal de um `Professional`) não é um instante — vive
  em hora de parede (`HH:mm`) e é interpretada só na constante de exibição,
  `DISPLAY_TIMEZONE` (`packages/contracts`, hoje `'America/Sao_Paulo'`).
- A conversão hora de parede ↔ instante resolve o offset via `Intl.DateTimeFormat` na data
  alvo, nunca por offset fixo em string — sobrevive a uma eventual volta do horário de
  verão brasileiro.
- A conversão pra hora local só acontece na borda de apresentação (tela do `web`, texto que
  a IA manda) — nenhuma outra camada faz essa conta. A API do operador recebe data/hora em
  hora de parede e converte no service; o `web` só formata UTC → exibição, nunca no sentido
  contrário (não importa `packages/db`, só `packages/contracts`).

---

## Convenções portadas

Do [`DentalEase-BackEnd`](../../DentalEase/DentalEase-BackEnd/CLAUDE.md):

- `Route → Controller → Service → Repository → Mongo`
- Services não importam de outros `.service.ts` — usar `services/shared/` ou use-cases
- Mongoose isolado em `repositories/` e `database/`
- Zod é fonte única de validação; nenhuma checagem manual que duplique um schema
- Response `{ success, data?, message? }`; rotas `/partial` para alimentar comboboxes
- Tenant do middleware, no padrão do `clinicAssignmentCheck`

Do [`DentalEase` front](../../DentalEase/DentalEase/CLAUDE.md):

- ShadCN sempre, HTML estilizado nunca
- Página = `createFileRoute()` + `<Card asPage>`; comum = `Item`/`ItemGroup`
- Listagem = `<DataTable>`; loading/vazio = `<DefaultLoading>`/`<DefaultEmptyData>`
- Rotas por diretório com `index.tsx`; detalhe via `search: { id }`, não `$id`
- `@components/ @consts/ @hooks/ @interface/ @utils/` por rota
- Toda string por `t()`; chave genérica por conceito, nunca por tela
- TanStack Query dona da verdade da API; Zustand só para UI

---

## Verificação end-to-end

| Área | O que provar |
|---|---|
| Motor de campos | `array` em `group` em `array` persiste e renderiza sem perder tipo; registro em versão antiga renderiza após bump |
| Isolamento de tenant | Dois tenants espelhados, nenhuma rota/tool/query cruza dado; teste estrutural varre `input_schema` por campo de tenant |
| Canal | Mesmo webhook duas vezes → uma `Message`; dois consumidores na mesma outbox → um envio; fora da janela de 24h → erro legível na UI |
| Inbox | Dois operadores recebem pelo WS; takeover silencia o bot; ociosidade devolve a `bot` |
| Dinheiro | `issue_payment_link` não cobra pedido que não esteja `confirmed`; pedido nasce `pending_approval`; webhook repetido do Asaas processa uma vez; status de pagamento não regride; `Payment` pendente há mais de 24h expira e devolve o estoque |
| Caching | Dois requests idênticos; `skip` explícito enquanto o prefixo estiver abaixo do mínimo do Haiku 4.5 |

Comandos (na raiz):

- `pnpm run check` — Build gate completo (`tsc --noEmit` + `biome check .` + `vitest run`), o mesmo da CI
- `pnpm vitest run --project unit --project structural` — Quick gate
- `pnpm run evals` — golden set
- `pnpm run format` — Biome

Dev local: `pnpm --filter <crm-api|ai-gateway|web> run dev`, com um MongoDB rodando à parte
(não há `docker-compose` no repo). Todos usam o `.env` único da raiz
([AD-018](../.specs/STATE.md#ad-018)): o `web` lê via `envDir`, mas os backends não carregam
arquivo nenhum sozinhos — as variáveis precisam estar no ambiente (ex.:
`tsx watch --env-file=<raiz>/.env src/server.ts`). Primeiro admin de plataforma:
`pnpm --filter crm-api run seed:platform-admin`.
