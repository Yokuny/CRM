# Dynamic Field Engine — Specification

**Escopo:** Large/Complex · **Fase seguinte:** Design (arquitetura + componentes) → Tasks → Execute

## Problem Statement

Tanto `Customer` quanto `Process` (feature 3, `crm-core`) precisam carregar campos definidos
pelo tenant — não fixos no schema — incluindo um campo `status` usado tanto no filtro da
listagem de Customer quanto na visão kanban. Hoje (pós feature 1) não existe nenhum
mecanismo de definição, versionamento ou valor de campo: cada feature futura que precisar
disso reinventaria a roda ou hardcodaria schema por tenant. Esta feature entrega o motor
isomórfico (`packages/field-engine`) e a persistência tenant-scoped e versionada que toda
entidade com campos dinâmicos consome — nesta rodada, `Customer` e `Process`.

## Goals

- [ ] `packages/field-engine` isomórfico (roda idêntico em `crm-api` e `web`) expõe
      `hydrate`, `validate`, `toToolSchema` sobre a árvore `FieldDef`, com os 11 tipos do
      v1 já fixados em `docs/architecture.md` (`text`, `number`, `currency`, `percent`,
      `boolean`, `date`/`datetime`, `select`, `status`, `document`, `reference`, `array`,
      `group`)
- [ ] Templates de campo tenant-scoped, versionados imutavelmente (evolução aditiva sem
      migração; destrutiva com migração explícita, nunca silenciosa — AD-003), reutilizados
      por mais de um tipo de entidade (`customer` e `process` nesta rodada)
- [ ] Tenant recém-provisionado (FND-01) recebe automaticamente um template padrão de
      `customer` com um campo `status` pronto para uso, sem configuração manual
- [ ] `pnpm check` limpo incluindo o novo package

## Out of Scope

| Item | Motivo |
| --- | --- |
| `<FieldRenderer>` (componente React recursivo) | Feature 4 (`crm-web-shell`) — esta feature entrega só a lógica isomórfica que ele vai consumir |
| Telas de administração de template (montar árvore de campos visualmente) | Feature 4 — aqui só a API |
| CRUD de `Customer`/`Process` em si (registro, valores preenchidos, stage) | Feature 3 (`crm-core`) — esta feature entrega só o motor e o template |
| Wiring de `toToolSchema` nas tools do harness de IA (`get_process_template`, `set_process_fields`) | AD-004 já reserva a superfície de tools; conectar o harness é feature própria do `ai-kit` |
| Template padrão automático para `Process` | Tipos de processo são de negócio do tenant (ex.: "compra", "agendamento") — sem default universal sensato; só `Customer` ganha seed |
| Dedup / merge de registros que usam o mesmo campo | Fora do domínio do motor — decisão de cada entidade consumidora |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Racional | Confirmado? |
| --- | --- | --- | --- |
| Generalização do AD-003 | AD-003 previa collections só de `Process` (`processTemplates`/`processTemplateVersions`); esta feature generaliza para um mecanismo único reutilizado por `customer` e `process`. Nome exato de collection (discriminador `targetType` único vs. dois pares paralelos que compartilham a mesma lib) fica para o Design | Discuss confirmou que `Customer.status` usa a MESMA máquina de campos dinâmicos do `Process`, não uma segunda implementação | **sim** (Discuss) |
| Conteúdo do seed padrão de Customer | Um único campo `status` (tipo `status`), opções `novo` / `ativo` / `inativo` (pt-BR, cores/ordem a definir visualmente na feature 4) | Nada além disso foi pedido; o motor genérico permite ao tenant adicionar mais campos depois — seed mínimo evita inventar requisito de negócio não pedido | não confirmado — default do agente; revisar se o tenant precisar de outra pipeline |
| `Process` ganha seed automático? | Não — só `Customer` | Tipo de processo é decisão de negócio do tenant, sem default universal (ao contrário de `status`, que toda listagem/kanban precisa para não nascer vazia) | **sim** (inferido do Discuss — só Customer foi mencionado) |
| Quem pode criar/editar template | Só `admin` do tenant | Mesmo padrão de RBAC de FND-08 (feature 1): mutação estrutural é ação administrativa | **sim** (consistência com feature 1) |
| Nome do package | `packages/field-engine`, já gravado no roadmap (AD-001, `.specs/STATE.md`) | Decidido antes desta feature | **sim** |

