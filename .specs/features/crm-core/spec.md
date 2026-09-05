# CRM Core — Specification

**Escopo:** Large/Complex · **Fase seguinte:** Design (arquitetura + componentes) → Tasks → Execute
**Depende de:** `dynamic-field-engine` (feature 2) — `Customer` e `Process` consomem o
motor e os templates de lá.

## Problem Statement

Com tenancy/auth (feature 1) e o motor de campos dinâmicos (feature 2) prontos, ainda não
existe nenhum registro de negócio no CRM — nenhum `Customer`, nenhum `Process`. Esta feature
entrega o núcleo do CRM: cadastro e listagem de `Customer` (busca/ordenação/paginação
server-side, com filtro por `status` que serve tanto a listagem em tabela quanto uma visão
kanban) e o ciclo de vida de `Process` sobre o field-engine da feature 2.

## Goals

- [ ] `Customer`: núcleo fixo (nome, telefone, documento — `docs/glossary.md`) + `values`
      contra o template `customer` corrente do Tenant (feature 2), com listagem
      server-side (busca, ordenação, paginação, filtro por `status`)
- [ ] `Process`: instância de um `ProcessTemplate` (feature 2) vinculada a um `Customer`,
      com `stage` avançando só por transição válida do template usado
- [ ] Visão "kanban" de Customer é uma **leitura agrupada por `status` sobre a mesma
      listagem** — nenhuma persistência de board/card nesta feature (isso é o
      `kanban-tool`, ADR-0011, feature própria)
- [ ] `pnpm check` limpo

## Out of Scope

| Item | Motivo |
| --- | --- |
| `<DataTable>`, layout de kanban, design system, componentes React | Feature 4 (`crm-web-shell`) — aqui só a API que os alimenta |
| Board/Card avulso (ferramenta kanban livre, referencia `Process` opcionalmente) | Feature própria do roadmap (`kanban-tool`) — o que esta feature chama de "kanban" é só a listagem de Customer agrupada por `status`, sem model de board/card próprio. Ver ADR-0011 e `docs/glossary.md` (**Board/Card**) — não confundir os dois |
| `Event`/`Activity` (calendário/agenda) | Fora desta rodada — confirmado no Discuss (escopo travado em Customer + Process) |
| Definição/edição da árvore de campos (templates) | Feature 2 (`dynamic-field-engine`) — esta feature só consome o template corrente, nunca o edita |
| Vínculo financeiro/`Deal` em `Process` | Não existe conceito de `Deal` ainda; `Process` já é o objeto de trabalho flexível — campos do tenant cobrem o que for necessário |
| Dedup/merge de `Customer` por telefone/documento repetido | Não pedido; ver Assumptions |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Racional | Confirmado? |
| --- | --- | --- | --- |
| O que é "kanban" nesta rodada | Visão da MESMA listagem de Customer; colunas = valores distintos do campo `status`; sem model de Board/Card separado | Resposta explícita do Discuss: "o kanban também recebe os mesmos dados da listagem de [Customer], porém apresenta eles organizados em colunas por status, enquanto a listagem apresenta e permite filtros" | **sim** (Discuss) |
| Paginação da listagem de Customer | Server-side — busca, ordenação e paginação por parâmetro de API | Resposta explícita do Discuss | **sim** (Discuss) |
| Nome da entidade | `Customer` | Resposta explícita do Discuss; consistente com roadmap e `docs/glossary.md` | **sim** (Discuss) |
| Núcleo fixo de Customer | Nome, telefone, documento (`docs/glossary.md`). `status` **não** é núcleo fixo — vive em `values`, contra o field-engine (feature 2) | Glossário já define o núcleo; `status` configurável por tenant foi decisão desta rodada de Discuss | **sim** (glossário + Discuss) |
| Unicidade de Customer dentro do tenant | Nenhuma unicidade forçada nesta rodada (telefone/documento podem repetir) | Não foi discutido; assumido para não inventar requisito de negócio ("mesmo telefone é a mesma pessoa?") sem confirmação | não confirmado — revisar se duplicidade virar problema real |
| Como a listagem serve "todas as colunas" do kanban com paginação server-side | O endpoint de listagem aceita filtro por `status` (valor único) + paginação normal; quem monta o board (uma chamada por coluna) é o front, feature 4 | Mantém um único contrato de listagem, sem endpoint kanban dedicado | não confirmado — proposta do agente para o Design ajustar sem reabrir Specify |
| `Process` sem `Deal`/financeiro | `Process` cobre isso via campos do tenant (feature 2) | Nenhum requisito pediu `Deal`; `Process` já é genérico o bastante para representar qualquer pipeline de negócio via template | **sim** (assumido — fora do pedido original) |

**Open questions:** nenhuma — tudo resolvido ou logado acima.

---

## Varredura de dimensões implícitas

