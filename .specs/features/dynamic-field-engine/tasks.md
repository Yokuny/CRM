# Dynamic Field Engine Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The
skill is the source of truth for the full flow (per-task cycle, sub-agent delegation,
adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/dynamic-field-engine/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling + project guidelines — confirm before Execute.
> Guidelines found: **AD-015**/**AD-017** (`.specs/STATE.md`) — Vitest 4 `projects`
> nomeados `unit`/`integration`/`e2e`/`structural`, arquivos por sufixo, sem `__test__`
> separado; `vitest.config.ts` (globs e `globalSetup` reais). Sampled 15 arquivos reais de
> `apps/crm-api`, `packages/contracts`, `packages/db`, `tests/structural`. Achado relevante
> da amostragem: `services/`, `repositories/` e `controllers/` de `crm-api` **não têm
> nenhum teste dedicado** em nenhum módulo existente (`platform`, `invite`, `auth`) — toda
> a lógica de negócio é provada pelo `*.router.e2e.test.ts` do módulo, com o app minimalista
> montado inline (`buildTestApp`, sem passar por `app.ts`). Esse é o piso real do projeto
> para esses três layers, não o default genérico da tabela abaixo — respeitado aqui.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `packages/contracts` (`fieldDefSchema`, `migrationActionSchema`, `createFieldTemplateSchema`, `bumpFieldTemplateSchema`) | unit | Cada um dos 11 tipos aceito; tipo inválido rejeitado; profundidade > 5 rejeitada; > 100 campos rejeitado; `fieldId` malformado rejeitado; `.strict()` recusa `TENANT_FORBIDDEN_KEYS` — mesmo nível de `provisionTenant.schema.unit.test.ts` | `packages/contracts/src/schemas/*.unit.test.ts` | `pnpm vitest run --project unit` |
| `packages/field-engine` (`hydrate`, `validate`, `toToolSchema`, `diffFields`, `emptyValueFor`) | unit | 1:1 com FLD-01/02/03/04/05: recursão `array` de `group` de `array`; toda regra por tipo; erro por `fieldId` sem lançar; JSONSchema sem chave de tenant; classificação aditivo/destrutivo em cada mudança listada no spec; isomorfismo Node + `jsdom` (dois arquivos de teste) | `packages/field-engine/src/*.unit.test.ts` | `pnpm vitest run --project unit` |
| `packages/db` (`FieldTemplate`, `FieldTemplateVersion`, `seedDefaultCustomerTemplate`) | integration | Índice único rejeita duplicata (`{Tenant,targetType,key}` e `{template,version}`); guarda por query aceita/rejeita; seed chamado 2x cria um único template — mesmo nível de `tenant.model.int.test.ts`/`invite.model.int.test.ts` | `packages/db/src/models/*.int.test.ts` | `pnpm vitest run --project integration` |
| `apps/crm-api` `providers/fieldValueStore` (no-op) | unit | `countByTemplateVersion` sempre 0; `migrateValues` sempre `{migrated:0}`, nunca toca em nada — mesmo nível de `log.mailProvider.unit.test.ts` | `apps/crm-api/src/providers/fieldValueStore/*.unit.test.ts` | `pnpm vitest run --project unit` |
| `apps/crm-api` `field-template` — repository/service/controller | **none** (piso real do projeto — ver nota acima) | Coberto transitivamente pelo e2e do router, mesma convenção de `platform`/`invite`/`auth` | — | — |
| `apps/crm-api` `field-template.router` (+ `fieldTemplateRateLimit`) | e2e | Toda rota: happy path + todo edge case listado no spec + erro — RBAC (403), 409 duplicata de `{targetType,key}`, 400 migração destrutiva incompleta, 409 conflito de slot de versão (`Promise.all` concorrente), migração bem-sucedida via fake `FieldValueStore` em memória (com fault injection para provar rollback), 429 rate limit, archive não quebra `hydrate` de registro antigo | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts` | `pnpm vitest run --project e2e` |
| Seed hook em `platform.service.provisionTenant` | e2e | Provisionar tenant → `GET /field-templates/current?targetType=customer` já devolve `status` sem chamada extra | `apps/crm-api/src/routers/platform.router.e2e.test.ts` (estendido) | `pnpm vitest run --project e2e` |
| Isolamento entre tenants (`FieldTemplate`/`FieldTemplateVersion`) | integration | Dois tenants espelhados provisionados via `buildApp()`, zero cruzamento de template — extensão do teste já existente | `apps/crm-api/tests/integration/tenant-isolation.int.test.ts` (estendido) | `pnpm vitest run --project integration` |
| Registry estrutural (`schemaRegistry`, `TENANT_FORBIDDEN_KEYS`) | structural | Sweep automático já existente cobre qualquer `*.schema.ts` novo sem exigir teste novo — só exige que os 4 schemas novos estejam registrados | `tests/structural/schema-registry.structural.test.ts` (já existe, sem mudança de código) | `pnpm vitest run --project structural` |
| `docs/architecture.md`, `docs/glossary.md` | none | — (documentação, build gate só valida que nada quebrou) | — | build gate only |

## Gate Check Commands

> De **AD-017** — reusados literalmente, nenhum comando novo inventado.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks só com teste unit | `pnpm vitest run --project unit --project structural` |
| Full | Após tasks com e2e/integration | `pnpm vitest run` |
| Build | Fim de fase, ou task só de config/docs | `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and
tasks within a phase execute in order.

### Phase 1: Docs sync

```
T1
```

### Phase 2: `packages/contracts`

```
T2 → T3 → T4
```

### Phase 3: `packages/field-engine`

```
T5 → T6 → T7 → T8 → T9
```

### Phase 4: `packages/db`

```
T10 → T11 → T12
```

### Phase 5: `apps/crm-api` — módulo `field-template`

```
T13 → T14 → T15 → T16 → T17
```

### Phase 6: Wiring + provas finais

```
T18 → T19 → T20
```

---

## Task Breakdown

### T1: Sincronizar docs com AD-019/AD-020

**What**: Atualizar `docs/architecture.md` (tabela "Propriedade de escrita por collection" e
seção "Motor de campos dinâmicos") e `docs/glossary.md` (entradas `ProcessTemplate`/
`ProcessTemplateVersion`) para refletir o par único `fieldTemplates`/`fieldTemplateVersions`
discriminado por `targetType`, conforme AD-019/AD-020 e `design.md`.
**Where**: `docs/architecture.md`, `docs/glossary.md`
**Depends on**: None
**Reuses**: Estrutura já existente dos dois arquivos — só a forma das collections muda.
**Requirement**: N/A (débito de documentação sinalizado em Risks & Concerns do `design.md`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `docs/architecture.md` mostra `fieldTemplates`/`fieldTemplateVersions` com `targetType` no exemplo de shape e na tabela de propriedade de escrita
- [x] `docs/glossary.md` atualiza `ProcessTemplate`/`ProcessTemplateVersion` para o termo generalizado, mantendo a nota "Não confundir com Template HSM"
- [x] Gate check passa: `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`

**Tests**: none
**Gate**: build
**Commit**: `docs(architecture): generalize field-engine collections per AD-019/AD-020`

---

### T2: `fieldDefSchema` — árvore recursiva dos 11 tipos

**What**: Criar `fieldDefSchema` (Zod, `z.lazy` + `z.discriminatedUnion('type', [...])`) para
os 11 tipos de `docs/architecture.md`, com `.superRefine` aplicando `MAX_TREE_DEPTH=5` e
`MAX_FIELDS_PER_TEMPLATE=100`; `fieldId` via regex `/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/`; `type
FieldDef = z.infer<typeof fieldDefSchema>`.
**Where**: `packages/contracts/src/schemas/fieldDef.schema.ts`
**Depends on**: None
**Reuses**: Molde de `provisionTenant.schema.ts` (schema é a fonte, tipo é `z.infer`)
**Requirement**: FLD-01 (forma), FLD-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Os 11 tipos (`text`,`number`,`currency`,`percent`,`boolean`,`date`,`datetime`,`select`,`status`,`document`,`reference`,`array`,`group`) validam com a config de cada um conforme `docs/architecture.md`
- [x] `array`/`group` recursam corretamente (`of`/`fields`); árvore com profundidade 6 é rejeitada; árvore com 101 campos é rejeitada
- [x] `fieldId` com `.` ou `$` é rejeitado
- [x] Exportado de `packages/contracts/src/index.ts`
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 16 testes (11 tipos + depth + count + fieldId válido/inválido) passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add recursive fieldDefSchema for the 11 v1 field types`

---

### T3: `migrationActionSchema` / `MigrationPlan`

**What**: Schema `migrationActionSchema` — união discriminada `{action:'discard'} |
{action:'mapField', toFieldId} | {action:'mapOptions', mapping}`; `type MigrationPlan =
Record<string, MigrationAction>`.
**Where**: `packages/contracts/src/schemas/migrationAction.schema.ts`
**Depends on**: None
**Reuses**: Mesmo molde de discriminated union de `fieldDefSchema` (T2)
**Requirement**: FLD-05, FLD-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] As três ações validam com seus campos exigidos; ação com `action` desconhecido é rejeitada
- [x] Exportado de `packages/contracts/src/index.ts`
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 4 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add migrationActionSchema and MigrationPlan type`

---

### T4: `createFieldTemplateSchema` / `bumpFieldTemplateSchema` + registro

**What**: `createFieldTemplateSchema` (`{targetType,key?,name,fields}.strict()` — `key`
obrigatório se `targetType==='process'`, ignorado/forçado a `DEFAULT_CUSTOMER_TEMPLATE_KEY`
se `'customer'`) e `bumpFieldTemplateSchema` (`{expectedVersion,fields,migration?}.strict()`).
Registrar os 4 schemas novos (`fieldDefSchema`, `migrationActionSchema`,
`createFieldTemplateSchema`, `bumpFieldTemplateSchema`) em `schemaRegistry`.
**Where**: `packages/contracts/src/schemas/createFieldTemplate.schema.ts`,
`bumpFieldTemplate.schema.ts`, `packages/contracts/src/registry.ts`
**Depends on**: T2, T3
**Reuses**: Molde de `createInviteSchema`; `registry.ts` já existente (T25 da feature 1
já provou que um schema esquecido aqui é o exato gap que o sweep estrutural pega)
**Requirement**: FLD-04, FLD-05, FLD-07 (via `.strict()` + `TENANT_FORBIDDEN_KEYS`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `targetType:'process'` sem `key` é rejeitado; `targetType:'customer'` com `key` custom é aceito mas o service (T15) ignora — schema só valida forma, não a regra de negócio
- [x] Corpo com `Tenant`/`tenantId`/`orgId` é rejeitado por `.strict()`
- [x] Ambos os schemas aparecem em `schemaRegistry`
- [x] `tests/structural/schema-registry.structural.test.ts` passa sem alteração de código do teste
- [x] Gate check passa: `pnpm vitest run --project unit --project structural`
- [x] Test count: ≥ 8 testes novos passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(contracts): add createFieldTemplate/bumpFieldTemplate schemas and register them`

---

### T5: Scaffold `packages/field-engine` + constantes + `emptyValueFor`

**What**: `package.json` (`exports: './src/index.ts'`, deps `@crm/contracts`+`zod`),
`tsconfig.json`, `src/index.ts` (barrel), `DEFAULT_CUSTOMER_TEMPLATE_KEY = 'default'`,
`emptyValueFor(field: FieldDef): RenderNodeValue` (tabela de valores vazios do `design.md`).
**Where**: `packages/field-engine/{package.json,tsconfig.json,src/index.ts,src/emptyValue.ts,src/constants.ts}`
**Depends on**: T2 (importa `FieldDef` de `@crm/contracts`)
**Reuses**: `package.json`/`tsconfig.json` de `packages/contracts` como molde
**Requirement**: FLD-01/AC2

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `pnpm install` resolve o novo workspace member
- [x] `emptyValueFor` cobre os 11 tipos conforme a tabela do `design.md` (`text`→`''`, `number`/`percent`/`currency`→`null`, `boolean`→`false`, `date`/`datetime`→`null`, `select`/`reference` `multiple`→`[]`, não-`multiple`→`null`, `status`→`null`, `document`→`null`)
- [x] Gate check passa: `pnpm -r exec tsc --noEmit`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(field-engine): scaffold package with constants and emptyValueFor`

---

### T6: `hydrate`

**What**: `hydrateNode`/`hydrate(fields, values): RenderNode[]` — algoritmo exato do
`design.md` (grupo e array sempre resolvem `RenderNode[]`, recursão uniforme).
**Where**: `packages/field-engine/src/hydrate.ts`, `hydrate.unit.test.ts`
**Depends on**: T5
**Reuses**: `emptyValueFor` (T5)
**Requirement**: FLD-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `array` de `group` de `array` hidrata sem perder tipo (fixture citada em `docs/architecture.md`)
- [x] Valor ausente vira o vazio de `emptyValueFor`, nunca `undefined`
- [x] Cada nó carrega todas as chaves do `FieldDef` original + `value`
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 8 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(field-engine): add hydrate with uniform array/group recursion`

---

### T7: `validate`

**What**: `validate(fields, values): {valid: boolean; errors: Record<string,string[]>}` —
constrói regras Zod por tipo (limites de `text`/`number`, `currency` inteiro em centavos,
`reference` como ObjectId respeitando `target`, opções válidas de `select`/`status`,
recursão em `array`/`group`), nunca lança.
**Where**: `packages/field-engine/src/validate.ts`, `validate.unit.test.ts`
**Depends on**: T5
**Reuses**: Estilo `safeParse` (nunca `parse`/try-catch) de `validation.middleware.ts`;
mapeamento de `issue.path` do mesmo arquivo
**Requirement**: FLD-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Uma regra testada por cada um dos 11 tipos (violação → erro; valor válido → sem erro)
- [x] Erros vêm chaveados por `fieldId` (incluindo path aninhado em `array`/`group`)
- [x] Entrada malformada (tipo errado de JS, não só regra de negócio) nunca lança exceção
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 14 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(field-engine): add validate with per-type rules and errors by fieldId`

---

### T8: `toToolSchema` + prova de isomorfismo

**What**: `toToolSchema(fields): JsonSchema` — mapeamento recursivo escrito à mão (sem lib
externa), mesma travessia de `validate`. Mais: um segundo arquivo de teste para `hydrate` e
`validate` com `// @vitest-environment jsdom` no topo, mesma fixture do arquivo default,
comparando saída estruturalmente idêntica (prova de isomorfismo Node vs. browser).
**Where**: `packages/field-engine/src/toToolSchema.ts`, `toToolSchema.unit.test.ts`,
`packages/field-engine/src/isomorphism.browser.unit.test.ts`
**Depends on**: T6, T7
**Reuses**: `// @vitest-environment jsdom` (pragma já usado em `apps/web/src/routes/_public/auth/index.unit.test.tsx:1`)
**Requirement**: FLD-03, FLD-01/AC5

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] JSONSchema resultante nunca contém nenhuma chave `tenant`/`Tenant`/`tenantId` em nenhum nível, para uma árvore com os 11 tipos
- [x] `isomorphism.browser.unit.test.ts` roda sob `jsdom` e produz exatamente o mesmo resultado (`toEqual`) que o teste default sob Node, para a MESMA fixture (`array` de `group` de `array`)
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 6 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(field-engine): add toToolSchema and prove Node/jsdom isomorphism`

---

### T9: `diffFields`

**What**: `diffFields(oldFields, newFields): {kind:'additive'} | {kind:'destructive';
changes: DestructiveChange[]}` — classifica campo removido, tipo trocado, opção
`select`/`status` removida como destrutivo; campo opcional novo, label/ordem, opção nova
como aditivo.
**Where**: `packages/field-engine/src/diffFields.ts`, `diffFields.unit.test.ts`
**Depends on**: T5
**Reuses**: Nenhum (função nova, pura)
**Requirement**: FLD-04, FLD-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Cada mudança aditiva listada no spec (campo opcional novo, label, ordem, opção nova) classifica `'additive'`
- [x] Cada mudança destrutiva listada no spec (campo removido, tipo trocado, opção removida em uso) classifica `'destructive'` com o(s) `fieldId`(s) afetado(s)
- [x] Árvore idêntica classifica `'additive'` com `changes` vazio (não é erro, é no-op)
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 8 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(field-engine): add diffFields additive/destructive classifier`

---

### T10: Model `FieldTemplate`

**What**: `FieldTemplateDocument` + schema Mongoose (`Tenant`, `targetType`, `key`, `name`,
`currentVersion`, `archived`) + índice único `{Tenant,targetType,key}` + índice
`{Tenant,targetType}` + `archiveFieldTemplate(id)` guardado por query (`{_id,archived:false}`).
**Where**: `packages/db/src/models/fieldTemplate.model.ts`, `.int.test.ts`
**Depends on**: None
**Reuses**: `transitionTenantStatus` (padrão "a guarda é a query") de `tenant.model.ts`
**Requirement**: FLD-04/AC1, FLD-08, FLD-19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Segundo `create` com o mesmo `{Tenant,targetType,key}` rejeita com `E11000`
- [x] `archiveFieldTemplate` num template já `archived:true` é no-op (devolve `null`, não lança)
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Test count: ≥ 5 testes passam

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add FieldTemplate model with unique {Tenant,targetType,key} index`

---

### T11: Model `FieldTemplateVersion`

**What**: `FieldTemplateVersionDocument` + schema Mongoose (`Tenant`, `template`,
`targetType`, `version`, `fields: Schema.Types.Mixed`) + índice único `{template,version}`
(a guarda de concorrência de FLD-17) + índice `{Tenant,targetType}`. `fields` tipado
`FieldDef[]` no TS, `Mixed` no Mongoose (confiado, validado por `fieldDefSchema` antes de
chegar aqui — mesma convenção de "Zod é fonte única").
**Where**: `packages/db/src/models/fieldTemplateVersion.model.ts`, `.int.test.ts`
**Depends on**: T2 (tipo `FieldDef`)
**Reuses**: Nenhum model existente tem campo `Mixed` — primeira vez no projeto; documentado
inline por quê
**Requirement**: FLD-06, FLD-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Segundo `create` com o mesmo `{template,version}` rejeita com `E11000`
- [x] `fields` grava e lê de volta uma árvore com `array`/`group` aninhados sem perda
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Test count: ≥ 4 testes passam

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add FieldTemplateVersion model with unique {template,version} index`

---

### T12: `seedDefaultCustomerTemplate`

**What**: `seedDefaultCustomerTemplate(tenantId): Promise<void>` — dois `findOneAndUpdate`
guardados com `$setOnInsert`+`upsert:true` (algoritmo exato do `design.md`);
`DEFAULT_CUSTOMER_FIELDS` (campo `status`, opções `novo`/`ativo`/`inativo`). Wire em
`packages/db/src/index.ts` (`syncIndexes` ganha os dois models novos).
**Where**: `packages/db/src/models/fieldTemplate.model.ts` (helper ao lado, como
`hashToken` em `invite.model.ts`), `packages/db/src/index.ts`, `.int.test.ts`
**Depends on**: T10, T11
**Reuses**: `DEFAULT_CUSTOMER_TEMPLATE_KEY` (T5); estilo de `hashToken` ao lado do model
**Requirement**: FLD-09, FLD-10, FLD-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Chamado 2x para o mesmo tenant cria exatamente um `FieldTemplate` e uma `FieldTemplateVersion`
- [x] Depois de um bump manual para v2 no teste, chamar o seed de novo NÃO reverte `currentVersion` para 1
- [x] `syncIndexes()` inclui os dois models novos
- [x] Gate check passa: `pnpm vitest run --project integration`
- [x] Test count: ≥ 4 testes passam

**Tests**: integration
**Gate**: full
**Commit**: `feat(db): add idempotent seedDefaultCustomerTemplate`

---

### T13: `providers/fieldValueStore` — interface + no-op

**What**: `type FieldValueStore` (`countByTemplateVersion`, `migrateValues`) +
`createNoopFieldValueStore(): FieldValueStore`.
**Where**: `apps/crm-api/src/providers/fieldValueStore/index.ts`,
`noop.fieldValueStore.ts`, `.unit.test.ts`
**Depends on**: None
**Reuses**: Molde exato de `providers/mail/index.ts` + `log.mailProvider.ts`
**Requirement**: FLD-12 (AD-021)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `countByTemplateVersion` sempre resolve `0`
- [x] `migrateValues` sempre resolve `{migrated:0}` e nunca lança
- [x] Gate check passa: `pnpm vitest run --project unit`
- [x] Test count: ≥ 3 testes passam

**Tests**: unit
**Gate**: quick
**Commit**: `feat(crm-api): add FieldValueStore port with no-op implementation`

---

### T14: `fieldTemplate.repository.ts`

**What**: `createTemplate`, `findTemplateByTargetKey`, `findCurrentVersion`, `claimVersionSlot`
(o `create` guardado por índice único de T11), `updateCurrentVersion`, `archiveTemplate` —
todos envolvidos em `withDbTiming`.
**Where**: `apps/crm-api/src/repositories/fieldTemplate.repository.ts`
**Depends on**: T10, T11
**Reuses**: `withDbTiming` (`metrics/db.metric.ts`); forma exata de `platform.repository.ts`
**Requirement**: FLD-04, FLD-06, FLD-08, FLD-17, FLD-18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Toda função exportada passa por `withDbTiming` com um nome de operação único
- [ ] `claimVersionSlot` propaga o erro `E11000` sem tratá-lo (o service decide o 409)
- [ ] Gate check passa: `pnpm -r exec tsc --noEmit`

**Tests**: none (coberto transitivamente pelo e2e de T17 — mesma convenção de `platform.repository.ts`)
**Gate**: quick
**Commit**: `feat(crm-api): add fieldTemplate repository with dbReqResTime timing`

---

### T15: `fieldTemplate.service.ts`

**What**: `createFieldTemplate`, `getCurrentTemplate`, `bumpFieldTemplateVersion` (fluxo
exato do sequence diagram do `design.md`: diff → checagem de cobertura de migração → claim
do slot → migração via `FieldValueStore` → avanço do ponteiro → log estruturado),
`archiveFieldTemplate`.
**Where**: `apps/crm-api/src/services/fieldTemplate.service.ts`
**Depends on**: T9, T13, T14, T4 (tipo `MigrationPlan`)
**Reuses**: `isDuplicateKeyError` (`platform.service.ts`); `CustomError`; forma de
`inviteToTenant` (sem rollback além do necessário — aqui o rollback é "nunca avançar o
ponteiro", não desfazer o que já foi escrito)
**Requirement**: FLD-04, FLD-05, FLD-07 (RBAC fica no router, T17), FLD-12, FLD-13, FLD-17, FLD-19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `targetType==='customer'` força `key=DEFAULT_CUSTOMER_TEMPLATE_KEY` mesmo se o body mandar outro
- [ ] Bump destrutivo sem `migration` cobrindo toda `DestructiveChange` lança `CustomError(400,...)` ANTES de qualquer escrita
- [ ] `claimVersionSlot` com `E11000` vira `CustomError(409,...)`
- [ ] Migração destrutiva bem-sucedida loga estruturado (`event`, `tenant`, `template`, `fromVersion`, `toVersion`, `fieldsAffected`, `recordsMigrated`, `actor`) e só DEPOIS avança `currentVersion`
- [ ] `FieldValueStore.migrateValues` lançando não avança `currentVersion` (a versão N+1 já criada fica órfã, aceito)
- [ ] Gate check passa: `pnpm -r exec tsc --noEmit`

**Tests**: none (coberto transitivamente pelo e2e de T17)
**Gate**: quick
**Commit**: `feat(crm-api): add fieldTemplate service with diff, migration and version guard`

---

### T16: `fieldTemplate.controller.ts`

**What**: Controllers finos (`createFieldTemplate`, `getCurrentTemplate`,
`bumpFieldTemplateVersion`, `archiveFieldTemplate`) — parse de `req`, chamada ao service,
`respObj`/status, `next(e)` no catch.
**Where**: `apps/crm-api/src/controllers/fieldTemplate.controller.ts`
**Depends on**: T15
**Reuses**: Forma exata de `platform.controller.ts`
**Requirement**: FLD-04, FLD-05, FLD-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Cada controller segue o padrão try/`respObj`/`catch(e){next(e)}` de `platform.controller.ts`
- [ ] Status codes corretos por caminho (201 criação, 200 leitura/bump/archive, 404 quando o service devolve `null` na leitura)
- [ ] Gate check passa: `pnpm -r exec tsc --noEmit`

**Tests**: none (coberto transitivamente pelo e2e de T17)
**Gate**: quick
**Commit**: `feat(crm-api): add fieldTemplate controller`

---

### T17: `fieldTemplate.router.ts` + `fieldTemplateRateLimit` + e2e completo

**What**: Router (`POST /field-templates`, `GET /field-templates/current`,
`POST /field-templates/:id/versions`, `POST /field-templates/:id/archive`) com
`isAdmin`+`tenantAssignmentCheck`+`validBody/Params/Query` nas mutações,
`tenantAssignmentCheck` só na leitura (qualquer papel). Novo `fieldTemplateRateLimit` em
`rateLimit.middleware.ts` (chave `tenant+IP`, ver Tech Decisions do `design.md`). Suíte e2e
completa cobrindo TODOS os cenários da matrix, com um fake `FieldValueStore` em memória
definido no próprio arquivo de teste (com hook de fault injection) para provar FLD-12/13 de
verdade.
**Where**: `apps/crm-api/src/routers/fieldTemplate.router.ts`,
`fieldTemplate.router.e2e.test.ts`, `apps/crm-api/src/middlewares/rateLimit.middleware.ts` (extend)
**Depends on**: T16
**Reuses**: Forma exata de `platform.router.ts` + `platform.router.e2e.test.ts`
(`buildTestApp` local, sem depender de `app.ts`); `rejectWithTooManyRequests` factory
**Requirement**: FLD-04, FLD-05, FLD-06, FLD-07, FLD-08, FLD-12, FLD-13, FLD-14 (via schema),
FLD-15, FLD-16, FLD-17, FLD-19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `POST /field-templates` cria v1 (201); duplicata de `{targetType,key}` → 409; `gestor`/`operador` → 403
- [ ] Bump aditivo (200, sem `migration`); bump destrutivo sem `migration` completa → 400, nada persistido; bump destrutivo com `migration` completa → 200, `FieldValueStore.migrateValues` chamado, log estruturado emitido
- [ ] `Promise.all` de dois bumps concorrentes na mesma `expectedVersion` → um 200 + um 409
- [ ] Fault injection no fake `FieldValueStore` durante migração → 500, `currentVersion` NÃO avança (nova leitura confirma)
- [ ] `POST /field-templates/:id/archive` → 200; registro de teste que já usa a versão continua hidratando normalmente após archive (chamando `hydrate` do `field-engine` diretamente no teste, sobre a versão lida)
- [ ] `GET /field-templates/current` sem template existente → 404
- [ ] N+1 mutações da mesma rota → 429
- [ ] Corpo com `Tenant`/`tenantId`/`orgId` forjado → 400 (schema `.strict()`)
- [ ] Gate check passa: `pnpm vitest run --project e2e`
- [ ] Test count: ≥ 14 testes passam

**Tests**: e2e
**Gate**: full
**Commit**: `feat(crm-api): add field-template routes with rate limit and full e2e coverage`

---

### T18: Wire `field-template.router` em `app.ts`

**What**: Montar `/field-templates` em `buildApp()`, injetar `createNoopFieldValueStore()`
para `'customer'` e `'process'` no composition root.
**Where**: `apps/crm-api/src/app.ts`
**Depends on**: T17
**Reuses**: Padrão de composição já usado para `platform`/`invite`/`auth` no mesmo arquivo
**Requirement**: FLD-04..19 (superfície completa acessível pelo app real)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `buildApp()` monta o router em `/field-templates`
- [ ] `apps/crm-api/src/server.int.test.ts` (smoke test de boot já existente) continua passando sem alteração
- [ ] Gate check passa: `pnpm vitest run --project integration`

**Tests**: integration (smoke existente, sem teste novo dedicado)
**Gate**: full
**Commit**: `feat(crm-api): wire field-template router into buildApp`

---

### T19: Hook do seed em `provisionTenant` + prova e2e

**What**: `platform.service.provisionTenant` chama `seedDefaultCustomerTemplate(tenant.id)`
logo após `platformRepository.createTenant`. Estender
`platform.router.e2e.test.ts` — `buildTestApp` passa a montar também o `fieldTemplate.router`
— com um teste que provisiona um tenant e confirma que `GET /field-templates/current`
já devolve o campo `status`.
**Where**: `apps/crm-api/src/services/platform.service.ts`,
`apps/crm-api/src/routers/platform.router.e2e.test.ts`
**Depends on**: T12, T17
**Reuses**: `seedAdminAndTenant`/`buildTestApp` já existentes no arquivo de teste
**Requirement**: FLD-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Provisionar um tenant e chamar `GET /field-templates/current?targetType=customer&key=default` sem nenhuma chamada de setup adicional devolve o campo `status` com as 3 opções padrão
- [ ] Gate check passa: `pnpm vitest run --project e2e`
- [ ] Test count: ≥ 1 teste novo passa (suíte inteira do arquivo continua verde)

**Tests**: e2e
**Gate**: full
**Commit**: `feat(crm-api): seed default customer field template on tenant provisioning`

---

### T20: Estender isolamento entre tenants para `FieldTemplate`

**What**: Novo `it(...)` em `tenant-isolation.int.test.ts` provisionando dois tenants
espelhados via `buildApp()`, cada um customizando seu template `customer`, confirmando que
nenhuma leitura de um vaza para o outro.
**Where**: `apps/crm-api/tests/integration/tenant-isolation.int.test.ts`
**Depends on**: T18
**Reuses**: `seedPlatformAdminCookie`/`provisionAndAcceptAdmin` já existentes no arquivo
**Requirement**: FLD-09 (extensão da garantia de isolamento de FND-09)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Dois tenants com nomes/campos customizados de template `customer` — `GET /field-templates/current` de cada sessão só vê o seu próprio
- [ ] Gate check passa: `pnpm vitest run --project integration`
- [ ] Test count: ≥ 1 teste novo passa (suíte inteira do arquivo continua verde)

**Tests**: integration
**Gate**: full
**Commit**: `test(crm-api): extend cross-tenant isolation to field templates`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1
Phase 2:  T2 ──→ T3 ──→ T4
Phase 3:  T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9
Phase 4:  T10 ──→ T11 ──→ T12
Phase 5:  T13 ──→ T14 ──→ T15 ──→ T16 ──→ T17
Phase 6:  T18 ──→ T19 ──→ T20
```

Execution is strictly sequential within a phase. Cross-phase dependencies (see task bodies):
T5 depends on T2; T10/T11 depend on T2 (T11) — T10 has no cross-phase dependency; T12
depends on T5, T10, T11; T14/T15 depend on T10/T11/T9/T13/T4.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 2 arquivos de doc, uma mudança conceitual | ✅ Granular |
| T2 | 1 schema (complexo, mas 1 arquivo/1 conceito) | ✅ Granular |
| T3 | 1 schema | ✅ Granular |
| T4 | 2 schemas + registro — cohesivos (mesma unidade de API) | ✅ Granular |
| T5 | 1 scaffold + 1 função pura pequena | ✅ Granular |
| T6 | 1 função | ✅ Granular |
| T7 | 1 função | ✅ Granular |
| T8 | 1 função + 1 par de testes de isomorfismo — cohesivos (mesma prova) | ✅ Granular |
| T9 | 1 função | ✅ Granular |
| T10 | 1 model | ✅ Granular |
| T11 | 1 model | ✅ Granular |
| T12 | 1 função + wiring de índice | ✅ Granular |
| T13 | 1 tipo + 1 implementação — mesmo molde de `MailProvider` (2 arquivos, 1 conceito) | ✅ Granular |
| T14 | 1 repository (6 funções cohesivas do mesmo módulo) | ✅ Granular |
| T15 | 1 service (4 funções cohesivas do mesmo módulo) | ✅ Granular |
| T16 | 1 controller | ✅ Granular |
| T17 | 1 router + 1 rate limiter + e2e — cohesivos (a superfície HTTP inteira do módulo, mesmo padrão de `platform.router.ts`/`.e2e.test.ts`) | ✅ Granular |
| T18 | 1 mudança em 1 arquivo | ✅ Granular |
| T19 | 1 hook + 1 extensão de teste — cohesivos (mesma prova ponta-a-ponta) | ✅ Granular |
| T20 | 1 teste novo em 1 arquivo existente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (fora do diagrama de fases — Phase 1 isolada) | ✅ Match |
| T2 | None | Phase 2 início | ✅ Match |
| T3 | None | T2→T3 | ✅ Match (T3 não depende de T2 no corpo, mas roda em sequência na mesma fase — sem conflito, ordem é só de execução) |
| T4 | T2, T3 | T3→T4 | ✅ Match |
| T5 | T2 | Phase 3 início; nota de cross-phase abaixo do diagrama | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T5 | T6→T7 (ordem de execução; dependência real é em T5) | ✅ Match — nota de cross-phase cobre a dependência real |
| T8 | T6, T7 | T7→T8 | ✅ Match |
| T9 | T5 | T8→T9 (ordem de execução; dependência real é em T5) | ✅ Match — nota de cross-phase cobre a dependência real |
| T10 | None | Phase 4 início | ✅ Match |
| T11 | T2 | T10→T11 (ordem de execução; dependência real é em T2) | ✅ Match — nota de cross-phase cobre a dependência real |
| T12 | T10, T11 | T11→T12 | ✅ Match |
| T13 | None | Phase 5 início | ✅ Match |
| T14 | T10, T11 | T13→T14 (ordem de execução; dependência real é Phase 4) | ✅ Match — nota de cross-phase cobre a dependência real |
| T15 | T9, T13, T14, T4 | T14→T15 | ✅ Match — nota de cross-phase cobre T9/T4 |
| T16 | T15 | T15→T16 | ✅ Match |
| T17 | T16 | T16→T17 | ✅ Match |
| T18 | T17 | Phase 6 início | ✅ Match |
| T19 | T12, T17 | T18→T19 | ✅ Match — nota de cross-phase cobre T12 |
| T20 | T18 | T19→T20 (ordem de execução; dependência real é T18) | ✅ Match — nota de cross-phase cobre a dependência real |

Nenhuma dependência aponta para uma fase posterior — todo cross-phase é backward, explicitado
na nota abaixo do diagrama.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Docs | none | none | ✅ OK |
| T2 | contracts schema | unit | unit | ✅ OK |
| T3 | contracts schema | unit | unit | ✅ OK |
| T4 | contracts schema | unit | unit | ✅ OK |
| T5 | field-engine scaffold | unit | unit | ✅ OK |
| T6 | field-engine `hydrate` | unit | unit | ✅ OK |
| T7 | field-engine `validate` | unit | unit | ✅ OK |
| T8 | field-engine `toToolSchema` | unit | unit | ✅ OK |
| T9 | field-engine `diffFields` | unit | unit | ✅ OK |
| T10 | db model | integration | integration | ✅ OK |
| T11 | db model | integration | integration | ✅ OK |
| T12 | db seed | integration | integration | ✅ OK |
| T13 | crm-api provider | unit | unit | ✅ OK |
| T14 | crm-api repository | none (piso real do projeto) | none | ✅ OK |
| T15 | crm-api service | none (piso real do projeto) | none | ✅ OK |
| T16 | crm-api controller | none (piso real do projeto) | none | ✅ OK |
| T17 | crm-api router | e2e | e2e | ✅ OK |
| T18 | crm-api `app.ts` | integration (smoke existente) | integration | ✅ OK |
| T19 | crm-api service + e2e | e2e | e2e | ✅ OK |
| T20 | crm-api teste de integração | integration | integration | ✅ OK |

Nenhuma violação — `repository`/`service`/`controller` com `Tests: none` é exatamente o piso
real já documentado na nota da Test Coverage Matrix (não é deferral: a lógica desses três
layers É exercitada pelo e2e de T17/T19, só não tem arquivo de teste próprio, mesma
convenção de `platform`/`invite`/`auth`).
