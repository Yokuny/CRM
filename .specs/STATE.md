# STATE

## Decisions

Decisões de nível de projeto. Toda feature futura conforma ou supersede.
Detalhamento completo (contexto, consequências, alternativas) em [`docs/adr/`](../docs/adr/README.md).

### AD-001
- **Decision**: Monorepo pnpm workspaces — `apps/{crm-api,ai-gateway,web}` + `packages/{contracts,db,field-engine,ai-kit}`.
- **Reason**: `field-engine` precisa rodar idêntico no back-end (validação) e no front (render recursivo); contratos Zod duplicados divergem.
- **Trade-off**: CI mais pesado; permissão de repositório vira tudo-ou-nada.
- **Scope**: todo o projeto.
- **Date**: 2026-09-02
- **Status**: active

### AD-002
- **Decision**: Dois serviços sobre um único MongoDB, sem nenhuma chamada entre eles; coordenação só por Mongo, com dono único de escrita por collection.
- **Reason**: requisito explícito do produto — o `ai-gateway` processa e grava, o `crm-api` consome. Sem broker, sem outbox de evento, sem HTTP interno.
- **Trade-off**: sem replay nem evento versionado; bug de escrita corrompe o dado direto. Mitigado pela tabela de propriedade de escrita.
- **Scope**: `crm-api`, `ai-gateway`, `packages/db`.
- **Date**: 2026-09-02
- **Status**: active

### AD-003
- **Decision**: Campos dinâmicos com definição e valor separados; `processTemplateVersions` guarda snapshot imutável, `processes` guarda só `values` por `fieldId`.
- **Reason**: indexabilidade (wildcard index), versionamento e edição de campo sem reescrever N registros.
- **Trade-off**: todo render exige join lógico template+registro.
- **Scope**: `packages/field-engine`, `crm-api`, `apps/web`.
- **Date**: 2026-09-02
- **Status**: active

### AD-004
- **Decision**: Superfície de tools fixa e idêntica entre tenants; schema dinâmico chega por *resultado* de tool, nunca por definição.
- **Reason**: definições de tools renderizam na posição 0 do prompt — variar por tenant elimina reuso de cache e infla a lista de tools.
- **Trade-off**: o modelo gasta um turno buscando o template antes de preencher.
- **Scope**: `packages/ai-kit`.
- **Date**: 2026-09-02
- **Status**: active

### AD-005
- **Decision**: Meta Cloud API (oficial) como canal de WhatsApp.
- **Reason**: sem risco de banimento do número do cliente; webhook estável.
- **Trade-off**: janela de 24h e templates HSM viram regra de negócio de primeira classe; custo por conversa.
- **Scope**: `ai-gateway`, `apps/web` (UI precisa mostrar estado da janela).
- **Date**: 2026-09-02
- **Status**: active

### AD-006
- **Decision**: Inbox ao vivo via WebSocket no `crm-api`, alimentado por poller interno (~2s) que só varre tenants com socket conectado.
- **Reason**: respeita AD-002 e não exige replica set.
- **Trade-off**: latência de até ~2s; carga contínua proporcional a tenants ativos.
- **Scope**: `crm-api`, `apps/web`.
- **Date**: 2026-09-02
- **Status**: active

### AD-007
- **Decision**: Envio outbound por fila no Mongo com claim atômico (`findOneAndUpdate`), consumido pelo `ai-gateway`; reaper devolve claims travados.
- **Reason**: só o `ai-gateway` tem o token da Meta, e AD-002 proíbe chamada entre serviços.
- **Trade-off**: latência de envio herda o intervalo do consumidor.
- **Scope**: `crm-api`, `ai-gateway`.
- **Date**: 2026-09-02
- **Status**: active

### AD-008
- **Decision**: `claude-haiku-4-5` no loop conversacional (model ID sem sufixo de data).
- **Reason**: custo por conversa em canal de alto volume; já em produção no DentalEase.
- **Trade-off**: cache só acima de 4096 tokens (prefixo atual não cacheia); sem `role: "system"` mid-conversation; sem `effort`; thinking desligado no loop. Montagem de prompt mantida para que a troca por `claude-opus-5` seja mudança de constante.
- **Scope**: `packages/ai-kit`.
- **Date**: 2026-09-02
- **Status**: active

