# ai-gateway Design

**Spec**: `.specs/features/ai-gateway/spec.md`
**Status**: Draft

---

## Architecture Overview

Três decisões de abordagem confirmadas com o usuário antes deste desenho (ver
`context.md`/thread de aprovação):

1. **Acesso a dados das tools**: `packages/ai-kit` implementa sua própria camada fina de
   acesso a `packages/db` (`Customer`/`Process`/`FieldTemplate`/`FieldTemplateVersion`) +
   `packages/field-engine` (`validate`/`hydrate`/`toToolSchema`, já isomórfico) — sem
   importar nada de `apps/crm-api`. Duplica uma fatia pequena de regra (stage inicial,
   ponteiro `template`/`templateVersion`), no mesmo espírito do adapter fino de
   `FieldValueStore` (AD-021). `crm-core` não é reaberto.
2. **Serialização de turno por Conversation**: claim atômico no Mongo
   (`findOneAndUpdate` em `Conversation.turnLock`), **o mesmo padrão exato** do claim da
   outbox (ADR-0007) — coordenação só via banco (AD-002), funciona igual com 1 ou N
   instâncias do `ai-gateway`.
3. **Modelo do webhook**: síncrono, um request HTTP só. `ingest → guard.input →
   context.build → loop → guard.output → persist → dispatch` roda inteiro dentro do
   handler; erro interno é capturado e ainda responde 200 (AIG-07/08) — sem fila,
   sem processamento em background, sem janela de perda por crash pós-ack.

```mermaid
graph TD
  Meta[Meta Cloud API] -- POST /webhooks/whatsapp --> WH[ai-gateway: webhook handler]
  WH -- verifica X-Hub-Signature-256 --> WH
  WH --> ING[ingest: dedup wamid, resolve Channel→Tenant, claim turnLock]
  ING --> GI[guard.input: rate limit, tipo, tamanho]
  GI --> MODE{mode === 'human'?}
  MODE -- sim: só persistiu 'in', para aqui --> WH
  MODE -- não --> CB[context.build: system congelado + turno dinâmico + histórico]
  CB --> LP[loop: Anthropic claude-haiku-4-5 + 4 tools Anel A]
  LP --> GO[guard.output: tamanho 1600, redige ObjectId]
  GO --> PS[persist: Message out + AiSession]
  PS --> DP[dispatch: Message out status=queued]
  DP --> WH
  WH -- 200 --> Meta

  DP -.-> OUTBOX[(messages queued)]
  MAN[crm-api: POST /conversations/:id/messages] -.-> OUTBOX
  OUTBOX --> CONS[ai-gateway: outbox consumer — claim atômico]
  CONS -- janela 24h ok --> SEND[Meta Send API]
  SEND -- wamid --> OUTBOX
  CONS -.stuck > 60s.-> REAPER[reaper: sending→queued]

  TAKE[crm-api: POST /conversations/:id/takeover|release] --> CONV[(conversations)]
  IDLE[ai-gateway: idle sweep — 30min sem atividade] --> CONV
  CHAN[crm-api: POST /channels] --> CHANDB[(channels, token AES-256-GCM)]
  WH --> CHANDB
```