Escopo Large/Complex: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | CORE-12 — Zod em nome/telefone/documento; `values` validados contra o template corrente (`FLD-02`); limites de `page`/`limit` na listagem |
| Falha / falha parcial | CORE-13 — criar Customer/Process com `values` inválidos não persiste nada (400); mudar `stage` inválido não altera o registro |
| Idempotência / retry / duplicata | N/A explícito nesta rodada — dedup de Customer fora de escopo (ver Assumptions); leitura (listagem) é idempotente por natureza (GET) |
| Fronteiras de auth & rate limit | CORE-14 — qualquer papel autenticado (`admin`/`gestor`/`operador`) lê Customer/Process do próprio tenant; rate limit em criação/mutação |
| Concorrência / ordenação | CORE-15 — duas mutações concorrentes de `stage` do mesmo Process resolvem em uma transição válida por vez (guard) |
| Ciclo de vida / expiração | N/A explícito — Customer/Process não expiram, nenhum TTL previsto nesta rodada |
| Observabilidade | CORE-16 — `dbReqResTime` nas novas operações; log estruturado em transição de `stage` inválida |
| Falha de dependência externa | N/A — mesma cobertura de FND-18 (Mongo indisponível falha o boot, feature 1) |
| Integridade de transição de estado | CORE-17 — `stage` do Process só transiciona conforme `stages` definidos no `ProcessTemplate` da `templateVersion` usada (guard) |

---

## User Stories

### P1: Admin/operador cadastra e lista Customer, com filtro por status ⭐ MVP

**User Story:** Como usuário autenticado do Tenant, quero cadastrar um Customer e listá-los
com busca, ordenação e filtro por status, para trabalhar tanto numa tabela quanto numa
visão kanban sobre os mesmos dados.

**Why P1:** É o registro central do CRM — sem `Customer`, `Process` não tem a quem se
vincular e a fatia vertical (feature 3) não é demo-ável.

**Acceptance Criteria**

1. WHEN um usuário autenticado cria um Customer com nome, telefone e (opcional) documento,
   e `values` válidos contra o template `customer` corrente do Tenant THEN o sistema SHALL
   persistir o registro vinculado ao `Tenant` da sessão (nunca de input) e à
   `templateVersion` usada.
2. WHEN os `values` submetidos não validam contra o template corrente (`validate()` da
   feature 2) THEN o sistema SHALL responder 400 com erro por campo, sem criar o registro.
3. WHEN um usuário lista Customers com parâmetros de busca (nome/telefone), ordenação e
   paginação THEN o sistema SHALL aplicar tudo server-side e devolver só registros do
   Tenant da sessão.
4. WHEN um usuário filtra a listagem por um valor de `status` THEN o sistema SHALL devolver
   só Customers com aquele valor — a mesma chamada usada para montar uma coluna do kanban.
5. WHEN dois tenants têm Customers espelhados (mesmo nome/telefone) THEN nenhuma chamada
   SHALL devolver registro do tenant errado (teste estrutural de FND-09 estendido a
   `customers`).
6. WHEN um corpo de requisição de criação/edição de Customer contém `Tenant`/`tenantId`/
   `orgId` THEN o sistema SHALL ignorá-lo (mesma regra AD-010/FND-07).

**Independent Test:** criar 2 tenants espelhados com Customers de mesmo nome e provar
isolamento; criar Customer com `status` fora das opções do template e receber 400; filtrar
listagem por um valor de `status` e confirmar que corresponde exatamente à "coluna"
esperada de um board.

---

### P1: Process é aberto sobre um template e avança por stage guardado ⭐ MVP

**User Story:** Como usuário autenticado, quero abrir um Process vinculado a um Customer
usando um template de processo do meu Tenant, e avançar seu `stage` só entre transições
válidas.