### AD-009
- **Decision**: Tools em dois anéis — Anel A autônomo; Anel B (`create_order`, `issue_payment_link`) grava `pending_approval` e exige confirmação explícita do cliente **e** liberação do operador.
- **Reason**: erro de modelo em operação financeira vira cobrança indevida a cliente real.
- **Trade-off**: fluxo de compra ganha um passo.
- **Scope**: `packages/ai-kit`, `crm-api` (orders), `apps/web`.
- **Date**: 2026-09-02
- **Status**: active

### AD-010
- **Decision**: Tenant sempre injetado no servidor — nunca em `input_schema` de tool, nunca no corpo da requisição. Acesso a dados no `ai-kit` passa por `TenantScopedRepo` que exige `Tenant` no filtro.
- **Reason**: vazamento entre tenants é a falha mais cara do sistema; o padrão já está provado no `ToolContext` do DentalEase.
- **Trade-off**: nenhum relevante — é restrição estrutural barata.
- **Scope**: todo o projeto. Teste estrutural obrigatório no CI.
- **Date**: 2026-09-02
- **Status**: active

### AD-011
- **Decision**: Kanban é ferramenta à parte; o card pode referenciar um `Process`, mas não é um `Process`.
- **Reason**: porte quase direto do DentalEase; mantém liberdade de montar quadros ad-hoc.
- **Trade-off**: dois modelos de coluna no sistema (`stage` do template vs `status` do board); card não herda estágio do processo.
- **Scope**: `crm-api`, `apps/web`.
- **Date**: 2026-09-02
- **Status**: active

### AD-012
- **Decision**: Asaas como gateway de pagamento, com chave por tenant criptografada em repouso.
- **Reason**: integração completa já existe no DentalEase (chave criptografada, webhook com resolução de tenant, conciliação); Pix/boleto/cartão cobertos.
- **Trade-off**: lock-in em gateway nacional.
- **Scope**: `crm-api`.
- **Date**: 2026-09-02
- **Status**: active

### AD-013
- **Decision**: Evals em duas camadas — golden set determinístico no CI (gate 100%) + replay de conversas reais anonimizadas antes de promover prompt. LLM-judge só para tom.
- **Reason**: mudança de prompt é mudança de comportamento sem diff legível.
- **Trade-off**: pipeline de anonimização e política de retenção; escrever eval vira parte de fechar feature que toca o harness.
- **Scope**: `packages/ai-kit`, `evals/`.
- **Date**: 2026-09-02
- **Status**: active

### AD-014
- **Decision**: Sessão de token único verificada no banco — o cookie httpOnly `refreshToken` é a credencial de todo request; não existe access token separado.
- **Reason**: o contrato de sessão exige carregar `tenantUser` do banco em toda requisição (FND-05), então um access token curto não pouparia leitura; pouparia apenas a verificação de assinatura, ao custo de rotação, corrida de 401 e fila de retry no cliente.
- **Trade-off**: cada request faz duas leituras (`sessions` + `users`/`tenants`); sem stateless. Em troca, papel revogado, usuário desativado e tenant suspenso passam a valer no request seguinte.
- **Scope**: `crm-api`, `apps/web`, `packages/contracts`.
- **Date**: 2026-09-02
- **Status**: active

### AD-015
- **Decision**: Vitest 4 é o único runner de testes do monorepo, configurado por `projects` na raiz.
- **Reason**: o gate de testes decide se uma task fechou, e um runner só cobre back-ends, packages isomórficos e o `web` sem transform ts-jest nem atrito de ESM em pnpm workspace.
- **Trade-off**: desvio do Jest + ts-jest do `DentalEase-BackEnd` — os testes portados de lá precisam de tradução de API (mínima) e o padrão de referência deixa de ser copiável literalmente.
- **Scope**: todo o projeto, incluindo `evals/`.
- **Date**: 2026-09-02
- **Status**: active

### AD-016
- **Decision**: E-mail é globalmente único e um `User` pertence a exatamente um `Tenant`; `isPlatformAdmin` é a única exceção a ter `Tenant` ausente.
- **Reason**: `POST /auth/signin` recebe só e-mail e senha e nenhum requisito prevê seletor de empresa no login; unicidade global mantém a resolução de identidade determinística.
- **Trade-off**: a mesma pessoa atuando em duas empresas precisa de dois e-mails. Suportar identidade compartilhada depois exige seletor de tenant no login e migração do índice.
- **Scope**: `crm-api`, `packages/db`, `packages/contracts`.
- **Date**: 2026-09-02
- **Status**: active

