# scheduling Specification

## Problem Statement

O bot já conversa, abre processo, vende e cobra — mas não sabe marcar hora. Não existe nenhum
model de agenda no repo (`Event`/`Appointment` foi adiado explicitamente no `crm-core`), nenhuma
noção de horário de funcionamento, e as duas últimas tools do Anel A previstas no ADR-0004
(`get_available_slots`, `book_appointment`) nunca puderam ser implementadas por falta de domínio
para consultar. Para a maior parte dos negócios de atendimento (salão, clínica, consultoria,
oficina), marcar horário pelo WhatsApp é o caso de uso principal — e hoje ele cai inteiro no colo
do operador.

## Goals

- [ ] Tenant cadastra quem atende, com grade semanal e duração de atendimento, e onde o
      atendimento acontece.
- [ ] Cliente consulta horários livres e marca sozinho pela conversa de WhatsApp, sem operador,
      sem nunca conseguir marcar em horário inexistente, ocupado ou fora da grade.
- [ ] Cliente confirma presença ou desmarca por um link próprio, sem depender de o operador
      interpretar a conversa.
- [ ] Operador vê a semana inteira, cria encaixe, cancela, remarca e bloqueia horário; quando
      cancela ou remarca, o cliente é avisado automaticamente se a janela de 24h permitir.
