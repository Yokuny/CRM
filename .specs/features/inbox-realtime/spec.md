# Inbox Realtime Specification

## Problem Statement

O `ai-gateway` (feature 5) já atende clientes no WhatsApp com IA, mas ninguém do time
consegue ver essa conversa acontecendo nem intervir nela. Os endpoints de takeover/release/
mensagem manual existem (`apps/crm-api/src/routers/conversation.router.ts`), mas não há
nenhuma forma de LER uma `Conversation`/`Message` (nenhum `GET`), não há WebSocket
([AD-006](../../STATE.md) nunca implementado, zero dependência `ws` no repo) e não há
nenhuma tela de Inbox no `apps/web`. O time opera cego: um cliente pode estar preso num
loop de bot, ou precisar de takeover humano, e não há como saber.

## Goals

- [ ] Operador vê a fila de conversas do tenant e o histórico de uma conversa específica,
      atualizados ao vivo (WebSocket, ≤ ~2s de atraso, AD-006) sem precisar dar F5.
- [ ] Operador assume (`takeover`) e libera (`release`) uma conversa com segurança sob
      concorrência — dois cliques simultâneos de operadores diferentes nunca colidem em
      silêncio.
- [ ] Operador consegue reenviar uma mensagem que falhou e contornar uma janela de 24h
      fechada sem que a plataforma precise integrar a API de templates da Meta.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Item | Motivo |
| --- | --- |
| Cadastro de templates HSM aprovados + composer de envio de template dentro do Inbox | Decidido no Discuss: a plataforma não integra a API de gestão de templates da Meta. Esta rodada resolve a janela fechada com um botão `wa.me` (via fora da plataforma), não com envio de template. Fica para uma feature futura de catálogo de templates |
| Push via WebSocket de mudança de `mode` (bot⇄human) ou de transição de `status` de envio (`queued→sending→sent/failed`) | Decidido no Discuss: só mensagens novas são empurradas nesta rodada. A UI descobre essas mudanças por refetch/poll HTTP normal |
| Coordenação de poller/WebSocket entre múltiplas instâncias do `crm-api` | Decidido no Discuss: assume-se instância única nesta rodada (AD-006 não previa isso). Fica para uma rodada futura, provavelmente `ops-hardening` (feature 11) |
| Pipeline de asset/storage próprio para mídia (persistir o binário) | Herdado do Out of Scope do `ai-gateway`: nunca existiu no repo. O preview sob demanda desta feature busca da Meta e devolve ao navegador sem persistir |
| "Marcar como lida" explícito / read receipts formais | Não pedido nesta rodada — "não lida" é só um indicador computado na fila (ver Assumptions), sem ação de usuário para limpar o indicador nem coleção nova de leitura |
| Limite de tentativas de reenvio de uma `Message failed` | Não discutido — sem cap nesta rodada, ver Assumptions |
| Provisionamento de `Channel` / envio automatizado outbound | Já existe (feature 5, `ai-gateway`) — fora do escopo desta feature |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Janela de 24h fechada — como o operador retoma contato | Composer desabilita texto livre e mostra botão "Abrir no WhatsApp" (`wa.me/<telefone>`, sem texto pré-preenchido, nova aba) | Decidido no Discuss: a plataforma não integra a API de templates da Meta; o link `wa.me` é uma via manual fora da plataforma | sim |
| `wa.me` reabre a janela oficial de 24h do número de negócio? | Não — o link abre o WhatsApp *pessoal* do operador, não o número Meta Cloud API do canal. É uma via manual paralela, fora do pipeline `ai-gateway`/Meta | Fato técnico do WhatsApp Business API (janela é por número de negócio); registrado para não criar expectativa errada na UI | fato técnico, não é decisão de produto |
| Render de mídia recebida | Preview sob demanda: botão "Ver"/"Baixar" aciona rota nova do `crm-api` que decifra o token do `Channel` e busca da Media API da Meta (2 etapas: `GET /{media-id}` → URL temporária → download), devolve ao navegador sem persistir | Decidido no Discuss | sim |
| Corrida de takeover simultâneo | Claim condicional: livre (`mode:'bot'`) ou já do mesmo usuário → sucesso idempotente; outro operador diferente do `assignee` atual → erro nomeando quem já assumiu | Decidido no Discuss | sim |
| Permissão de `release` | Incondicional — qualquer operador do tenant (`admin`\|`gestor`\|`operador`) libera qualquer conversa, independente de quem é o `assignee` | Decidido no Discuss: sem mudança em relação ao comportamento atual | sim |
| Poller AD-006 com múltiplas instâncias do `crm-api` | Assume-se instância única nesta rodada | Decidido no Discuss | sim |
| Reenvio manual de `Message failed` | Clona em uma `Message` nova (`status:'queued'`), mesmo conteúdo; a original nunca muda de estado | Decidido no Discuss — resetar o mesmo doc exigiria o `crm-api` transicionar `status` de mensagem existente, hoje exclusividade do `ai-gateway` (`docs/architecture.md`) | sim |
| UI do reenvio | Mensagem original permanece visível com selo "Falhou"; a nova tentativa aparece como bolha nova, mais abaixo na timeline | Decidido no Discuss | sim |
| Definição de "não lida" na fila | Computado, sem campo novo: `lastInboundAt > lastActivityAt` (ambos já gravados hoje — `lastActivityAt` já avança em qualquer ação de operador ou atividade, `lastInboundAt` só em mensagem recebida) | Usuário não foi consultado neste ponto específico — segue o mesmo padrão já estabelecido pela decisão da janela de 24h (reuso de campo existente, zero migração). Revisar no Design se a semântica não bater com o esperado | não confirmado |
| Limite de tentativas de reenvio de uma mesma `Message failed` | Sem limite nesta rodada — cada clique gera uma nova `Message` clonada independente | Não discutido; nenhum requisito de produto pediu um teto | não confirmado |
| Keepalive do WebSocket (ping/pong) | Design decide se é necessário; reconexão do lado cliente cobre quedas de conexão | Detalhe técnico, não de produto | não confirmado — Design decide o mecanismo exato |
| Papel exigido nos novos endpoints (`GET /conversations`, `GET .../messages`, reenvio, preview de mídia) | Mesmo `canOperate` (`admin`\|`gestor`\|`operador`) dos 3 endpoints já existentes | Reuso direto de convenção já ativa (`checkRole`), mesmo padrão do spec do `ai-gateway` para os endpoints headless | não confirmado — reuso de convenção, baixo risco |
| Paginação de `GET /conversations` e `GET /conversations/:id/messages` | Cursor/offset por `createdAt`/`lastActivityAt`, reaproveitando os índices já existentes (`{Tenant,Conversation,createdAt}` em `messages`, `{Tenant,mode,lastActivityAt}` em `conversations`) | Detalhe técnico — Design escolhe a forma exata (cursor vs. offset), seguindo `AD-028` (paginação sempre server-side) | não confirmado — Design decide |