### AD-017
- **Decision**: Convenção concreta de testes do monorepo — Vitest `projects` nomeados `unit` / `integration` / `e2e` / `structural`; arquivos colocados por sufixo (`*.unit.test.ts`, `*.int.test.ts`, `*.e2e.test.ts`, `*.structural.test.ts`, `*.unit.test.tsx` no `web`), sem diretório `__test__` separado. Gates: Quick = `pnpm vitest run --project unit --project structural`; Full = `pnpm vitest run`; Build = `pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run`.
- **Reason**: AD-015 fixou o runner único; faltava a convenção de nomes de `project` e os comandos de gate que toda feature futura reusa sem reinventar — decidido com o usuário na fase Tasks da feature 1, na ausência de qualquer teste pré-existente no repo.
- **Trade-off**: renomear um `project` exige atualizar todo `Location Pattern` já escrito em specs futuros; um arquivo de teste fora do sufixo esperado não roda em nenhum project (falso-negativo silencioso).
- **Scope**: todo o projeto.
- **Date**: 2026-09-02
- **Status**: active

### AD-018
- **Decision**: Um único `.env` na raiz do monorepo para todo dev local — backends leem `process.env` direto; `apps/web` lê o mesmo arquivo via `envDir: '../../'` no `vite.config.ts` (nunca `.env` duplicado por app). Cada app Node expõe `"dev": "tsx watch src/server.ts"` no seu `package.json`. Dado de bootstrap que não pode vir de rota (ex.: primeiro `isPlatformAdmin`) é seed idempotente em `apps/<app>/scripts/`, nunca endpoint.
- **Reason**: nenhuma task da feature 1 cobriu como o ambiente de dev realmente sobe (só testes automatizados contra `MongoMemoryServer`/apps mínimos via supertest) — sem isso `pnpm dev` não funcionava em nenhum dos 3 apps e o percurso manual do Success Criteria do spec (convite → senha → login → área privada no navegador) não rodava. Descoberto e corrigido pelo orquestrador na verificação pós-Execute da feature 1.
- **Trade-off**: variáveis de ambiente perdem isolamento por app — nomes precisam ser únicos globalmente (o front já usa prefixo `VITE_` para isso). Um seed script por dado de bootstrap é mais uma peça de tooling para manter, mas evita abrir uma segunda via de escrita para um campo que uma rota nunca deveria aceitar (AD-010).
- **Scope**: todo o projeto — toda feature futura que adicionar um app Node ou telas no `web` segue esta convenção sem redecidir.
- **Date**: 2026-09-03
- **Status**: active

### AD-019
- **Decision**: O motor de campos dinâmicos (AD-003) deixa de ser exclusivo de `Process` — generaliza para um mecanismo único de template/versão/valores reutilizado por qualquer tipo de entidade que precise de campos definidos pelo tenant. Nesta rodada, `customer` e `process` são os dois `targetType`. Só `Customer` ganha um template padrão semeado automaticamente na provisão do Tenant (FND-01); `Process` não tem default universal.
- **Reason**: `docs/glossary.md` já previa "Customer: núcleo fixo... mais campos dinâmicos definidos pelo tenant", mas nenhuma feature havia confirmado que isso usa a mesma máquina de `Process`. Confirmado na sessão de Discuss da feature `dynamic-field-engine`: o campo `status` do Customer (usado tanto no filtro da listagem quanto na visão kanban — `crm-core`) precisa ser configurável pelo tenant, não fixo, e a UI que o renderiza deve ser a mesma função recursiva usada por `Process` — não uma segunda implementação.
- **Trade-off**: exige generalizar as collections `processTemplates`/`processTemplateVersions` (nome exato — discriminador `targetType` único vs. pares paralelos que compartilham a lib — decidido no Design de `dynamic-field-engine`) em vez de manter a forma Process-only original do AD-003. Ganha-se reuso e uma única implementação de motor; perde-se a simplicidade de um nome de collection dedicado a Process.
- **Scope**: `packages/field-engine`, `packages/db`, `crm-api`, `apps/web` (feature 4 em diante).
- **Date**: 2026-09-03
- **Status**: active