`packages/ai-kit` expõe só funções puras por etapa (testáveis isoladas, arquitetura.md).
`apps/ai-gateway` orquestra: webhook handler chama `runTurn()` do `ai-kit`; dois workers
de intervalo (`outboxConsumer`, `reaper`) e um terceiro (`idleTakeoverSweep`) rodam em
paralelo, todos coordenados só via Mongo — nenhum chama o outro serviço (AD-002).

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| `tenantScoped<F extends {Tenant}>` | `packages/db/src/tenantScoped.ts` | Toda query da camada fina de `ai-kit` passa por aqui — mesma garantia de tipo do AD-010 |
| `checkRole`/`isAdmin` | `apps/crm-api/src/middlewares/authorization.middleware.ts` | Guarda dos 3 endpoints novos (`isAdmin` no Channel; `checkRole(['admin','gestor','operador'])` em takeover/envio manual) |
| `respObj` / `CustomError` | `packages/contracts`, `apps/crm-api/src/middlewares/errorHandler.middleware.ts` | Resposta `{success,data?,message?}` nos 3 controllers novos |
| `parseEnv`/`envSchema` (Zod, `safeParse`, erro nomeia a var ausente) | `apps/{crm-api,ai-gateway}/src/config/env.config.ts` | Estende os dois `envSchema` com as vars novas (ver Tech Decisions) |
| `transitionTenantStatus` (guard de transição pela própria query, não por `if`) | `packages/db/src/models/tenant.model.ts` | Molde para `Conversation.mode` bot⇄human e `Message.status` (`queued→sending`, `sending→sent\|failed`) |
| `validate`/`hydrate`/`toToolSchema` | `packages/field-engine/src` | `set_process_fields` (validate), `get_process_template` (toToolSchema), render de `stages` |
| `fieldTemplate.repository.findCurrentVersion` (padrão de leitura) | `apps/crm-api/src/repositories/fieldTemplate.repository.ts` | Molde para a camada fina de `ai-kit` ler `FieldTemplateVersion` corrente (não importa o arquivo, replica a assinatura/consulta) |
| Crypto helper — AES-256-GCM, `EncryptedSecret{ciphertext,iv,authTag}`, `maskSecret`, `sha256` | `DentalEase-BackEnd/src/helpers/crypto.helper.ts` (referência externa, **portar** para `packages/db/src/crypto.helper.ts`) | Criptografia do token do `Channel` — mesmo algoritmo/formato já usado em produção lá para o Asaas |
| Loop de tools — `ToolContext`, `MAX_TOOL_ITERATIONS`, `extractText`, `is_error` | `DentalEase-BackEnd/src/use-cases/assistant-chat.use-case.ts` + `assistant-tools.ts` (referência externa, padrão a replicar, não importar — projeto diferente) | `packages/ai-kit/src/loop.ts` — generaliza para 2 anéis (só Anel A ativo) e tenant vindo do `Channel` |
| Claim atômico da outbox (`findOneAndUpdate` ordenado, ADR-0007) | Só existe como decisão (ADR-0007), ainda sem código | Primeira vez que vira código real — molde para o `turnLock` de `Conversation` também |

### Integration Points

| System | Integration Method |
| --- | --- |
| MongoDB | Mesma connection string de `packages/db`, novos models `Channel`/`Conversation`/`Message`/`AiSession`. Nenhum app declara model próprio (regra já ativa) |
| Anthropic API | `@anthropic-ai/sdk`, `claude-haiku-4-5`, chamado só de dentro de `packages/ai-kit/src/providers/anthropicClient.ts` |
| Meta Cloud API | Webhook (`GET`/`POST`) + Send API (`POST /{phone_number_id}/messages`) + Media API (`GET /{media-id}` → URL temporária → download) |
| OpenAI Whisper API | Novo pacote `openai`, chamado só de `packages/ai-kit/src/providers/whisperClient.ts` (P2) |

---

## Components

### `packages/ai-kit` — novo pacote

- **Purpose**: Pipeline puro `ingest→guard.input→context.build→loop→guard.output→persist→dispatch`
  + os 4 tool executors do Anel A.
