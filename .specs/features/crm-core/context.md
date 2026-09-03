# CRM Core Context

**Gathered:** 2026-09-03
**Spec:** `.specs/features/crm-core/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Cadastro e listagem server-side de `Customer` (núcleo fixo + campos dinâmicos da feature
2) e ciclo de vida de `Process` (instância de `ProcessTemplate` vinculada a um `Customer`).
Não inclui UI (feature 4) nem model de Board/Card de kanban avulso (feature `kanban-tool`).

---

## Implementation Decisions

### Escopo confirmado: só Customer + Process

Pergunta decisiva do Discuss: quais modelos reais entram nas features 2/3 agora? Resposta
do usuário: **"a primeira opção, só customer + process"** — sem `Event`/`Activity`
(calendário) e sem model de `Board`/kanban separado nesta rodada.

### "Kanban" nesta rodada não é o Board do ADR-0011

- Resposta literal do usuário: *"o kanban também recebe os mesmos dados da listagem de
  usuário [Customer], porém apresenta eles organizados em colunas por status, enquanto a
  listagem apresenta e permite filtros"*.
- Ou seja: **não há um segundo model** (`boards`/`cards`) nesta feature. O que o
  documento de investigação chamava de "Porte 3 — Kanban" (o Board/Card livre do
  ADR-0011, que referencia `Process` opcionalmente) continua sendo a feature `kanban-tool`
  do roadmap original, intocada por esta rodada.
- O que ENTRA aqui é só: a listagem de `Customer` aceitar filtro por `status` — o front
  (feature 4) usa a mesma API para montar tanto a tabela quanto um board visual agrupado
  por `status`.
- Registrado explicitamente em spec.md (Out of Scope) para não confundir as duas coisas
  no vocabulário do projeto — mesmo cuidado que `docs/glossary.md` já pede na seção
  "Termos que colidem".

### Listagem server-side

Resposta explícita: busca/ordenação/paginação real na API (não client-side como o
DentalEase original fazia). Justificativa do usuário: mais correto para um CRM que pode
crescer.

### Nome da entidade: Customer

Confirmado — consistente com o roadmap já gravado e com `docs/glossary.md`.

### Agent's Discretion

- Como a listagem serve "todas as colunas" do kanban dado que a paginação é server-side
  (uma chamada por coluna, filtrando por `status`, vs. um endpoint dedicado de
  agrupamento) — o agente propôs a opção mais simples (reusar o mesmo endpoint de
  listagem com filtro) e registrou como assumption não confirmada; Design pode revisar.
- Unicidade de Customer (telefone/documento duplicado dentro do mesmo tenant) — não
  discutido; o agente assumiu "sem unicidade forçada nesta rodada" para não inventar
  requisito de negócio.

### Declined / Undiscussed Gray Areas → Assumptions

- `Room`/local de evento — pergunta feita, mas marcada **N/A** pelo usuário porque
  `Event` não entrou no escopo desta rodada. Sem impacto em `crm-core`.
- Vínculo financeiro/`Deal` em `Process` — não discutido; assumido como fora de escopo
  porque `Process` já é genérico o bastante via campos do tenant.

---

## Specific References

Nenhuma referência visual — feature back-end. O documento de investigação
(`crm-web-shell-identidade-visual-context.md`, Porte 1 — Listagem de Customer) foi usado
só para o modelo mínimo de campos (nome, telefone, e-mail, status, createdAt), não para
decisões de layout.

---

## Deferred Ideas

- Board/Card de kanban avulso com colaboradores, compartilhamento e referência opcional a
  `Process` (ADR-0011) — feature `kanban-tool` própria do roadmap, não tocada aqui.
- `Event`/`Activity` (calendário, Porte 2 do documento de investigação) — fora desta
  rodada; fica para quando o usuário confirmar que entra no roadmap (possivelmente uma
  feature nova, já que não mapeia 1:1 em nenhuma das 5 features originais).
- Dedup/merge de `Customer` duplicado.