**Open questions:** nenhuma — tudo resolvido ou logado acima.

---

## Varredura de dimensões implícitas

Escopo Large: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | INBOX-05/INBOX-14 — paginação com limites, corpo de reenvio validado pelo mesmo `sendMessageSchema` já existente |
| Falha / falha parcial | INBOX-08 (claim de takeover falha nomeando o dono atual, nunca corrompe o documento), INBOX-18 (mídia indisponível na Meta retorna erro legível, nunca quebra a tela) |
| Idempotência / retry / duplicata | INBOX-08 (mesmo usuário re-clicando "assumir" é idempotente, não erro), INBOX-14 (reenvio nunca modifica a mensagem original — cada tentativa é um documento novo e independente) |
| Fronteiras de auth & rate limit | INBOX-02/INBOX-16/INBOX-17 — mesmo `canOperate` em todos os endpoints novos; WS handshake autenticado pelo cookie httpOnly (AD-014, já decidido, não requisito novo) |
| Concorrência / ordenação | INBOX-08/INBOX-09 — claim condicional de takeover; `release` incondicional documentado como decisão, não como lacuna |
| Ciclo de vida / expiração | N/A explícito para `Conversation`/`Message` (mesma decisão já registrada no `ai-gateway`); mídia da Meta expira sozinha do lado da Meta — INBOX-18 cobre o erro legível quando isso acontece |
| Observabilidade | INBOX-19 (log estruturado de conexão/desconexão WS e de falha ao buscar mídia, mesmo padrão `dbReqResTime`/log já usado no projeto) |
| Falha de dependência externa | INBOX-18 (Media API da Meta) — fallback definido (erro legível), nada trava o processo |
| Integridade de transição de estado | INBOX-08/INBOX-09 (`mode` só muda pelas transições já definidas), INBOX-14/INBOX-15 (uma `Message failed` nunca "volta" de estado — sempre um documento novo) |

---

## User Stories

### P1: Operador vê a fila de conversas ao vivo ⭐ MVP