- **Location**: `packages/ai-kit/src/`
- **Interfaces**:
  - `runTurn(input: { channel: ChannelDocument; wamid: string; from: string; type: string; text?: string; mediaId?: string }): Promise<TurnOutcome>` — orquestra as 7 etapas; é a única função que `apps/ai-gateway` chama
  - `ingest(input): Promise<{ conversation; customer; message; isDuplicate: boolean }>` — dedup por `wamid` (insert com `unique index`, `duplicate key` vira no-op), resolve `Channel→Tenant`, `findOrCreateConversation({Channel,Customer})`, reivindica `turnLock` (retry curto com timeout — ver Error Handling)
  - `guardInput(message, conversation): Promise<{ ok: true; text: string } | { ok: false; fixedReply: string }>` — rate limit, gate de tipo (texto/áudio processam; resto vira `fixedReply`), gate de tamanho
  - `checkConversationMode(conversation): boolean` — gate explícito entre `guardInput` e `contextBuild`, espelhando a etapa própria de `architecture.md` ("`conversation.mode === 'human'`? → só persiste, não chama modelo"): quando `true` (mode `'human'`), `runTurn` para logo após `persist` da mensagem `'in'` — `contextBuild`/`loop`/`guardOutput` nunca rodam (AIG-12/32)
  - `contextBuild(tenant, conversation, aiSession, userText): { system: string; messages: Anthropic.MessageParam[] }` — `system` congelado (não inclui nada por tenant além do nome, que não muda o prefixo em bytes relevantes — ver Tech Decisions); turno de usuário carrega data/hora, estado da janela de 24h, e a **lista de `key`+`name` dos `FieldTemplate` de `targetType:'process'` do tenant** (não o schema completo — isso só vem por `get_process_template`, ADR-0004)
  - `runLoop(ctx: ToolContext, system, messages): Promise<{ reply: string; rawTurn: Anthropic.MessageParam[] }>` — `claude-haiku-4-5`, `MAX_TOOL_ITERATIONS=5`, `MAX_TOKENS=1024`, tools = `TOOL_DEFINITIONS` (Anel A fixo)
  - `guardOutput(reply: string): string` — trunca em 1600 chars (ponto seguro), redige `ObjectId` (regex `/\b[0-9a-f]{24}\b/gi`)
  - `persist(conversation, aiSession, outText): Promise<MessageDocument>` — grava `Message{direction:'out'}`, atualiza `AiSession` (histórico bruto + sumário rolante quando cruza o limiar)
  - `dispatch(message): Promise<void>` — seta `status:'queued'`, libera `turnLock`
- **Dependencies**: `@anthropic-ai/sdk`, `openai` (P2), `packages/db`, `packages/field-engine`, `packages/contracts`
- **Reuses**: `tenantScoped`, padrão de loop do DentalEase-BackEnd (adaptado), `validate`/`toToolSchema`

#### `packages/ai-kit/src/tools/` — os 4 executores do Anel A

- **Purpose**: Implementação de cada tool, sempre recebendo `ToolContext {tenantId,
  channelId, conversationId}` do servidor — nunca do `input_schema` (AD-010).
- **Location**: `packages/ai-kit/src/tools/{getProcessTemplate,findOrCreateCustomer,openProcess,setProcessFields}.ts`
- **Interfaces**:
  - `getProcessTemplate(input: {key: string}, ctx: ToolContext): Promise<{fields: JSONSchema; stages: string[]} | {error: string}>`
  - `findOrCreateCustomer(input: {name?; phone; document?}, ctx): Promise<{customerId: string; created: boolean}>` — busca `{Tenant, phone}`, ordena por `updatedAt desc`, reusa o primeiro; cria contra o `FieldTemplate` `targetType:'customer'` corrente do tenant (`values:{}`) se nenhum existir
  - `openProcess(input: {templateKey; customerId; values?}, ctx): Promise<{processId: string; stage: string} | {error: string}>` — rejeita se `customerId` não pertence ao `Tenant` do `ctx`; `stage` inicial = `stages[0]` da `FieldTemplateVersion` corrente
  - `setProcessFields(input: {processId; values}, ctx): Promise<{ok: true} | {error: string; fieldErrors?}>` — valida contra a `templateVersion` **do Process** (não a corrente do template — mesma convenção CORE-08/AD-023), via `field-engine.validate`
- **Dependencies**: `packages/db` (`Customer`, `Process`, `FieldTemplate`, `FieldTemplateVersion`), `packages/field-engine`
- **Reuses**: mesma forma de consulta de `fieldTemplate.repository.findCurrentVersion` (feature 2), convenção de ponteiro `(template, templateVersion)` (AD-026)

### `apps/ai-gateway`

