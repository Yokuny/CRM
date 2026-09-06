# ai-gateway Context

**Gathered:** 2026-09-05
**Spec:** `.specs/features/ai-gateway/spec.md`
**Status:** Ready for design

---

## Feature Boundary

`apps/ai-gateway` deixa de ser esqueleto e ganha o webhook da Meta (dedup por `wamid`,
resolução de tenant via `Channel`) e o pipeline completo `ingest → guard.input →
context.build → loop de tools → guard.output → persist → dispatch`, implementado em
`packages/ai-kit` (novo pacote). O loop de tools roda contra `claude-haiku-4-5` (AD-008) e
oferece só as 4 tools do Anel A que já têm dado real hoje sobre `Customer`/`Process`
(feature 3). Modelos novos em `packages/db`: `Channel`, `Conversation`, `Message`,
`AiSession`. `crm-api` ganha 3 endpoints headless (sem UI): provisionar `Channel`, takeover
de `Conversation`, e enviar mensagem manual (operador). Fecha com golden set determinístico
(`evals/`) provando os fluxos e o isolamento de tenant. Réplay anonimizado, Anel B
(dinheiro), catálogo/pedidos/agenda, e a inbox visual (`apps/web`) ficam para depois.

---

## Implementation Decisions

### Superfície de tools v1 (Anel A)

- Só as 4 tools que já têm collection real por trás: `get_process_template`,
  `find_or_create_customer`, `open_process`, `set_process_fields` — todas sobre
  `Customer`/`Process`/`FieldTemplate` da feature `crm-core`/`dynamic-field-engine`.
- As outras 6 do ADR-0004/0009 (`search_products`, `get_order_status`,
  `get_available_slots`, `book_appointment`, `create_order`, `issue_payment_link`) **não
  existem nesta rodada** — dependem de `Product`/`Order`/agenda, que não existem em
  nenhuma feature ainda. Entram no loop quando a feature de catálogo/pedidos existir.
- Consequência direta: **Anel B fica 100% fora desta rodada.** Nenhum endpoint de
  aprovação de pedido é construído agora — ele nasce junto com `create_order`/
  `issue_payment_link`, com um produtor real para testar contra. Confirmado
  explicitamente: "Anel B fica 100% fora, só takeover entra".
- Mesma lógica aplicada a `guard.output`: a regra "preço só de tool result desta
  conversa" (architecture.md) não tem nenhum tool que retorne preço nesta rodada —
  fica fora pelo mesmo motivo do Anel B (guard sem produtor real é guard não-testável).
  `guard.output` desta feature cobre só **tamanho** e **IDs internos**; "vazamento entre
  contatos" é garantido por construção (`ToolContext` escopado por `conversationId`) e
  provado pelo golden set (duas conversas espelhadas), não por uma função de runtime.

### Evals

- Só **golden set determinístico** (`evals/cases/*.yaml` + teste estrutural de
  `input_schema`, ADR-0010) entra nesta feature.
- **Replay anonimizado fica para depois** — não existe conversa real em produção para
  anonimizar ainda; construir o pipeline agora seria rodar vazio.

### Takeover / aprovação — backend headless

- `crm-api` ganha endpoints headless (sem tela — `apps/web` inbox é feature futura) para
  as ações que só um humano pode disparar:
  - Takeover: muda `Conversation.mode` para `human` / libera de volta para `bot`.
  - Enviar mensagem manual: operador insere `Message{direction:'out', status:'queued'}` —
    é o produtor real que o consumidor de outbox (`ai-gateway`) precisa para o fluxo
    "Operador envia" (architecture.md) ser demonstrável de ponta a ponta.
  - **Nenhum** endpoint de aprovação de Anel B (ver acima — 100% fora desta rodada).
- Idle automático (Conversation volta a `bot` sozinha) é responsabilidade do
  `ai-gateway` (roda dentro do `ingest`/checagem de turno), não um endpoint.

### Provisionamento de Channel

- Endpoint admin em `crm-api` (CRUD mínimo: create + get), token da Meta criptografado em
  repouso — mesmo padrão do AD-012 (Asaas). Consistente com a tabela de propriedade de
  escrita (`channels` → `crm-api`).
- Confirmado explicitamente: "endpoint admin em crm-api", não seed idempotente (AD-018 não
  se aplica aqui — provisionar um canal por tenant é ação operacional recorrente, não dado
  de bootstrap único do sistema).

### Tipos de mensagem WhatsApp v1