### AD-020
- **Decision**: Motor de campos dinâmicos generalizado (AD-019) persiste em **um único par de collections** discriminado por `targetType` — `fieldTemplates`/`fieldTemplateVersions` com `targetType: 'customer' | 'process'` — em vez de dois pares paralelos (`customerTemplates`/`processTemplates`).
- **Reason**: Confirmado com o usuário no Design de `dynamic-field-engine`. Estende ao nível de dados a mesma unificação que AD-019 já exige do motor: um único repositório e uma única máquina de migração, não duas mantidas em lockstep manualmente.
- **Trade-off**: toda query precisa filtrar por `targetType`; índice único `{Tenant,targetType,key}` um pouco mais largo que um índice dedicado por collection.
- **Scope**: `packages/db`, `apps/crm-api` (`dynamic-field-engine`), `crm-core` (feature 3, que consome como `customer`/`process`).
- **Date**: 2026-09-03
- **Status**: active

### AD-021
- **Decision**: A migração destrutiva de template (FLD-05/12/13) roda contra uma interface `FieldValueStore` (`countByTemplateVersion`, `migrateValues`) injetada por `targetType`. `dynamic-field-engine` registra um adapter no-op em produção (nenhum `Customer`/`Process` existe ainda) e prova a mecânica (diff, rejeição, rollback, log) contra um fake em memória nos testes. `crm-core` (feature 3) escreve os adapters reais sobre `customers`/`processes` e troca a injeção em `app.ts`, sem tocar `packages/field-engine` nem `field-template.service.ts`.
- **Reason**: Confirmado com o usuário no Design de `dynamic-field-engine`. Evita invadir o escopo de `crm-core` — `Customer` precisa do núcleo fixo (nome/telefone/documento) no MESMO documento que `values`, o que uma collection genérica de valores criada agora não serviria sem retrabalho.
- **Trade-off**: mais uma peça de DI a manter (mesmo molde de `MailProvider`); a materialização Mongo real da migração transacional (sem transação nativa — `MongoMemoryServer` é standalone) fica para o Design de `crm-core` resolver.
- **Scope**: `apps/crm-api` (`dynamic-field-engine`, `crm-core`).
- **Date**: 2026-09-03
- **Status**: active

### AD-022
- **Decision**: FLD-08/AC6 ("template arquivado impede novos registros de usá-lo") tem enforcement dividida: `dynamic-field-engine` garante que a flag `archived` chega correta em toda leitura (`GET /field-templates/current`) e que `hydrate` nunca para de servir registros já vinculados a uma versão antiga; **bloquear a criação de um novo registro contra um template arquivado é responsabilidade de quem cria o registro** (`crm-core`, feature 3), não desta feature — não há `Customer`/`Process` ainda para bloquear.
- **Reason**: `design.md` (Error Handling Strategy) já delegava essa metade ao consumidor, mas a lacuna ficou implícita — o Verifier independente da feature (`validation.md`, iteração 1) achou um mutante sobrevivente (`archived` hardcodado `false` na leitura corrente, 276/276 verde) porque nenhum teste asseria a flag por valor. Confirmado com o usuário: mantém o deferral já previsto, mas fecha o buraco testável — `getCurrentTemplate` agora tem um teste que assere `archived: true` após archive.
- **Trade-off**: nenhuma mudança de comportamento; só torna explícito, com número de decisão, o que já estava implícito no design — para que `crm-core` (feature 3) não precise redescobrir essa fronteira.
- **Scope**: `apps/crm-api` (`dynamic-field-engine`, `crm-core`).
- **Date**: 2026-09-03
- **Status**: active

### AD-023
- **Decision**: `FieldTemplateVersion` gains an additive `stages?: string[]` field, required (non-empty, unique) only when `targetType === 'process'`; absent for `customer`. Threaded through `createFieldTemplateSchema`/`bumpFieldTemplateSchema` (contracts) and `fieldTemplate.service`/`repository` (apps/crm-api).
- **Reason**: AD-019/AD-020 generalized `FieldTemplate`/`FieldTemplateVersion` across `customer`/`process`, but that generalization silently dropped the `stages` concept that `docs/glossary.md` ("Stage: etapa dentro de um FieldTemplate de targetType process") and ADR-0003 already assumed existed. Discovered mid-Design of `crm-core` (feature 3), which needs a versioned source of truth for the `Process.stage` transition guard (CORE-09/CORE-17). Confirmed with the user: keep it on `FieldTemplateVersion` (one source of truth, correctly versioned) rather than a second collection in `crm-core` that would need manual lockstep with template bumps — exactly the duplication AD-020 was created to avoid.
- **Trade-off**: reopens a small, additive surface of the closed/Verified `dynamic-field-engine` feature (contracts + service + repository) — no behavior change for existing `customer` templates, `stages` is simply absent for them.
- **Scope**: `packages/contracts`, `apps/crm-api` (`field-template` module, `crm-core`).
- **Date**: 2026-09-04
- **Status**: active