- **Purpose**: Host HTTP do webhook + workers de intervalo (outbox, reaper, idle sweep).
- **Location**: `apps/ai-gateway/src/`
- **Interfaces**:
  - `GET /webhooks/whatsapp` → valida `hub.verify_token`, responde `hub.challenge` cru
  - `POST /webhooks/whatsapp` → middleware de assinatura (`X-Hub-Signature-256`) → chama `ai-kit.runTurn()` por mensagem do payload → sempre 200 (exceto assinatura inválida → 401)
  - `startOutboxConsumer(intervalMs=2000)` — claim atômico, checa janela 24h, chama Meta Send API, grava `wamid`/`sent` ou 3 retries/`failed`
  - `startReaper(intervalMs=30000, staleAfterMs=60000)` — `sending` preso → `queued`; nunca mexe em mensagem com `wamid` já gravado
  - `startIdleTakeoverSweep(intervalMs=60000, idleAfterMs=1800000)` — `Conversation{mode:'human'}` com `lastActivityAt` velho → `mode:'bot'`
- **Dependencies**: `packages/ai-kit`, `packages/db`, `express`
- **Reuses**: `buildApp`/`start` já existentes (esqueleto), `env.config` (estendido)

### `apps/crm-api` — 3 endpoints novos

- **Purpose**: Ações headless que só um humano autenticado do Tenant pode disparar.
- **Location**: `apps/crm-api/src/{routers,controllers,services,repositories}/channel.*`,
  `conversation.*`
- **Interfaces**:
  - `POST /channels` (`isAdmin`) → cria `Channel`, criptografa o token (`packages/db` crypto helper), rejeita `phoneNumberId` duplicado (409)
  - `GET /channels/current` (`isAdmin`) → devolve o `Channel` do Tenant **sem o token em claro** (`maskSecret`)
  - `POST /conversations/:id/takeover` (`checkRole(['admin','gestor','operador'])`) → `mode:'human'`, `assignee: req.tenantUser`
  - `POST /conversations/:id/release` (mesmo papel) → `mode:'bot'`, limpa `assignee`
  - `POST /conversations/:id/messages` (mesmo papel) → `{text}` ou `{templateName,templateLanguage,templateParams}` → valida janela de 24h antes de criar `Message{direction:'out',status:'queued'}`
- **Dependencies**: `packages/db`, middlewares existentes de auth/role
- **Reuses**: `Route→Controller→Service→Repository` (convenção portada do DentalEase-BackEnd, já em uso em todo `crm-api`), `checkRole`/`isAdmin`, `respObj`/`CustomError`

### `evals/` — golden set determinístico

- **Purpose**: Provar, contra o harness real (`mongodb-memory-server`, sem rede externa —
  Anthropic/Meta/Whisper mocados/injetados via os providers de `ai-kit`), os cenários de
  AIG-39 a AIG-43: tool certa com argumentos certos, superfície fixa (só Anel A), teste
  estrutural de `input_schema` (ADR-0010), isolamento entre 2 tenants espelhados, dedup de
  `wamid`, e a defesa estrutural contra injeção de prompt (edge case do spec).
- **Location**: `evals/cases/*.yaml` (casos declarativos) + `evals/runner/` (executa cada
  caso chamando `ai-kit.runTurn()` diretamente, com os 3 providers substituídos por fakes
  determinísticos)
- **Interfaces**:
  - `expectTool(name, argsMatcher)` / `expectNoTool(name)` — mesmo formato do exemplo em
    ADR-0013
  - `expectNoLeak(otherTenantId | otherConversationId)`
  - Teste estrutural: varre `TOOL_DEFINITIONS` e falha se algum `input_schema` contiver
    `tenant`/`Tenant`/`orgId`/`channelId`/`conversationId`
- **Dependencies**: `packages/ai-kit`, `packages/db`, `vitest` (project `structural`/
  `integration`, AD-017)
- **Reuses**: convenção de nome de arquivo por sufixo já ativa (AD-017); `MongoMemoryServer`
  já usado por todos os testes de integração do projeto

