# Dynamic Field Engine Validation

# ✅ FINAL VERDICT: PASS after Iteration 2 (2026-09-04)

Iteration 1 (below) FAILed with 8 ranked gaps (2 Blocker, 4 Major, 2 Minor). A separate
implementer applied 7 fix commits (`a7aeee1`..`445d7e8`). Iteration 2 (see section at the
bottom of this file) independently re-verified all 7 fixes with evidence-or-zero, re-ran the
4 previously-surviving mutants against the fixed code, and confirmed all 4 now killed with no
regressions. **Feature `dynamic-field-engine` — PASS after iteration 2.**

---

**Date**: 2026-09-03
**Spec**: `.specs/features/dynamic-field-engine/spec.md`
**Diff range**: `267559a..85549d3` (21 commits — T1..T20 + docs closure)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

---

## Task Completion

All 20 tasks (T1–T20) are marked `[x]` in `tasks.md` with matching commits in the range. No
task is blocked or partial per the file. Task checkboxes are **not** treated as evidence
below — every row cites a located assertion or is marked as uncovered.

| Task | Commit | Status |
| ---- | ------ | ------ |
| T1 | `f018c31` | ✅ Done |
| T2 | `0cdad3f` | ✅ Done |
| T3 | `a554494` | ✅ Done |
| T4 | `42b3c23` | ✅ Done |
| T5 | `cb74fea` | ✅ Done |
| T6 | `7357802` | ✅ Done |
| T7 | `4a9009d` | ✅ Done |
| T8 | `b5d163d` | ✅ Done |
| T9 | `1522e2e` | ✅ Done |
| T10 | `0a68a98` | ✅ Done |
| T11 | `dbaa391` | ✅ Done |
| T12 | `a7ec944` | ✅ Done |
| T13 | `6bbf574` | ✅ Done |
| T14 | `6274108` | ✅ Done (no dedicated test — see FLD-18) |
| T15 | `23b0c0c` | ✅ Done |
| T16 | `0e784a6` | ✅ Done |
| T17 | `70d3c88` | ✅ Done |
| T18 | `60efa42` | ✅ Done |
| T19 | `84ea1e8` | ✅ Done |
| T20 | `85549d3` | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

### P1 — Motor isomórfico define, renderiza e valida uma árvore de campos

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — `hydrate(fields, values)` devolve `RenderNode[]` = `FieldDef` + key `value`, recursando em `array` (via `of`) e `group` (via `fields`) | Cada nó = FieldDef inteiro + `value`; recursão uniforme | `packages/field-engine/src/hydrate.unit.test.ts:52` — `expect(node).toEqual({ ...field, value: 'Ana' })`; `:103` — `expect(children.map((c) => c.fieldId)).toEqual(['rua','numero'])` (group via `fields`); `:130` — `expect(nodesOf(node).map((c) => c.value)).toEqual(['urgente','novo'])` (array via `of`); `:155–160` — `array` de `group` de `array`, `expect(tagNodes.map((t) => t.type)).toEqual(['text','text'])` | ✅ PASS |
| AC2 — valor ausente → representação vazia do tipo, nunca `undefined` | `''` / `null` / `false` / `[]` conforme o tipo | `packages/field-engine/src/hydrate.unit.test.ts:65` — `expect(nodes.map((node) => node.value)).toEqual(['', null, false, []])`; `:79` — `expect(node.value, ...).not.toBeUndefined()` sobre 6 tipos incl. `group`/`array`; `packages/field-engine/src/emptyValue.unit.test.ts:63` — `expect(emptyValueFor(field), ...).not.toBeUndefined()` sobre os 13 construtores de tipo | ✅ PASS |
| AC3 — `validate` aplica as regras dos 11 tipos, erros por `fieldId`, sem lançar | Uma regra por tipo; `currency` inteiro em centavos; `reference` ObjectId **respeitando `target`**; opções válidas de `select`/`status`; recursão | `packages/field-engine/src/validate.unit.test.ts:11` (`text`), `:18` (`number`), `:25` — `expect(Object.keys(validate(fields,{total:10.5}).errors)).toEqual(['total'])` (`currency` centavos), `:32` (`percent`), `:39` (`boolean`), `:46` (`date`), `:53` (`datetime`), `:70`/`:85` (`select`), `:102` (`status`), `:110–113` (`document`), `:119` (`reference` ObjectId), `:133` (`array`), `:147` (`group`); erros por path: `:171` — `expect(Object.keys(result.errors)).toEqual(['linhas.1.produto'])`; nunca lança: `:212` — `expect(run).not.toThrow()`, `:221` | ⚠️ Spec-precision gap (ver nota A) |
| AC4 — `toToolSchema(fields)` produz JSONSchema válido sem nenhum campo de `Tenant` | Nenhuma chave de tenant em nenhum nível (AD-010/AD-004) | `packages/field-engine/src/toToolSchema.unit.test.ts:165` — `expect(keys, ...).not.toContain(forbidden)` varrendo recursivamente TODAS as chaves do schema contra `TENANT_FORBIDDEN_KEYS` (7 chaves, `registry.unit.test.ts:30`); forma: `:126–144`, `:150–151`, `:157–158` | ✅ PASS (ver nota B) |
| AC5 — mesmo `FieldDef[]`/`FieldValues` sob Node e sob browser → resultado idêntico | `hydrate`/`validate` produzem exatamente o mesmo valor nos dois runtimes | Node: `packages/field-engine/src/toToolSchema.unit.test.ts:172` — `expect(hydrate(ISO_FIELDS, ISO_VALUES)).toEqual(ISO_HYDRATED)`, `:179`, `:183`. jsdom: `packages/field-engine/src/isomorphism.browser.unit.test.ts:85` — `expect(hydrate(ISO_FIELDS, ISO_VALUES)).toEqual(ISO_HYDRATED)` (constantes literalmente idênticas), `:92`, `:96`; prova de runtime DOM: `:80–81` — `expect(typeof dom.document).toBe('object')` | ✅ PASS (ver nota C) |

**Nota A (AC3 / FLD-02)** — o spec exige `reference` "como ObjectId **respeitando `target`**".
A implementação valida **só a forma de ObjectId** e ignora `target` por completo
(`packages/field-engine/src/validate.ts:62–65`, comentário explícito de deferimento), e o
teste `validate.unit.test.ts:119` também só checa a forma. Não existe assertion que prove
que dois `target` diferentes produzam veredictos diferentes. Nenhum marcador
`// SPEC_DEVIATION` foi deixado. → **spec-precision gap**: o outcome asserido é mais fraco
que o que o spec define.

**Nota B (AC4)** — "JSONSchema válido" nunca é verificado por um meta-validador de JSON
Schema (não há `ajv` no projeto); a validade é provada por assertions de forma escritas à
mão. O spec não nomeia draft, então isso é aceitável, mas fica registrado.

**Nota C (AC5)** — o spec diz "em `web` (browser via Vite)". A prova real é `jsdom` sob
Vitest, não um bundle Vite de browser, e os dois arquivos **duplicam** as constantes
esperadas em vez de comparar as saídas entre runtimes num único ponto. Proxy razoável e
declarado no próprio teste; a duplicação é o mecanismo que faz uma divergência deixar um dos
arquivos vermelho.