### AD-024
- **Decision**: The real `FieldValueStore` adapters (AD-021 closure, `customer`/`process`) implement `migrateValues` as an **idempotent filtered bulk update** — only documents still at `fromVersion` are touched (already-migrated ones are excluded by the query filter itself, not by external bookkeeping), and each migration action (`discard`/`mapField`/`mapOptions`) is written defensively so re-applying it is a no-op. No distributed transaction, no persisted "in-progress" marker.
- **Reason**: AD-002/AD-006 already commit the project to a standalone MongoDB (no replica set), so native multi-document transactions aren't available. Confirmed with the user during `crm-core` Design: safety comes from combining this natural per-document idempotency with the rollback contract `fieldTemplate.service.bumpFieldTemplateVersion` already has (FLD-12, feature 2) — releasing the version slot on failure means an admin retrying the identical bump reuses the same `(fromVersion, toVersion)` pair and the retry converges on its own.
- **Trade-off**: no crash-safe resumption bookkeeping (rejected alternative: a `pendingMigration` marker per record) — judged disproportionate complexity for a low-frequency admin action. A crash mid-batch leaves some records migrated and some not until the admin retries the same bump.
- **Scope**: `apps/crm-api` (`providers/fieldValueStore`), any future `targetType` that reuses `FieldValueStore`.
- **Date**: 2026-09-04
- **Status**: active

### AD-025
- **Decision**: Querying/filtering by a tenant-defined dynamic field (e.g. `Customer.values.status`, used by both the listing filter and the kanban-column read) relies on a compound wildcard index (`{Tenant: 1, 'values.$**': 1}`) — no denormalized top-level copy of any `values.*` field is maintained for query performance.
- **Reason**: Confirmed with the user during `crm-core` Design. Keeps a single source of truth for every tenant-defined value (zero drift risk between a denormalized copy and `values`), consistent with AD-003's original definition/value-separation intent. Judged adequate for the data volumes expected of a CRM at this stage.
- **Trade-off**: gives up the sort/filter/pagination performance a dedicated compound index on a real column would offer; revisit (denormalize) only if profiling shows this index is actually a bottleneck, not preemptively.
- **Scope**: `packages/db` (`customers`, and any future collection querying by a dynamic `values.*` field).
- **Date**: 2026-09-04
- **Status**: active

### AD-026
- **Decision**: Any business entity that consumes the field-engine (AD-019) stores its fixed core fields, its `values`, and its template pointer (`template: ObjectId` + `templateVersion: number` — not a single `templateVersionId` FK) in **one** Mongoose document, never split across collections.
- **Reason**: Generalizes AD-021's own reasoning for `Customer` ("núcleo fixo precisa estar no MESMO documento que `values`") into an explicit, reusable convention for `crm-core`'s two entities and any future `targetType`. The `(template, templateVersion)` pointer pair (not a single FK) was chosen because it's what `FieldValueStore.countByTemplateVersion`/`migrateValues` already takes as parameters (feature 2), and what `fieldTemplate.repository.findCurrentVersion(tenantId, templateId, version)` already accepts — zero-friction reuse either way.
- **Trade-off**: none beyond what AD-021 already accepted; this entry exists so a future feature doesn't have to re-derive the same shape from first principles.
- **Scope**: `packages/db`, `apps/crm-api` (`crm-core` and any future field-engine consumer).
- **Date**: 2026-09-04
- **Status**: active