**Open questions:** nenhuma — tudo resolvido ou logado acima.

---

## Varredura de dimensões implícitas

Escopo Large/Complex: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | FLD-14 — Zod na própria árvore `FieldDef` (profundidade máx. de `array`/`group`, tamanho de `label`/`key`, nº máx. de campos por template) e por-tipo em `validate()` (FLD-02) |
| Falha / falha parcial | FLD-12 — migração destrutiva é transacional: tudo-ou-nada |
| Idempotência / retry / duplicata | FLD-10 (seed do template padrão) + FLD-15 (retry de bump de versão não duplica versão) |
| Fronteiras de auth & rate limit | FLD-07 (só `admin` muta template) + FLD-16 (rate limit na mutação) |
| Concorrência / ordenação | FLD-17 — dois `admin`s bumpando o mesmo template ao mesmo tempo resolve em uma única versão nova (guard otimista por `currentVersion`) |
| Ciclo de vida / expiração | FLD-08 — versões antigas nunca são apagadas (registro antigo precisa renderizar contra elas); template pode ser `archived`, nunca deletado, enquanto houver registro referenciando alguma versão dele |
| Observabilidade | FLD-18 — `dbReqResTime` nas novas operações de banco (padrão já gravado em FND-17); log estruturado em migração destrutiva |
| Falha de dependência externa | N/A — nenhuma dependência externa nova; Mongo indisponível já coberto por FND-18 da feature 1 (boot falha, não sobe aceitando tráfego) |
| Integridade de transição de estado | FLD-19 — bump de versão e arquivamento de template são transições guardadas, além do que FLD-04/05/06/08 já cobrem |

---

## User Stories

### P1: Motor isomórfico define, renderiza e valida uma árvore de campos ⭐ MVP

**User Story:** Como sistema (consumido por `crm-api` e `web`), preciso de um motor único
que produza a árvore renderizável a partir de valores e valide valores submetidos, para
que nenhuma feature futura reimplemente essa lógica.

**Why P1:** É a fundação que `Customer`/`Process` (feature 3) e o front (feature 4)
consomem; sem ela nada mais tem onde se apoiar.

**Acceptance Criteria**

1. WHEN `hydrate(fields: FieldDef[], values: FieldValues)` roda THEN o sistema SHALL
   devolver um `RenderNode[]` onde cada nó é o `FieldDef` acrescido da key `value`,
   recursando em `array` (via `of`) e `group` (via `fields`).
2. WHEN um valor está ausente para um campo THEN `hydrate` SHALL preencher a representação
   vazia do tipo (string vazia, `null`, array vazio conforme o tipo) — nunca `undefined`
   solto que quebre o render.
3. WHEN `validate(fields, values)` roda THEN o sistema SHALL aplicar as regras de cada um
   dos 11 tipos do v1 (limites de `text`/`number`, `currency` como inteiro em centavos,
   `reference` como ObjectId respeitando `target`, opções válidas de `select`/`status`,
   recursão em `array`/`group`) e devolver erros por `fieldId`, sem lançar exceção não
   tratada.
4. WHEN `toToolSchema(fields)` roda THEN o sistema SHALL produzir um JSONSchema válido sem
   nenhum campo de `Tenant` nele (conformidade AD-010/AD-004).
5. WHEN o mesmo `FieldDef[]` e `FieldValues` rodam em `crm-api` (Node) e em `web` (browser
   via Vite) THEN o resultado de `hydrate`/`validate` SHALL ser idêntico (prova de
   isomorfismo).

**Independent Test:** suíte unit isomórfica do package rodando as mesmas fixtures de
`FieldDef`/`FieldValues` sob os dois runtimes e comparando saída; `array` de `group` de
`array` persiste e valida sem perder tipo (caso citado em `docs/architecture.md`).

---

### P1: Template de campo tenant-scoped, versionado imutavelmente ⭐ MVP

**User Story:** Como admin de um Tenant, quero definir e evoluir a árvore de campos de um
tipo de entidade (`customer` ou `process`) sem quebrar registros já preenchidos com a
versão anterior.