**User Story**: Como operador, quero ver a lista de conversas do meu tenant — com
indicador de `mode` (bot/human), quem está com a conversa e quais têm mensagem não lida —
atualizada ao vivo, para saber quais conversas precisam da minha atenção sem precisar dar
F5 o tempo todo.

**Why P1**: Sem visibilidade da fila, nenhuma outra funcionalidade desta feature importa —
é o ponto de entrada de tudo.

**Acceptance Criteria**:

1. WHEN um operador autenticado (`canOperate`) chama `GET /conversations` THEN o sistema
   SHALL retornar uma lista paginada, escopada ao `Tenant` da sessão, de conversas com
   `id`, `customer`, `mode`, `assignee`, `lastActivityAt`, indicador `unread` (derivado,
   ver Assumptions) e estado da janela de 24h (aberta/fechada + `windowExpiresAt`,
   derivado sem campo novo).
2. WHEN a query aceita filtro por `mode` (`bot`\|`human`) e/ou `assignee` THEN o sistema
   SHALL retornar só as conversas que casam com o filtro.
3. WHEN um usuário sem papel `admin`\|`gestor`\|`operador` chama `GET /conversations`
   THEN o sistema SHALL responder 403, sem retornar nenhum dado.
4. WHEN uma nova `Message` (`in` ou `out`) é persistida para uma `Conversation` do tenant
   de um cliente WebSocket conectado THEN o sistema SHALL emitir, em até ~2s (poller
   AD-006), um evento que permita à UI atualizar a fila (nova mensagem/novo `unread`) sem
   precisar refazer o `GET /conversations` inteiro.

**Independent Test**: abrir a tela de Inbox, mandar uma mensagem de outro número/sessão
simulando o cliente, ver a conversa subir/atualizar na fila sem refresh manual.

---

### P1: Operador abre uma conversa e vê o histórico ao vivo ⭐ MVP

**User Story**: Como operador, quero abrir uma conversa e ver todo o histórico de
mensagens (texto, mídia, template) paginado, com novas mensagens chegando ao vivo, para
entender o contexto antes de responder.

**Why P1**: É a tela central do Inbox — sem ela, `takeover`/mensagem manual não têm
contexto nenhum.

**Acceptance Criteria**:

1. WHEN um operador chama `GET /conversations/:id/messages` para uma `Conversation` do
   seu `Tenant` THEN o sistema SHALL retornar as mensagens paginadas em ordem cronológica.
2. WHEN o `id` não existe ou pertence a outro `Tenant` THEN o sistema SHALL responder 404
   (mesmo idioma de `customer.service.ts`/`conversation.service.ts` — id ausente e id de
   outro tenant são indistinguíveis).
3. WHEN uma mensagem é do tipo `image`\|`document`\|`audio`\|`location` THEN a resposta
   SHALL conter só o ponteiro (`mediaId`, `mime`, `caption`), nunca o binário.
4. WHEN uma nova `Message` chega para a `Conversation` aberta por um cliente WebSocket
   conectado THEN o sistema SHALL empurrar essa mensagem em tempo real para quem está
   com a thread aberta.

**Independent Test**: abrir uma conversa com histórico longo, confirmar paginação; mandar
mensagem simulando o cliente, ver aparecer na thread aberta sem refresh.

---

### P1: Operador assume e libera uma conversa com segurança sob concorrência ⭐ MVP

**User Story**: Como operador, quero assumir uma conversa (silenciando o bot) e liberá-la
de volta, sabendo que não vou colidir em silêncio com outro operador fazendo a mesma
coisa ao mesmo tempo.

**Why P1**: Sem isso, dois operadores podem "roubar" a conversa um do outro sem perceber
— exatamente a corrida que o roadmap pede para resolver.

**Acceptance Criteria**:

1. WHEN um operador chama `POST /:id/takeover` e a conversa está livre (`mode:'bot'`)
   THEN o sistema SHALL marcá-la `mode:'human'` com `assignee` = esse operador.
2. WHEN o mesmo operador que já é o `assignee` atual chama `POST /:id/takeover` de novo
   THEN o sistema SHALL tratar como sucesso idempotente (sem erro, sem mudar nada
   relevante).
3. WHEN um operador diferente do `assignee` atual chama `POST /:id/takeover` numa
   conversa já em `mode:'human'` THEN o sistema SHALL rejeitar nomeando explicitamente
   quem já assumiu, sem sobrescrever o `assignee` existente.
4. WHEN qualquer operador (`canOperate`) chama `POST /:id/release` THEN o sistema SHALL
   devolver a conversa a `mode:'bot'`, `assignee:null`, independente de quem era o
   `assignee` — sem exigir ser o dono atual.
