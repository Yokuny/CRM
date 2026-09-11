# scheduling Design

**Spec**: `.specs/features/scheduling/spec.md`
**Context**: `.specs/features/scheduling/context.md`
**Status**: Draft

---

## Research Provenance (ler antes do resto)

Knowledge Verification Chain, em ordem estrita:

1. **Codebase** — leitura completa de `packages/ai-kit/src/{loop,runTurn,contextBuild,guardOutput}.ts`,
   `tools/{toolDefinitions,toolContext,searchProducts,createOrder,getOrderStatus}.ts`,
   `packages/db/src/{index,tenantScoped,orderTransitions,paymentTransitions}.ts`,
   `models/{order,customer,conversation,process,user,tenant,invite}.model.ts`,
   `apps/crm-api/src/app.ts`, `{routers,controllers,services,repositories}/order.*`,
   `services/product.service.ts`, `middlewares/{authorization,rateLimit}.middleware.ts`,
   `routers/invite.router.ts`, `apps/web/src/routes/_private/orders/index.tsx`,
   `routes/_private/inbox/@components/{composer,order-card,thread}.tsx`, `query/order.ts`,
   `routes/{_public,_private/index}.tsx`, `components/mobile-dock.tsx`,
   `lib/helpers/formatDate.helper.ts`, `tests/structural/*.structural.test.ts`,
   `evals/cases/createOrderGuardrails.int.test.ts`, `vitest.config.ts`, ambos os `env.config.ts`.
2. **Project docs** — `.specs/STATE.md` (34 ADs ativos no início deste Design, 36 ao fim),
   `docs/roadmap.md` §9, `docs/architecture.md`, `docs/glossary.md`, `apps/web/CLAUDE.md`.
3. **Referência nomeada pelo usuário** — `../DentalEase/DentalEase-BackEnd/src/helpers/slots.helper.ts`,
   `use-cases/assistant-tools.ts`, `database/{schedule,clinic,passkey}.database.ts`,
   `services/{schedule,passkey}.service.ts`, `services/shared/{schedule,passkey}.ts`,
   `schemas/schedule.schema.ts`, e o front `routes/_public/schedule/$code/**`.
4. **Verificação por execução** (o que este Design NÃO presume):

| Afirmação | Como foi verificada | Resultado |
| --- | --- | --- |
| Hora de parede → instante UTC sem offset fixo | Script Node com `Intl.DateTimeFormat` + `timeZoneName:'longOffset'`, duas passadas | `2026-09-15 21:00` SP → `2026-09-16T00:00:00Z` (vira o dia em UTC); Manaus 08:00 → `12:00Z`. Node 26 com ICU completo |
| `$in` em `partialFilterExpression` | Índice criado contra o `mongodb-memory-server` do próprio repo | Aceito no mongod **8.2.6** |
| Índice único parcial resolve a corrida de dupla reserva | 5 inserções concorrentes no mesmo `(professional,start)` | **1 aceita, 4 rejeitadas** (E11000); cancelar libera o slot; vários cancelados coexistem |
| `guard.output` não redige o link de confirmação | Regex real (`/\b[0-9a-f]{24}\b/gi`) aplicada a formatos candidatos de token | `apt_`+base62 passa intacto; **base64url é inseguro** (um `-` cercando 24 hex dispara a redação); 24 hex puro é redigido |