- [ ] Dois clientes disputando o mesmo horário do mesmo profissional: exatamente um consegue.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Item | Motivo |
| --- | --- |
| Cancelar/remarcar **pela IA** | Exigiria tools além das duas que o roadmap define para esta feature. O cliente cancela pela página pública de confirmação; remarcar é ação de operador |
| Lembrete automático antes do atendimento | Um lembrete útil (24h antes) quase sempre cai fora da janela de 24h e exige template HSM aprovado (AD-005) — feature própria. Decidido no Discuss |
| Notificação ativa fora da janela de 24h | Mesma razão: sem HSM, não existe mensagem iniciada pela plataforma. Fora da janela o sistema oferece o `wa.me` para o operador mandar |
| Catálogo de serviços com duração própria | Decidido no Discuss: duração é fixa por profissional. Slots de tamanho variável são escopo bem maior |
| Capacidade por ambiente | Decidido no Discuss: `Space` é informativo e não restringe ocupação simultânea |
| Fuso por tenant | Decidido no Discuss: instante em UTC, exibição na constante única `America/Sao_Paulo`, sem campo de fuso |
| Calendário com arrastar-e-soltar, visões dia/mês | Decidido no Discuss: semana com coluna por dia. O calendário completo da referência são ~1.800 linhas de componentes |
| Agendamento recorrente | Não mencionado no roadmap nem levantado no Discuss |
| Sincronização com Google Calendar | Existe na referência (`google.schedule.service.ts`), fora do roadmap desta feature |
| Vínculo `Professional` ↔ `User` (profissional com login) | Não levantado; `Professional` é cadastro de agenda, não conta de acesso. Ver Assumptions |
| Pagamento/cobrança do atendimento | Feature 8 já entregue cobre `Order`; agendamento não gera cobrança nesta rodada |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear. As quatro zonas
cinzentas levantadas foram **todas discutidas** com o usuário (2026-09-10, registro completo em
[`context.md`](context.md)); os itens marcados `n` abaixo não foram levantados no Discuss e são
defaults do agente, cada um com justificativa.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Unidade de agenda | Dois eixos: `Space` (ambiente) + `Professional` (quem atende), nomes genéricos em inglês | Decisão do usuário, com os cenários salão/consultório | y |
| `Space` restringe disponibilidade? | Não — informativo, usado em filtro e registro | Decisão do usuário (salão: 3 barbeiros, 1 sala) | y |
| Dono da grade e da duração | `Professional` | Decisão do usuário | y |
| Forma da grade | Semanal, 0..N janelas por dia da semana | Decisão do usuário | y |
| Duração do atendimento | Fixa por profissional; todo agendamento ocupa 1 slot | Decisão do usuário | y |
| Fuso | Instantes em UTC; grade em hora de parede interpretada na constante `America/Sao_Paulo` (a mesma que o `contextBuild` já usa); conversão só na exibição | Decisão do usuário ("evitar fuso, sempre +0, aplicar timezone na apresentação") + a ressalva de que regra recorrente não tem UTC próprio | y |
| Escolha do profissional pelo cliente | Cada horário vem com a lista de profissionais livres; `book_appointment` exige o escolhido | Decisão do usuário | y |
| Como a IA responde sobre agendamento já feito | `get_available_slots` devolve também os agendamentos futuros do cliente | Decisão do usuário (escolhida em vez de injetar no `contextBuild`) | y |
| Horizonte máximo | 90 dias | Decisão do usuário (ajustou de 30 para 90) | y |
| Antecedência mínima | 1 hora | Decisão do usuário (ajustou de 2h para 1h) | y |
| Agendamentos futuros ativos por cliente | No máximo 1, para agendamento criado pela IA | Decisão do usuário | y |
| Teto de horários por resposta | 16 por default, **configurável por tenant** na tela de agenda | Decisão do usuário (pediu configurável; escolheu por tenant) | y |
| Estados | `pending` → `confirmed` → `completed` \| `no_show`; `canceled_by_customer`; `canceled_by_operator` | Decisão do usuário (distinguir quem cancelou) | y |
| Confirmação de presença | Pelo cliente, em página pública aberta por link com token opaco, entregue por wa.me | Decisão do usuário | y |
| Quem gera/entrega o link | IA devolve o link ao agendar (janela aberta por definição); no CRM, botão "Pedir confirmação" gera link `wa.me` | Decisão do usuário | y |
| Ações na página pública | Ver, confirmar presença, cancelar | Decisão do usuário, com a página da referência como base | y |
| Mutação de confirmação identificada por | **Token** (hasheado em repouso), nunca pelo id do agendamento | Desvio deliberado da referência, onde `PUT /schedule/confirm/:id` aceita o id e permite confirmar/cancelar horário alheio. Precedente interno: `Invite.tokenHash` | y |
| Visão da agenda | Calendário semanal, coluna por dia, filtro por profissional e ambiente | Decisão do usuário | y |
| Ações do operador | Criar manual, cancelar, remarcar, bloquear horário | Decisão do usuário (marcou as quatro) | y |
| Card no Inbox | Sim, card inline com o próximo agendamento do cliente | Decisão do usuário | y |
| Aviso de cancelamento/remarcação | Automático (outbox) dentro da janela de 24h; `wa.me` fora dela | Decisão do usuário | y |
| Lembrete antes do horário | Fora do P1 | Decisão do usuário | y |
| Horário vencido sem marcação | Continua no estado atual; nenhum worker fecha sozinho | Decisão do usuário | y |
| Vínculo `Professional` ↔ `User` | Nenhum: `Professional` é cadastro de agenda, sem login | Nada no Discuss pediu que o profissional acesse o sistema, e exigir conta quebraria o caso do barbeiro/atendente sem acesso ao CRM. Aditivo depois, sem migração destrutiva | n |
| `Space` no agendamento | Opcional | `Space` não restringe nada (decisão do usuário); exigi-lo obrigaria um tenant que só tem profissionais a cadastrar um ambiente fictício | n |
| Observação no agendamento | Campo de texto livre opcional (`notes`), preenchível pelo operador; a IA não coleta | Registro de "motivo do atendimento" é esperado numa agenda, mas coletar isso na conversa não foi pedido e ampliaria a tool | n |
| Onde vivem horizonte (90d) e antecedência (1h) | Constantes exportadas em código, não configuração por tenant | O usuário pediu configurável **apenas** para o teto de horários; transformar os outros dois em campo de tenant seria escopo não pedido. Mesmo precedente de `PAYMENT_EXPIRATION_HOURS` (feature 8) | n |
| Rate limit da rota pública de confirmação | Sim, reusando o `rateLimit.middleware.ts` já existente | A rota é anônima e recebe token na URL: sem limite, vira alvo de varredura. A referência também limita a rota equivalente | n |
| Limites da IA valem para o operador? | Não — o operador pode encaixar fora da grade, sem horizonte, sem antecedência mínima e com mais de um agendamento por cliente; a única regra que continua valendo é não sobrepor o mesmo profissional | Encaixe é operação real de balcão; os tetos existem para conter a IA, não a pessoa. Sobreposição do mesmo profissional continua barrada porque é impossível no mundo físico | n |
| Papel exigido nas rotas novas do CRM | Mesmo `canOperate` (`admin`\|`gestor`\|`operador`) já usado em `product.router.ts`/`order.router.ts` | Reuso direto da convenção ativa | n |
| Validade do token de confirmação | Expira no fim do agendamento; pedir de novo invalida o anterior | Um token que sobrevive ao atendimento não serve para nada e só aumenta a superfície. Reemissão substituir o anterior é o comportamento da referência (`postPasskey` apaga o anterior) | n |
| Status depois de remarcação pelo operador | Volta para `pending`, limpa `confirmedAt` e a validade do token acompanha o novo `end` | A confirmação do cliente valia para o horário antigo; manter `confirmed` num horário que ele nunca confirmou seria informação falsa para o operador. Achado na fase Tasks ao detalhar SCH-31 | n |
| Duração ao remarcar | Preservada (`end − start` original), mesmo trocando de profissional | Mesmo princípio do Edge Case "mudar a duração do profissional não reescreve agendamento já marcado" | n |
| Faixa de `maxSlotsPerResponse` | Inteiro `1..50` | Teto de sanidade, mesma lógica do `1..100` de quantidade em `create_order`: 50 horários já é mais do que cabe numa mensagem legível de WhatsApp | n |