5. WHEN a UI exibe uma conversa THEN o sistema SHALL mostrar visivelmente o `mode`
   (bot/human) e, quando `human`, o nome do `assignee`.

**Independent Test**: dois usuários (sessões diferentes) clicando "assumir" na mesma
conversa quase ao mesmo tempo — só um consegue, o outro vê o erro nomeado; qualquer um
dos dois consegue liberar depois.

---

### P1: Operador envia mensagem manual, respeitando a janela de 24h ⭐ MVP

**User Story**: Como operador, quero responder ao cliente pelo Inbox quando a janela de
24h está aberta, e ter uma saída clara quando ela está fechada, sem a plataforma precisar
gerenciar templates aprovados na Meta.

**Why P1**: É a ação fim-a-fim do Inbox — ver a fila e o histórico não vale nada se o
operador não consegue responder.

**Acceptance Criteria**:

1. WHEN a janela de 24h está aberta (`windowExpiresAt` no futuro) THEN o composer SHALL
   permitir texto livre, chamando `POST /:id/messages` (`{text}`, endpoint já existente).
2. WHEN a janela de 24h está fechada THEN o composer SHALL desabilitar o campo de texto
   livre e mostrar, no lugar, um botão "Abrir no WhatsApp" que abre
   `https://wa.me/<telefone-do-cliente-em-dígitos>` em nova aba — nenhuma chamada de envio
   é feita pela plataforma nesse caminho.
3. WHEN, por qualquer motivo, um `POST /:id/messages {text}` chega ao backend fora da
   janela (ex.: UI contornada) THEN o sistema SHALL continuar rejeitando com 400
   (comportamento já existente, `OutsideWindowError` — sem regressão).

**Independent Test**: com a janela aberta, mandar texto e ver a mensagem sair; fechar a
janela (ou usar uma conversa com `windowExpiresAt` no passado) e confirmar que o composer
troca para o botão `wa.me`.

---

### P2: Operador reenvia uma mensagem que falhou

**User Story**: Como operador, quero reenviar uma mensagem marcada como `failed` sem
perder o histórico de que ela falhou antes.

**Why P2**: Importante para recuperação de falha de envio, mas a conversa funciona sem
isso no primeiro dia — falhas de envio são a exceção, não a regra.

**Acceptance Criteria**:

1. WHEN uma `Message` tem `status:'failed'` THEN a UI SHALL mostrar um botão "Reenviar"
   nela.
2. WHEN o operador clica "Reenviar" THEN o sistema SHALL criar uma **nova** `Message` com
   o mesmo conteúdo (texto ou `templateName`/`templateLanguage`/`templateParams`) e
   `status:'queued'`, entrando na fila normal do outbox — sem alterar o documento
   original.
3. WHEN a mensagem original `failed` é reenviada THEN ela SHALL permanecer visível na
   thread com seu selo de falha; a nova tentativa SHALL aparecer como uma mensagem nova,
   mais abaixo na timeline.
4. WHEN um usuário sem papel `canOperate` tenta reenviar THEN o sistema SHALL responder
   403.

**Independent Test**: forçar uma `Message` para `status:'failed'` (fixture/dado de teste),
reenviar, confirmar dois documentos distintos no banco e ambos visíveis na thread.

---

### P2: Operador vê preview de mídia recebida sob demanda

**User Story**: Como operador, quero ver uma imagem ou documento que o cliente mandou sem
a plataforma precisar guardar esse arquivo.

**Why P2**: Enriquece o atendimento, mas o operador consegue atender só com o metadado
(nome/tipo) enquanto isso não existe — não bloqueia o MVP do Inbox.

**Acceptance Criteria**:

1. WHEN uma mensagem tem `type: 'image'`\|`'document'` THEN a UI SHALL mostrar um card com
   ícone por tipo, `mime` e `caption` (quando houver), e um botão "Ver"/"Baixar".
2. WHEN o operador clica nesse botão THEN o sistema SHALL chamar uma rota nova do
   `crm-api` que decifra o `accessToken` do `Channel` (mesmo `crypto.helper`/
   `env.CHANNEL_ENC_KEY` de `channel.service.ts`), resolve a URL temporária na Media API
   da Meta e devolve o binário ao navegador, sem persistir em disco.
3. WHEN a mídia não está mais disponível na Meta (URL expirada) THEN o sistema SHALL
   responder com um erro legível e a UI SHALL mostrar essa falha sem quebrar a tela.
4. WHEN um usuário sem papel `canOperate` chama essa rota THEN o sistema SHALL responder
   403, sem tocar a Meta.