---

## Data Models

### Channel

```ts
interface ChannelDocument {
  _id: ObjectId;
  Tenant: ObjectId;          // único — 1 tenant, 1 channel na v1 (glossário)
  phoneNumberId: string;     // único GLOBAL — é o resolvedor de tenant do webhook
  wabaId?: string;
  displayPhoneNumber?: string;
  accessTokenEnc: { ciphertext: string; iv: string; authTag: string }; // AES-256-GCM
  status: 'active' | 'inactive';
  createdAt: Date; updatedAt: Date;
}
```

**Indexes**: `{phoneNumberId:1}` unique · `{Tenant:1}` unique (v1: um por tenant)
**Relationships**: `Conversation.Channel` → `Channel._id`

### Conversation

```ts
interface ConversationDocument {
  _id: ObjectId;
  Tenant: ObjectId; Channel: ObjectId; Customer: ObjectId;
  mode: 'bot' | 'human';
  assignee?: ObjectId; // User
  lastInboundAt?: Date;     // última mensagem 'in' — base da janela de 24h
  windowExpiresAt?: Date;   // lastInboundAt + 24h, mantido junto para leitura barata
  lastActivityAt: Date;     // qualquer atividade (mensagem OU ação de operador) — base do idle sweep
  turnLock: { holder: string; claimedAt: Date } | null; // claim atômico (serialização, ADR-0007-like)
  rateWindowStart?: Date; rateWindowCount?: number; // guard.input — rate limit atômico (ver Tech Decisions)
  createdAt: Date; updatedAt: Date;
}
```

**Indexes**: `{Channel:1, Customer:1}` unique · `{Tenant:1, mode:1, lastActivityAt:1}` (idle sweep)
**Relationships**: `Message.Conversation`, `AiSession.Conversation` → `Conversation._id`

### Message

```ts
interface MessageDocument {
  _id: ObjectId;
  Tenant: ObjectId; Conversation: ObjectId; Channel: ObjectId; Customer: ObjectId;
  direction: 'in' | 'out';
  type: 'text' | 'audio' | 'image' | 'document' | 'location' | 'unsupported';
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'; // só 'out'
  text?: string;             // normalizado (transcrição de áudio entra aqui, P2)
  media?: { mediaId: string; mime?: string; caption?: string }; // ponteiro Meta, NUNCA binário
  wamid?: string;            // único, sparse — chave de idempotência (ADR-0005)
  templateName?: string; templateLanguage?: string; templateParams?: Record<string, string>;
  claimedBy?: string; claimedAt?: Date; // bookkeeping do claim da outbox
  error?: string;            // motivo do 'failed'
  createdAt: Date; updatedAt: Date;
}
```

**Indexes**: `{wamid:1}` unique sparse · `{Tenant:1, Conversation:1, createdAt:1}` (histórico) ·
`{status:1, createdAt:1}` (claim da outbox, só documentos `direction:'out'` participam)
**Relationships**: `Conversation.Message[]` (1:N, implícito por `Conversation` FK)

### AiSession

```ts
interface AiSessionDocument {
  _id: ObjectId;
  Tenant: ObjectId; Conversation: ObjectId; // único — 1:1
  rawHistory: { role: 'user' | 'assistant'; content: unknown }[]; // últimas 20, formato Anthropic.MessageParam
  summary?: string;          // sumário rolante do que saiu da janela de 20
  totalMessageCount: number; // dispara resumo a cada +10 acima de 20
  lastRunAt: Date;
  createdAt: Date; updatedAt: Date;
}
```