**Open questions:** nenhuma — tudo resolvido ou logado acima.

---

## Varredura de dimensões implícitas

Escopo Complex: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | SCH-02 (grade: janela com fim ≤ início, duração fora de faixa, dia da semana inválido), SCH-10/SCH-11 (data fora do formato, passada ou além de 90 dias), SCH-16 (start desalinhado, no passado, com menos de 1h, ou de outro tenant) |
| Falha / falha parcial | SCH-17 (falha na criação não deixa agendamento nem token órfão), SCH-39 (mensagem de aviso é enfileirada, nunca enviada direto — falha de envio é problema da outbox já existente, o cancelamento continua válido) |
| Idempotência / retry / duplicata | SCH-18 (retry exato de `book_appointment` devolve o existente), SCH-25 (repetir a mesma ação com o mesmo token é idempotente) |
| Fronteiras de auth & rate limit | SCH-07 (`canOperate` nas rotas do CRM), SCH-19 (tenant/canal/conversa só do `ToolContext`, teste estrutural cobre as 2 tools novas), SCH-23/SCH-26 (rota pública anônima, identificada por token, rate-limited, nunca por id) |
| Concorrência / ordenação | SCH-20 (duas reservas concorrentes no mesmo profissional+horário: exatamente uma vence), SCH-31 (remarcação concorrente respeita a mesma garantia) |
| Ciclo de vida / expiração | SCH-24 (token expira e é substituído na reemissão), SCH-35 (agendamento vencido sem marcação permanece no estado atual, destacado — nenhuma transição automática) |
| Observabilidade | SCH-36 (log estruturado em agendamento criado, cancelado e confirmado, mesmo padrão `console.log(JSON.stringify({event}))` já usado no harness) |
| Falha de dependência externa | `N/A` explícito — esta feature não chama nenhuma API externa. O aviso ao cliente entra na outbox (AD-007) e quem fala com a Meta continua sendo o `ai-gateway`, sem mudança |
| Integridade de transição de estado | SCH-21/SCH-22 (`pending`→`confirmed`, `pending`/`confirmed`→`canceled_by_customer`), SCH-25 (ação sobre estado terminal não muda nada), SCH-30 (cancelamento pelo operador), SCH-34 (`completed`/`no_show` só depois do horário) |

---

## User Stories

### P1: Tenant configura quem atende, onde e quando ⭐ MVP

**User Story**: Como operador, quero cadastrar os profissionais com a grade semanal e a duração
de atendimento de cada um, e os ambientes de atendimento, para que exista horário livre a ser
oferecido.

