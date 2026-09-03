# Arquitetura

Plataforma de CRM com atendimento a clientes por WhatsApp assistido por IA.
Decisões formais em [`docs/adr/`](adr/README.md); vocabulário em [`docs/glossary.md`](glossary.md).

---

## Visão geral

```
        WhatsApp (Meta Cloud API)
                 │  webhook
                 ▼
        ┌──────────────────┐            ┌──────────────────┐
        │   ai-gateway     │            │     crm-api      │
        │ ────────────────  │            │ ──────────────── │
        │ webhook + idemp. │            │ auth + tenancy   │
        │ harness Claude   │            │ processos/campos │
        │ guardrails       │            │ catálogo/pedidos │
        │ consumidor outbox│            │ WS inbox + poller│
        └────────┬─────────┘            └────────┬─────────┘
                 │        mesma connection string │
                 └───────────────┬────────────────┘
                                 ▼
                          MongoDB (único)
                                 ▲
                                 │ HTTP + WS
                          ┌──────┴──────┐
                          │     web     │
                          └─────────────┘
```

**Os dois serviços nunca se chamam.** Toda coordenação passa pelo Mongo, com dono único
de escrita por collection. O front fala HTTP e WebSocket apenas com o `crm-api`.

---

## Workspaces

```
CRM/
├── apps/
│   ├── crm-api/          Express + Mongoose — CRM, tenancy, auth, catálogo, inbox (WS)
│   ├── ai-gateway/       Express + Mongoose — webhook Meta, harness, fila de envio
│   └── web/              Vite + React 19 + TanStack Router/Query + ShadCN + Tailwind 4
├── packages/
│   ├── contracts/        Schemas Zod + tipos de domínio (fonte da verdade única)
│   ├── db/               Models Mongoose + conexão + índices (dono único dos schemas)
│   ├── field-engine/     Motor de campos dinâmicos — isomórfico
│   └── ai-kit/           Cliente Anthropic, loop de tools, guardrails, montagem de prompt
├── evals/                Golden set + runner + replay anonimizado
└── docs/
```

Nenhum app declara model Mongoose próprio — todos vêm de `packages/db`.

---

## Propriedade de escrita por collection

Invariante do projeto ([ADR-0002](adr/0002-dois-servicos-um-mongo-sem-chamada-entre-eles.md)).
Ninguém escreve na collection do outro.

| Collection | Escreve | Lê |
|---|---|---|
| `messages` (`direction: 'in'`) | `ai-gateway` | ambos |
| `messages` (`direction: 'out'`) | `crm-api` cria como `queued`; `ai-gateway` só transiciona status | ambos |
| `conversations` | `ai-gateway` | ambos |
| `aiSessions` | `ai-gateway` | `ai-gateway` |
| `customers` | `crm-api` | ambos |
| `processes` | `crm-api` | ambos |
| `fieldTemplates`, `fieldTemplateVersions` | `crm-api` | ambos |
| `products`, `orders` | `crm-api` | ambos |
| `tenants`, `users`, `channels` | `crm-api` | ambos |
| `invites` | `crm-api` | `crm-api` |
| `sessions` | `crm-api` | `crm-api` |
| `boards` (kanban) | `crm-api` | `crm-api` |

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
{ _id, Tenant, template, targetType: 'process', version: 3, fields: FieldDef[] }

// processes — só os valores
{ _id, Tenant, template: 'compra', templateVersion: 3, Customer,
  stage: 'aguardando_pagamento',
  values: { f1: 'urgente', f2: { assetId, filename, mime, size }, f3: [2, 5] } }

// customers — núcleo fixo mais os valores
{ _id, Tenant, name, phone, template, templateVersion: 1,
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
| `guard.output` | Vazamento entre contatos, preço só de tool result desta conversa, tamanho, IDs internos |
| `persist` | Mensagens, sessão, escritas no CRM |
| `dispatch` | Insere na outbox |

### Superfície de tools

**Anel A (autônomo):** `get_process_template`, `search_products`,
`find_or_create_customer`, `open_process`, `set_process_fields`, `get_order_status`,
`get_available_slots`, `book_appointment`.

**Anel B (exige aprovação):** `create_order`, `issue_payment_link` — gravam
`pending_approval` e exigem confirmação explícita do cliente **e** liberação do operador.

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
| Dinheiro | `issue_payment_link` não é chamada antes da confirmação; pedido nasce `pending_approval` |
| Caching | Dois requests idênticos; `skip` explícito enquanto o prefixo estiver abaixo do mínimo do Haiku 4.5 |

Comandos: `pnpm run check` (typecheck) · `pnpm run format` (Biome) · `pnpm test` ·
`pnpm run evals` · `docker compose up` sobe Mongo e os dois serviços.