**Why P1:** É o contrato de persistência que dá sentido ao motor da story anterior — sem
versão imutável, editar um campo corromperia o histórico (AD-003).

**Acceptance Criteria**

1. WHEN um `admin` cria um template para um `targetType` (`customer` ou `process`) com uma
   árvore de campos THEN o sistema SHALL persistir o template com `currentVersion: 1` e uma
   versão imutável snapshot dos campos.
2. WHEN um `admin` faz uma mudança aditiva (campo opcional novo, label, ordem, opção nova)
   THEN o sistema SHALL criar uma nova versão imutável e bumpar `currentVersion`, sem tocar
   em nenhum registro existente.
3. WHEN um `admin` tenta uma mudança destrutiva (remover campo em uso, trocar tipo, remover
   opção em uso) THEN o sistema SHALL exigir um passo de migração explícito (descartar ou
   mapear o valor) antes de aceitar a nova versão — SHALL rejeitar um bump que deixaria
   `values` órfãos silenciosamente.
4. WHEN um registro antigo (`Customer`/`Process`) aponta para uma `templateVersion`
   anterior THEN `hydrate` SHALL renderizá-lo fiel à versão que ele usou, mesmo após o
   template ter avançado versões.
5. WHEN um usuário sem papel `admin` tenta criar/editar um template THEN o sistema SHALL
   responder 403 sem alterar nada.
6. WHEN um template é arquivado THEN o sistema SHALL impedir novos registros de usá-lo, mas
   SHALL continuar servindo `hydrate` para registros existentes que já o referenciam.

**Independent Test:** criar template v1 com campo `status`; criar um registro fictício de
teste contra v1; bumpar para v2 removendo o campo sem migração e receber rejeição; migrar
explicitamente e confirmar que v2 é aceita; confirmar que o registro de teste ainda
renderiza contra v1.

---

### P1: Tenant recém-provisionado já tem um template padrão de Customer ⭐ MVP

**User Story:** Como admin recém-convidado (feature 1), quero que minha empresa já tenha um
campo `status` de Customer configurado, para poder usar listagem e kanban sem montar nada
manualmente primeiro.

**Why P1:** Sem isso, o vertical slice de `crm-core` (feature 3) fica bloqueado numa tela de
configuração antes de mostrar qualquer Customer — quebra o padrão "demo-ável" já
estabelecido na feature 1.

**Acceptance Criteria**

1. WHEN um Tenant é provisionado (FND-01) THEN o sistema SHALL semear automaticamente um
   template `customer` versão 1 contendo um campo `status` (tipo `status`) com um conjunto
   de opções padrão.
2. WHEN o seed roda mais de uma vez para o mesmo Tenant (reprocessamento, retry) THEN o
   sistema SHALL ser idempotente — nunca criar um segundo template `customer` padrão para
   o mesmo Tenant.
3. WHEN um `admin` do tenant customiza o template padrão (adiciona campo, muda opção) THEN
   nenhuma reexecução futura do seed SHALL sobrescrever a customização (seed só cria quando
   não existe nenhum template `customer` para o Tenant).

**Independent Test:** provisionar um Tenant (reusando o fluxo de FND-01) e verificar que o
`GET` do template `customer` corrente já devolve o campo `status` com as opções padrão, sem
nenhuma chamada extra de setup.

---

### P2: Migração destrutiva de template é transacional e auditável

**User Story:** Como admin, ao remover um campo em uso quero que a operação seja tudo-ou-
nada e fique registrada, para nunca ficar num estado onde parte dos registros aponta para
uma definição inconsistente.

**Why P2:** Reforça a garantia da story P1 anterior com o caminho de falha explícito; não
bloqueia o MVP porque a maioria das edições do dia 1 é aditiva.

**Acceptance Criteria**

1. WHEN uma migração destrutiva falha no meio (ex.: erro ao reescrever `values` de parte
   dos registros) THEN o sistema SHALL reverter por completo — nenhum registro fica
   apontando para a nova versão sem ter sido migrado.