---

### P1 — Template de campo tenant-scoped, versionado imutavelmente

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — `admin` cria template para um `targetType` → persiste com `currentVersion: 1` + versão imutável snapshot | `currentVersion === 1`, snapshot de campos v1 | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:197` — `expect(res.status).toBe(201)`; `:198` — `expect(res.body.data.currentVersion).toBe(1)`; `:204` — `expect(template?.currentVersion).toBe(1)`; `:208` — `expect(version?.fields).toEqual([STATUS_FIELD])`; imutabilidade do slot: `packages/db/src/models/fieldTemplateVersion.model.int.test.ts:48` — `rejects.toMatchObject({ code: 11000 })` | ✅ PASS |
| AC2 — mudança aditiva → nova versão imutável + bump de `currentVersion`, sem tocar em registro existente | 200, `currentVersion: 2`, zero registros tocados, v1 intacta | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:377` — `expect(res.body.data.currentVersion).toBe(2)`; `:378` — `expect(store.calls).toHaveLength(0)` (nenhum registro tocado); `:383` — `expect(v1?.fields).toEqual([STATUS_FIELD])`; `:385` — `expect(v2?.fields).toEqual([STATUS_FIELD, OBS_FIELD])`; classificador puro: `packages/field-engine/src/diffFields.unit.test.ts:25`,`:31`,`:37`,`:47` — `toEqual({ kind: 'additive', changes: [] })` | ✅ PASS |
| AC3 — mudança destrutiva → exigir migração explícita; rejeitar bump que deixaria `values` órfãos | 400 + nada persistido; com plano → aceita | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:396` — `expect(res.status).toBe(400)`; `:397` — `expect(res.body.message).toContain('obs')`; `:398` — `expect(store.calls).toHaveLength(0)`; `:401` — `expect(template?.currentVersion).toBe(1)`; `:402` — `expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1)`; com plano: `:418` — `expect(res.body.data.currentVersion).toBe(2)`, `:419–427` — `expect(store.calls).toEqual([{ tenantId, templateId: id, fromVersion: 1, toVersion: 2, migration: { obs: { action: 'discard' } } }])`; classificador: `diffFields.unit.test.ts:56`,`:65`,`:78`,`:93`,`:113`,`:122–125` | ✅ PASS |
| AC4 — registro antigo aponta para `templateVersion` anterior → `hydrate` renderiza fiel à versão que ele usou, **mesmo após o template ter avançado versões** | Árvore renderizada = definição da versão antiga, depois do template ter avançado | Só evidência **por proxy**: `packages/db/src/models/fieldTemplateVersion.model.int.test.ts:63` — `expect(v1?.fields).toEqual(nestedFields)` depois de criar v2 (imutabilidade do snapshot); e `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:490` — `expect(reread.body.data.fields).toEqual([STATUS_FIELD, OBS_FIELD])`, que lê a v1 **enquanto uma linha de v2 já existe** na collection (confirmado pelo mutante M8, que essa assertion matou). Falta a conjunção exata: nenhum teste avança `currentVersion` para 2 e então renderiza a v1; o único `hydrate` fora do package (`:548`) roda sobre a versão **corrente** de um template que nunca avançou | ⚠️ Parcial (conjunção do spec não asserida) |
| AC5 — usuário sem papel `admin` cria/edita template → 403 sem alterar nada | 403 + estado inalterado | Create: `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:248–250` — `expect(asGestor.status).toBe(403)`, `expect(asOperador.status).toBe(403)`, `expect(await FieldTemplate.countDocuments()).toBe(0)`; bump: `:518` — `expect(res.status).toBe(403)`, `:519` — `expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1)`; archive: `:593` — `expect(res.status).toBe(403)`, `:595` — `expect(template?.archived).toBe(false)` | ✅ PASS |
| AC6 — template arquivado → impede **novos** registros de usá-lo, mas continua servindo `hydrate` para registros existentes | Duas metades: bloqueio de novo uso **e** leitura antiga intacta | Metade "leitura antiga": `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:547` — `expect(afterArchive.status).toBe(200)`; `:548–550` — `expect(hydrate(afterArchive.body.data.fields, { status: 'ativo' })).toEqual([{ ...STATUS_FIELD, value: 'ativo' }])`. Metade "impedir novo uso": **nenhuma assertion, nenhuma implementação** — `getCurrentTemplate` continua devolvendo 200 para um template `archived` (só expõe a flag), e nenhuma rota nega mutação/uso por `archived` | ⚠️ Parcial (metade sem evidência) |

---

### P1 — Tenant recém-provisionado já tem um template padrão de Customer

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — Tenant provisionado (FND-01) → semear template `customer` v1 com campo `status` e opções padrão | GET do template corrente já devolve `status` com as 3 opções, sem setup extra | `apps/crm-api/src/routers/platform.router.e2e.test.ts:198` — `expect(res.status).toBe(200)`; `:200` — `expect(res.body.data.template.currentVersion).toBe(1)`; `:202–214` — `expect(res.body.data.fields).toEqual([{ fieldId:'status', label:'Status', type:'status', required:true, options:[{key:'novo',...order:0},{key:'ativo',...order:1},{key:'inativo',...order:2}] }])` (nenhuma chamada de setup entre a provisão e a leitura); nível db: `packages/db/src/models/fieldTemplate.model.int.test.ts:111–123` | ✅ PASS |
| AC2 — seed roda mais de uma vez para o mesmo Tenant → idempotente, nunca um segundo template | Exatamente 1 template e 1 versão | `packages/db/src/models/fieldTemplate.model.int.test.ts:143` — `expect(await FieldTemplate.countDocuments({ Tenant, targetType: 'customer' })).toBe(1)`; `:145` — `expect(await FieldTemplateVersion.countDocuments({ template: template?._id })).toBe(1)`; invariante de banco: `:29–31` — `rejects.toMatchObject({ code: 11000 })` | ✅ PASS |
| AC3 — admin customiza o template padrão → nenhuma reexecução futura sobrescreve | Customização preservada byte a byte | `packages/db/src/models/fieldTemplate.model.int.test.ts:157` — `expect(reloaded?.currentVersion).toBe(2)`; `:158` — `expect(reloaded?.name).toBe('Meus Clientes')`; `:171` — `expect(version?.fields).toEqual(customFields)` | ✅ PASS |

---

### P2 — Migração destrutiva de template é transacional e auditável

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — migração destrutiva falha no meio → reverter por completo; nenhum registro aponta para a nova versão sem ter sido migrado | Rollback total; ponteiro inalterado | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:483` — `expect(res.status).toBe(500)`; `:484` — `expect(store.records).toEqual([{ id: 'r1', templateVersion: 1 }])`; `:487` — `expect(template?.currentVersion).toBe(1)`; `:489` — `expect(reread.body.data.template.currentVersion).toBe(1)`; `:490` — `expect(reread.body.data.fields).toEqual([STATUS_FIELD, OBS_FIELD])` | ✅ PASS (ver nota D — consequência não coberta) |
| AC2 — migração destrutiva aplicada com sucesso → log estruturado (quem, quando, template, campos afetados, quantos registros migrados) | Cada campo nomeado presente **por valor** | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:456` — `expect(entries).toHaveLength(1)`; `:457–466` — `expect(entries[0]).toMatchObject({ event:'fieldTemplate.destructive_migration', actor: user.id, tenant: tenant.id, template: id, fromVersion: 1, toVersion: 2, fieldsAffected: ['obs'], recordsMigrated: 2 })`; `:467` — `expect(Date.parse(entries[0].at)).not.toBeNaN()` | ✅ PASS |

**Conjunção de payload (FLD-13)** — os 5 itens nomeados pelo spec são todos asseridos **por
valor**, não por "a função foi chamada": quem → `actor: user.id`; quando → `at` parseável
como data (único item não asserido por valor exato, correto para um timestamp); template →
`template: id`; campos afetados → `fieldsAffected: ['obs']`; quantos registros migrados →
`recordsMigrated: 2` (com o fake carregando exatamente 2 registros, `:436–439`). ✅

**Nota D (AC1 / FLD-12 + FLD-15)** — o rollback asserido é o do **ponteiro** e o dos
**valores**, e ambos passam. Mas o slot de versão N+1 já reivindicado (`claimVersionSlot`,
`fieldTemplate.service.ts:113`) **não é revertido** e o índice único `{template,version}` o
mantém para sempre. Consequência não asserida por nenhum teste: depois de uma migração que
falhou, **reaplicar o mesmo bump devolve 409 permanentemente**
(`fieldTemplate.service.ts:120–125`), com a mensagem enganosa "Outro bump já avançou este
template" — quando nada avançou. Ver Discrimination Sensor / M6.

---

## Edge Cases

| Edge case do spec | `file:line` + assertion | Result |
| --- | --- | --- |
| Dois `admin`s bumpam simultaneamente → só um bump aceito, o segundo recebe conflito | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:504` — `expect(results.map((r) => r.status).sort()).toEqual([200, 409])`; `:505` — `expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(2)`; `:507` — `expect(template?.currentVersion).toBe(2)` | ✅ |
| `reference` cujo `target` foi apagado → `hydrate` devolve referência pendente/inválida, nunca lança | `packages/field-engine/src/hydrate.unit.test.ts:168` — `expect(run).not.toThrow()`; `:169` — `expect(run()[0].value).toBe('64b7f2c1a1b2c3d4e5f60718')` | ⚠️ Spec-precision gap (spec não define a forma de "pendente/inválida"; o motor é puro e não pode detectar deleção) |
| Template com profundidade acima do limite → 400 antes de persistir | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:307` — `expect(res.status).toBe(400)`; `:308` — `expect(await FieldTemplate.countDocuments()).toBe(0)`; nível schema: `packages/contracts/src/schemas/fieldDef.schema.unit.test.ts:171–174` | ✅ |
| Opções do `status` seed com `key`, `label`, `color` e `order` únicos entre si | `packages/db/src/models/fieldTemplate.model.int.test.ts:129–132` — `expect(new Set(options.map((o) => o.key)).size).toBe(options.length)` (idem label, color, order) | ✅ |
| Template `archived` consultado por registro que já o usa → `hydrate` funciona normalmente | `apps/crm-api/src/routers/fieldTemplate.router.e2e.test.ts:547–550` (ver AC6 acima) | ✅ |

---

## Requirement Coverage (FLD-01..19)

| ID | Evidência (`file:line` + assertion) | Result |
| --- | --- | --- |
| FLD-01 — `hydrate` recursivo com defaults vazios | `hydrate.unit.test.ts:52`, `:65`, `:79`, `:155–160`; `emptyValue.unit.test.ts:63` | ✅ |
| FLD-02 — `validate` por tipo, erro por `fieldId` | `validate.unit.test.ts:11…:147` (13 regras), `:171`, `:212` | ⚠️ `target` de `reference` não validado (nota A) |
| FLD-03 — `toToolSchema` sem Tenant + isomorfismo | `toToolSchema.unit.test.ts:165`; `isomorphism.browser.unit.test.ts:80–81`, `:85`, `:92`, `:96` | ✅ |
| FLD-04 — criação e bump aditivo sem migração | `fieldTemplate.router.e2e.test.ts:197–208`, `:377–385`; duplicata: `:235` — `expect(res.status).toBe(409)`, `:236` — `countDocuments(...) === 1` | ✅ |
| FLD-05 — bump destrutivo bloqueado sem migração | `fieldTemplate.router.e2e.test.ts:396–402`, `:418–428` | ✅ |
| FLD-06 — registro antigo renderiza versão antiga | `fieldTemplateVersion.model.int.test.ts:63` (imutabilidade) + `fieldTemplate.router.e2e.test.ts:490` (lê v1 com v2 já presente — matou M8). Sem `hydrate` sobre versão antiga **após `currentVersion` avançar** | ⚠️ Parcial |
| FLD-07 — RBAC, só `admin` muta | `fieldTemplate.router.e2e.test.ts:248–250`, `:518–519`, `:593–595`; router: `fieldTemplate.router.ts:38`,`:56`,`:67` (`isAdmin` antes de `validBody`) | ✅ |
| FLD-08 — arquivamento não quebra registros existentes | `fieldTemplate.router.e2e.test.ts:547–550`; model: `fieldTemplate.model.int.test.ts:66`, `:76` | ⚠️ Parcial (bloqueio de novo uso sem evidência) |
| FLD-09 — seed na provisão | `platform.router.e2e.test.ts:198–214`; `fieldTemplate.model.int.test.ts:103–123`; isolamento: `tenant-isolation.int.test.ts:289–296`, `:305` | ✅ |
| FLD-10 — seed idempotente | `fieldTemplate.model.int.test.ts:143`, `:145` | ✅ |
| FLD-11 — customização sobrevive a reseed | `fieldTemplate.model.int.test.ts:157–158`, `:171` | ✅ |
| FLD-12 — migração destrutiva transacional | `fieldTemplate.router.e2e.test.ts:483–490` | ✅ (nota D) |
| FLD-13 — log estruturado | `fieldTemplate.router.e2e.test.ts:456–467` | ✅ |
| FLD-14 — validação de entrada da árvore `FieldDef` | `fieldDef.schema.unit.test.ts:166`, `:171–174`, `:184–187`, `:191`, `:195`, `:200`, `:205`; e2e `:307–308` | ✅ |
| FLD-15 — idempotência de retry no bump | Só via caminho concorrente: `fieldTemplate.router.e2e.test.ts:504–505`. Nenhum teste de retry **sequencial**, e nenhum de retry **após falha de migração** (que hoje é 409 permanente) | ⚠️ Parcial |
| FLD-16 — rate limit em mutação de template | `fieldTemplate.router.e2e.test.ts:321` — `expect(last?.status).toBe(429)` (6ª chamada, limite 5) | ✅ |
| FLD-17 — concorrência no bump (guard otimista) | `fieldTemplate.router.e2e.test.ts:504–507`; invariante: `fieldTemplateVersion.model.int.test.ts:48` | ✅ |
| FLD-18 — observabilidade (`dbReqResTime` + log) | Log: `fieldTemplate.router.e2e.test.ts:456–467` ✅. `dbReqResTime`: **nenhuma assertion** sobre as 6 operações novas — `db.metric.unit.test.ts:5–28` só exercita o wrapper com nomes fictícios (`'test.success'`/`'test.failure'`); implementação verificável por leitura em `fieldTemplate.repository.ts:34,50,58,68,87,100` | ⚠️ Parcial (metade sem evidência de teste) |
| FLD-19 — transições guardadas (bump/arquivamento) | Archive idempotente: `fieldTemplate.router.e2e.test.ts:571–574`; model: `fieldTemplate.model.int.test.ts:76–78`; bump guardado: `:504–507` | ✅ |

---

## Success Criteria (spec)

| Critério | Evidência | Result |
| --- | --- | --- |
| `pnpm check` limpo incluindo `packages/field-engine` | `pnpm -r exec tsc --noEmit` → 0 · `pnpm biome check .` → 0 · `pnpm vitest run` → 0 (276/276) | ✅ |
| `hydrate`/`validate`/`toToolSchema` idênticos sob `crm-api` e `web` | `toToolSchema.unit.test.ts:172,179,183` vs `isomorphism.browser.unit.test.ts:85,92,96` | ✅ (proxy jsdom — nota C) |
| Tenant provisionado já tem template `customer` com `status` sem chamada extra | `platform.router.e2e.test.ts:198–214` | ✅ |
| Bump destrutivo sem migração rejeitado; bump aditivo nunca migra nada | `fieldTemplate.router.e2e.test.ts:396`, `:378` (`store.calls` vazio) | ✅ |
| Registro em versão antiga renderiza fiel após o template avançar | Só por proxy (ver AC4/FLD-06) — nenhum teste com `currentVersion` já em 2 | ⚠️ |
| Nenhum model Mongoose novo fora de `packages/db` | `grep -rn "new Schema\|mongoose.model" apps packages` (excl. `packages/db`) → 0 resultados; `tests/structural/mongoose-boundary.structural.test.ts` faz o sweep | ✅ |

---

## Gate Check

- **Gate command** (Build, de `tasks.md` → Gate Check Commands): `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`
- `pnpm -r exec tsc --noEmit` → **exit 0**
- `pnpm biome check .` → **exit 0** (155 arquivos)
- `pnpm vitest run` → **exit 0** — 51 arquivos, **276 passed, 0 failed, 0 skipped**
- **Test Integrity**: blocos `it(` em arquivos de teste — `267559a`: 115 → `HEAD`: 266 (**+151**). Nenhum teste removido, nenhuma assertion enfraquecida detectada no diff (as duas mudanças em testes pré-existentes — `registry.unit.test.ts` 6→10 schemas, `syncIndexes.unit.test.ts` 4→6 models — **fortalecem** a expectativa).

---

## Discrimination Sensor

**Numeração**: a rodada anterior deste Verifier morreu por erro de infraestrutura exatamente
nesta seção; os resultados dela se perderam. As referências a **M6** (nota D) e **M8** (AC4/FLD-06)
nas tabelas acima vêm daquela rodada interrompida. O conjunto abaixo foi **reexecutado do zero e
renumerado a partir de M1**, e **substitui** aquelas referências.

Correspondência com a rodada perdida: o antigo **M8** (leitura de versão, morto por
`fieldTemplate.router.e2e.test.ts:490`) foi **reproduzido e reconfirmado** por **M16** — mesmo
killer, mesma linha. A evidência citada na linha FLD-06 da tabela de cobertura **se sustenta**.
**M11** é um segundo probe da mesma superfície por outro ângulo (servir sempre a v1 em vez da
corrente) e mostra algo que o antigo M8 não mostrava: esse ângulo escapa por completo do
`fieldTemplate.router.e2e.test.ts` e só morre em `tenant-isolation.int.test.ts:289` (nota F).
O antigo **M6** (slot não liberado após migração falha) corresponde a **M13**, que **sobrevive**.

**Protocolo**: cada mutação foi aplicada no arquivo real, a suíte inteira (`pnpm vitest run`,
51 arquivos / 276 testes, ~13 s) rodou, e o arquivo foi restaurado com `git checkout --` seguido
de `git status --porcelain` + `git diff` vazios **antes** da mutação seguinte. Rodar a suíte
inteira (em vez de uma seleção) é a seleção mais ampla possível — nenhum kill pode escapar por
recorte de teste.

**Sensor depth**: P0-full (dados versionados + RBAC + migração destrutiva ⇒ integridade de dados).

| # | Mutação | Alvo `file:line` | Killer esperado | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| M1 | `index({template,version})` perde `{ unique: true }` (guarda de concorrência de FLD-17 sai do banco) | `packages/db/src/models/fieldTemplateVersion.model.ts:33` | invariante de índice + bump concorrente | ✅ **Killed** (2 testes) | `fieldTemplateVersion.model.int.test.ts:48` — `promise resolved "{ …(8) }" instead of rejecting`; `fieldTemplate.router.e2e.test.ts:504` — `expected [200, 200] to deeply equal [200, 409]` |
| M2 | Checagem destrutiva deixa passar sem plano de migração: `uncovered.length > 0` → `> 999` | `apps/crm-api/src/services/fieldTemplate.service.ts:104` | rejeição 400 do bump destrutivo | ✅ **Killed** | `fieldTemplate.router.e2e.test.ts:396` — `expected 200 to be 400` (único killer; `store.calls`/contagem de versões não pegaram) |
| M3 | `updateCurrentVersion` movido para **antes** do bloco destrutivo — o ponteiro avança mesmo com `migrateValues` lançando (rollback de FLD-12 desfeito) | `apps/crm-api/src/services/fieldTemplate.service.ts:127/154` | rollback do ponteiro na falha de migração | ✅ **Killed** | `fieldTemplate.router.e2e.test.ts:487` — `expected 2 to be 1` |
| M4 | Seed do template `customer`: `$setOnInsert` → `$set` incondicional (reseed sobrescreve a customização do tenant — FLD-11) | `packages/db/src/models/fieldTemplate.model.ts:73` | preservação da customização após reseed | ✅ **Killed** | `fieldTemplate.model.int.test.ts:157` — `expected 1 to be 2` (`currentVersion` customizado revertido); `:158` (`name`) cairia na sequência |
| M5 | `fieldsAffected` removido do payload do log estruturado de migração destrutiva (FLD-13) | `apps/crm-api/src/services/fieldTemplate.service.ts:148` | conjunção do payload (5 itens do spec) | ✅ **Killed** | `fieldTemplate.router.e2e.test.ts:457` — `expected { …(8) } to match object { …(8) }` (o `toMatchObject` exige a chave, não só a forma) |
| M6 | `hydrate` devolve `undefined` no lugar da representação vazia do tipo: `raw ?? emptyValueFor(def)` → `raw` (FLD-01/AC2) | `packages/field-engine/src/hydrate.ts:20` | preenchimento de vazio por tipo | ✅ **Killed** (6 testes, 3 arquivos) | `hydrate.unit.test.ts:65` — `expected [undefined, undefined, …(2)] to deeply equal ['', null, false, []]`; `:79` — `nome não pode ficar undefined`; `:103`, `:113`; e **os dois lados do isomorfismo** caem juntos: `toToolSchema.unit.test.ts:172` e `isomorphism.browser.unit.test.ts:85` |
| M7 | `isAdmin` removido da rota `POST /:id/archive` (FLD-07) | `apps/crm-api/src/routers/fieldTemplate.router.ts:67` | 403 do não-admin no arquivamento | ✅ **Killed** — mas **pelo motivo errado** (ver nota E) | `fieldTemplate.router.e2e.test.ts:593` — `expected 404 to be 403`: sem `isAdmin` a requisição chega ao service e morre no **escopo de Tenant**, não no RBAC |
| M8 | `withDbTiming` removido de `updateCurrentVersion` (FLD-18 — instrumentação `dbReqResTime`) | `apps/crm-api/src/repositories/fieldTemplate.repository.ts:99–102` | nenhum (probe deliberado do ⚠️ FLD-18) | ❌ **SURVIVED** — 276/276 verdes | Confirma concretamente o gap já registrado em FLD-18: nenhuma assertion observa a instrumentação das operações novas |
| M9 | **Todos** os 7 `withDbTiming` do repositório removidos + import apagado — a feature inteira perde `dbReqResTime` (FLD-18) | `apps/crm-api/src/repositories/fieldTemplate.repository.ts:4,34,50,58,68,87,100,105` | nenhum (probe deliberado, escalada de M8) | ❌ **SURVIVED** — 276/276 verdes | A metade "observabilidade" de FLD-18 pode ser **integralmente deletada** sem um único teste vermelho. `db.metric.unit.test.ts` testa só o wrapper com nomes fictícios, nunca as 6 operações reais |
| M10 | `getCurrentTemplate` sempre reporta `archived: false`, mesmo para template arquivado (FLD-08 / AC6 "impedir novo uso") | `apps/crm-api/src/services/fieldTemplate.service.ts:73` | nenhum (probe deliberado do ⚠️ FLD-08) | ❌ **SURVIVED** — 276/276 verdes | O único sinal que um consumidor (`crm-core`) teria para bloquear novo uso é essa flag na leitura corrente, e **nenhum teste a assere como `true`**: `:531` só assere no documento do Mongo, e o `getCurrent` pós-arquivamento (`:547`) checa status 200 + `hydrate`, nunca a flag. A API pode mentir sobre o arquivamento sem ficar vermelha |
| M11 | `getCurrentTemplate` serve sempre a **versão 1** em vez de `template.currentVersion` (FLD-06 — servir a versão certa depois do bump) | `apps/crm-api/src/services/fieldTemplate.service.ts:65` | probe do ⚠️ FLD-06 | ✅ **Killed** | `apps/crm-api/tests/integration/tenant-isolation.int.test.ts:289` — `expected [{fieldId:'status',…}] to deeply equal [{…},…(1)]`. **Nenhum** teste do `fieldTemplate.router.e2e.test.ts` pegou. Ver nota F |
| M12 | Tradução do E11000 do slot para 409 removida no bump (`isDuplicateKeyError` → rethrow cru) — FLD-15/FLD-17 | `apps/crm-api/src/services/fieldTemplate.service.ts:120–125` | conflito de bump concorrente | ✅ **Killed** | `fieldTemplate.router.e2e.test.ts:504` — `expected [200, 500] to deeply equal [200, 409]` |
| M13 | Reordenação do bump destrutivo: `claimVersionSlot` passa a rodar **depois** de `migrateValues` (nenhum slot órfão sobra numa migração falha; a guarda de FLD-17 deixa de cobrir o caminho destrutivo) | `apps/crm-api/src/services/fieldTemplate.service.ts:112–127` | probe do ⚠️ FLD-15 + nota D | ❌ **SURVIVED** — 276/276 verdes | Duplo achado: (1) nenhum teste fixa o estado do slot N+1 após falha de migração — nem o atual (409 permanente) nem o reparado; (2) o teste de concorrência (`:504`) usa bump **aditivo**, então mover a guarda para depois da migração — o que deixaria **duas** migrações destrutivas concorrentes rodarem antes de qualquer claim — não deixa nada vermelho |
| M14 | `referenceValueSchema` aceita qualquer string (regra de ObjectId apagada) — FLD-02 | `packages/field-engine/src/validate.ts:18` | regra de `reference` | ✅ **Killed** | `validate.unit.test.ts:119` — `expected [] to deeply equal ['dono']`. Confirma que a **metade "forma de ObjectId"** discrimina; a metade **`target`** continua sem código e sem teste (nota A) — não é mutável, é ausente |
| M15 | `isAdmin` removido da rota `POST /` (criação) — controle de nota E | `apps/crm-api/src/routers/fieldTemplate.router.ts:38` | 403 do não-admin na criação | ✅ **Killed** — e **pelo motivo certo** | `fieldTemplate.router.e2e.test.ts:248` — `expected 201 to be 403`: aqui o gestor é do próprio tenant e a rota não tem `:id`, então quem produz o 403 é de fato o `isAdmin` |
| M16 | `findCurrentVersion` ignora a `version` pedida e devolve sempre a **maior** versão do template (FLD-06 — reprodução do antigo M8) | `apps/crm-api/src/repositories/fieldTemplate.repository.ts:69–71` | leitura da versão correta na falha de migração | ✅ **Killed** | `fieldTemplate.router.e2e.test.ts:490` — `expected [{fieldId:'status',…}] to deeply equal [{…},…(1)]`. Confirma a evidência da rodada interrompida |

**Resultado**: **16 mutações · 12 mortas · 4 sobreviventes.**

Os 12 kills cobrem os invariantes que o spec carrega com mais peso — índice único de
concorrência (M1), bloqueio destrutivo (M2), rollback do ponteiro (M3), sobrevivência da
customização ao reseed (M4), conjunção do payload de log (M5), vazio por tipo no `hydrate`
(M6, que derruba **os dois lados** do isomorfismo junto), RBAC (M7 e M15), versão servida após o
bump (M11 e M16), tradução do conflito para 409 (M12) e a forma de `reference` (M14). Onde há
teste, ele discrimina de verdade — com a ressalva de M7, que morre pelo motivo errado (nota E).

Os 4 sobreviventes são todos concentrados nas linhas já marcadas ⚠️ pela análise de cobertura —
o sensor não descobriu um gap novo, ele **quantificou** os que já estavam anotados, e mostrou que
dois deles são maiores do que a tabela sugeria (M9 e M13).

**Nota E (M7/M15 — FLD-07)** — a mutação que remove `isAdmin` de `POST /:id/archive` morre, mas a
mensagem do killer é `expected 404 to be 403`: o `seedTenantUser` do arquivo **cria um Tenant novo
a cada chamada** (`fieldTemplate.router.e2e.test.ts:131–133`, comentário explícito), então o
`operador` do teste de 403 é de **outro tenant** e a requisição morre no escopo de Tenant
(`findTemplateById` → 404) antes de qualquer decisão de RBAC. O mesmo vale para o teste de 403 do
bump (`:518`). Consequência concreta: se `isAdmin` caísse dessas duas rotas, um `operador` **do
próprio tenant** conseguiria bumpar e arquivar templates e **nenhum teste ficaria vermelho por
esse motivo** — o vermelho viria da mistura RBAC + isolamento. M15 mostra o contraste: em `POST /`
(sem `:id`, gestor do próprio tenant) o kill é `expected 201 to be 403`, RBAC puro. → FLD-07 está
provado só na criação; em bump/arquivamento a evidência é confundida com FND-07.

**Nota F (M11 — FLD-06)** — o probe que faz `getCurrentTemplate` servir sempre a v1 **morre**, mas
só em `apps/crm-api/tests/integration/tenant-isolation.int.test.ts:289` — que bumpa para v2 e
assere `afterA.body.data.fields` contra a definição de v2. Isso é mais forte do que a tabela de
cobertura registrou (ela dizia que o único `hydrate` fora do package roda sobre um template que
nunca avançou): existe, sim, uma leitura das definições servidas **depois** do `currentVersion`
avançar. O que continua sem existir é a outra metade, que é a que o AC4 pede: ler/`hydrate` a
versão **antiga** depois do avanço. **M16** fecha o outro ângulo: fazer `findCurrentVersion`
devolver sempre a maior versão **é** pego, e por `fieldTemplate.router.e2e.test.ts:490` — ou
seja, a superfície "servir a versão certa" discrimina, mas nunca a partir de um registro preso a
uma versão anterior. Isso não é mutável — **não há rota nem função que sirva uma versão
arbitrária**; o gap é de capacidade, não de assertion. Nenhuma mutação pode prová-lo, e
por isso ele fica registrado aqui como gap de spec, não como mutante sobrevivente.

---

## Verdict

# ❌ FAIL

O gate está verde e a esmagadora maioria dos invariantes discrimina (12/16 kills, incluindo todos
os de integridade de dados). O FAIL não vem de nada quebrado — vem de **quatro mutantes
sobreviventes**, três deles em requisitos que o próprio spec lista como entregáveis (FLD-08,
FLD-15, FLD-18) e um deles (M13) revelando que a guarda de concorrência pode ser deslocada para
depois da migração destrutiva sem um único teste vermelho. Isso é exatamente a condição que
`validate.md` define como FAIL: "surviving mutants → create fix tasks before marking the feature
done". Somado a isso, o AC6 tem metade **sem implementação nenhuma**.

Nada aqui exige rework de arquitetura; são gaps de assertion mais uma metade de AC não construída.

### Gaps ranqueados

| # | Gap | Requisito / AC | Evidência | Severidade |
| --- | --- | --- | --- | --- |
| 1 | **AC6 "impedir novo uso" não existe** — nem implementação nem assertion. `getCurrentTemplate` devolve 200 para template `archived`, nenhuma rota nega uso por `archived`, e o único sinal que sobra (a flag na resposta) **nunca é asserido como `true`**: M10 hardcodou `archived: false` e a suíte ficou verde | FLD-08 / P1-AC6 | M10 (survived); `fieldTemplate.service.ts:73`; `fieldTemplate.router.e2e.test.ts:547–550` só checa 200 + `hydrate` | **Blocker** |
| 2 | **Guarda de concorrência não cobre o caminho destrutivo** — o teste de FLD-17 usa bump **aditivo**; mover `claimVersionSlot` para depois de `migrateValues` (o que deixaria duas migrações destrutivas concorrentes rodarem antes de qualquer claim) não deixa nada vermelho | FLD-17 + FLD-12 | M13 (survived); `fieldTemplate.router.e2e.test.ts:504` (aditivo) | **Blocker** |
| 3 | **Retry após migração falha é 409 permanente, com mensagem enganosa, e nada testa isso** — o slot N+1 reivindicado nunca é liberado; nenhum teste fixa o estado do slot após falha (nem `countDocuments` no teste de FLD-12), nem existe teste de retry **sequencial** | FLD-15 (+ nota D) | M13 (survived); `fieldTemplate.service.ts:113`,`:120–125`; FLD-12 test `:483–490` não assere contagem de versões | **Major** |
| 4 | **Observabilidade de FLD-18 é integralmente deletável** — remover os 7 `withDbTiming` do repositório e o import deixa 276/276 verdes | FLD-18 | M9 (survived, escalada de M8); `fieldTemplate.repository.ts:4,34,50,58,68,87,100,105`; `db.metric.unit.test.ts:5–28` só usa nomes fictícios | **Major** |
| 5 | **RBAC de bump/arquivamento asserido só entre tenants** — o 403 desses dois testes é produzido pelo isolamento de Tenant (404), não pelo `isAdmin`; um `operador` do próprio tenant nunca é exercido | FLD-07 / P1-AC5 | Nota E; M7 kill = `expected 404 to be 403` vs. M15 kill = `expected 201 to be 403` | **Major** |
| 6 | **AC4 nunca é asserido na conjunção que o spec define** — ler/`hydrate` uma versão **antiga** depois do `currentVersion` avançar. Não há rota nem função que sirva versão arbitrária: gap de capacidade, não só de teste | FLD-06 / P1-AC4 | Nota F; M11 morre em `tenant-isolation.int.test.ts:289` (versão **corrente** após avanço), nunca na antiga | **Major** |
| 7 | **`reference` ignora `target`** — o spec pede "ObjectId **respeitando `target`**"; só a forma é validada, sem marcador `// SPEC_DEVIATION` | FLD-02 / P1-AC3 | Nota A; `validate.ts:62–65`; M14 mata só a metade "forma" | **Minor** (spec-precision) |
| 8 | **"referência pendente/inválida" não tem forma definida** — o edge case do spec não define o valor esperado e o teste só assere `not.toThrow()` + eco do valor cru | Edge case `reference` apagada | Nota do bloco Edge Cases; `hydrate.unit.test.ts:168–169` | **Minor** (spec-precision) |

### O que está sólido

Motor isomórfico (`hydrate`/`validate`/`toToolSchema`), imutabilidade do snapshot de versão,
bloqueio do bump destrutivo sem plano, rollback do ponteiro, idempotência e não-sobrescrita do
seed, payload do log estruturado, rate limit, validação da árvore `FieldDef`, e a fronteira
"nenhum model Mongoose fora de `packages/db`". Nenhum desses precisa de ação.

---

## Gate Check — reexecução (pós-sensor)

Reexecutado depois de restaurar a última mutação, para provar que o sensor não deixou resíduo:

- `pnpm -r exec tsc --noEmit` → **exit 0**
- `pnpm biome check .` → **exit 0** (156 arquivos)
- `pnpm vitest run` → **exit 0** — 51 arquivos, **276 passed, 0 failed, 0 skipped** (idêntico ao baseline)

**Integridade do sensor**: as 16 mutações foram aplicadas no arquivo real e revertidas com
`git checkout -- <arquivo>`; após **cada** reversão, `git status --porcelain` e `git diff` foram
verificados vazios antes da mutação seguinte. Ao fim da rodada, `git diff` não contém **nenhum**
arquivo de código ou de teste — só `.specs/LESSONS.md` (artefato de lições, reescrito pelo
script) aparece como modificado, mais `.specs/features/dynamic-field-engine/validation.md` e
`.specs/lessons.json` como novos. Nenhum fix foi aplicado: o Verifier não corrige.

---

## Lições Destiladas

`.specs/lessons.json` não existia (o repo estava no *no-script fallback* de `LESSONS.md`).
O store foi inicializado com `lessons.py init` e as **3 lições manuais existentes** de
`foundation-tenancy-auth` foram **migradas** para dentro dele antes das novas — sem isso o
`init`/`add` teria reescrito `LESSONS.md` e apagado o histórico. Total: **12 lições**
(3 migradas + 9 novas), todas `candidate`.

| ID | Sinal | Origem |
| --- | --- | --- |
| L-004 | `surviving_mutant` | M9 — instrumentação `dbReqResTime` deletável inteira |
| L-005 | `surviving_mutant` | M10 — flag de ciclo de vida asserida só no documento, não na leitura |
| L-006 | `surviving_mutant` | M13 — guarda de concorrência exercitada só no caminho barato |
| L-007 | `ac_gap` | FLD-15 / nota D — retry após falha com slot não liberado |
| L-008 | `ac_gap` | P1-AC6 / FLD-08 — AC de duas metades, só uma construída |
| L-009 | `ac_gap` | P1-AC4 / FLD-06 — conjunção "mesmo após avançar" não asserida |
| L-010 | `ac_gap` | P1-AC5 / FLD-07 — teste de RBAC com usuário de outro tenant |
| L-011 | `spec_precision_gap` | P1-AC3 / FLD-02 — discriminador `target` ignorado sem marcador |
| L-012 | `spec_precision_gap` | Edge case `reference` apagada — outcome sem valor concreto |

**Nota de tooling** (não é defeito da feature): o JSON que `lessons.py` grava usa arrays
multi-linha e o Biome do projeto exige array de um item em linha única — `pnpm biome check .`
fica **vermelho** logo após qualquer `lessons.py add`. Foi corrigido aqui com
`pnpm biome format .specs/lessons.json --write` (reformatação pura, JSON semanticamente
idêntico), mas vai voltar a acontecer no próximo `add`. Ou o `.specs/` entra no ignore do
`biome.json`, ou o `format` passa a ser rodado depois de cada `add`.

---

## Iteration 2

**Date**: 2026-09-04
**Diff range**: `85549d3..445d7e8` (7 fix commits, listed below)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero — a different
instance from iteration 1, and did **not** author any of the 7 fixes below.

### Fix commits under review

| # | Commit | Claims to close |
| - | ------ | ---------------- |
| 1 | `a7aeee1` fix(crm-api): release the claimed version slot when destructive migration fails | Gap #3 (Major, M13/Nota D) |
| 2 | `ef9df28` test(crm-api): cover the version-slot guard on the destructive migration path | Gap #2 (Blocker, M13) |
| 3 | `6458af5` test(crm-api): assert the archived flag is exposed after archiving | Gap #1 (Blocker, M10) |
| 4 | `4d70ee1` test(crm-api): prove FLD-07 RBAC with a non-admin from the SAME tenant | Gap #5 (Major, Nota E) |
| 5 | `0c5baaf` test(crm-api): assert dbReqResTime instrumentation on field-template repository ops | Gap #4 (Major, M8/M9) |
| 6 | `7d9631a` test(db): hydrate an old field-template version after three later bumps (FLD-06) | Gap #6 (Major, Nota F) |
| 7 | `445d7e8` docs(field-engine): mark the reference/target gap as an explicit SPEC_DEVIATION | Gap #7 (Minor) + documents gap #8 (Minor) |

### Re-check of the 4 previously-surviving mutants

Each mutation was hand-applied to the **current** (post-fix) source in scratch state, the
targeted test file (or full suite) run, then reverted with `git checkout --` and confirmed
clean via `git status --porcelain` before the next mutation. No mutation left residue.

| Mutant | Current target | Result | Killer |
| ------ | --------------- | ------ | ------ |
| M10 | `fieldTemplate.service.ts` — `getCurrentTemplate` hardcoded to `archived: false` | ✅ **KILLED** | `fieldTemplate.router.e2e.test.ts:636` — `expected false to be true` (the new assertion from `6458af5`) |
| M13 | `fieldTemplate.service.ts` — `claimVersionSlot` moved to run *after* `migrateValues` in the destructive branch (full reorder, releaseVersionSlot removed since nothing is claimed before migrate) | ✅ **KILLED** | `fieldTemplate.router.e2e.test.ts:586` — `expected [...] to have a length of 1 but got 2` (the new destructive-concurrency test from `ef9df28`); also collaterally fails the FLD-18 `releaseVersionSlot` observability test from `0c5baaf` |
| M8 (narrow, original target) | `fieldTemplate.repository.ts` — `withDbTiming` removed from **only** `updateCurrentVersion` | ✅ **KILLED** | `fieldTemplate.router.e2e.test.ts:722` — `expected [...] to include 'fieldTemplate.updateCurrentVersion'` (new test from `0c5baaf`) — confirms the fix is **not** vacuous despite `dbReqResTime` being a module-level Prometheus `Histogram` singleton that accumulates across every test in the file: removing instrumentation from one function removes that operation's label for every caller in the whole run, so cumulative state cannot mask this class of mutation |
| M9 (escalated, all 7 `withDbTiming` + import removed) | `fieldTemplate.repository.ts` — every operation | ✅ **KILLED** | Same test as above, `expected [] to include 'fieldTemplate.createTemplate'` (fully empty set) |

**All 4 previously-surviving mutants are now killed.** No previously-solid invariant (M1–M7,
M11, M12, M14–M16) was touched by the fix commits, and none needed re-verification.

### Fix-by-fix evidence

| # | Fix | Verdict | Evidence |
| - | --- | ------- | -------- |
| 1 | Slot release on migration failure (`a7aeee1`) | ✅ **Genuine** | `apps/crm-api/src/repositories/fieldTemplate.repository.ts:101-104` adds `releaseVersionSlot` (`FieldTemplateVersion.deleteOne`, tenant-scoped); `apps/crm-api/src/services/fieldTemplate.service.ts:134-145` wraps `migrateValues` in try/catch, calling `releaseVersionSlot` before rethrow. The existing rollback test gained a slot-count assertion (`fieldTemplate.router.e2e.test.ts:508` — `countDocuments(...).toBe(1)`), and a **new** dedicated retry-after-failure test (`:513-538`) fails first with 500, then retries the identical bump and asserts `200`, `currentVersion: 2`, `countDocuments(...).toBe(2)`, and `store.records` reflecting the migration. Empirically confirmed: removing just the `releaseVersionSlot` call (keeping order intact) fails **3 separate tests** — the slot-count assertion (`expected 2 to be 1`), the retry test (`expected 409 to be 200`), and the FLD-18 observability test for `releaseVersionSlot`. |
| 2 | Destructive-path concurrency test (`ef9df28`) | ✅ **Genuine** | `fieldTemplate.router.e2e.test.ts:566-589` fires two **identical concurrent destructive bumps** (`migration: { obs: { action: 'discard' } }`, not additive) and asserts `store.calls` (populated inside the fake store's `migrateValues`, before `failOnMigrate` is even checked — confirmed by reading the fake store helper at `:63-76`) has length 1 — i.e., only the slot's winner may migrate. This is a genuinely different signal than counting HTTP statuses. Empirically confirmed by the M13 re-check above: reordering `claimVersionSlot` after `migrateValues` makes `store.calls` length 2, failing this exact assertion. |
| 3 | Archived flag assertion (`6458af5`) | ✅ **Genuine** | `fieldTemplate.router.e2e.test.ts:636` adds `expect(afterArchive.body.data.template.archived).toBe(true)` after archiving, reading the real field from `getCurrentTemplate` (`fieldTemplate.service.ts:73` — `archived: template.archived`, a real DB read, not hardcoded). STATE.md gained AD-022 explicitly scoping "block new use" enforcement to `crm-core` (consumer), consistent with design.md's pre-existing Error Handling Strategy — this is a legitimate scope boundary, not a dodge, since no `Customer`/`Process` model exists yet in this codebase to enforce against. Empirically confirmed killed (M10 re-check above). |
| 4 | RBAC same-tenant test (`4d70ee1`) | ✅ **Genuine** | New helper `addUserToTenant` (`fieldTemplate.router.e2e.test.ts:150-164`) creates a `User` with `Tenant: tenant._id` — the **same** `ObjectId` passed in from a prior `seedTenantUser()` call, not a fresh tenant. Both the bump-403 test (`:594`) and the archive-403 test (`:672`) were rewired to use it. Empirically confirmed by removing `isAdmin` from both `POST /:id/versions` and `POST /:id/archive` in `fieldTemplate.router.ts`: both tests now fail with **`expected 200 to be 403`** (not `404 to be 403` as iteration 1's Nota E found) — proof the 403 is now produced by `isAdmin`, not by tenant-scoped `findTemplateById` returning null. |
| 5 | FLD-18 dbReqResTime assertions (`0c5baaf`) | ✅ **Genuine** | Two new tests import the real `dbReqResTime` histogram (`../metrics/db.metric.js`) and assert `metric.get().values.map(v => v.labels.operation)` contains all 7 real operation names emitted by the actual repository (`fieldTemplate.createTemplate`, `.claimVersionSlot`, `.findTemplateByTargetKey`, `.findCurrentVersion`, `.findTemplateById`, `.updateCurrentVersion`, `.archiveTemplate`) plus `.releaseVersionSlot` for the failure path — not the fictitious names (`'test.success'`) that `db.metric.unit.test.ts` uses. Verified non-vacuous despite the histogram being a shared module-level singleton across the whole test file: narrowly removing instrumentation from only `updateCurrentVersion` still fails the assertion (see M8 narrow re-check above), because the mutation is a function-definition change that suppresses that operation's label for every caller for the entire test run, not just this test's own call. |
| 6 | FLD-06 old-version hydrate test (`7d9631a`) | ✅ **Genuine** | `packages/db/src/models/fieldTemplateVersion.model.int.test.ts:86-131` creates v1/v2/v3 of the **same template id**, where v3 redefines fieldId `status` with a **different** `label` (`'Situação'` vs `'Status'`) and different `options` (`'ativo'` vs `'novo'`). It then explicitly queries `FieldTemplateVersion.findOne({ template, version: 1 })` (not the current version) and asserts `hydrate(oldVersion.fields, { status: 'novo' })` equals the **v1** definition. Because v1 and v3 redefine the same fieldId differently, this assertion would fail if `hydrate` (or the query) picked up the wrong version — it is not a value that would pass either way. Confirmed passing (6/6 tests in the file, including this one). No new HTTP route was added, correctly scoped to the engine (`hydrate`) per the spec's AC wording, not the API surface. |
| 7 | SPEC_DEVIATION marker (`445d7e8`) | ✅ **Genuine** | `packages/field-engine/src/validate.ts:62-72` — the marker is present in the exact project convention: `// SPEC_DEVIATION: ...` followed by `// Reason: ...` within the same comment block (matching `implement.md`'s `// SPEC_DEVIATION: [what] / // Reason: [why]` format, cross-checked against the project's only other pre-existing usages in `apps/ai-gateway/src/app.ts` and `apps/web/src/lib/helpers/translate.helper.ts`). No behavior or test change, as claimed — `git show 445d7e8 --stat` touches only this one file, 11 insertions/2 deletions, all comment text. Both the reference/target gap (#7) and the pending-reference edge case (#8) are addressed at their shared root cause. |

### Regression check

Diffed every fix commit individually (`git show <sha>`) for weakened or removed assertions:
`git diff 85549d3..445d7e8 -- '*.test.ts' | grep '^-.*expect('` returns **zero matches** — no
`expect(...)` line was removed or altered across the entire fix range. The only non-additive
test-file edits are two `it()` title renames and swapping `seedTenantUser` for `addUserToTenant`
in the two RBAC tests (commit `4d70ee1`), which **strengthens** those tests (same-tenant instead
of cross-tenant) rather than weakening them. Test count grew from 276 to 281 (5 new tests: retry-
after-failure, destructive-concurrency, 2 observability tests, FLD-06 old-version hydrate); the
archived-flag and RBAC fixes extended two existing tests in place rather than adding new ones.
**No regressions found.**

### Gate check (iteration 2)

- `pnpm -r exec tsc --noEmit` → **exit 0**
- `pnpm biome check .` → **exit 0** (156 files)
- `pnpm vitest run` → run 3× for stability:
  - Run 1: exit 0 — 51 files, **281 passed, 0 failed**
  - Run 2: exit 0 — 51 files, **281 passed, 0 failed**
  - Run 3: exit 0 — 51 files, **281 passed, 0 failed**
  - **Stable across all 3 runs.**

**Working tree integrity**: every scratch mutation (M10, M13, M8-narrow, M9-escalated, fix#1
release-removal, fix#4 isAdmin-removal) was applied to a real source file, the targeted test(s)
run, then reverted with `git checkout --` and confirmed via `git status --porcelain` before the
next mutation. Final `git status --porcelain` shows only the pre-existing untracked `CLAUDE.md`
(unrelated, ignored per task instructions); `git diff --stat` is empty. No fix was applied by
this Verifier — only `validation.md` was edited.

### Verdict

# ✅ PASS

All 4 previously-surviving mutants (M8, M9, M10, M13) are now killed by genuine, non-cosmetic
assertions. Both Blockers (gap #1 AC6/archived-flag, gap #2 FLD-17 destructive concurrency) and
all 4 Majors (gap #3 slot-release/FLD-15, gap #4 FLD-18 observability, gap #5 FLD-07 RBAC, gap #6
FLD-06 old-version hydrate) have real evidence, each independently confirmed by re-deriving the
same failure class the original gap described and observing it fail for the right reason. The
2 Minor spec-precision gaps (reference/target discrimination, pending-reference edge case) remain
intentionally deferred to `crm-core` per design.md's Error Handling Strategy, and are now marked
with the project's `// SPEC_DEVIATION` convention as required — this is an accepted documented
deferral, not a defect, and does not block PASS. No regression was introduced by any fix commit.
Gate is green and stable across 3 consecutive full-suite runs.

**Feature `dynamic-field-engine` — PASS after iteration 2.**

### Lessons

Iteration 2 is a clean PASS with no new grounded gap (all signal was already captured by
iteration 1's L-004 through L-012). Per `lessons.md`, nothing new is recorded; `.specs/lessons.json`
is left untouched.