**Why P1:** É o segundo objeto central do CRM (`docs/glossary.md`: "é o objeto de trabalho
do CRM"); sem ele o field-engine da feature 2 não tem consumidor real além do seed de
Customer.

**Acceptance Criteria**

1. WHEN um usuário abre um Process escolhendo um `ProcessTemplate` do Tenant e um `Customer`
   existente do mesmo Tenant THEN o sistema SHALL criar o registro com a `templateVersion`
   corrente, `stage` inicial (primeiro `stage` definido no template) e `values` vazios/
   default.
2. WHEN um usuário atualiza `values` de um Process THEN o sistema SHALL validar contra a
   `templateVersion` que **aquele Process** usa (não necessariamente a corrente do
   template, se o template já tiver avançado) e persistir só se válido.
3. WHEN um usuário move o `stage` de um Process para um valor não listado nos `stages` da
   `templateVersion` usada THEN o sistema SHALL responder 400 e não alterar o `stage`.
4. WHEN um Process é criado apontando para um `Customer` de outro Tenant (forjado) THEN o
   sistema SHALL responder 403/404 e não criar nada.

**Independent Test:** abrir Process e mover por `stages` válidos em sequência; tentar mover
para um `stage` inexistente no template e receber 400 sem alteração; tentar vincular
Customer de outro tenant e receber rejeição sem criar registro.

---

### P2: Ver o histórico de Process de um Customer

**User Story:** Como usuário autenticado, quero listar todos os Process vinculados a um
Customer, para ver o histórico de trabalho com ele.

**Why P2:** Útil desde já, mas o MVP (P1) já é demo-ável sem essa navegação — pode chegar
depois de Customer e Process existirem isoladamente.

**Acceptance Criteria**

1. WHEN um usuário lista Process filtrando por `Customer` THEN o sistema SHALL devolver só
   os Process daquele Customer, dentro do Tenant da sessão.

**Independent Test:** criar 2 Process para o mesmo Customer e 1 para outro Customer;
listar por Customer e confirmar que só os 2 corretos voltam.

---

## Edge Cases

- WHEN o telefone/documento vem com formatação diferente (espaços, traços, parênteses)
  THEN o sistema SHALL normalizar antes de persistir (mesmo espírito da normalização de
  e-mail em minúsculas na feature 1).
- WHEN a paginação pede `page`/`limit` fora dos limites (negativo, acima do máximo) THEN o
  sistema SHALL aplicar o limite máximo configurado e nunca devolver a coleção inteira sem
  paginação.
- WHEN o filtro de `status` recebe um valor que não existe nas opções do template corrente
  THEN o sistema SHALL devolver lista vazia, não erro — coluna vazia é um estado válido do
  kanban.
- WHEN um Process é aberto contra uma versão de template já superada (tenant editou o
  template depois de o Process ter sido criado) THEN novos Process SHALL usar a versão
  corrente; Process já abertos continuam na versão que usaram (garantia da feature 2,
  `FLD-06`).
- WHEN um `Customer` referenciado por um `Process` ainda não tem nenhum `Process` aberto
  THEN a listagem de histórico (P2) SHALL devolver lista vazia, não erro.

---

## Requirement Traceability

| ID | Story | Fase | Status |
| --- | --- | --- | --- |
| CORE-01 | P1: Customer — criação com `values` válidos, Tenant/versão da sessão | Verified | ✅ Verified |
| CORE-02 | P1: Customer — `values` inválidos rejeitam sem criar | Verified | ✅ Verified |
| CORE-03 | P1: Customer — listagem server-side (busca/ordenação/paginação) | Verified | ✅ Verified |
| CORE-04 | P1: Customer — filtro por `status` (base da coluna do kanban) | Verified | ✅ Verified |
| CORE-05 | P1: Customer — isolamento entre tenants (estende FND-09) | Verified | ✅ Verified |
| CORE-06 | P1: Customer — `Tenant`/`tenantId`/`orgId` forjado no body ignorado | Verified | ✅ Verified |
| CORE-07 | P1: Process — abertura com `templateVersion` corrente + `stage` inicial | Verified | ✅ Verified |
| CORE-08 | P1: Process — update de `values` valida contra a `templateVersion` do registro | Verified | ✅ Verified |
| CORE-09 | P1: Process — `stage` só transiciona entre `stages` do template (guard) | Verified | ✅ Verified |
| CORE-10 | P1: Process — não vincula Customer de outro tenant | Verified | ✅ Verified |
| CORE-11 | P2: Process — listagem filtrada por Customer (histórico) | Verified | ✅ Verified |
| CORE-12 | Dimensão: validação de entrada & limites | Verified | ✅ Verified |
| CORE-13 | Dimensão: falha/falha parcial não persiste registro inválido | Verified | ✅ Verified |
| CORE-14 | Dimensão: fronteiras de auth & rate limit | Verified | ✅ Verified |
| CORE-15 | Dimensão: concorrência no avanço de `stage` | Verified | ✅ Verified |
| CORE-16 | Dimensão: observabilidade (`dbReqResTime` + log) | Verified | ✅ Verified |
| CORE-17 | Dimensão: integridade de transição de `stage` | Verified | ✅ Verified |

**ID format:** `CORE-[NUMBER]`. **Status values:** Pending → In Design → In Tasks →
Implementing → Verified.

**Coverage:** 17 requisitos · 17 mapeados e verificados independentemente —
ver `.specs/features/crm-core/validation.md` (2026-09-04).

---

## Success Criteria

- [ ] `pnpm check` limpo
- [ ] Dois tenants espelhados com Customer/Process de mesmo nome: teste estrutural de
      isolamento estendido cobre as novas rotas (reusa/expande o teste de FND-09)
- [ ] Listagem de Customer com busca + ordenação + paginação + filtro de `status` provada
      server-side sob teste de integração
- [ ] `Process` não aceita `stage` fora do template usado; `values` não persistem quando
      inválidos contra a `templateVersion` do registro
- [ ] Nenhum model Mongoose novo declarado fora de `packages/db` (mesma regra da feature 1)
