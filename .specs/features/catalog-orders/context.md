# Catalog Orders Context

**Gathered:** 2026-09-09
**Spec:** `.specs/features/catalog-orders/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Catálogo e pedidos — destrava o Anel B inteiro (feature 7/11). Hoje não existe nenhum
`Product`/`Order` no repo, e a superfície de tools tem só as 4 do Anel A da feature 5
(`get_process_template`, `find_or_create_customer`, `open_process`, `set_process_fields`).
Esta feature entrega:

1. Models `Product` (schema fixo) e `Order` (dois anéis: nasce `pending_approval`, vira
   `confirmed` ou `rejected`).
2. Tools Anel A novas: `search_products`, `get_order_status`.
3. Tool Anel B nova: `create_order` — primeira tool do Anel B implementada no projeto.
4. `guard.output` ganha a regra "preço só de tool result desta conversa" — primeira tool
   que retorna preço, então o guard nunca teve produtor real pra testar até agora
   ([AD-009](../../STATE.md), ADR-0004, glossário — Guardrail).
5. Telas de gestão de catálogo (CRUD de `Product`) e de aprovação de pedido
   (`Pedidos pendentes`) em `apps/web`, mais um card inline na thread do Inbox (feature 6).

---

## Implementation Decisions

### 1. Shape do `Product`

- Schema fixo (não usa o field-engine): `name`, `sku` (opcional, sem unicidade exigida —
  não foi levantado como requisito), `description`, `price` (inteiro em centavos),
  `stock` (inteiro), `active` (boolean). Segue o padrão de `channel.model.ts` — nenhum
  campo dinâmico por tenant nesta rodada.
- Preço sempre em **inteiro, em centavos** — evita erro de ponto flutuante e já usa a
  mesma unidade que a feature 8 (`payments-asaas`) vai consumir do gateway.

### 2. Estoque — rastreado, reservado só na confirmação

- `Product.stock` é rastreado e imposto por `create_order`.
- A reserva (decremento) **não acontece** quando o `Order` nasce `pending_approval` — só
  no exato momento em que as duas condições da transição se completam (confirmação do
  cliente **e** aprovação do operador). Até lá, dois pedidos `pending_approval` podem
  competir pela mesma última unidade sem nenhum bloqueio prévio — a atomicidade fica
  inteiramente no momento da confirmação.
- Consequência direta e desejada: **rejeitar** um `Order` nunca precisa devolver estoque
  a lugar nenhum, porque nenhuma reserva foi feita enquanto ele estava pendente.
- Se a checagem atômica falhar no momento da confirmação (estoque insuficiente pra
  qualquer item), o `Order` **permanece `pending_approval`** com um motivo de erro exposto
  ao operador — nenhuma mudança automática de estado, nenhum decremento parcial (tudo ou
  nada por item).

### 3. Confirmação explícita do cliente — capturada em código, não só no prompt

- ADR-0009 exige que a confirmação do cliente seja uma condição checável, não uma
  suposição do modelo ("a regra vive no código, não no prompt" — glossário, Guardrail).
  O roadmap lista só uma tool de Anel B (`create_order`) para esta feature, então a
  captura acontece dentro da própria tool, em **duas chamadas**:
  1. 1ª chamada (`customerConfirmed` ausente ou `false`): cria o `Order` `pending_approval`
     com `customerConfirmed:false`, devolve um resumo que o modelo tem que ler de volta ao
     cliente.
  2. Depois que o cliente responde afirmativamente na conversa, o modelo chama
     `create_order` **de novo**, com a **mesma** `idempotencyKey` e `customerConfirmed:true`
     — isso atualiza o **mesmo** `Order` (nunca cria um segundo), marcando a confirmação do
     cliente como um campo persistido, verificável, não uma inferência do modelo.
  - As duas chamadas devem ter os **mesmos `items`**. Se divergirem, a 2ª chamada retorna
    `{error}` sem tocar o `Order` existente — protege contra reuso indevido de uma
    `idempotencyKey` pra um pedido diferente.
  - Se `customerConfirmed:true` chega sem um `Order` `pending_approval` prévio com essa
    `idempotencyKey`, a tool retorna `{error}`.
  - Se a `idempotencyKey` já aponta pra um `Order` terminal (`confirmed`/`rejected`), uma
    nova chamada com essa key retorna o estado atual sem mutar nada (leitura idempotente,
    não erro) — protege contra chamada tardia/duplicada do modelo.

### 4. Aprovação do operador — qualquer operador, não só o assignee da conversa

- Aprovar/rejeitar um `Order` **não** está preso ao `assignee` da `Conversation`
  (diferente do takeover da feature 6) — qualquer operador do tenant com a mesma
  permissão já usada nos endpoints existentes (`canOperate`) pode agir sobre qualquer
  pedido pendente do tenant.
- Consequência: como a aprovação é desacoplada de "estar naquela conversa", o operador
  precisa de uma forma de achar pedidos pendentes sem depender de navegar pra conversa
  certa (ver decisão 5).
- Aprovar e a confirmação do cliente são condições **independentes** — qualquer uma pode
  acontecer primeiro. A transição pra `confirmed` (e a checagem atômica de estoque, ver
  decisão 2) só dispara no momento em que a **segunda** condição se completa, seja ela
  qual for.
- Rejeição entra no P1: `Order.status` inclui `rejected`, com motivo opcional
  (`rejectionReason`) e quem rejeitou (`rejectedBy`). É uma transição terminal — assim
  como `confirmed`. Uma vez terminal, novas chamadas de aprovar/rejeitar retornam erro
  sem mudar nada.

### 5. UI de aprovação — inline + tela simples de fila (dupla superfície, decisão explícita)

- **Duas superfícies no P1, não uma:**
  1. Um card inline na thread da conversa (Inbox, feature 6) mostrando o `Order`
     `pending_approval` daquela conversa específica, com botões Aprovar/Rejeitar — dá
     contexto pra quem já está atendendo aquele cliente.
  2. Uma tela nova, **simples** (lista/tabela básica, sem design rico) — "Pedidos" — que
     lista `Order`s do tenant com filtro por `status` (default `pending_approval`, mas
     também serve pra ver `confirmed`/`rejected` como histórico, reusando a mesma tela
     em vez de construir uma segunda do zero). É o que permite a "qualquer operador"
     achar pedidos pendentes sem depender de estar na conversa certa.
- **Design rico dessa tela de Pedidos é explicitamente adiado** — o P1 entrega algo
  funcional (tabela + ações), não um kanban ou uma UI elaborada; fica registrado como
  ideia futura (ver Deferred Ideas) para uma iteração de design melhorar depois.

### 6. `guard.output` — escopo do preço citado

- A regra "preço só de tool result desta conversa" (glossário, ADR-0004) é implementada
  no escopo **deste turno**: `guard.output` valida contra os `tool_result`s já disponíveis
  em memória no turno atual (`loopResult.rawTurn`), sem precisar ler o banco de novo —
  reusa exatamente o dado que `guardOutput` já recebe indiretamente hoje, só que agora
  também passado pra função (hoje ela só recebe a `string` da resposta).
- Quando a IA cita um valor monetário na resposta que não bate com nenhum preço presente
  nos tool results deste turno, `guard.output` **redige** esse valor (mesmo padrão do
  redaction de ObjectId já existente) em vez de bloquear o turno inteiro — e registra a
  ocorrência para observabilidade.

### 7. `search_products` / `get_order_status` — sem paginação

- `search_products` devolve um **top-N fixo** (Design escolhe o N exato, ex.: 5) de
  produtos `active` que casam com a busca — nunca uma lista paginada; é uma tool chamada
  dentro de um chat, não uma tela.
- `get_order_status` aceita um `orderId` **opcional**: se informado, precisa pertencer à
  mesma `conversation` do `ToolContext` (senão `{error}` — nunca vaza pedido de outro
  cliente); se omitido, a tool devolve o `Order` mais recente dessa `conversation`.

### 8. Gestão de catálogo — telas de CRUD de `Product` entram no P1

- Sem alguma forma de o tenant cadastrar produtos, `search_products`/`create_order` não
  têm o que testar de ponta a ponta. Telas simples de lista/adicionar/editar `Product`
  em `apps/web`, no mesmo padrão de Customer/Process (feature 4) — sem isso a feature não
  fica demonstrável.

### Agent's Discretion

- Nome exato dos campos internos de bookkeeping no `Order` (ex.: como representar
  "operador já aprovou" separado do `status` público) — Design escolhe a modelagem
  exata, desde que o comportamento observável das decisões 2/3/4 acima seja respeitado.
- Mecanismo exato de matching de valor monetário no `guard.output` (regex, formato
  aceito) — Design escolhe.
- N exato do top-N de `search_products`.
- Paginação exata de `GET /products`/`GET /orders` (cursor vs. offset) — Design escolhe
  seguindo o padrão já usado (`AD-028`, rotas `/partial` quando aplicável).

### Declined / Undiscussed Gray Areas → Assumptions

- Nenhuma — todos os pontos levantados no Discuss (shape/preço de `Product`, regras de
  estoque, idempotência de `create_order`, escopo do guard de preço, quem aprova, onde a
  aprovação aparece na UI, rejeição, expiração, cadastro de produto) foram discutidos e
  resolvidos acima. Pontos menores não levantados no Discuss (unicidade de `sku`, moeda,
  limites de quantidade por item) ficam registrados como Assumptions no `spec.md`.

---

## Specific References

- Nenhuma referência visual/produto específica trazida pelo usuário nesta sessão — as
  decisões vieram de resolver as lacunas já mapeadas no `docs/roadmap.md` (seção 7) e nos
  ADRs 0004/0009.

---

## Deferred Ideas

- Design rico da tela "Pedidos" (kanban, filtros avançados, indicadores visuais) — o P1
  entrega uma tabela simples funcional; a melhoria de design fica para uma iteração
  futura, fora desta feature.
- Expiração automática de `Order pending_approval` (sweep parecido com o idle takeover da
  feature 6) — decidido como fora de escopo do P1; revisitar se pedidos esquecidos
  virarem um problema real.
- Edição de itens (produto/quantidade) de um `Order` já criado, seja pelo cliente ou pelo
  operador — não discutido, fora de escopo; hoje só existe criar (duas chamadas),
  aprovar e rejeitar.
- Notificação em tempo real (WebSocket) quando um novo `Order pending_approval` é criado
  — o WS da feature 6 só empurra `Message` nova; um `Order` novo não gera nenhum evento
  dedicado nesta rodada. Operador descobre abrindo a conversa ou a tela de Pedidos.