**Indexes**: `{Conversation:1}` unique
**Relationships**: 1:1 com `Conversation` — só `ai-gateway` lê/escreve (tabela de propriedade,
`architecture.md`)

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| `X-Hub-Signature-256` ausente/inválida | 401, log, nada processado | Nenhum (não é tráfego real do cliente) |
| Payload malformado (falta `wamid`/`messages[]`) | 200 (ack), log do payload rejeitado, nada persistido | Nenhum |
| `phone_number_id` sem `Channel` | 200 (ack), log "canal não resolvido" | Nenhum — mensagem nunca chega a existir no sistema |
| `turnLock` já reivindicado (2ª mensagem da mesma Conversation chega antes da 1ª terminar) | Espera curta com poll (200ms, teto 15s) pelo lock liberar, dentro do MESMO request; se estourar o teto, processa mesmo assim e loga aviso (best-effort, caso raro) | Resposta um pouco mais lenta na 2ª mensagem; nunca perde mensagem |
| Anthropic API indisponível/erro | Capturado no `loop`; `Message{direction:'in'}` já persistida antes (não se perde); resposta de fallback fixa; ainda 200 | Recebe uma mensagem genérica de indisponibilidade, não trava |
| Whisper indisponível (P2) | Cai no mesmo fallback de tipo não suportado do P1 | Recebe pedido para escrever, não trava |
| Meta Send API falha | 3 tentativas (backoff 1s/3s/9s) → `failed` terminal | Mensagem não chega; sem reenvio automático nesta rodada (feature de inbox trata reenvio manual depois) |
| Janela de 24h expirada + texto livre (bot ou operador) | Rejeitado antes de chamar a Meta (400/erro legível) | Operador vê erro claro (mesmo sem UI, o corpo da resposta já carrega a mensagem certa para a inbox futura renderizar) |
| `Channel` duplicado (`phoneNumberId` já existe) | 409, nada criado | Admin vê erro claro |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| Webhook síncrono + espera de `turnLock` dentro do mesmo request pode empilhar latência se o cliente mandar várias mensagens muito rápido | `packages/ai-kit/src/ingest.ts` (novo) | Resposta mais lenta em rajada; no pior caso (>15s) processa fora de ordem estrita | Teto de espera + processamento best-effort (ver Error Handling); aceito como trade-off da abordagem síncrona confirmada com o usuário |
| Resumo rolante do `AiSession` custa uma chamada extra ao modelo a cada 10 mensagens acima de 20 | `packages/ai-kit/src/persist.ts` (novo) | Latência/custo extra só nesse turno específico | Só dispara no cruzamento do limiar, não a cada turno — impacto concentrado e raro |
| Sem gestão de chave via KMS — `CHANNEL_ENC_KEY` é uma env var crua (mesmo modelo do `ASAAS_ENC_KEY` de referência) | `packages/db/src/crypto.helper.ts` (novo, portado) | Comprometimento do `.env` expõe todos os tokens de canal | Mesmo modelo de confiança já aceito pelo AD-012 de referência — não é um risco novo desta feature, é o padrão do projeto |
| `outboxConsumer`/`reaper`/`idleTakeoverSweep` rodando em N instâncias do `ai-gateway` | `apps/ai-gateway/src/workers/*` (novo) | Nenhum — é exatamente o caso que o claim atômico (ADR-0007, decisão confirmada) já cobre | Nenhuma ação adicional necessária; registrado aqui só para deixar explícito que não é um risco |
| Duplicação de lógica fina de `Customer`/`Process` entre `ai-kit` e `crm-api` (abordagem confirmada) | `packages/ai-kit/src/tools/*` (novo) vs. `apps/crm-api/src/services/{customer,process}.service.ts` | Uma regra de negócio mudada num lado (ex.: convenção de ponteiro `templateVersion`) e esquecida no outro diverge silenciosamente | Cada tool tem teste de integração comparando o registro criado pela tool com o schema que `crm-core` espera (mesmos índices/campos); qualquer duplicação futura de regra de negócio real (não só leitura) deve ser sinalizada como candidata a promover para um pacote compartilhado |

