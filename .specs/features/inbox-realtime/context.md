# Inbox Realtime Context

**Gathered:** 2026-09-08
**Spec:** `.specs/features/inbox-realtime/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Superfície humana da conversa (feature 6/11). O bot já atende sozinho pelo WhatsApp
(`ai-gateway`, feature 5); ninguém do time consegue ver ou intervir. Esta feature entrega:

1. WebSocket no `crm-api`, alimentado por poller ~2s (AD-006), fazendo fan-out de
   mensagens **novas** por `tenant:conversation`.
2. Leitura: `GET /conversations` (fila, filtro por `mode`/`assignee`) e
   `GET /conversations/:id/messages` (paginado).
3. Telas de Inbox no `apps/web`: fila, thread, composer, indicador `mode` bot/human,
   takeover/release.
4. Reenvio manual de `Message` com `status:'failed'`.
5. Affordance para reabrir contato fora da janela de 24h (ver decisão abaixo — **não** é
   envio de template HSM pela plataforma nesta rodada).

---

## Implementation Decisions

### 1. Auth do WebSocket (pré-confirmado, não reaberto)

- Handshake autenticado pelo cookie httpOnly `refreshToken` (AD-014) — mesmo fluxo de
  `extractToken`/`validToken` (`authentication.middleware.ts`), sem ticket de conexão
  separado, sem access token à parte.

### 2. Escopo do push via WebSocket (pré-confirmado, não reaberto)

- Só mensagens novas (inbound e outbound) são empurradas via WS.
- Mudança de `mode` (bot⇄human) e transição de `status` de envio (`queued→sending→sent/failed`)
  **não** são empurradas nesta rodada — a UI descobre isso por refetch/poll HTTP normal.

### 3. Janela de 24h na UI (pré-confirmado, não reaberto)

- Sem campo novo no Mongo. A UI deriva o estado (aberta/fechada, quanto falta) a partir de
  `windowExpiresAt`/`lastInboundAt` (já gravados pelo `ai-gateway`) combinados com
  `createdAt`/`updatedAt` (`timestamps:true`).

### 4. Fonte do "template HSM" para reabrir a janela — **resolvido como não-escopo de envio via plataforma**

- Quando a janela de 24h está fechada, o composer do Inbox **desabilita o envio de texto
  livre** pela plataforma e mostra, no lugar, um botão **"Abrir no WhatsApp"** — um link
  `wa.me/<telefone-do-cliente>` (sem texto pré-preenchido) que abre em nova aba, fora da
  plataforma. O operador retoma o contato pelo seu próprio WhatsApp Web/app; a plataforma
  não acompanha nem grava essa conversa paralela.
- O endpoint `POST /conversations/:id/messages` com `templateName`/`templateLanguage`
  (já existente, `sendMessageSchema`) **continua existindo no backend sem regressão**, mas
  nenhuma tela desta feature o chama — fica reservado para uma feature futura de catálogo
  de templates HSM. Nenhuma entidade nova de "template aprovado" é criada nesta rodada.
- **Nota técnica registrada para o spec (Assumption), não uma reabertura da decisão do
  usuário:** o link `wa.me` reabre a conversa no WhatsApp *pessoal* do operador, não no
  número da Meta Cloud API do canal — não reabre de fato a janela de 24h *daquele número
  de negócio* perante a Meta. É uma via manual paralela, fora do pipeline
  `ai-gateway`/Meta Cloud API, e assim deve ficar registrado.

### 5. Render de mídia recebida

- **Preview sob demanda (fetch on-demand).** A thread mostra um card por mídia
  (ícone/mime/caption); um botão "Ver"/"Baixar" aciona uma nova rota do `crm-api` que
  decifra o `accessToken` do `Channel` (mesmo `crypto.helper`/`env.CHANNEL_ENC_KEY` já
  usado em `channel.service.ts`), chama a Media API da Meta (`GET /{media-id}` → URL
  temporária → download) e devolve o binário ao navegador — nunca persiste em disco
  (mantém o Out of Scope do `ai-gateway`: sem pipeline de asset/storage próprio).
- Design decide se essa chamada é um novo cliente HTTP fino duplicado em `crm-api` (mesmo
  padrão de `apps/ai-gateway/src/providers/metaClient.ts`, mas só a metade de leitura de
  mídia) ou outra forma de reuso — sem violar AD-002 (os dois serviços nunca se chamam;
  aqui é `crm-api` chamando a Meta diretamente, igual o `ai-gateway` já faz, não um
  serviço chamando o outro).

### 6. Atribuição de conversa (`assignee`) e corrida de takeover simultâneo

- `takeover()` passa a ser um **claim condicional** (mesmo espírito do `turnLock`/claim de
  outbox já usado no projeto): a query só societário quando a conversa está livre
  (`mode:'bot'`) **ou** já pertence ao mesmo usuário da sessão (idempotente — reclicar
  "assumir" sendo o mesmo operador não é erro, só confirma).
- Se outro operador diferente do `assignee` atual tenta assumir uma conversa já em
  `mode:'human'`, o sistema **rejeita** com um erro nomeando explicitamente quem já
  assumiu (ex.: "Conversa já assumida por {nome do operador}").
- **Release continua incondicional** — qualquer operador do tenant (`admin`/`gestor`/
  `operador`, mesmo `canOperate` de hoje) pode devolver qualquer conversa ao bot,
  independentemente de quem é o `assignee` atual. Nenhuma mudança de permissão aqui.

### 7. Poller AD-006 com múltiplas instâncias do `crm-api`

- **Assumido: instância única nesta rodada.** Registrado como Assumption explícita no
  spec — coordenação de poller/sockets entre múltiplas instâncias fica para uma rodada
  futura (provavelmente `ops-hardening`, feature 11), sem desenho antecipado agora.

### 8. Reenvio manual de `Message` com `status:'failed'`

- **Clona em uma nova `Message`.** O documento `failed` original nunca muda de estado —
  permanece visível na thread com selo de falha. O reenvio cria um **novo** documento com
  o mesmo conteúdo (texto ou template), `status:'queued'`, que entra na fila normal do
  outbox (`ai-gateway` consome como qualquer outra mensagem `queued`).
- Motivo arquitetural, não só de produto: resetar o mesmo documento (`failed→queued`
  in-place) exigiria o `crm-api` transicionar `status` de uma `Message` já existente — hoje
  essa transição é exclusividade do `ai-gateway` (`docs/architecture.md`, tabela de
  propriedade de escrita). Clonar respeita a fronteira sem abrir exceção.
- **UI:** a mensagem original continua visível com selo "Falhou"; a nova tentativa aparece
  como uma bolha nova, mais abaixo na timeline, com seu próprio ciclo de status
  (`queued→sending→sent/failed`). Histórico completo de tentativas fica visível — nunca
  substitui/oculta a anterior.

### Agent's Discretion

- Formato exato do payload do WebSocket (nome do evento, shape do JSON) — Design escolhe.
- Se o cliente HTTP fino de mídia da Meta em `crm-api` é um módulo novo dedicado ou reuso
  de alguma peça já existente — Design escolhe, sem violar AD-002.
- Paginação exata de `GET /conversations/:id/messages` (cursor vs. offset) — Design escolhe
  seguindo o padrão já usado em outras listagens do projeto (`AD-028`/rotas `/partial`).
- Nome do evento/rota HTTP de download de mídia sob demanda.

### Declined / Undiscussed Gray Areas → Assumptions

- Nenhuma — todos os pontos levantados (A–E do brief) foram discutidos e resolvidos acima.

---

## Specific References

- "Reabrir via WhatsApp Web": o usuário imagina um botão que redireciona para uma nova aba
  com o número do cliente pré-preenchido (estilo link `wa.me`), deixando o operador
  continuar a conversa pelo próprio WhatsApp pessoal/comercial fora da plataforma — não um
  fluxo de envio de template dentro do Inbox.
- Reenvio de falha: o usuário quer o histórico completo visível — "mostra essa clonagem e
  tentativa novamente de envio" — nunca a aparência de já ter apagado/reescrito a
  tentativa anterior.

---

## Deferred Ideas

- Catálogo de templates HSM aprovados por tenant (cadastro + composer de envio de
  template dentro do Inbox) — cogitado e explicitamente adiado para uma feature futura;
  o link `wa.me` é a solução desta rodada.
- Coordenação de poller/WebSocket entre múltiplas instâncias do `crm-api` — fora de escopo
  aqui, provável `ops-hardening` (feature 11).
