# Dynamic Field Engine Context

**Gathered:** 2026-09-03
**Spec:** `.specs/features/dynamic-field-engine/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Motor isomórfico de campos dinâmicos (`packages/field-engine`) + persistência de template
tenant-scoped versionada, generalizada para atender mais de um tipo de entidade
(`customer` e `process` nesta rodada). Não inclui UI de renderização (`<FieldRenderer>`,
feature 4) nem o CRUD de `Customer`/`Process` em si (feature 3).

---

## Implementation Decisions

### Sequenciamento do roadmap (reordenação implícita pedida pelo usuário)

- O usuário pediu explicitamente para atualizar as features 2 e 3 do roadmap (não a 4),
  a partir de um documento de investigação sobre porte de UI (calendário, listagem,
  kanban) do projeto de referência DentalEase.
- Isso resolveu a "Opção B" descrita naquele documento (puxar modelos reais para frente
  em vez de mock) — mas com escopo reduzido: só `Customer` + `Process` entram nesta
  rodada, não `Event`/`Activity` (calendário) nem um model de `Board`/kanban separado.

### Escopo de Customer.status — generaliza o AD-003

- `docs/glossary.md` já registrava que `Customer` tem núcleo fixo + "campos dinâmicos
  definidos pelo tenant" — mas nenhuma feature anterior havia confirmado que isso usa a
  MESMA máquina de `Process` (AD-003).
- Decisão do usuário: **não é fixo, é customizável**, e deve rodar sobre uma função
  recursiva (o motor desta feature) para construir os campos em tela de forma
  personalizada por tenant — mas **deve haver um preenchimento base como modelo** (seed
  automático), para o tenant não começar do zero.
- Isso generaliza o AD-003 (que falava só de `Process`) para um mecanismo reutilizável
  por `customer` e `process`. O nome exato das collections (discriminador único vs. dois
  pares paralelos que compartilham a lib) fica para o Design — a spec só garante que é
  UMA implementação, não duas divergentes.

### Seed automático só para Customer

- Só `Customer` ganha um template padrão semeado na provisão do Tenant (reusando o fluxo
  de FND-01, feature 1). `Process` não tem default universal — tipos de processo
  ("compra", "agendamento") são decisão de negócio de cada tenant, sem valor sensato para
  pré-preencher.

### Agent's Discretion

- Conteúdo exato do seed padrão de `Customer` (opções do campo `status`: `novo`/`ativo`/
  `inativo`, cores e ordem) — o usuário não especificou valores; o agente escolheu um
  default mínimo e genérico, registrado como assumption não confirmada em spec.md.
- Nome exato das collections generalizadas (`targetType` discriminador vs. pares
  paralelos) — decisão técnica de Design, sem impacto observável no comportamento
  especificado.

### Declined / Undiscussed Gray Areas → Assumptions

- Limite de profundidade de `array`/`group` e tamanho máximo de árvore de campos — não
  discutido; a spec loga como requisito (FLD-14) sem número exato definido (Design
  escolhe um limite técnico razoável).
- Conteúdo/rotulagem exata do seed — ver "Agent's Discretion" acima; registrado em
  spec.md como assumption não confirmada.

---

## Specific References

Nenhuma referência visual/de produto específica foi trazida para esta feature — ela é
inteiramente back-end/isomórfica. O documento de investigação
(`crm-web-shell-identidade-visual-context.md`) que motivou esta rodada é sobre UI (feature
4); usado aqui só para entender POR QUE a generalização de `Customer.status` era
necessária (kanban do Porte 3 do documento), não para decisões visuais.

---

## Deferred Ideas

- Template padrão para `Process` (fora de escopo — sem default de negócio sensato).
- Dedup/merge de valores quando um campo é removido em massa (a spec só garante migração
  guiada por tenant, não automação de merge).
- Wiring de `toToolSchema` nas tools do harness de IA (`get_process_template`,
  `set_process_fields`) — feature própria do `ai-kit`, fora desta rodada.