5. **Docs oficiais** — MongoDB, [Partial Indexes](https://www.mongodb.com/docs/manual/core/index-partial/):
   `$in` consta como operador suportado em `partialFilterExpression`, sem ressalva de versão.
6. **Context7/busca de biblioteca** — não usados: esta feature não introduz nenhuma dependência
   nova (o calendário é grid CSS próprio; `date-fns` e `Intl` já estão no projeto).

---

## Architecture Overview

Duas superfícies de escrita sobre a mesma coleção `appointments` — o operador pelo `crm-api` e a
IA pelo `ai-gateway` — exatamente a forma que AD-032/AD-033/AD-034 já estabeleceram para
`orders`/`payments`. A matemática da grade e a máquina de estados vivem uma única vez em
`packages/db` (decisão confirmada com o usuário), nunca duplicadas por app. Nenhuma chamada entre
os dois serviços (AD-002 intacto).

```mermaid
graph TD
    subgraph web["apps/web"]
        CAL[Agenda: semana, coluna por dia]
        CFG[Config: professionals, spaces, teto]
        PUB["Pagina publica ?token="]
        IC[Card na thread do Inbox]
    end

    subgraph api["apps/crm-api"]
        PR[professional/space/settings routers]
        AR[appointment router: criar, cancelar, remarcar, bloquear, marcar]
        CR["appointmentConfirmation router (publico, sem sessao)"]
    end

    subgraph kit["packages/ai-kit (roda no ai-gateway)"]
        GS[get_available_slots]
        BA[book_appointment]
    end

    subgraph db["packages/db"]
        SC["scheduling.ts: grade, slots, fuso (puro, sem Mongoose)"]
        AT["appointmentTransitions.ts: reservar, confirmar, cancelar, remarcar"]
        MD[("professionals / spaces / schedulingSettings / appointments")]
    end

    CAL --> AR
    CFG --> PR
    IC --> AR
    PUB --> CR
    PR --> MD
    AR --> AT
    CR --> AT
    GS --> SC
    GS --> MD
    BA --> AT
    AT --> SC
    AT --> MD
    AR -.janela de 24h aberta: Message queued.-> MD
```

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| `ToolContext` | `packages/ai-kit/src/tools/toolContext.ts` | Reusado **sem alteração** — as 2 tools novas não precisam de provider injetado (diferente de `issue_payment_link`, que exigiu `asaasClient`) |
| `tenantScoped()` | `packages/db/src/tenantScoped.ts` | Todo filtro Mongo novo, nos models e em `appointmentTransitions.ts` |
| Padrão de handler de tool | `tools/getProcessTemplate.ts`, `searchProducts.ts` | `getAvailableSlots.ts`/`bookAppointment.ts`: import direto do model, nunca `throw`, ausência é `{error}`, lista vazia nunca é erro |
| `executeTool` switch + `TOOL_DEFINITIONS` | `packages/ai-kit/src/loop.ts`, `tools/toolDefinitions.ts` | 2 `case` novos e 2 entradas de `input_schema` literal (AD-004), sem tenant/canal/conversa (AD-010) |
| `orderTransitions.ts` / `paymentTransitions.ts` | `packages/db/src/` | Molde exato de `appointmentTransitions.ts`: módulo compartilhado pelos dois apps, retorno `Record | {error}`, nunca `throw` |
| `Invite.tokenHash` + `hashToken` + `invite.router.ts` | `packages/db/src/models/invite.model.ts`, `apps/crm-api/src/routers/invite.router.ts` | Precedente interno do token opaco hasheado e da rota pública sem `validToken` — usado no lugar do `Passkey.code` em texto claro da referência |
| `rateLimit.middleware.ts` (`rejectWithTooManyRequests`) | `apps/crm-api/src/middlewares/` | Rate limit da rota pública de confirmação, com gerador por IP |
| `withDbTiming` | `apps/crm-api/src/metrics/db.metric.js` | Todo método dos repositories novos |
| Padrão repository/service/controller/router + `CustomError` tipado | `apps/crm-api/src/**/order.*`, `product.*` | Molde de `professional.*`, `space.*`, `appointment.*` (404/409 traduzidos no controller) |
| Workaround de query paginada do Express 5 | `apps/crm-api/src/routers/order.router.ts` (`validListOrdersQuery`) | Reusado tal-e-qual nas listagens novas (inclusive a consulta por faixa de datas da agenda) |
| `sendManualMessage` / outbox `queued` | `apps/crm-api/src/services/conversation.service.ts`, AD-007 | SCH-39: o aviso automático é uma `Message` `out` `queued` — nenhuma chamada direta à Meta |
| Fallback `wa.me` de janela fechada | `apps/web/src/routes/_private/inbox/@components/composer.tsx` | SCH-40 e o botão "Pedir confirmação": mesmo formato de link e mesma leitura de `windowOpen` |
| `order-card.tsx` | `apps/web/src/routes/_private/inbox/@components/` | Molde do `appointment-card.tsx` (mesma query→card→sem render quando vazio) |
| Rotas file-based, hub de seção, `<Card asPage>`, `t()`, `formatDate` | `apps/web/CLAUDE.md`, `routes/_private/customers/**` | `_private/schedule/` segue a convenção: `index.tsx` vira hub (calendário, profissionais, ambientes, config) |
| `createOrderGuardrails.int.test.ts` | `evals/cases/` | Molde do golden set novo (fake client + `runTurn` + asserção no banco) |

### Integration Points

| System | Integration Method |
| --- | --- |
| `tests/structural/toolInputSchema.structural.test.ts` | `EXPECTED_TOOL_NAMES` ganha 2 nomes e `toHaveLength(8)`→`(10)`; a varredura de chaves proibidas já é genérica |
| `evals/cases/promptInjection.int.test.ts:159` | Lista de 8 tools **hardcoded** vira 10 — mesma armadilha que já mordeu nas features 7 e 8 (ver Risks) |
| `packages/contracts/src/registry.ts` | Todo schema Zod novo **precisa** ser registrado: o teste estrutural varre o filesystem e falha se faltar |
| `packages/db/src/index.ts` (`syncIndexes`) | 4 models novos entram no barrel e no `Promise.all` de `createIndexes()` |
| `apps/crm-api/src/app.ts` | Monta `/professionals`, `/spaces`, `/scheduling-settings`, `/appointments` (com `validToken`) e `/appointment-confirmations` (**sem** `validToken`, como `inviteRouter`) |
| `.env` da raiz (AD-018) | `WEB_BASE_URL` nova, lida pelos **dois** apps para montar a URL pública de confirmação |

---

## Components

### `scheduling.ts` — matemática pura de grade (sem Mongoose)

- **Purpose**: traduzir grade semanal + ocupação em horários livres, e resolver fuso.
- **Location**: `packages/db/src/scheduling.ts`
- **Interfaces**:
  - `DISPLAY_TIMEZONE = 'America/Sao_Paulo'`, `MAX_HORIZON_DAYS = 90`, `MIN_LEAD_MINUTES = 60`,
    `DEFAULT_MAX_SLOTS = 16`
  - `wallClockToUtc(date: 'YYYY-MM-DD', time: 'HH:mm'): Date` — duas passadas de offset via
    `Intl` (verificado por execução), nunca offset fixo
  - `dateInDisplayTz(instant: Date): 'YYYY-MM-DD'`, `timeInDisplayTz(instant: Date): 'HH:mm'`,
    `weekdayInDisplayTz(date: 'YYYY-MM-DD'): 0..6`
  - `expandWindowsToSlots(windows, slotDurationMinutes, date): Array<{start: Date, end: Date}>` —
    só slots que cabem **inteiros** na janela (Edge Case do spec)
  - `computeFreeSlots({professionals, busy, date, now, maxSlots}): FreeSlot[]` — `FreeSlot = {start: Date, time: string, professionals: {id, name}[]}`; descarta slot que começa a menos de `MIN_LEAD_MINUTES`
  - `isSlotAligned(start: Date, professional): boolean`
- **Dependencies**: nenhuma (só `Intl`) — testável sem Mongo
- **Reuses**: a lógica de `computeFreeSlots`/`isSlotAligned` da referência, reescrita para grade
  por profissional com janelas múltiplas e sem a dimensão restritiva de sala

### `appointmentTransitions.ts` — máquina de estados compartilhada (AD-033/AD-035)

- **Purpose**: única implementação das transições de agendamento, chamada pelos dois apps.
- **Location**: `packages/db/src/appointmentTransitions.ts`
- **Interfaces** (todas `Promise<AppointmentRecord | {error: string}>`, nunca `throw`):
  - `bookAppointment({tenantId, professionalId, start, spaceId?, customerId, conversationId?, source})` —
    valida alinhamento/lead/horizonte, resolve `end` pela duração do profissional, cria `pending`
    **confiando no índice único parcial** para a corrida (captura E11000 → `{error}`), e emite o
    token de confirmação no mesmo documento
  - `createManualAppointment(...)` — caminho do operador: sem lead/horizonte/alinhamento
    (encaixe), mas com checagem de sobreposição por consulta de intervalo
  - `createBlock({tenantId, professionalId, start, end, title})`
  - `issueConfirmationToken(tenantId, appointmentId)` — gera token novo, invalida o anterior por
    sobrescrita do hash (SCH-24)
  - `confirmByToken(tokenHash)` / `cancelByToken(tokenHash)` — resolvem o agendamento **pelo
    hash do token**, nunca por id (SCH-27)
  - `cancelByOperator(tenantId, appointmentId, userId, reason?)`
  - `rescheduleAppointment(tenantId, appointmentId, {start, professionalId?})`
  - `markAttendance(tenantId, appointmentId, 'completed' | 'no_show')`
- **Dependencies**: models `Appointment`/`Professional`, `scheduling.ts`, `tenantScoped`
- **Reuses**: forma de `orderTransitions.ts` (guarda na própria query, rank de status, retorno
  tipado)

### Tools Anel A: `getAvailableSlots`, `bookAppointment`

- **Location**: `packages/ai-kit/src/tools/{getAvailableSlots,bookAppointment}.ts`
- **Interfaces**:
  - `getAvailableSlots({date, professionalId?}, ctx)` →
    `{date, slots: [{start, time, professionals: [{id, name}]}], upcomingAppointments: [...]}`
    ou `{error}`. O teto vem de `SchedulingSettings` do tenant (default 16).
  - `bookAppointment({professionalId, start, spaceId?}, ctx)` →
    `{appointmentId, date, time, professionalName, spaceName?, status: 'pending', confirmationUrl}`
    ou `{error}`. Resolve o `Customer` pela `Conversation` do `ToolContext` (nunca do input).
- **Reuses**: padrão de `searchProducts.ts`/`createOrder.ts`

### `apps/crm-api` — módulos novos

- `professional.*`, `space.*` — CRUD por `canOperate`, molde de `product.*`
- `schedulingSettings.*` — `GET /` + `PUT /` (teto por tenant)
- `appointment.*` — `GET /` por faixa (`from`/`to`, filtros `professional`/`space`), `POST /`
  (manual), `POST /:id/cancel`, `POST /:id/reschedule`, `POST /:id/attendance`,
  `POST /:id/confirmation-link` (devolve o `wa.me` pronto), `POST /blocks`, `DELETE /blocks/:id`
- `appointmentConfirmation.*` — **público**, sem `validToken`, com rate limit:
  `GET /:token`, `POST /:token/confirm`, `POST /:token/cancel`

### `apps/web`

- `_private/schedule/index.tsx` — hub da seção (convenção do `CLAUDE.md`), com cards para
  Calendário, Profissionais, Ambientes e Configuração
- `_private/schedule/calendar/index.tsx` + `@components/week-grid.tsx`,
  `appointment-dialog.tsx`, `block-dialog.tsx` — grid CSS próprio (7 colunas × faixas de hora),
  sem biblioteca nova, sem drag-and-drop
- `_private/schedule/professionals/{index,add,details}.tsx` (com editor de grade semanal),
  `_private/schedule/spaces/{index,add,details}.tsx`, `_private/schedule/settings/index.tsx`
- `_public/appointment/index.tsx` — página de confirmação (`?token=`, AD-030), conteúdo
  espelhando a página da referência indicada pelo usuário
- `query/{professional,space,appointment,schedulingSettings,appointmentConfirmation}.ts`
- `_private/inbox/@components/appointment-card.tsx`, montado em `thread.tsx` ao lado do
  `order-card.tsx`; card no hub `_private/index.tsx` apontando para a Agenda

---

## Data Models

```typescript
// professionals
interface ScheduleWindow { weekday: number; start: string; end: string } // 0..6, 'HH:mm' hora de parede
interface ProfessionalDocument {
  _id: ObjectId; Tenant: ObjectId;
  name: string;
  slotDurationMinutes: number;      // 5..480
  weeklySchedule: ScheduleWindow[]; // janelas sem sobreposição no mesmo weekday
  active: boolean;                  // default true
  createdAt: Date; updatedAt: Date;
}
// índice: {Tenant:1, active:1}

// spaces — informativo, não restringe (context.md decisão 1)
interface SpaceDocument { _id; Tenant; name: string; active: boolean; createdAt; updatedAt }
// índice: {Tenant:1, active:1}

// schedulingSettings — um doc por tenant (molde de AsaasIntegration)
interface SchedulingSettingsDocument { _id; Tenant: ObjectId; maxSlotsPerResponse: number }
// índice: {Tenant:1} unique

// appointments — discriminada por kind (decisão confirmada)
type AppointmentKind = 'appointment' | 'block';
type AppointmentStatus =
  | 'pending' | 'confirmed' | 'completed' | 'no_show'
  | 'canceled_by_customer' | 'canceled_by_operator';

interface AppointmentDocument {
  _id: ObjectId; Tenant: ObjectId;
  kind: AppointmentKind;
  professional: ObjectId;            // obrigatório nos dois kinds
  space?: ObjectId;                  // opcional, nunca restringe
  customer?: ObjectId;               // obrigatório quando kind='appointment'
  conversation?: ObjectId;           // presente quando criado pela IA
  title?: string;                    // usado pelo bloqueio
  notes?: string;
  start: Date; end: Date;            // SEMPRE UTC
  status: AppointmentStatus;
  source: 'ai' | 'operator';
  confirmationTokenHash?: string;    // sha256 do token opaco; texto claro nunca persistido
  confirmationExpiresAt?: Date;
  confirmedAt?: Date;
  canceledAt?: Date; canceledBy?: ObjectId; cancelReason?: string;
  attendanceMarkedAt?: Date; attendanceMarkedBy?: ObjectId;
  createdAt: Date; updatedAt: Date;
}
```

**Índices de `appointments`:**

| Índice | Papel |
| --- | --- |
| `{Tenant:1, professional:1, start:1}` **unique, partial** `status ∈ {pending, confirmed}` | A garantia anti-dupla-reserva (SCH-20), verificada por execução: 5 concorrentes → 1 vence. Cancelado sai do índice e libera o horário |
| `{Tenant:1, start:1}` | Faixa da semana (tela de Agenda) e varredura de ocupação do dia |
| `{Tenant:1, customer:1, start:1}` | Agendamentos futuros do cliente (SCH-14/SCH-18/SCH-38) |
| `{confirmationTokenHash:1}` unique sparse | Resolução da rota pública pelo token |

**Bloqueio**: nasce e permanece `status:'confirmed'` (ocupa) e é **removido por deleção**, nunca
cancelado — bloqueio não tem ciclo de vida de atendimento. Isso o mantém dentro do mesmo índice
único, então bloqueio e agendamento disputam o mesmo horário corretamente.

**Token**: `apt_` + 32 caracteres base62 (alfabeto do `generateSecureCode` da referência).
`base64url` foi **descartado por evidência**: `-` cercando 24 hex faz o `guard.output` redigir o
link. Persistido só como `sha256` (`hashToken`, `packages/db`).

---

## Error Handling Strategy

| Cenário | Tratamento | Impacto no usuário |
| --- | --- | --- |
| `date` inválida/passada/>90d em `get_available_slots` | `{error}`, sem consulta | IA explica e oferece outra data |
| Data sem horário livre | `{date, slots: []}` — nunca `{error}` (SCH-13) | IA oferece outro dia |
| `book_appointment` fora da grade/lead/horizonte | `{error}`, nada criado | IA pede outro horário |
| Corrida no mesmo slot | E11000 do índice parcial capturado → `{error}` para o perdedor | Cliente é avisado que o horário acabou de sair e consulta de novo |
| Retry exato do mesmo agendamento | Devolve o existente, sem criar nem errar (SCH-18) | Nenhum |
| Cliente já tem agendamento futuro ativo | `{error}` (SCH-18) | IA explica o limite |
| Token inexistente / expirado / substituído | 404 / 410, sem revelar nada (SCH-23) | Página mostra "link inválido ou expirado" |
| Ação repetida no mesmo token | Idempotente, mesmo estado, sem erro (SCH-25) | Nenhum |
| Ação sobre agendamento terminal | Erro sem mudar nada (SCH-25) | Página/tela informa o estado atual |
| Encaixe do operador sobrepondo o mesmo profissional | 409 (checagem de intervalo) | Operador escolhe outro horário |
| `attendance` antes do horário de início | 409 (SCH-34) | Botão indisponível na tela |
| Agendamento de outro tenant / inexistente | 404, mesmo idioma de `order.service.ts` | Operador vê "não encontrado" |
| Sem `canOperate` | 403 | Acesso negado |
| Aviso com janela de 24h fechada | Nada enfileirado; UI oferece `wa.me` (SCH-40) | Operador manda manualmente |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- |
| `SYSTEM_PROMPT` enumera só **4 tools** ("usando só as ferramentas disponíveis: 1..4") desde a feature 5, enquanto `TOOL_DEFINITIONS` já tem 8 — as features 7 e 8 não atualizaram o texto | `packages/ai-kit/src/contextBuild.ts:27-42` | O modelo recebe 10 definições de tool mas um system prompt que descreve 4; para agendamento, que exige uma sequência (consultar → escolher → reservar), a chance de o modelo não usar as tools novas é concreta | Task dedicada atualizando o prompt para descrever as 10 tools e a sequência de agendamento, com o golden set novo como rede (AD-013: mudança de prompt é mudança de comportamento) |
| Lista de tools **hardcoded** em teste: `promptInjection.int.test.ts` (8 nomes) e `toolInputSchema.structural.test.ts` (`toHaveLength(8)`) | `evals/cases/promptInjection.int.test.ts:159`, `tests/structural/toolInputSchema.structural.test.ts:42` | Já quebrou nas features 7 **e** 8; é a terceira recorrência | Tasks explícitas para os dois arquivos, antes de registrar as tools. Se recorrer na feature 10, vira lição confirmada (`lessons.py`) |
| `guard.output` redige qualquer 24 hex; o link de confirmação passa pela resposta da IA | `packages/ai-kit/src/guardOutput.ts:9`, `book_appointment` | Link redigido = cliente não consegue confirmar, falha silenciosa e visível só ao cliente | Formato `apt_`+base62 **verificado por execução** contra a regex real; teste de regressão no golden set assertando que o link sobrevive ao `guard.output` |
| Sem transação nativa do Mongo (AD-002/AD-006) para "criar agendamento + emitir token" | `appointmentTransitions.bookAppointment` | Crash entre os dois passos deixaria agendamento sem token | Um único `Appointment.create()` com o hash do token **no mesmo documento** — não há dois documentos para coordenar (SCH-17 satisfeito por construção, não por compensação) |
| Sobreposição do encaixe do operador é checar-antes-de-gravar (o índice único só cobre `start` idêntico) | `createManualAppointment`/`rescheduleAppointment` | Dois encaixes concorrentes desalinhados podem se sobrepor | Aceito e documentado: o caminho da IA (o de alta concorrência) é 100% coberto pelo índice; o do operador é ação humana de baixa concorrência. Teste cobre a rejeição sequencial |
| `$in` em índice parcial verificado no mongod 8.2.6; produção pode rodar versão bem anterior | `appointment.model.ts` | Índice recusado no boot em servidor antigo | Documentado nos docs oficiais sem ressalva de versão; fallback conhecido é um booleano `slotActive` com filtro de igualdade, sem mudar a semântica |
| `routeTree.gen.ts` só regenera com o dev server rodando | `apps/web/CLAUDE.md` | 7+ rotas novas, incluindo a primeira rota `_public` desde a feature 1 — `check` passa e o `build` quebra | Task de wiring roda `pnpm --filter web run dev` antes do `build`, conforme o `CLAUDE.md` |
| `Space` não restringe nada (decisão do usuário) | `spaces` | Dois atendimentos podem ser marcados na mesma sala de uma cadeira | Consequência aceita e registrada em `context.md`/Assumptions; capacidade está em Deferred |
| Constante única de fuso; tenant fora do horário de Brasília vê horário deslocado | `scheduling.ts` | Agenda errada para tenant em Manaus/Acre | Aceito (decisão do usuário). A conversão usa `Intl` por data, então passar a fuso por tenant depois é trocar a constante por um campo, sem reescrever a matemática |
| `contextBuild` diz "Data e hora agora (America/Sao_Paulo)" com a constante repetida em código | `packages/ai-kit/src/contextBuild.ts:44-53` | Duas fontes da mesma constante divergirem | `contextBuild` passa a importar `DISPLAY_TIMEZONE` de `packages/db` (AD-036) em vez de repetir a string |

---

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Onde vive a lógica de agenda | `packages/db`: `scheduling.ts` (puro) + `appointmentTransitions.ts` | Confirmado com o usuário; precedente AD-033/AD-034. O `apps/web` não precisa da matemática porque o operador pode encaixar fora da grade |
| Bloqueio | Mesma coleção, `kind: 'appointment' \| 'block'` | Confirmado com o usuário; uma consulta de ocupação e um índice único cobrindo os dois. Precedente do `targetType` (AD-020) |
| Garantia de dupla reserva | Índice único parcial `{Tenant, professional, start}` filtrado por status ativo | Verificado por execução (1 de 5 vence). Move a invariante para o banco em vez de checar-antes-de-gravar — que é exatamente o buraco que o Verifier da feature 8 achou (lição `L-027`) |
| Token de confirmação | Campo no próprio `Appointment` (`confirmationTokenHash`), não coleção separada | A referência tem `Passkey` separada porque serve 4 tipos distintos; aqui há um só. Um documento = nenhuma coordenação entre escritas, e reemitir é sobrescrever o hash (SCH-24 de graça) |
| Formato do token | `apt_` + base62(32), hasheado com `sha256` | Verificado contra a regex real do `guard.output`; base64url foi descartado por evidência |
| Fuso | Instante sempre UTC; hora de parede + `DISPLAY_TIMEZONE`; offset resolvido pelo `Intl` em duas passadas | Decisão do usuário + verificação por execução. A referência crava `-03:00`, que quebra se o horário de verão voltar |
| Duração do agendamento | `end` calculado na criação e **congelado** no documento | Edge Case do spec: mudar a duração do profissional não pode reescrever agendamento já marcado |
| Teto de horários | `schedulingSettings`, um doc por tenant (molde `AsaasIntegration`), default 16 | Decisão do usuário. Horizonte e lead ficam constantes em `scheduling.ts` — só o teto foi pedido como configurável |
| URL pública de confirmação | Nova env `WEB_BASE_URL`, lida pelos dois apps | `ai-gateway` não tem nenhuma var de origem do front; `crm-api` tem `CORS_ORIGIN`. Usar a mesma var nos dois evita dois links diferentes por misconfig. O uso de `CORS_ORIGIN` pelo convite (feature 1) fica intocado |
| Calendário | Grid CSS próprio, 7 colunas de dia, sem drag-and-drop | Decisão do usuário; evita portar ~1.800 linhas e não adiciona dependência |
| Navegação | `_private/schedule/index.tsx` como hub de seção | Convenção documentada em `apps/web/CLAUDE.md` para seção com mais de um destino |

> **Project-level decisions:** AD-035 e AD-036 apendadas a `.specs/STATE.md` `## Decisions` nesta
> sessão de Design. `docs/architecture.md` (tabela de propriedade de escrita e superfície de
> tools) e `docs/glossary.md` (Professional, Space, Appointment, Block) são atualizados na fase
> Tasks, no mesmo commit da task de documentação.