**Why P1**: Sem grade não existe slot; nenhuma outra história desta feature é demonstrável.

**Acceptance Criteria**:

1. WHEN um operador (`canOperate`) cria um `Professional` com `{name, slotDurationMinutes,
   weeklySchedule}` — onde `weeklySchedule` é uma lista de janelas `{weekday 0..6, start "HH:mm",
   end "HH:mm"}`, admitindo mais de uma janela no mesmo dia — THEN o sistema SHALL persistir o
   registro escopado ao `Tenant`, com `active` default `true`. `[SCH-01]`
2. WHEN uma janela tem `end` menor ou igual a `start`, ou `weekday` fora de `0..6`, ou
   `start`/`end` fora do formato `HH:mm`, ou `slotDurationMinutes` fora da faixa `5..480` THEN o
   sistema SHALL rejeitar com 400, sem persistir nem criar nada parcial. `[SCH-02]`
3. WHEN duas janelas do mesmo `weekday` do mesmo profissional se sobrepõem THEN o sistema SHALL
   rejeitar com 400 (uma grade ambígua produziria slot duplicado). `[SCH-03]`
4. WHEN um operador cria, lista ou edita um `Space` `{name}` THEN o sistema SHALL persistir
   escopado ao `Tenant`, com `active` default `true`. `[SCH-04]`
5. WHEN um `Professional` é marcado `active:false` THEN `get_available_slots` SHALL parar de
   oferecer horários dele, e os agendamentos já criados para ele SHALL permanecer intactos e
   visíveis na agenda. `[SCH-05]`
6. WHEN um operador define `maxSlotsPerResponse` na configuração de agenda do tenant THEN
   `get_available_slots` SHALL devolver no máximo esse número de horários; WHEN o tenant nunca
   configurou, o valor SHALL ser 16. `[SCH-06]`
7. WHEN um usuário sem papel `canOperate` chama qualquer rota de `Professional`, `Space` ou
   configuração de agenda THEN o sistema SHALL responder 403. `[SCH-07]`
8. WHEN o operador acessa as telas de configuração de agenda em `apps/web` THEN SHALL conseguir
   listar, criar e editar profissionais (com a grade semanal e a duração), listar/criar/editar
   ambientes, e ajustar o teto de horários por resposta. `[SCH-08]`

**Independent Test**: cadastrar um profissional com grade seg–sex 09:00–12:00, duração 30min, e
um ambiente; ver os dois na listagem, sem tocar em nenhuma outra parte da feature.

---

### P1: Cliente consulta horários e marca pela conversa ⭐ MVP

**User Story**: Como cliente no WhatsApp, quero ver os horários livres e marcar o meu, sem falar
com atendente e sem receber um horário que na verdade não existe.

**Why P1**: É o coração da feature — as duas tools que o ADR-0004 previa e nunca puderam nascer.

**Acceptance Criteria**:

1. WHEN a IA chama `get_available_slots` com `date` no formato `YYYY-MM-DD` THEN o sistema SHALL
   devolver os horários livres daquela data, cada um com `start` (ISO 8601 em UTC), o rótulo de
   hora já formatado na constante de exibição, e a lista de profissionais livres naquele intervalo
   (`{id, name}`) — calculados a partir da grade semanal de cada profissional `active`, menos os
   intervalos ocupados por agendamentos não cancelados e por bloqueios. `[SCH-09]`
2. WHEN `date` está fora do formato `YYYY-MM-DD`, é anterior a hoje na constante de exibição, ou
   está a mais de 90 dias de hoje THEN o sistema SHALL retornar `{error}`, sem consultar nada.
   `[SCH-10]`
3. WHEN um horário candidato começa a menos de 1 hora de agora THEN ele SHALL ser omitido da
   resposta, mesmo estando livre na grade. `[SCH-11]`
4. WHEN `get_available_slots` recebe o parâmetro opcional `professionalId` THEN o resultado SHALL
   conter apenas horários daquele profissional; WHEN esse `professionalId` não existe, está
   inativo ou é de outro tenant THEN o sistema SHALL retornar `{error}`. `[SCH-12]`