### AD-027
- **Decision**: `apps/web`'s front-end stack is Tailwind v4 (via `@tailwindcss/vite`, CSS-first `@theme`, no `tailwind.config.js`) + a ShadCN-style component layer over Radix primitives + `@dnd-kit/core`+`@dnd-kit/sortable`+`@dnd-kit/utilities` + `@tanstack/react-table` — ported from `../DentalEase/DentalEase` at the versions confirmed working there (`tailwindcss@4.3.1`, `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@tanstack/react-table@8.21.3`).
- **Reason**: `apps/web` had zero styling/UI infrastructure before this feature (confirmed by a repo-wide search: no Tailwind, no Radix, no `cva`/`clsx`/`tailwind-merge` anywhere in the monorepo). Decided during `crm-web-shell` Design — closes the `card.tsx`/`default-loading.tsx` `SPEC_DEVIATION`s and gives every future `apps/web` feature a single, already-proven design-system baseline instead of each feature re-deciding its own UI stack.
- **Trade-off**: locks the project into Radix's component model and Tailwind's utility-class styling for the life of `apps/web`; a future feature wanting a different UI paradigm would need to supersede this entry, not silently deviate.
- **Scope**: `apps/web`, every future feature that touches its UI.
- **Date**: 2026-09-05
- **Status**: active

### AD-028
- **Decision**: Any table component in `apps/web` uses `@tanstack/react-table` in manual/server mode (`manualPagination: true, manualSorting: true, manualFiltering: true`) — client-side slicing/sorting/filtering over an already-fetched page is never acceptable, regardless of expected dataset size.
- **Reason**: Decided during `crm-web-shell` Design after finding that the reference repo's own convenience `DataTable<T>` (`../DentalEase/DentalEase/src/components/ui/data-table.tsx`) is actually 100% client-side despite its name — porting it as-is would have violated WEB-01 AC2/AC3's explicit server-side requirement. Recorded as a standing convention so a future feature doesn't rediscover or re-litigate this the same way.
- **Trade-off**: every list screen must carry its filter/sort/page state in a place the server call can read (URL search params or component state) instead of handing a full dataset to a convenience component — slightly more wiring per screen, in exchange for never accidentally loading a full collection into the browser.
- **Scope**: `apps/web`, any future table/list screen.
- **Date**: 2026-09-05
- **Status**: active

### AD-029
- **Decision**: A field-engine (AD-019) consumer whose mutation endpoint validates `values` against the tenant's **current** template version — rather than the record's own snapshot version, which is `Process`'s model (AD-023/WEB-08) — must, on every successful write, advance the record's stored `(template, templateVersion)` pointer (AD-026) to match the version that actually validated it.
- **Decision context**: first applied to `PATCH /customers/:id` (`crm-web-shell`) — `Customer` edits validate against the current `customer` template (WEB-06 AC3's own wording, unlike `Process`'s explicit per-record snapshot in WEB-08 AC1), so leaving `templateVersion` unchanged after a successful edit would let the stored pointer understate what was actually checked.
- **Reason**: Decided with the user during `crm-web-shell` Design. Keeps AD-026's pointer pair truthful under a second, different validation philosophy — `Process` snapshots forever, `Customer` re-validates against current on every write — without forcing every future field-engine consumer to rediscover which of the two models it needs or to leave a stale pointer as a side effect.
- **Trade-off**: an entity following this model can never answer "what did this record look like when it was last edited under an older template" the way `Process`'s snapshot model can — accepted because `Customer` has no requirement (unlike `Process`'s `stage` guard) that depends on remembering an old version.
- **Scope**: `apps/crm-api` (`customer` module now; any future `targetType` that chooses "always-current" validation semantics).
- **Date**: 2026-09-05
- **Status**: active