2. WHEN uma migração destrutiva é aplicada com sucesso THEN o sistema SHALL registrar log
   estruturado (quem, quando, template, campos afetados, quantos registros migrados).

**Independent Test:** simular falha no meio da reescrita de `values` (fault injection) e
confirmar que nenhum registro ficou órfão; migração bem-sucedida aparece no log
estruturado.

---

## Edge Cases

- WHEN dois `admin`s bumpam o mesmo template simultaneamente THEN o sistema SHALL aceitar
  apenas um bump por vez (guard otimista por `currentVersion`) — o segundo recebe conflito
  e precisa reaplicar sobre a versão atual.
- WHEN um campo `reference` aponta para um `target` cujo registro foi apagado THEN
  `hydrate` SHALL devolver o `value` como referência pendente/inválida, nunca lançar
  exceção que derrube o render de toda a árvore.
- WHEN um template é criado com profundidade de `array`/`group` acima do limite THEN o
  sistema SHALL responder 400 antes de persistir.
- WHEN o `status` seed padrão é usado sem nenhuma customização THEN as opções SHALL ter
  `key`, `label`, `color` e `order` únicos entre si, prontos para virar coluna de kanban
  sem transformação adicional.
- WHEN um template `archived` é consultado por um registro que já o usa THEN `hydrate`
  SHALL funcionar normalmente — arquivar bloqueia só **novo** uso, nunca leitura antiga.

---

## Requirement Traceability

| ID | Story | Fase | Status |
| --- | --- | --- | --- |
| FLD-01 | P1: Motor — `hydrate` recursivo com defaults vazios | Design | Pending |
| FLD-02 | P1: Motor — `validate` por tipo, erro por `fieldId` | Design | Pending |
| FLD-03 | P1: Motor — `toToolSchema` sem Tenant + isomorfismo | Design | Pending |
| FLD-04 | P1: Template — criação e bump aditivo sem migração | Design | Pending |
| FLD-05 | P1: Template — bump destrutivo bloqueado sem migração | Design | Pending |
| FLD-06 | P1: Template — registro antigo renderiza versão antiga | Design | Pending |
| FLD-07 | P1: Template — RBAC, só `admin` muta | Design | Pending |
| FLD-08 | P1: Template — arquivamento não quebra registros existentes | Design | Pending |
| FLD-09 | P1: Seed — template `customer` padrão na provisão (FND-01) | Design | Pending |
| FLD-10 | P1: Seed — idempotente | Design | Pending |
| FLD-11 | P1: Seed — customização do tenant sobrevive a reseed | Design | Pending |
| FLD-12 | P2: Migração destrutiva — transacional (rollback completo) | Design | Pending |
| FLD-13 | P2: Migração destrutiva — log estruturado | Design | Pending |
| FLD-14 | Dimensão: validação de entrada da árvore `FieldDef` | Design | Pending |
| FLD-15 | Dimensão: idempotência de retry no bump de versão | Design | Pending |
| FLD-16 | Dimensão: rate limit em mutação de template | Design | Pending |
| FLD-17 | Dimensão: concorrência no bump de versão (guard otimista) | Design | Pending |
| FLD-18 | Dimensão: observabilidade (`dbReqResTime` + log) | Design | Pending |
| FLD-19 | Dimensão: transições guardadas (bump/arquivamento) | Design | Pending |

**ID format:** `FLD-[NUMBER]`. **Status values:** Pending → In Design → In Tasks →
Implementing → Verified.

**Coverage:** 19 requisitos · 0 mapeados (spec recém-criada, aguardando Design).

---

## Success Criteria

- [ ] `pnpm check` limpo incluindo `packages/field-engine`
- [ ] `hydrate`/`validate`/`toToolSchema` rodam idênticos em teste sob `crm-api` e sob
      `web` (mesma fixture, mesmo resultado)
- [ ] Tenant provisionado via fluxo de FND-01 já tem template `customer` com campo
      `status` sem nenhuma chamada extra
- [ ] Bump destrutivo sem migração é rejeitado sob teste; bump aditivo nunca migra nada
- [ ] Registro em versão antiga renderiza fiel após o template avançar versões
- [ ] Nenhum model Mongoose novo declarado fora de `packages/db` (mesma regra da feature 1)