5. WHEN a data consultada não tem nenhum horário livre THEN o sistema SHALL devolver a data com
   uma lista vazia de horários, nunca `{error}`. `[SCH-13]`
6. WHEN `get_available_slots` é chamada THEN o resultado SHALL incluir também os agendamentos
   futuros ativos (`pending`/`confirmed`) do `Customer` desta `Conversation`, com data/hora,
   profissional e status. `[SCH-14]`
7. WHEN a IA chama `book_appointment` com `{professionalId, start, spaceId?}` para um horário
   alinhado à grade daquele profissional e livre THEN o sistema SHALL criar um `Appointment`
   `status:'pending'` com `start`/`end` em UTC (`end` = `start` + `slotDurationMinutes` do
   profissional), vinculado ao `Customer` e à `Conversation` do `ToolContext`, e SHALL devolver o
   resumo do agendamento mais a URL pública de confirmação para a IA repassar ao cliente.
   `[SCH-15]`
8. WHEN `start` não está alinhado à grade do profissional, está no passado, começa a menos de 1
   hora, está a mais de 90 dias, ou o `professionalId`/`spaceId` não pertence ao tenant do
   `ToolContext` THEN o sistema SHALL retornar `{error}` sem criar nada. `[SCH-16]`
9. WHEN a criação do agendamento falha em qualquer ponto THEN o sistema NÃO SHALL deixar
   `Appointment` sem token de confirmação nem token apontando para agendamento inexistente.
   `[SCH-17]`
10. WHEN o `Customer` desta conversa já tem um agendamento futuro ativo (`pending` ou
    `confirmed`) THEN `book_appointment` SHALL retornar `{error}` sem criar um segundo; WHEN a
    chamada repete exatamente o agendamento ativo que já existe (mesmo profissional e mesmo
    `start`) THEN SHALL devolver esse agendamento, sem criar outro nem erro (retry idempotente).
    `[SCH-18]`
11. WHEN qualquer uma das duas tools é invocada THEN `Tenant`/`channelId`/`conversationId` SHALL
    vir exclusivamente do `ToolContext` injetado no servidor — nunca do `input_schema` (AD-010) —
    e o teste estrutural `toolInputSchema.structural.test.ts` SHALL passar a cobrir as 10 tools.
    `[SCH-19]`
12. WHEN duas chamadas concorrentes de `book_appointment` disputam o mesmo `(professional,
    start)` THEN exatamente uma SHALL criar o agendamento e a outra SHALL retornar `{error}` —
    nunca dois agendamentos ativos no mesmo horário do mesmo profissional. `[SCH-20]`

**Independent Test**: numa conversa simulada, pedir horários de uma data com grade configurada e
ver só horários reais; marcar um deles; ver o `Appointment` `pending` no banco com `start` em UTC
e o horário sumir da consulta seguinte.

---

### P1: Cliente confirma presença ou desmarca pelo link ⭐ MVP

**User Story**: Como cliente, quero abrir um link e confirmar que vou comparecer — ou avisar que
não vou — sem precisar conversar com ninguém.

**Why P1**: Foi a decisão explícita do usuário no Discuss, e é o que transforma `pending` em
informação confiável para o operador.

**Acceptance Criteria**:

1. WHEN um `Appointment` é criado (pela IA ou pelo operador) THEN o sistema SHALL gerar um token
   opaco de confirmação, persistido **hasheado** (mesmo padrão de `Invite.tokenHash`), e SHALL
   expor a URL pública correspondente a quem criou — nunca o token em texto claro no banco.
   `[SCH-21]`
2. WHEN alguém abre a leitura pública com um token válido e não expirado THEN o sistema SHALL
   retornar apenas os dados daquele agendamento (data, hora, nome do profissional, ambiente
   quando houver, nome do cliente e status atual) — nunca dados de outro agendamento ou tenant.
   `[SCH-22]`
3. WHEN o token não existe, expirou, ou já foi substituído por uma reemissão THEN o sistema SHALL
   responder erro (404 para inexistente, 410 para expirado) sem revelar nenhum dado do
   agendamento. `[SCH-23]`