### AD-030
- **Decision**: `apps/web` adopts TanStack Router's file-based routing (`@tanstack/router-plugin`'s `tanstackRouter()` vite plugin + `createFileRoute()`), converging the manual `createRoute`+`router.tsx` `addChildren` composition feature 1 introduced onto the file-based convention `CLAUDE.md` already documents as mandatory (directory + `index.tsx`, `staticData`, no `.`-nested filenames). Every route that identifies a specific record resolves it via `search` params (`validateSearch`), never a dynamic path segment (`$id`) — `details.tsx` is the fixed name for a single-record view/edit screen, `add/index.tsx` for a create screen. A directory prefixed with `_` (e.g. `_private`) is a pathless layout requiring a matching `<name>.tsx` layout file; `_public` had no such file and no shared layout component, so `auth`/`invite` move to plain top-level directories (`auth/index.tsx`, `invite/index.tsx`) instead of inventing an unneeded pathless group.
- **Reason**: Confirmed with the user during `crm-web-shell` Execute (before Batch 2), after finding `CLAUDE.md`'s routing section (`createFileRoute`, `staticData`, explicit ban on `$id` for details — "use details.tsx com search: { id }") was never actually adopted by feature 1 (`foundation-tenancy-auth` shipped `createRoute`+manual composition instead), and this feature's own Design phase continued that gap (`$customerId`/`$processId` in its original Routes table) without cross-checking `CLAUDE.md`. `crm-web-shell` is the first feature adding a meaningful volume of new `apps/web` routes (6, vs. feature 1's 3) — the natural point to correct this before more routes accumulate on the wrong convention, rather than migrating later at higher cost. The reference `../DentalEase/DentalEase` already uses this exact plugin+convention (`@tanstack/router-plugin@1.168.18` resolved in its lockfile), confirming `CLAUDE.md`'s routing section was transcribed from it.
- **Trade-off**: rewrites all 4 of feature 1's existing route files (`_private.tsx`, `_private/index.tsx`, `_public/auth/index.tsx`→`auth/index.tsx`, `_public/invite/index.tsx`→`invite/index.tsx`) plus `router.tsx`, adds a new dependency (`@tanstack/router-plugin`) and a generated `routeTree.gen.ts`; every future `apps/web` route follows this from now on — no more manual composition, no more `$id` path segments for a record detail.
- **Scope**: `apps/web`, every future feature that adds a route.
- **Date**: 2026-09-05
- **Status**: active

---

## Handoff

- **Feature**: `dynamic-field-engine` (feature 2 de 11) e `crm-core` (feature 3 de 11) — ambas **Execute completo, Verifier PASS, merged em `main`** (`crm-core` via PR [`#2`](https://github.com/Yokuny/CRM/pull/2), squash-merge `28c7872`, a pedido explícito do usuário). `crm-web-shell` (`.specs/features/crm-web-shell`, feature 4) é a atual — **spec.md, design.md e tasks.md confirmados pelo usuário**, pronta para Execute (em sessão separada).
- **Phase / Task**: `crm-web-shell` — Specify confirmado → Design confirmado (AD-027..AD-029 gravadas) → **Tasks confirmado** (28 tasks, 8 fases, `tasks.md` Status: Approved). Próximo: Execute.
- **Completed** (`crm-web-shell`): Specify (spec.md, 17 requisitos WEB-01..17) → Design (design.md, 4 decisões de arquitetura resolvidas: DataTable em modo server via `@tanstack/react-table`, `PATCH /customers/:id` sempre avança `templateVersion` para a corrente, sentinela `status=__none__` para "sem status" no kanban, fallback somente-leitura para `document`/`reference` no `DynamicField`) → Tasks (tasks.md, 28 tasks/8 fases, Test Coverage Matrix + Gate Check Commands gerados por amostragem real do repo, as 3 validações obrigatórias — Granularity/Diagram-Definition/Test Co-location — todas ✅, MCP/Skill = NONE em todas as tasks confirmado pelo usuário).
- **In-progress**: nenhum — Tasks fechado, aguardando o prompt de Execute (sessão separada, pedido explícito do usuário).
- **Next step**: rodar Execute em uma sessão nova — 28 tasks empacotadas em batches de sub-agentes (~7 tasks/batch, offer-then-confirm) seguindo `tasks.md`; Verifier independente roda automaticamente ao final.
- **Blockers**: nenhum. 4 toques em `apps/crm-api` confirmados no escopo (design.md/tasks.md T1-T6): `GET /customers/:id` (novo), `PATCH /customers/:id` (novo, único endpoint de mutação de Customer — núcleo+values parciais, serve kanban-drag e edição completa, sempre revalida contra o template corrente e avança `templateVersion` — AD-029), `GET /field-templates` (novo, lista `{key,label,archived}` por `targetType`), extensão de query em `GET /customers` (sentinela `status=__none__`, cobre "sem chave" e "valor com option removida" numa query só).
- **Uncommitted files**: `.specs/features/crm-web-shell/tasks.md` (Status → Approved) e este próprio `STATE.md` (Handoff) — a serem commitados nesta sessão.
- **Branch**: `feature/crm-web-shell`, criada a partir de `main` já atualizado com `crm-core` (`main` = `28c7872`), pushada para `origin` (commit `5cd5a95`, spec.md+design.md+tasks.md confirmados). `feature/crm-core`/`feature/dynamic-field-engine`/`feature/foundation-tenancy-auth` seguem intactas, históricas (conteúdo já em `main`, PR #2 `MERGED`).