> Nenhum problema de código existente foi encontrado nas áreas tocadas — todo o código
> desta feature é novo (`ai-gateway`/`ai-kit` eram esqueleto/inexistentes).

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Modelo do loop conversacional | `claude-haiku-4-5`, `MAX_TOOL_ITERATIONS=5`, `MAX_TOKENS=1024` | AD-008 fixa o modelo; teto e tokens reusam os valores já comprovados em produção no `DentalEase-BackEnd` (mesmo tipo de loop, mesmo modelo) |
| Criptografia do token do `Channel` | AES-256-GCM, formato `{ciphertext,iv,authTag}` (base64), chave `CHANNEL_ENC_KEY` (32 bytes base64) — helper portado de `DentalEase-BackEnd/src/helpers/crypto.helper.ts` para `packages/db/src/crypto.helper.ts` | Mesmo algoritmo/formato que o AD-012 já referencia como "integração completa já existe no DentalEase"; chave separada da futura `ASAAS_ENC_KEY` (domínios de segredo diferentes) |
| Verificação do webhook | `GET`: `hub.verify_token` contra `META_WEBHOOK_VERIFY_TOKEN`, responde `hub.challenge` cru (sem JSON). `POST`: HMAC-SHA256 do corpo cru vs `META_APP_SECRET`, comparação em tempo constante (`crypto.timingSafeEqual`) | Como a API da Meta funciona (não é escolha de produto) — confirmado por busca externa |
| Lista de tipos de processo no prompt | `context.build` injeta `key`+`name` (não o schema completo) dos `FieldTemplate` `targetType:'process'` do tenant no bloco dinâmico do turno de usuário | Resolve uma lacuna do ADR-0004: o modelo precisa saber QUAIS `key` existem antes de chamar `get_process_template(key)`. Só metadado leve (não o schema, que ainda chega por tool *result*) — não viola "superfície fixa" |
| Serialização de turno | Campo `turnLock:{holder,claimedAt}` em `Conversation`, reivindicado via `findOneAndUpdate({_id, turnLock:null}, {$set:{turnLock:{holder,claimedAt:now}}})` | Mesmo padrão exato do claim da outbox (ADR-0007) — abordagem confirmada com o usuário |
| Intervalos dos workers | `outboxConsumer`: 2s · `reaper`: 30s (limiar 60s) · `idleTakeoverSweep`: 60s (limiar 30min) | `outboxConsumer` reusa a cadência de poll já estabelecida pelo ADR-0006 (inbox, ~2s) por consistência de sistema; os outros dois são varreduras de manutenção, cadência mais espaçada é suficiente |
| Rate limit de `guard.input` | Contadores no próprio documento `Conversation` (`rateWindowStart`, `rateWindowCount`), atualizados via `findOneAndUpdate` atômico — não em memória do processo | Consistente com a mesma decisão de "coordenação só via Mongo" já confirmada para o `turnLock`; em memória quebraria do mesmo jeito sob múltiplas instâncias |
| Transcrição de áudio (P2) | OpenAI Whisper API (`whisper-1`), pacote `openai`, `OPENAI_API_KEY` nova | Confirmado explicitamente com o usuário — não há transcrição integrada em nenhum lugar do repo ou da referência |
| Observabilidade (AIG-44) | Log estruturado (`JSON.stringify({event, ...})`, mesmo padrão de `server.ts`/`server.listening`\/`server.boot_failed`) em: rejeição de `guard.input`/`guard.output`, erro de tool, falha de envio à Meta (cada retry + `failed` final), hit de dedup por `wamid`, hit de `turnLock` ocupado | Reusa o único padrão de log estruturado já existente no projeto (`apps/ai-gateway/src/server.ts`), equivalente em espírito ao `dbReqResTime` de CORE-16 — sem nova biblioteca de logging |

> **Project-level decisions:** As 3 escolhas de abordagem (acesso a dados das tools,
> serialização de turno, modelo síncrono do webhook) foram confirmadas com o usuário nesta
> sessão mas são específicas desta feature — não criam convenção vinculante para outras
> features do jeito que um `AD-NNN` cria (ex.: a superfície de tools do Anel A crescer
> não muda a abordagem de acesso a dados). Nenhuma entrada nova em `STATE.md` é necessária
> por este Design.