4. WHEN o operador pede um novo link de confirmação para o mesmo agendamento THEN o token
   anterior SHALL deixar de funcionar; e todo token SHALL expirar, no máximo, no fim do
   agendamento a que pertence. `[SCH-24]`
5. WHEN o cliente confirma presença por um token válido THEN o `Appointment` SHALL passar de
   `pending` para `confirmed`; WHEN a mesma ação é repetida com o mesmo token THEN o sistema SHALL
   responder o mesmo estado sem erro (idempotente); WHEN a ação é aplicada a um agendamento já
   terminal (`completed`, `no_show`, `canceled_by_customer`, `canceled_by_operator`) THEN SHALL
   responder erro sem mudar nada. `[SCH-25]`
6. WHEN o cliente cancela por um token válido THEN o `Appointment` SHALL passar para
   `canceled_by_customer` e aquele horário SHALL voltar a aparecer em `get_available_slots`.
   `[SCH-26]`
7. WHEN qualquer leitura ou mutação da confirmação é chamada THEN ela SHALL ser identificada
   exclusivamente pelo token, nunca pelo id do agendamento, e SHALL estar sob rate limit.
   `[SCH-27]`
8. WHEN o cliente abre a URL no navegador THEN SHALL ver uma página pública em `apps/web` (sem
   sessão, `?token=` em search param conforme AD-030) com os dados do agendamento e os dois botões
   — confirmar presença e cancelar —, além de estado de carregando e de link inválido/expirado.
   `[SCH-28]`

**Independent Test**: criar um agendamento, abrir a URL devolvida, confirmar presença e ver o
status virar `confirmed`; abrir a mesma URL depois de um cancelamento e ver o erro correto.

---

### P1: Operador opera a agenda no CRM ⭐ MVP

**User Story**: Como operador, quero ver a semana inteira, encaixar quem ligou, cancelar,
remarcar e bloquear horário, para que a agenda do sistema seja a agenda real do negócio.

**Why P1**: Sem isso, a agenda só reflete o que a IA marcou — qualquer atendimento combinado por
fora some, e a IA passa a oferecer horário que na prática está ocupado.

**Acceptance Criteria**:

1. WHEN o operador acessa a tela de Agenda THEN SHALL ver um calendário semanal com uma coluna
   por dia, os agendamentos e bloqueios posicionados por horário, navegação entre semanas, e
   filtros por profissional e por ambiente. `[SCH-29]`
2. WHEN o operador cria um agendamento manual escolhendo cliente, profissional, horário e
   ambiente opcional THEN o sistema SHALL criar o `Appointment` `pending` mesmo que o horário
   esteja fora da grade do profissional (encaixe), mas SHALL rejeitar se sobrepuser outro
   agendamento ativo ou bloqueio do mesmo profissional. `[SCH-30]`
3. WHEN o operador remarca um agendamento (novo horário e, opcionalmente, outro profissional)
   THEN o sistema SHALL alterar o **mesmo** `Appointment`, aplicando a mesma checagem de
   sobreposição, sem criar um segundo registro. `[SCH-31]`
4. WHEN o operador cancela um agendamento, com motivo opcional THEN o status SHALL virar
   `canceled_by_operator`, registrando quem cancelou, e o horário SHALL voltar a ser ofertável.
   `[SCH-32]`
5. WHEN o operador cria um bloqueio de horário (sem cliente, com título e intervalo) THEN aquele
   intervalo do profissional SHALL deixar de ser oferecido por `get_available_slots` e SHALL
   aparecer na agenda; e o bloqueio SHALL poder ser removido. `[SCH-33]`
6. WHEN o operador marca um agendamento como `completed` ou `no_show` THEN o sistema SHALL
   aceitar somente depois do horário de início do agendamento e somente a partir de `pending` ou
   `confirmed`. `[SCH-34]`
7. WHEN o horário de um agendamento passa sem nenhuma marcação THEN o sistema SHALL mantê-lo no
   estado em que está — nenhuma transição automática — e a tela SHALL destacá-lo como pendente de
   marcação. `[SCH-35]`
8. WHEN qualquer ação de agenda é executada (criar, cancelar, confirmar, remarcar) THEN o sistema
   SHALL registrar um log estruturado do evento, no mesmo padrão já usado no harness. `[SCH-36]`
