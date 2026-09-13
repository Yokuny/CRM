# scheduling Context

**Gathered:** 2026-09-10
**Spec:** `.specs/features/scheduling/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Agenda (feature 9 de 11). Hoje não existe nada de agenda no repo: nenhum model de
`Event`/`Appointment`, nenhum horário de funcionamento, nenhum campo de fuso em `Tenant`, e a
superfície de tools tem 8 das 10 previstas (ADR-0004). Esta feature entrega:

1. Models novos de agenda: quem atende, onde atende, o agendamento em si e a grade semanal de
   disponibilidade.
2. Tools Anel A novas: `get_available_slots` e `book_appointment` — a superfície fixa passa de
   8 para 10 tools ([AD-004](../../STATE.md)), tenant sempre do `ToolContext`
   ([AD-010](../../STATE.md)).
3. Confirmação de presença pelo próprio cliente, por link público com token opaco.
4. Telas de agenda e de configuração no `apps/web`, mais um card inline na thread do Inbox
   (feature 6 — a dependência declarada no roadmap).

Anel A significa autônomo: `book_appointment` cria o agendamento sem liberação do operador
([AD-009](../../STATE.md)) — diferente de `create_order`/`issue_payment_link`, que são Anel B.

---

## Implementation Decisions

Quatro zonas cinzentas foram levantadas e **todas as quatro foram discutidas** (2026-09-10), em
rodadas de perguntas com opções concretas e trade-off declarado por opção.

### 1. Unidade de agenda: dois eixos, `Space` e `Professional`

- O usuário rejeitou tanto a agenda única quanto a agenda por `User`, com dois cenários reais:
  um salão com **3 barbeiros dentro de uma sala só** (cada um com sua agenda) e um consultório
  com **várias salas onde mais de um profissional atende**. A forma mais ampla é sala +
  profissional.
- Nomes **em inglês e genéricos**, exigência explícita do usuário ("o sistema deve servir para
  qualquer cenário e profissão"): `Space` (ambiente de atendimento — sala, cadeira, mesa,
  quadra) e `Professional` (quem presta o atendimento).
- **`Space` não restringe disponibilidade.** É informativo: aparece no agendamento e serve de
  filtro na tela, mas não limita quantos atendimentos acontecem nele ao mesmo tempo. É o que faz
  o caso do salão funcionar sem inventar uma abstração por cadeira. Consequência aceita: duas
  pessoas podem ser marcadas na mesma sala de uma cadeira só — o sistema não impede.
- **A grade semanal e a duração do slot pertencem ao `Professional`**, não ao `Space`. Um
  horário está livre quando o profissional está dentro da grade dele e não tem nada ocupando
  aquele intervalo.

### 2. Grade semanal, duração e fuso

- Grade **semanal por profissional, com 0..N janelas por dia da semana** (ex.: seg–sex 08–12 e
  13–18, sáb 08–12) — cobre intervalo de almoço, ao contrário da grade de janela única.
- **Duração de slot fixa por profissional** (ex.: 30 ou 60 min); todo agendamento ocupa
  exatamente um slot. Catálogo de serviços com duração própria foi recusado nesta rodada.
- **Fuso**: instrução literal do usuário — "evitar fuso, sempre o fuso vai ser em +0 e apenas no
  momento de apresentação deve ser calculado e aplicado o timezone partindo do +0". Traduzindo
  para as duas naturezas de dado:
  - **Instantes** (`start`/`end` do agendamento) são gravados em UTC, sem exceção.
  - **Regra recorrente** (a grade "seg a sex, 08:00") não é um instante e não tem UTC próprio:
    é hora de parede. Fica gravada como `HH:mm` e é interpretada na **constante de exibição**
    que o `contextBuild` já usa hoje (`America/Sao_Paulo`). A alternativa — converter a grade
    para UTC na gravação — foi apresentada e recusada, porque deforma a regra: uma janela
    21:00–23:00 local vira o dia seguinte no UTC e muda o dia da semana gravado.
  - Nenhum campo de fuso por tenant é criado. Tenant fora do horário de Brasília fica com
    horários deslocados — limitação aceita e registrada.

### 3. O que o cliente faz pela conversa

- `get_available_slots` devolve cada horário **com a lista de profissionais livres nele**;
  `book_appointment` exige o profissional escolhido. O cliente pode pedir alguém específico ou
  aceitar quem for oferecido — o sistema nunca escolhe sozinho.
- **`get_available_slots` também devolve os agendamentos futuros do cliente** desta conversa.
  Decisão explícita do usuário, escolhida em vez de injetar isso no bloco dinâmico do
  `contextBuild`. Trade-off que ele aceitou ao escolher: junta duas responsabilidades no mesmo
  resultado de tool, em troca de não mexer no `contextBuild` (feature 5) nem criar tool nova.
- **Limites do agendamento pela IA**, todos confirmados com valores ajustados pelo usuário:
  - horizonte máximo: **90 dias** à frente (o usuário subiu de 30 para 90);
  - antecedência mínima: **1 hora** (o usuário baixou de 2h para 1h);
  - **no máximo 1 agendamento futuro ativo por cliente** — enquanto tiver um, a IA não cria
    outro;
  - **teto de horários por resposta: 16, porém configurável por tenant**, na tela de
    configuração da agenda (o usuário pediu explicitamente que fosse configurável, e escolheu
    "por tenant" em vez de constante de código ou variável de ambiente).
- Cancelar e remarcar **pela IA** ficam fora: exigiriam tools além das duas que o roadmap
  define para esta feature. O cliente cancela pela página pública de confirmação (decisão 4).

### 4. Confirmação de presença pelo cliente

- O usuário recusou o ciclo de vida mínimo e pediu **confirmação de presença pelo próprio
  cliente**, com o mecanismo já usado na referência: **link público com passkey**, entregue por
  **wa.me / WhatsApp Web**.
- **Estados**: `pending` → `confirmed` → `completed` | `no_show`, mais `canceled_by_customer` e
  `canceled_by_operator` — distinguindo quem cancelou, como na referência.
- **Geração e entrega do link**: ao agendar pela conversa, a IA já devolve o link na resposta
  (a janela de 24h está aberta por definição — o cliente acabou de escrever, então é mensagem
  normal, sem template HSM). Para agendamento criado no CRM, o operador clica "Pedir
  confirmação" e recebe um link `wa.me` com texto pronto.
- **Página pública**: ver os dados do agendamento, confirmar presença ou cancelar — as mesmas
  duas ações da referência (`../DentalEase/DentalEase/src/routes/_public/schedule/$code/`, que
  o usuário indicou como base visual e de conteúdo). Remarcar pela página pública ficou fora.
- **Desvio deliberado da referência (segurança)**: lá, a mutação de confirmação é
  `PUT /schedule/confirm/:id` — recebe o **id do agendamento**, então quem descobrir um id
  confirma ou cancela horário alheio. Aqui a mutação é identificada **pelo token**, nunca pelo
  id, e o token é gravado **hasheado**, seguindo o precedente que já existe no repo
  (`Invite.tokenHash`, `hashToken`, rota pública `invite.router.ts`) em vez do code em texto
  claro da referência (`Passkey.code`).

### 5. Operação da agenda no CRM

- **Visão**: calendário **semanal com uma coluna por dia** (7 colunas), com filtro por
  profissional e por ambiente. O usuário preferiu isso à coluna-por-profissional; o calendário
  com arrastar-e-soltar da referência (~1.800 linhas de componentes) ficou fora.
- **Ações do operador no P1, todas as quatro marcadas**: criar agendamento manual, cancelar,
  remarcar e bloquear horário (bloqueio sem cliente — folga, feriado, almoço pontual, reunião —
  que ocupa o horário e some das opções que a IA oferece).
- Telas de configuração para profissionais (com grade e duração), ambientes e o teto de
  horários por resposta.

### 6. Avisos ao cliente

- **Cancelamento/remarcação pelo operador**: mensagem automática **dentro** da janela de 24h,
  enfileirada na outbox que já existe ([AD-007](../../STATE.md)); **fora** da janela, botão
  `wa.me` na tela de agenda — o mesmo fallback que o composer do Inbox já faz hoje
  (`composer.tsx`, INBOX-11/12/13). Nenhuma chamada direta à Meta nesta feature.
- **Lembrete antes do horário fica fora do P1**: um lembrete útil (24h antes) quase sempre cai
  fora da janela de 24h e exigiria template HSM aprovado ([AD-005](../../STATE.md)) — escopo de
  feature própria.
- **Agendamento com horário vencido e sem marcação continua no estado em que está.** Nenhum
  worker fecha como concluído automaticamente: o sistema nunca registra como atendido quem
  talvez não apareceu. A tela destaca os vencidos sem marcação.

### Agent's Discretion

Pontos deixados a critério do Design, desde que o comportamento acima seja respeitado:

- Modelagem exata do bloqueio de horário: `Appointment` sem cliente (forma da referência) vs.
  model próprio. O roadmap cita "`Event`/`Appointment`", o que admite os dois.
- Onde vive o algoritmo de slots (`packages/db` compartilhado vs. dentro de um app) e a forma
  exata da garantia anti-corrida de dupla reserva.
- Validade e política de reemissão do token de confirmação.
- Nomes exatos de collections, rotas e índices; forma da paginação onde houver.
- Construir os componentes de calendário do zero vs. portar da referência.
- Formato exato do texto pronto dos links `wa.me`.

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área foi recusada — as quatro levantadas foram discutidas. Os pontos de menor alcance
que não foram levantados no Discuss estão registrados como Assumptions no `spec.md`, cada um
com default e justificativa: vínculo (ausente) entre `Professional` e `User`, obrigatoriedade
de `Space` no agendamento, campo de observação livre, onde vivem horizonte e antecedência
mínima (constantes, não configuração por tenant), e o rate limit da rota pública.

---

## Specific References

- **`../DentalEase/DentalEase-BackEnd`** — a mesma referência que AD-012 já nomeou para
  pagamentos tem a agenda inteira: `helpers/slots.helper.ts` (`computeFreeSlots`,
  `isSlotAligned`, grade semanal + duração de slot), `use-cases/assistant-tools.ts` (tools com
  **os mesmos dois nomes** `get_available_slots`/`book_appointment`, incluindo recheque de
  conflito imediatamente antes de criar), `database/schedule.database.ts` e
  `services/shared/schedule.ts` (passkey de confirmação + link `wa.me`). É precedente literal,
  não analogia — mas com três adaptações obrigatórias: o modelo lá é sala **restritiva** +
  profissional sem grade própria, a grade é do tenant inteiro, e a mutação de confirmação é
  identificada pelo id do agendamento (ver decisão 4).
- **`../DentalEase/DentalEase/src/routes/_public/schedule/$code/`** — indicado pelo usuário
  como base da página pública de confirmação (layout, campos exibidos, os dois botões).
- **No próprio repo**: `Invite`/`hashToken`/`invite.router.ts` (token opaco hasheado + rota
  pública) e `composer.tsx` (fallback `wa.me` de janela fechada) são os precedentes internos
  reusados no lugar dos equivalentes da referência.

---

## Deferred Ideas

- Cancelar e remarcar pela IA (exigiria tools além das duas do roadmap).
- Lembrete automático antes do atendimento e qualquer notificação ativa fora da janela de 24h —
  depende de template HSM aprovado (AD-005), escopo de feature própria.
- Catálogo de serviços com duração própria por serviço (slots de tamanho variável).
- Capacidade por ambiente (`Space` passando a restringir ocupação simultânea).
- Fuso por tenant (hoje a constante de exibição é única, `America/Sao_Paulo`).
- Calendário com arrastar-e-soltar e visões dia/mês, como na referência.
- Sincronização com Google Calendar (existe na referência, `google.schedule.service.ts`).
- Agendamento recorrente (toda terça, por N semanas).
- Remarcar pela página pública de confirmação.
- Vínculo entre `Professional` e `User` (profissional que faz login e vê só a própria agenda).