**Independent Test**: abrir uma conversa com uma imagem recebida, clicar "Ver", confirmar
que o binário aparece sem nenhum registro de asset criado no banco/disco.

---

## Edge Cases

- WHEN o cliente WebSocket perde a conexão (reinício do `crm-api`, rede) THEN a UI SHALL
  reconectar automaticamente e resincronizar via `GET /conversations`/`GET .../messages`
  normal (nunca travar mostrando dado desatualizado sem indicação).
- WHEN dois operadores têm a mesma thread aberta ao mesmo tempo (sem takeover) THEN ambos
  SHALL receber os mesmos eventos de mensagem nova — não há exclusividade de leitura.
- WHEN uma `Conversation` não tem nenhuma `Message` ainda (`Channel` recém-provisionado)
  THEN a thread SHALL mostrar um estado vazio, sem erro.
- WHEN o operador reenvia a mesma `Message failed` mais de uma vez THEN cada clique SHALL
  gerar uma nova `Message` clonada independente, sem limite nesta rodada (ver Assumptions).
- WHEN o `phone` do `Customer` está em um formato que o `wa.me` não aceita bem (raro, mas
  o campo é livre) THEN o botão SHALL usar o valor como está armazenado — normalização de
  telefone é decisão pré-existente (`crm-core`/`ai-gateway`), não desta feature.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| INBOX-01 | P1: Fila de conversas ao vivo | Verified | ✅ Verified |
| INBOX-02 | P1: Fila de conversas ao vivo | Verified | ✅ Verified |
| INBOX-03 | P1: Fila de conversas ao vivo | Verified | ✅ Verified |
| INBOX-04 | P1: Fila de conversas ao vivo | Verified | ✅ Verified |
| INBOX-05 | P1: Histórico ao vivo | Verified | ✅ Verified |
| INBOX-06 | P1: Histórico ao vivo | Verified | ✅ Verified |
| INBOX-07 | P1: Histórico ao vivo | Verified | ✅ Verified |
| INBOX-08 | P1: Takeover/release seguro | Verified | ✅ Verified |
| INBOX-09 | P1: Takeover/release seguro | Verified | ✅ Verified |
| INBOX-10 | P1: Takeover/release seguro | Verified | ⚠️ Verified with gap (validation.md Fix 1 — assignee name not shown in queue/badge UI, only in the 409 toast) |
| INBOX-11 | P1: Composer + janela 24h | Verified | ✅ Verified |
| INBOX-12 | P1: Composer + janela 24h | Verified | ✅ Verified |
| INBOX-13 | P1: Composer + janela 24h | Verified | ✅ Verified |
| INBOX-14 | P2: Reenvio de `failed` | Verified | ✅ Verified |
| INBOX-15 | P2: Reenvio de `failed` | Verified | ✅ Verified |
| INBOX-16 | P2: Reenvio de `failed` | Verified | ✅ Verified |
| INBOX-17 | P2: Preview de mídia | Verified | ✅ Verified |
| INBOX-18 | P2: Preview de mídia | Verified | ✅ Verified |
| INBOX-19 | (transversal) Observabilidade WS/mídia | Verified | ✅ Verified |

**ID format:** `INBOX-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Verifier report:** `.specs/features/inbox-realtime/validation.md` (independent Verifier,
2026-09-08) — 23/24 spec-anchored ACs matched precisely, 1 gap (INBOX-10/AC5), gate green
(874/874), 3/3 discrimination-sensor mutations killed. See that file for the full
evidence trail and Fix Plans.

**Coverage:** 19 total, 19 mapped to tasks (`.specs/features/inbox-realtime/tasks.md`,
T1–T26), 0 unmapped ⚠️

---

## Success Criteria

- [ ] Uma mensagem nova do cliente aparece na fila e na thread aberta em até ~2s sem
      refresh manual (dentro do orçamento do poller AD-006).
- [ ] Dois operadores tentando assumir a mesma conversa ao mesmo tempo: exatamente um
      consegue, o outro recebe erro nomeando quem já assumiu — nunca os dois "ganham"
      silenciosamente.
- [ ] Reenviar uma `Message failed` produz uma nova tentativa visível na thread sem apagar
      ou reescrever a mensagem original.
- [ ] Composer alterna corretamente entre texto livre e botão `wa.me` conforme o estado da
      janela de 24h, sem exigir nenhum campo novo no Mongo.
- [ ] `pnpm run check` (typecheck + Biome + testes) limpo, mesma gate de todo o projeto
      (AD-017/AD-031).