9. WHEN o operador aciona "Pedir confirmação" em um agendamento THEN o sistema SHALL devolver um
   link `wa.me` com o texto pronto contendo a URL pública de confirmação; e WHEN o operador tenta
   agir sobre um agendamento de outro tenant ou inexistente THEN SHALL responder 404. `[SCH-37]`

**Independent Test**: criar dois agendamentos manuais no mesmo profissional e horário — o segundo
é recusado; bloquear uma tarde e confirmar que `get_available_slots` para de oferecer aqueles
horários.

---

### P2: Agendamento visível no Inbox e aviso automático ao cliente

**User Story**: Como operador atendendo uma conversa, quero ver o agendamento daquele cliente sem
trocar de tela, e quero que ele seja avisado quando eu cancelar ou remarcar.

**Why P2**: O fluxo P1 é funcionalmente completo sem isso; separar deixa o P1 verificável de forma
independente, do mesmo jeito que a feature 8 separou a visibilidade de pagamento.

**Acceptance Criteria**:

1. WHEN o operador abre uma conversa no Inbox cujo `Customer` tem agendamento futuro ativo THEN a
   thread SHALL mostrar um card inline com data, hora, profissional e status — no mesmo padrão do
   card de pedido já existente; sem agendamento ativo, nada é renderizado. `[SCH-38]`
2. WHEN o operador cancela ou remarca um agendamento e a janela de 24h daquela conversa está
   aberta THEN o sistema SHALL enfileirar uma `Message` `out` com `status:'queued'` avisando o
   cliente — pela outbox já existente (AD-007), sem nenhuma chamada direta à Meta. `[SCH-39]`
3. WHEN a janela de 24h está fechada THEN nenhuma mensagem SHALL ser enfileirada e a tela SHALL
   oferecer um botão `wa.me` com o texto pronto do aviso — mesmo fallback do composer do Inbox.
   `[SCH-40]`

**Independent Test**: cancelar um agendamento de uma conversa com janela aberta e ver a `Message`
`queued` no banco; repetir com janela fechada e ver que nada foi enfileirado, só o botão.

---

## Edge Cases

- WHEN um profissional tem grade em um dia da semana mas todos os slots já estão ocupados THEN
  `get_available_slots` SHALL devolver lista vazia para aquela data, nunca `{error}`.
- WHEN o tenant não tem nenhum `Professional` cadastrado ou todos estão inativos THEN
  `get_available_slots` SHALL devolver lista vazia, e `book_appointment` SHALL retornar `{error}`.
- WHEN a grade de um profissional é editada depois de já existirem agendamentos fora da nova grade
  THEN os agendamentos existentes SHALL permanecer válidos e visíveis — a grade só governa a
  oferta futura de horários.
- WHEN a duração do slot de um profissional muda THEN os agendamentos já criados SHALL manter o
  `end` com que foram gravados, nunca recalculado.
- WHEN o último slot do dia não cabe inteiro dentro da janela da grade THEN ele NÃO SHALL ser
  oferecido (um atendimento nunca começa sabendo que ultrapassa o expediente).
- WHEN o `Customer` da `Conversation` não existe mais, ou o `Tenant` do agendamento não bate com
  o `ToolContext` THEN qualquer tool desta feature SHALL retornar `{error}`, nunca vazar dado de
  outro tenant (mesma defesa em profundidade de `create_order`).
- WHEN a resposta da IA cita o link de confirmação THEN o `guard.output` NÃO SHALL redigir o
  token — o link é dado legítimo desta conversa (atenção: o token não pode ter a forma de um
  ObjectId de 24 hex, que a redação existente removeria).
- WHEN um bloqueio de horário é criado sobre um intervalo que já tem agendamento ativo THEN o
  sistema SHALL rejeitar, em vez de deixar cliente e bloqueio no mesmo horário em silêncio.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status | Task(s) |