- **Texto + áudio transcrito** entram de verdade no loop do modelo. Áudio é baixado da
  Meta (endpoint de media de duas etapas: `GET /{media-id}` → URL temporária → `GET` da
  URL com o token do canal) e transcrito via **OpenAI Whisper API** antes de virar texto no
  turno do usuário. Confirmado explicitamente como provedor de transcrição — não existe
  transcrição integrada em lugar nenhum do repo nem do `DentalEase-BackEnd` de referência
  (busca confirmou), então é dependência externa nova (mais uma credencial além da
  Anthropic).
- Imagem, documento, localização e qualquer outro tipo: **persistidos como `Message`**
  (para a inbox futura mostrar), mas **não processados** — não entram no loop. Guardado só
  o ponteiro da Meta (`mediaId`/`mime`/legenda quando houver), nunca o binário — **esta
  feature não baixa nem armazena mídia própria** (confirmado por busca: não existe NENHUM
  backend de asset/S3 no repo; `document` do field-engine é só forma de valor, sem
  produtor de `assetId` — construir um pipeline de storage agora seria escopo novo não
  pedido). Isso vale também para o áudio: baixado só para transcrever, texto persiste,
  binário nunca é gravado em disco/S3 próprio.
- Tipo não suportado (fora de texto/áudio) recebe **resposta fixa em código no
  `guard.input`** ("não consigo processar esse tipo de conteúdo, pode escrever?") — sem
  gastar turno de modelo.
- Limite de tamanho do que entra no loop (texto ou transcrição): acima do limite,
  `guard.input` **rejeita com resposta fixa** (pede para resumir/dividir) — nunca
  processa parcial, nunca trunca a entrada silenciosamente.

### Agent's Discretion

- Números exatos de timeout (idle takeover, reaper de outbox, rate limit por contato,
  retries de envio à Meta) e a mecânica exata do sumário rolante — o usuário declinou
  discutir estas áreas nesta rodada; viraram Assumption no spec com default proposto pelo
  agente (ver `spec.md` → Assumptions & Open Questions), não confirmadas.
- Exata forma de reuso de lógica de negócio de `Customer`/`Process` dentro das 4 tools
  (duplicar uma fatia fina em `ai-kit` vs. extrair `crm-core` para pacote compartilhado)
  fica para o Design escolher com exploração de abordagens (Large/Complex).

### Declined / Undiscussed Gray Areas → Assumptions

Ver `spec.md` → Assumptions & Open Questions para os defaults propostos (timeouts, janela
de histórico/sumário rolante, verificação e retry do webhook Meta).

---

## Specific References

- Padrão de loop de tools, `ToolContext`, e formato `{error: string}`/`is_error` já
  provados em produção em
  `../DentalEase/DentalEase-BackEnd/src/use-cases/assistant-chat.use-case.ts` e
  `assistant-tools.ts` (`claude-haiku-4-5`, `MAX_TOOL_ITERATIONS = 5`,
  `MAX_TOKENS = 1024`) — reusar a mesma estrutura, generalizada para os dois anéis e para
  tenant vindo do `Channel` em vez de `clinicId` de sessão HTTP.
- Limite de mensagem livre do WhatsApp: **1600 caracteres** (janela de atendimento) —
  confirmado por busca externa; é o número que `guard.output` usa para truncar.
- Verificação de webhook da Meta: handshake `GET` (`hub.mode`/`hub.verify_token`/
  `hub.challenge`, resposta é o challenge cru) e assinatura `X-Hub-Signature-256`
  (HMAC-SHA256 do corpo cru com o App Secret) — confirmado por busca externa.

---

## Deferred Ideas

- Anel B completo (`create_order`, `issue_payment_link`, endpoint de aprovação) — feature
  de catálogo/pedidos.
- `search_products`, `get_order_status`, `get_available_slots`, `book_appointment` — idem
  (catálogo/pedidos/agenda).
- Replay anonimizado (ADR-0013) — feature própria, quando houver conversa real para
  anonimizar.
- Inbox visual (`apps/web`) — feature própria, consome `Conversation`/`Message` já
  prontos desta feature.
- Submissão/aprovação de templates HSM junto à Meta (Business Manager) — o sistema confia
  que o nome de template informado já foi aprovado na Meta, fora da plataforma.
- Pipeline de asset/storage próprio (S3 ou equivalent) para mídia (imagem/documento/áudio
  bruto) — não existe hoje em nenhuma parte do repo; esta feature só baixa áudio
  temporariamente para transcrever, nunca armazena.
