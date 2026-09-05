# CRM Web Shell Specification

## Problem Statement

`crm-core` (feature 3) shipped a complete Customer/Process API — but `apps/web` has no
screen that consumes it. Today the front-end is only the feature-1 shell: login, invite
acceptance, and a private layout that shows the tenant name and role. Two `SPEC_DEVIATION`
markers already sit in the codebase pointing at this feature by name:
`components/ui/card.tsx` ("o design system completo (ShadCN + Tailwind) é escopo da
feature 4") and `lib/helpers/translate.helper.ts` ("i18n completo é escopo da feature 4").
Without this feature, nobody can create, browse, or work a Customer or a Process — the
back-end built in feature 3 has no user in front of it.

## Goals

- [ ] An authenticated user can list, search, and browse Customers in a table AND in a
      kanban view grouped by `status`, and move a Customer between statuses by dragging its
      card — this is the day-to-day CRM screen.
- [ ] An authenticated user can create and edit a Customer (core fields + tenant-defined
      dynamic fields) through a form driven by the field-engine's `hydrate()` output — no
      per-template-shape code.
- [ ] An authenticated user can open a Process for a Customer, edit its values, and advance
      its `stage` through a control restricted to the Process's own template snapshot.
- [ ] The two `SPEC_DEVIATION` markers above are closed: a real ShadCN + Tailwind design
      system replaces the placeholder `<Card>`, and a complete `t(key)` dictionary replaces
      the 12-entry placeholder — applied to every existing screen (auth/invite/private), not
      only the new ones.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Board/Card avulso (ferramenta kanban livre) | Feature própria do roadmap (`kanban-tool`, ver ADR-0011). O kanban desta feature é só a listagem de Customer agrupada por `status` — sem model de Board/Card separado. |
| Criar/editar/versionar/arquivar `FieldTemplate` (a árvore de campos em si) | Feature 2 (`dynamic-field-engine`). Esta feature só CONSOME o template corrente (via `hydrate()`/`validate()`) e a lista de templates disponíveis (para o picker de Process) — nunca edita a definição. |
| Excluir ou arquivar um `Customer`/`Process` | `crm-core` não construiu nenhum endpoint de delete/archive para essas entidades (`design.md`: "`GET /customers/:id`... Not built"; nenhuma rota `DELETE` existe). Nada para a UI chamar. |
| Telas de Inbox/WhatsApp, financeiro/Asaas, evals | Outras features do roadmap (`ai-gateway`, pagamentos) — nada a ver com Customer/Process. |
| Seletor de idioma / múltiplos locales | Só pt-BR nesta rodada — mesma convenção do front de referência (dicionário `t(key)` plano, sem biblioteca de i18n, sem troca de idioma). |
| Atualização em tempo real (WebSocket) na listagem/kanban | AD-006 cobre o Inbox, não Customer/Process; esta tela usa fetch/refetch via TanStack Query, sem push ao vivo. |
| Ações em massa (multi-select bulk edit) | Não pedido; sem suporte no backend. |
| Gestão de convites/time (convidar, revogar, trocar papel) pela UI | Pertence à feature 1 (`foundation-tenancy-auth`), fora do escopo Customer/Process desta feature. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Base do design system, DataTable e kanban | Portar `ui/` (ShadCN + Tailwind), `data-table.tsx` (tanstack-table) e `kanban.tsx` (`@dnd-kit/*`) do repo de referência `../DentalEase/DentalEase`, adaptando ao domínio Customer/Process. Substitui o `<Card>` `SPEC_DEVIATION` em TODAS as telas existentes (auth/invite/private), não só as novas. | Reuso real e já testado no front de referência; fecha o `SPEC_DEVIATION` já registrado em `card.tsx`. | **sim** (Discuss) |
| Biblioteca de drag-and-drop do kanban | `@dnd-kit/core` + `@dnd-kit/sortable`, o mesmo par usado pelo `kanban.tsx` portado | Decorre da decisão acima — evita uma segunda lib de DnD no projeto. | **sim** (decorre da decisão acima) |
| Semântica do kanban | Drag-and-drop entre colunas **persiste** a mudança de `status` do Customer (não é só leitura) | Resposta explícita do Discuss — exige o novo endpoint de mutação abaixo. | **sim** (Discuss) |
| Acesso a um Customer específico | Novo `GET /customers/:id` (pequeno adicional a `apps/crm-api`, módulo `customer`, additive-only) | Necessário para reload direto de URL e como fonte de verdade da página de detalhe; sem ele o detalhe só existiria via cache de navegação, o que quebra em reload/link direto. | **sim** (Discuss) |
| Mutação de um Customer existente | Um único endpoint novo e autenticado (`apps/crm-api`, módulo `customer`) que aceita núcleo (`name`/`phone`/`document`) e/ou `values` parciais — reaproveitado tanto pelo drag do kanban (só `values.status`) quanto pelo formulário de edição completa | Customer não tem a dimensão "stage guard" que justifica o split em 2 endpoints do Process (`values` vs `stage`); uma única superfície de mutação evita duplicar rota sem um motivo de domínio distinto. Design decide o shape exato do payload/schema. | **sim** (Discuss, forma exata fica para Design) |
| Escopo de edição de Customer | Completo — núcleo fixo E `values`, não só `status` | Resposta explícita do Discuss: a página de detalhe (já confirmada) deve permitir corrigir qualquer campo, não só mudar coluna no kanban. | **sim** (Discuss) |
| Descoberta de templates de Process | Novo `GET /field-templates` (pequeno adicional a `apps/crm-api`, módulo `field-template` — feature 2, já Verified — additive-only, só leitura) filtrando por `targetType`, retornando `{key, label, archived}` por template | Sem isso o picker de "novo Process" não tem como saber quais `templateKey` existem no tenant; `createProcessSchema` já assume múltiplos templates por `key` (AD-019), então não há uma key única para "assumir". | **sim** (Discuss) |
| i18n | Dicionário `t(key)` completo (toda string de usuário do app, telas novas e existentes), pt-BR único, sem seletor de idioma nem biblioteca (i18next etc.) — mesmo padrão do `translations.json` plano do front de referência (que também não usa nenhuma lib de i18n) | `translate.helper.ts` já tem o `SPEC_DEVIATION` apontando exatamente para esta feature; ninguém pediu multi-idioma; o próprio front de referência resolve i18n assim. | não perguntado — default do agente, alinhado ao padrão já portado |
| Granularidade de colunas da tabela / conteúdo do card do kanban | Núcleo fixo (nome/telefone) + status sempre visíveis; quais outros `values` aparecem como coluna extra ou badge no card é decisão do Design (guiada por `FieldDef.order`), não fixada aqui | A spec descreve O QUE o usuário vê e faz (busca por nome/telefone, agrupamento por status), não o layout pixel-a-pixel — isso é Design. | não perguntado — default do agente |
| Concorrência em toda mutação nova (edição de Customer, drag do kanban) | Last-write-wins, sem campo de lock otimista | Mesmo modelo já aceito e Verified para `Process.stage` (CORE-15 em `crm-core`); nenhuma AC desta feature pede um modelo mais forte. | **sim** (reafirma decisão já Verified) |
| Papel/autorização dos 3 novos endpoints | Mesma cadeia de `crm-core`: `validToken` + `tenantAssignmentCheck`, sem gate `isAdmin` extra (Customer/Process são registros do dia a dia; a leitura de templates disponíveis é liberada, mesmo padrão de `GET /field-templates/current`) | Consistente com CORE-14 ("qualquer papel autenticado") e com o padrão já Verified de leitura de template aberta a todo papel. | **sim** (decorre de decisão já Verified em `crm-core`/`dynamic-field-engine`) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Listar e buscar Customers em tabela ⭐ MVP

**User Story**: Como usuário autenticado do tenant, quero ver os Customers em uma tabela
com busca, ordenação e paginação, para encontrar rapidamente um registro específico.

**Why P1**: É a tela de entrada do CRM — sem ela, nenhuma outra jornada desta feature é
alcançável.

**Acceptance Criteria**:

1. WHEN a tela de Customers carrega THEN o sistema SHALL exibir uma tabela paginada
   consumindo `GET /customers`, mostrando ao menos nome, telefone e `status`.
2. WHEN o usuário digita um termo de busca THEN o sistema SHALL enviar `q` ao servidor e
   exibir só os Customers cujo nome ou telefone casam (busca server-side, nunca filtro
   local sobre uma página só).
3. WHEN o usuário troca a ordenação (nome/data de criação) ou a página THEN o sistema
   SHALL refletir a nova ordem/página vinda do servidor, sem carregar a coleção inteira.
4. WHEN a busca/filtro não retorna nenhum Customer THEN o sistema SHALL mostrar um estado
   vazio explícito (não uma tabela em branco nem um erro).

**Independent Test**: Abrir a tela com Customers pré-cadastrados (via API), buscar por um
nome parcial, trocar a ordenação e a página, e confirmar que cada ação reflete uma nova
chamada ao servidor com os parâmetros corretos.

---

### P1: Visualizar Customers em kanban por status ⭐ MVP

**User Story**: Como usuário autenticado, quero ver os mesmos Customers organizados em
colunas por `status`, para enxergar o funil de trabalho de um jeito visual.

**Why P1**: É a segunda visão dos MESMOS dados (já decidido no Discuss de `crm-core`) —
sem ela a tabela sozinha não entrega o valor "kanban" que o produto promete.

**Acceptance Criteria**:

1. WHEN a tela de kanban carrega THEN o sistema SHALL exibir uma coluna por opção do campo
   `status` do template `customer` corrente do tenant, ordenadas por `StatusOption.order`.
2. WHEN uma coluna carrega THEN o sistema SHALL popular seus cards a partir de
   `GET /customers?status=<key>` (mesmo endpoint da tabela, um filtro por coluna).
3. WHEN uma coluna não tem nenhum Customer com aquele `status` THEN o sistema SHALL exibir
   a coluna vazia (não omiti-la nem tratar como erro).
4. WHEN um Customer não tem valor algum em `status` (registro criado antes do campo
   existir, ou campo não obrigatório) THEN o sistema SHALL agrupá-lo em uma coluna
   explícita "sem status", nunca descartá-lo silenciosamente.

**Independent Test**: Com Customers em ao menos 2 status diferentes e 1 sem status
cadastrado, abrir o kanban e confirmar que cada card aparece na coluna correta, incluindo a
coluna "sem status".

---

### P1: Mudar o status de um Customer arrastando o card ⭐ MVP

**User Story**: Como usuário autenticado, quero arrastar um card de uma coluna para outra,
para mover um Customer de etapa sem abrir formulário nenhum.

**Why P1**: Confirmado no Discuss como o comportamento esperado do kanban — sem persistir,
a visão kanban seria só um recorte read-only da tabela.

**Acceptance Criteria**:

1. WHEN o usuário solta um card em uma coluna diferente THEN o sistema SHALL enviar uma
   mutação atualizando `values.status` do Customer para a chave da nova coluna.
2. WHEN a mutação é aceita pelo servidor THEN o card SHALL permanecer na nova coluna e a
   contagem de ambas as colunas (origem e destino) SHALL refletir o novo estado.
3. WHEN a mutação falha (rede ou validação) THEN o card SHALL voltar visualmente para a
   coluna de origem e o sistema SHALL mostrar uma mensagem de erro — nunca deixar o card
   "preso" numa coluna que o servidor rejeitou.
4. WHEN dois usuários movem o mesmo Customer quase ao mesmo tempo THEN o sistema SHALL
   aceitar ambas as chamadas (last-write-wins, sem lock otimista) e cada cliente SHALL
   refletir o estado real após um refetch, nunca um estado divergente permanente.

**Independent Test**: Arrastar um card para outra coluna, confirmar via `GET /customers`
que o `status` persistiu; simular uma falha (ex.: desconectar a rede) e confirmar que o
card volta para a coluna original com uma mensagem de erro visível.

---

### P1: Criar um novo Customer ⭐ MVP

**User Story**: Como usuário autenticado, quero cadastrar um novo Customer preenchendo um
formulário, para começar a trabalhá-lo no CRM.

**Why P1**: Sem criação, a tabela/kanban nunca teriam dado nenhum para mostrar.

**Acceptance Criteria**:

1. WHEN o usuário abre o formulário de novo Customer THEN o sistema SHALL renderizar os
   campos núcleo (nome, telefone, documento opcional) mais os campos dinâmicos do template
   `customer` corrente, usando a árvore recursiva de `hydrate()` (`FieldDef`/`RenderNode`)
   — um renderer único para qualquer tipo/profundidade de campo, sem código por template.
2. WHEN o usuário envia o formulário com dados válidos THEN o sistema SHALL chamar
   `POST /customers` e, no sucesso, levar o usuário para a listagem/detalhe do registro
   criado.
3. WHEN o servidor rejeita o envio (400 — `values` inválidos) THEN o sistema SHALL manter o
   formulário preenchido e exibir a mensagem de erro retornada, sem perder os dados digitados.
4. WHEN o usuário clica em enviar mais de uma vez seguida (duplo clique) THEN o sistema
   SHALL bloquear o segundo envio enquanto o primeiro está em voo — nunca criar 2
   registros a partir de 1 clique do usuário.

**Independent Test**: Preencher e enviar o formulário com dados válidos, confirmar 1 novo
registro via `GET /customers`; repetir com `values` inválidos e confirmar que nada foi
criado e o formulário preservou os dados.

---

### P1: Ver o detalhe de um Customer ⭐ MVP

**User Story**: Como usuário autenticado, quero abrir um Customer específico e ver seus
dados completos e o histórico de Process, para entender o contexto antes de agir.

**Why P1**: É o hub a partir do qual o usuário edita o Customer e abre/acompanha Process —
sem ele, as duas jornadas de Process (abaixo) não têm onde morar.

**Acceptance Criteria**:

1. WHEN o usuário navega para a URL de detalhe de um Customer (inclusive por reload direto)
   THEN o sistema SHALL buscar o registro via `GET /customers/:id` e exibir núcleo + values.
2. WHEN o `:id` não existe ou pertence a outro tenant THEN o sistema SHALL exibir um estado
   de "não encontrado", nunca os dados de outro tenant nem uma tela quebrada.
3. WHEN a página de detalhe carrega THEN o sistema SHALL exibir a lista de Process daquele
   Customer via `GET /processes?customerId=:id`, incluindo o estado vazio "nenhum Process
   ainda" quando a lista vier vazia.

**Independent Test**: Abrir o detalhe de um Customer com 2 Process associados, recarregar a
página (F5) e confirmar que os dados persistem vindos do servidor; tentar abrir um `:id` de
outro tenant e confirmar "não encontrado".

---

### P1: Editar um Customer existente ⭐ MVP

**User Story**: Como usuário autenticado, quero corrigir os dados de um Customer já
cadastrado (núcleo e/ou campos dinâmicos), para manter o registro correto ao longo do tempo.

**Why P1**: Confirmado no Discuss — a página de detalhe deve permitir edição completa, não
só a mudança de `status` via kanban.

**Acceptance Criteria**:

1. WHEN o usuário abre o formulário de edição a partir do detalhe THEN o sistema SHALL
   pré-preencher núcleo e `values` com os dados atuais do registro.
2. WHEN o usuário salva alterações válidas THEN o sistema SHALL persistir via a mutação de
   Customer e refletir os novos valores no detalhe sem exigir reload manual.
3. WHEN o servidor rejeita a edição (`values` inválidos contra o template corrente) THEN o
   sistema SHALL manter o formulário com os dados digitados e exibir o erro, sem descartar
   silenciosamente a tentativa.

**Independent Test**: Editar o nome e um campo dinâmico de um Customer existente, salvar, e
confirmar via `GET /customers/:id` que ambos persistiram; tentar salvar um valor inválido e
confirmar que o registro original não mudou.

---

### P1: Abrir um novo Process para um Customer ⭐ MVP

**User Story**: Como usuário autenticado, quero abrir um Process para um Customer
escolhendo o tipo de processo (template), para começar a trabalhar aquele fluxo.

**Why P1**: Completa a fatia vertical confirmada (Customer + Process ponta a ponta) — sem
ela, Process fica inacessível pela UI mesmo já pronto no back-end.

**Acceptance Criteria**:

1. WHEN o usuário abre "novo Process" a partir do detalhe de um Customer THEN o sistema
   SHALL listar os templates de `targetType: 'process'` disponíveis no tenant (via o novo
   endpoint de descoberta), mostrando `label`, e SHALL ocultar/desabilitar qualquer
   template `archived`.
2. WHEN não existe nenhum template de process não-arquivado no tenant THEN o sistema SHALL
   comunicar isso claramente e impedir a tentativa de criação (nunca um picker vazio e
   silencioso).
3. WHEN o usuário escolhe um template e confirma THEN o sistema SHALL chamar
   `POST /processes` com o `templateKey` e o `customerId` do contexto atual, exibindo o
   `stage` inicial retornado.
4. WHEN o servidor rejeita a criação (template arquivado entre a listagem e o envio, ou
   `values` inválidos) THEN o sistema SHALL exibir o erro e SHALL NOT navegar como se o
   Process tivesse sido criado.

**Independent Test**: Com 2 templates de process não-arquivados e 1 arquivado no tenant,
abrir o picker e confirmar que só os 2 não-arquivados aparecem selecionáveis; criar um
Process e confirmar via `GET /processes?customerId=` que ele aparece com o `stage` inicial
correto.

---

### P1: Editar os `values` de um Process e avançar seu `stage` ⭐ MVP

**User Story**: Como usuário autenticado, quero editar os campos de um Process aberto e
avançar seu `stage` apenas entre as etapas válidas do seu template, para trabalhar o fluxo
sem poder colocá-lo num estado inválido.

**Why P1**: Fecha a fatia vertical de Process — sem isso, "abrir um Process" (story acima)
não leva a lugar nenhum.

**Acceptance Criteria**:

1. WHEN o usuário abre um Process existente THEN o sistema SHALL renderizar seus `values`
   com o mesmo renderer recursivo usado por Customer, validado contra a `templateVersion`
   PRÓPRIA do registro (nunca a versão corrente do template, mesmo se o template já foi
   atualizado depois).
2. WHEN o usuário salva `values` válidos THEN o sistema SHALL chamar
   `PATCH /processes/:id/values` e refletir o novo estado sem reload manual.
3. WHEN o usuário troca o `stage` THEN o sistema SHALL oferecer como opções **apenas** os
   valores presentes no `stages` da `templateVersion` snapshot do próprio Process — nunca
   um campo de texto livre nem uma lista de todos os stages já vistos no sistema.
4. WHEN o servidor rejeita uma transição de `stage` (fora do `stages` válido) THEN o
   sistema SHALL manter o `stage` atual exibido e mostrar o erro — nunca mostrar
   otimisticamente um `stage` que o servidor não aceitou.

**Independent Test**: Abrir um Process, confirmar que o controle de `stage` só lista as
etapas do seu próprio template snapshot; avançar por uma sequência válida e confirmar
persistência via `GET`; tentar (via ferramenta de dev) forçar um `stage` inválido e
confirmar que o servidor rejeita e a UI não avança visualmente.

---

### P2: Persistir filtro/ordenação/página na URL

**User Story**: Como usuário autenticado, quero que o filtro de busca, ordenação, página e
coluna ativa fiquem na URL, para poder recarregar ou compartilhar o link e voltar ao mesmo
recorte.

**Why P2**: Melhora real de usabilidade, mas nenhuma AC de P1 depende disso — a tela
funciona corretamente sem persistência de URL.

**Acceptance Criteria**:

1. WHEN o usuário aplica busca/ordenação/página na tabela THEN o sistema SHALL refletir
   esse estado na URL (query string).
2. WHEN o usuário recarrega a página com uma URL que já tem esses parâmetros THEN o
   sistema SHALL restaurar a mesma busca/ordenação/página, sem exigir reconfiguração manual.

**Independent Test**: Aplicar um filtro, copiar a URL, abrir em nova aba e confirmar que o
mesmo filtro está ativo.

---

### P3: Criar Process a partir de um atalho no card do kanban

**User Story**: Como usuário autenticado, quero abrir "novo Process" direto de um card do
kanban, sem precisar navegar até o detalhe do Customer primeiro, para economizar cliques.

**Why P3**: Puro atalho de conveniência — a jornada completa (via detalhe) já cobre o
mesmo resultado.

**Acceptance Criteria**:

1. WHEN o usuário aciona o atalho no card THEN o sistema SHALL abrir o mesmo fluxo de
   criação de Process da story P1 correspondente, pré-preenchendo o `customerId` do card.

---

## Edge Cases

- WHEN o template `customer` corrente do tenant não define nenhum campo além do núcleo
  THEN o formulário de criação/edição SHALL funcionar normalmente com `values: {}`.
- WHEN uma opção de `status` é removida do template DEPOIS que Customers já usam aquele
  valor THEN o kanban SHALL continuar mostrando essa coluna (ou agrupá-la em "sem status"
  se a chave já não existir nas opções), nunca descartar os cards silenciosamente.
- WHEN o template usado por um Process aberto é arquivado DEPOIS da criação do Process
  THEN a edição de `values`/`stage` daquele Process SHALL continuar funcionando (valida
  contra a `templateVersion` própria do registro, não contra o estado corrente do
  template) — a UI pode sinalizar "template arquivado" como informativo, nunca bloquear.
- WHEN a tabela/kanban/listagem de Process retorna vazia (tenant novo, ou filtro sem
  resultado) THEN o sistema SHALL mostrar um estado vazio explícito em cada tela.
- WHEN a sessão expira/torna-se inválida enquanto o usuário está em qualquer tela desta
  feature THEN o sistema SHALL redirecionar para `/auth` (comportamento já existente de
  `_private.tsx`, feature 1 — reafirmado aqui como herdado, não uma AC nova).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status | Tasks |
| --- | --- | --- | --- | --- |
| WEB-01 | P1: Listar e buscar Customers em tabela | Tasks | In Tasks | T16, T17, T18 |
| WEB-02 | P1: Visualizar Customers em kanban por status | Tasks | In Tasks | T19, T20 |
| WEB-03 | P1: Mudar status de um Customer arrastando o card | Tasks | In Tasks | T3, T20 |
| WEB-04 | P1: Criar um novo Customer | Tasks | In Tasks | T14, T15, T22 |
| WEB-05 | P1: Ver o detalhe de um Customer | Tasks | In Tasks | T2, T23 |
| WEB-06 | P1: Editar um Customer existente | Tasks | In Tasks | T1, T3, T24 |
| WEB-07 | P1: Abrir um novo Process para um Customer | Tasks | In Tasks | T5, T25 |
| WEB-08 | P1: Editar `values`/avançar `stage` de um Process | Tasks | In Tasks | T25B, T26, T27 |
| WEB-09 | P2: Persistir filtro/ordenação/página na URL | Tasks | In Tasks | T18 |
| WEB-10 | P3: Criar Process a partir de atalho no card do kanban | Tasks | In Tasks | T25 |
| WEB-11 | Dimensão: validação client-side é só UX, servidor é fonte da verdade | Tasks | In Tasks | T14, T15 |
| WEB-12 | Dimensão: falha/falha parcial (rollback otimista do drag, formulário preserva dados) | Tasks | In Tasks | T20, T22, T24 |
| WEB-13 | Dimensão: idempotência de submit (evita duplo-clique duplicando registro) | Tasks | In Tasks | T22 |
| WEB-14 | Dimensão: fronteiras de auth & rate limit dos 3 novos endpoints | Tasks | Implementing | T2, T3, T5, T6 |
| WEB-15 | Dimensão: concorrência (last-write-wins + refetch) | Tasks | In Tasks | T3 |
| WEB-16 | Dimensão: observabilidade dos novos endpoints (dbReqResTime + log) | Tasks | Implementing | T2, T3, T4, T5 |
| WEB-17 | Dimensão: integridade de estado (`stage` só entre opções da snapshot do registro) | Tasks | In Tasks | T27 |

**ID format:** `WEB-[NUMBER]`. **Status values:** Pending → In Design → In Tasks →
Implementing → Verified.

**Coverage:** 17 requisitos · 17 mapeados a tasks (T1-T28 + T25B, added 2026-09-05) · 0 não
mapeados.

---

## Success Criteria

How we know the feature is successful:

- [ ] Um usuário consegue, sem sair do navegador: listar/buscar Customers, ver o kanban,
      arrastar um card para mudar status, criar um Customer, abrir seu detalhe, editá-lo,
      abrir um Process, editar seus `values` e avançar seu `stage` — de ponta a ponta, sem
      chamar a API manualmente.
- [ ] Nenhuma tela desta feature usa o `<Card>` `SPEC_DEVIATION` nem o dicionário de 12
      chaves de `translate.helper.ts` — ambos substituídos e reaplicados em TODAS as telas
      existentes (auth/invite/private) e nas novas.
- [ ] Zero regressão nas telas/testes já Verified de `foundation-tenancy-auth` (login,
      convite, shell privado) após a troca de design system/i18n.