| --- | --- | --- | --- | --- |
| SCH-01 | P1: Configuração de agenda | Tasks | ✅ Verified | T2, T13, T14, T15 |
| SCH-02 | P1: Configuração de agenda | Tasks | ✅ Verified | T10, T14, T15, T33 |
| SCH-03 | P1: Configuração de agenda | Tasks | ✅ Verified | T10, T14, T15, T33 |
| SCH-04 | P1: Configuração de agenda | Tasks | ✅ Verified | T3, T11, T16, T17, T35 |
| SCH-05 | P1: Configuração de agenda | Tasks | ✅ Verified | T2, T13, T14, T15, T34 |
| SCH-06 | P1: Configuração de agenda | Tasks | ✅ Verified | T4, T11, T18, T19, T36 |
| SCH-07 | P1: Configuração de agenda | Tasks | ✅ Verified | T15, T17, T19, T24 |
| SCH-08 | P1: Configuração de agenda | Tasks | ✅ Verified | T32, T33, T34, T35, T36, T43 |
| SCH-09 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T1, T26, T30 |
| SCH-10 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T26 |
| SCH-11 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T1, T26 |
| SCH-12 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T26 |
| SCH-13 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T26 |
| SCH-14 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T26 |
| SCH-15 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T6, T27, T29, T30, T31 |
| SCH-16 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T1, T6, T27, T31 |
| SCH-17 | P1: Consulta e agendamento pela conversa | Tasks | ⚠️ Verified (evidência indireta, validation.md Gap 3) | T6, T27 |
| SCH-18 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T6, T27 |
| SCH-19 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T27, T28 |
| SCH-20 | P1: Consulta e agendamento pela conversa | Tasks | ✅ Verified | T5, T6, T31 |
| SCH-21 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T5, T6, T20 |
| SCH-22 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T22, T42 |
| SCH-23 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T7, T22, T42 |
| SCH-24 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T6, T25 |
| SCH-25 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T7, T22, T42 |
| SCH-26 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T7, T22, T42 |
| SCH-27 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T7, T22 |
| SCH-28 | P1: Confirmação pelo cliente | Tasks | ✅ Verified | T42 |
| SCH-29 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T21, T24, T37, T38, T39, T43 |
| SCH-30 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T8, T12, T23, T24, T40 |
| SCH-31 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T9, T12, T23, T25, T40 |
| SCH-32 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T9, T12, T23, T25, T40 |
| SCH-33 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T5, T8, T12, T23, T24, T41 |
| SCH-34 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T9, T12, T23, T25, T40 |
| SCH-35 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T21, T38 |
| SCH-36 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T6, T7, T8, T9 |
| SCH-37 | P1: Operação da agenda no CRM | Tasks | ✅ Verified | T20, T23, T25, T40 |
| SCH-38 | P2: Inbox e aviso automático | Tasks | ✅ Verified | T21, T24, T37, T46 |
| SCH-39 | P2: Inbox e aviso automático | Tasks | ✅ Verified | T44 |
| SCH-40 | P2: Inbox e aviso automático | Tasks | ✅ Verified | T44, T45 |

**ID format:** `SCH-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 40 total, 40 mapped to tasks (`.specs/features/scheduling/tasks.md`, T1–T47), 0 unmapped

---

## Success Criteria

- [ ] Um tenant cadastra um profissional com grade e duração e, na mesma conversa simulada de
      WhatsApp, o cliente vê só horários que existem de verdade e marca um deles.
- [ ] Um agendamento marcado pela IA aparece na agenda do operador, e um bloqueio criado pelo
      operador some das opções que a IA oferece — as duas superfícies enxergam a mesma agenda.
- [ ] Dois clientes disputando o último horário de um profissional: exatamente um consegue marcar,
      o outro recebe erro — nunca dois agendamentos ativos no mesmo horário do mesmo profissional.
- [ ] O cliente confirma presença por um link que não expõe nem aceita o id do agendamento, e um
      token de outro agendamento nunca dá acesso a este.
- [ ] Instantes gravados em UTC do início ao fim; a conversão para horário local acontece só na
      exibição (tela e texto que a IA manda), em nenhum outro lugar.
- [ ] `pnpm run check` (typecheck + Biome + testes) limpo, mesmo gate de todo o projeto
      (AD-017/AD-031).
