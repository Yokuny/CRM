# STATE

## Decisions

Decisões de nível de projeto. Toda feature futura conforma ou supersede.
AD-001..AD-013 têm detalhamento completo (contexto, consequências, alternativas) em [`docs/adr/`](../docs/adr/README.md);
de AD-014 em diante, a entrada abaixo é o registro completo (indexada no mesmo README).

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

### AD-031
- **Decision**: CI via GitHub Actions (`.github/workflows/ci.yml`), um único job (`build-gate`) que roda em todo push/PR para `main`, executando exatamente o script `check` da raiz (`pnpm -r exec tsc --noEmit && pnpm biome check . && pnpm vitest run` — o próprio Build gate do AD-017, sem comando novo). `packageManager` (pnpm) já fixado em `package.json`; Node fica em `lts/*` (nenhuma versão de Node era fixada em lugar nenhum do repo antes desta decisão — sem precedente para fixar um número específico).
- **Reason**: `ai-gateway`'s AC AIG-43 ("golden set — gate 100% determinístico no CI") expôs que nenhuma das 4 features anteriores jamais configurou CI — achado pelo Verifier independente da feature (`validation.md`, iteração 1). Discutido e confirmado com o usuário: em vez de tratar como um fix isolado só de `ai-gateway`, resolve a lacuna de uma vez para o projeto inteiro, já que o Build gate (AD-017) é o mesmo para toda feature — um único workflow cobre todas.
- **Trade-off**: nenhuma versão de Node fixada (`lts/*` muda sozinho quando o GitHub atualiza a LTS corrente) — aceito por não haver nenhum precedente de pin no repo; fixar um número específico agora seria uma decisão nova sem base. Binário do `mongodb-memory-server` baixa da rede a cada run (sem cache) — aceitável para o volume atual de testes, revisar se o tempo de CI virar gargalo. Risco pré-existente conhecido: `apps/crm-api`/`ai-gateway` `integration`/`e2e` projects compartilham uma única instância de `MongoMemoryServer` (`vitest.config.ts`), causando um flake intermitente já documentado — a CI pode eventualmente mostrar 1 run vermelho sem regressão real; revisitar se a taxa de flake virar incômodo prático.
- **Scope**: todo o projeto — todo push/PR para `main`, toda feature futura.
- **Date**: 2026-09-07
- **Status**: active
- **Follow-up (mesmo dia)**: `pnpm biome check .` rodava vermelho na PRIMEIRA execução do workflow — o erro de formatação pré-existente de `.specs/lessons.json` (nunca corrigido, arquivo machine-owned) tornaria a CI permanentemente vermelha, achado pelo Verifier na iteração 2 do `ai-gateway`. Corrigido com um override em `biome.json` excluindo o arquivo do linter/formatter/assist (mesmo padrão já usado para `**/*.gen.ts`), commit `4805e4b`.

### AD-032
- **Decision**: Propriedade de escrita (AD-002) é por *write-path dentro da collection*, não por collection inteira, para `customers`, `processes` e `orders` — tanto `crm-api` (CRUD acionado pelo operador) quanto `ai-gateway`/`packages/ai-kit` (escritas do loop de tools na conversa) podem escrever nessas três, cada um só na sua fatia (`crm-api`: CRUD direto; `ai-gateway`: `find_or_create_customer`, `open_process`, `set_process_fields`, e agora `create_order`). `products` continua exclusivamente `crm-api` (nenhuma tool escreve nela). `docs/architecture.md` (tabela "Propriedade de escrita por collection") é corrigido nesta mesma sessão para refletir isso.
- **Reason**: Achado durante o Design de `catalog-orders` (varredura de código, passo 1.5) — a tabela de `docs/architecture.md` já dizia "Escreve: crm-api" só para `customers`/`processes` desde a feature 5, mas `packages/ai-kit/src/tools/findOrCreateCustomer.ts:26` (`Customer.create`) e `openProcess.ts:28` (`Process.create`) já escrevem essas collections de dentro do `ai-gateway` — a tabela já estava desatualizada antes desta feature, não é uma decisão nova reabrindo AD-002. `create_order` (Anel B) precisa do mesmo padrão para `orders`, o que tornou a lacuna importante o bastante para corrigir agora.
- **Trade-off**: a leitura literal de AD-002 ("dono único de escrita por collection") fica mais estreita na prática — um write-path por collection, não a collection inteira. Uma feature futura que precisar desse mesmo formato (duas partes escrevendo a mesma collection) tem que fazer a mesma divisão explícita, não presumir por padrão. O núcleo de AD-002 (nenhuma chamada HTTP entre os dois serviços, coordenação só via Mongo) continua intacto.
- **Scope**: `packages/db` (`customers`, `processes`, `orders`), `apps/crm-api`, `apps/ai-gateway`/`packages/ai-kit`, `docs/architecture.md`.
- **Date**: 2026-09-09
- **Status**: active

### AD-033
- **Decision**: Uma transição de negócio multi-documento e tudo-ou-nada (`Order pending_approval → confirmed`, que precisa checar-e-decrementar `Product.stock` de N itens antes de virar `status:'confirmed'`) é implementada uma única vez, em `packages/db/src/orderTransitions.ts` (`tryConfirmOrder`/`setCustomerConfirmed`/`setOperatorApproved`/`rejectOrder`), nunca duplicada por app — tanto `apps/crm-api` (aprovar) quanto `packages/ai-kit` (2ª chamada de `create_order`, confirmação do cliente) importam essa mesma função. Implementação sem transação nativa do Mongo: `findOneAndUpdate` atômico por item (condição `stock >= quantity`), com rollback compensatório (`$inc` de volta) se qualquer item falhar.
- **Reason**: Tanto o operador (aprovar) quanto o cliente (confirmar, via IA) podem ser o lado que completa a segunda condição da transição (AD-009) — duplicar essa lógica em dois apps arrisca as duas cópias divergirem numa invariante que mexe com dinheiro/estoque. `packages/db` é o único pacote que os dois apps já importam (dono dos schemas), então é o dono natural dessa lógica compartilhada nova. Generaliza o precedente já aceito em AD-024 (`FieldValueStore.migrateValues`) — mesma causa raiz: MongoDB standalone, sem replica set (AD-002/AD-006), sem transação nativa disponível.
- **Trade-off**: mesma janela de risco já aceita em AD-024 — um crash entre reservar o estoque de alguns itens e virar `confirmed` deixa uma inconsistência transitória até um retry (reaprovar, ou o modelo reenviar `customerConfirmed:true`) convergir sozinho; sem bookkeeping de retomada à prova de crash, julgado desproporcional para uma ação de baixa frequência frente ao volume de mensagens. `packages/db` ganha sua primeira peça de lógica de negócio compartilhada além de models + `tenantScoped` — precedente que uma feature futura com a mesma forma de escrita dos dois lados (ex.: `issue_payment_link` em `payments-asaas`, feature 8) deve seguir em vez de duplicar.
- **Scope**: `packages/db` (`orderTransitions.ts`), `apps/crm-api` (`order.service.ts`), `packages/ai-kit` (`tools/createOrder.ts`); precedente para qualquer feature futura com o mesmo formato de escrita dos dois serviços.
- **Date**: 2026-09-09
- **Status**: active

### AD-034
- **Decision**: `payments-asaas` (feature 8) introduz três collections novas (`payments`, `asaasIntegrations`, `asaasEvents`) cuja propriedade de escrita segue o modelo por-write-path do AD-032: `apps/ai-gateway`/`packages/ai-kit` são donos do write-path inteiro de `payments`/`asaasEvents` (criação de cobrança pela tool, confirmação via webhook, worker de reconciliação); `apps/crm-api` é dono do write-path inteiro de `asaasIntegrations` (configuração da chave pelo admin do tenant) e só LÊ `payments` (exibição em Orders/Inbox, P2). `Order` ganha um status terminal aditivo `'payment_expired'` e uma nova transição compartilhada multi-documento, `packages/db/src/paymentTransitions.ts` (`expireOrderPayment`), seguindo exatamente o precedente que AD-033 fixou para `orderTransitions.ts` — mesmo só o worker de reconciliação do `ai-gateway` chamando isso hoje, fica em `packages/db` (não duplicado no app) por ser um invariante multi-documento (Payment+Product+Order), a mesma classe de decisão que AD-033 generalizou. O webhook do Asaas é uma rota nova em `apps/ai-gateway` (`webhooks/asaas/:webhookToken`), ao lado do webhook da Meta já existente — os dois são "ingestão de webhook externo", o mesmo bounded context — usando o mecanismo de verificação real do Asaas (um token opaco por tenant na URL + um header `asaas-access-token` com hash comparado), não o esquema HMAC-do-corpo da Meta, porque os dois provedores verificam webhook de formas diferentes por natureza, não por escolha.
- **Reason**: Confirmado durante o Design de `payments-asaas`. `issue_payment_link` (a tool que cria a cobrança) necessariamente roda dentro do loop de tools do `ai-gateway` (mesmo raciocínio que AD-032 já aplicou a `create_order`); o webhook que confirma essa mesma cobrança é a continuação natural do mesmo write-path, e reusar o padrão de webhook-router já provado do `ai-gateway` (`webhook.router.ts`, raw-body) evita rederivar toda a infra de webhook em `crm-api`, que hoje não tem nenhuma. `AsaasIntegration` (a credencial do próprio tenant) é configuração que o operador gerencia pela superfície de admin-CRUD que `crm-api` já tem (espelha exatamente o padrão encrypt/mask de `channel.service.ts` pro token da Meta, AD-005/AIG-01) — encaixe natural no serviço que já é dono das configurações voltadas ao admin do tenant, não no serviço de conversa da IA.
- **Trade-off**: `crm-api` precisa do seu próprio client Asaas (pequeno, independente) só pra validar uma chave e auto-registrar um webhook no momento da configuração — aceito como uma duplicação pequena e sem sobreposição real do client do `ai-gateway` (que precisa de um conjunto de métodos maior e diferente: criar cobrança, buscar QR Code Pix, consultar status) em vez de introduzir um novo pacote de workspace compartilhado para ~100 linhas ao todo em dois pontos de chamada que não se sobrepõem. `packages/db` ganha sua primeira transição compartilhada do domínio de *pagamento* (`paymentTransitions.ts`) ao lado de `orderTransitions.ts` já existente — mesma janela de risco já aceita em AD-024/AD-033 (sem transação nativa do Mongo, MongoDB standalone por AD-002/AD-006): um crash no meio da liberação de estoque deixa uma inconsistência transitória até o próximo tick de reconciliação convergir.
- **Scope**: `packages/db` (`payments`, `asaasIntegrations`, `asaasEvents`, `paymentTransitions.ts`, enum de status de `orders`), `apps/ai-gateway` (webhook receiver, worker de reconciliação, `providers/asaasClient.ts`), `apps/crm-api` (CRUD de `asaasIntegrations`, seu próprio `providers/asaasClient.ts`), `packages/ai-kit` (tool `issue_payment_link`, `get_order_status` estendida).
- **Date**: 2026-09-09
- **Status**: active

### AD-035
- **Decision**: As collections de agenda de `scheduling` (feature 9) seguem o modelo por-write-path do AD-032: `appointments` (discriminada por `kind: 'appointment' | 'block'`) é escrita pelos DOIS apps — `apps/crm-api` (CRUD do operador: criar manual, cancelar, remarcar, marcar comparecimento, bloquear; e a rota **pública** de confirmação, que é o cliente agindo pela superfície do CRM) e `apps/ai-gateway`/`packages/ai-kit` (tool `book_appointment`) — enquanto `professionals`, `spaces` e `schedulingSettings` são escritas exclusivamente por `apps/crm-api`. Toda a matemática de grade (`packages/db/src/scheduling.ts`, sem Mongoose) e toda a máquina de estados do agendamento (`packages/db/src/appointmentTransitions.ts`) vivem uma única vez em `packages/db`, nunca duplicadas por app — mesmo lugar e mesma forma de `orderTransitions.ts` (AD-033) e `paymentTransitions.ts` (AD-034). A invariante de dupla reserva não é checar-antes-de-gravar: é um **índice único parcial** `{Tenant, professional, start}` filtrado por `status ∈ {pending, confirmed}`, que faz o banco eleger um vencedor entre reservas concorrentes (verificado por execução no Design: 5 inserções concorrentes no mesmo slot → 1 aceita, 4 rejeitadas com E11000; cancelar sai do índice e libera o horário).
- **Reason**: Tanto o operador quanto o cliente (via IA) marcam horário na mesma agenda — é a terceira feature seguida com escrita dos dois lados na mesma collection, depois de `orders` (AD-032/AD-033) e `payments` (AD-034), então o padrão já está estabelecido e só precisa ser aplicado. A escolha do índice parcial em vez de consulta-e-grava veio direto da lição `L-027` da feature 8: um guard de corrida que depende de leitura prévia passa em teste sequencial mesmo quando a condição atômica é removida. Aqui a garantia é estrutural — nenhum código de aplicação pode esquecê-la.
- **Trade-off**: O índice único só cobre `start` idêntico, então o **encaixe** do operador (agendamento fora da grade, permitido por decisão do usuário) continua dependendo de checagem de sobreposição por consulta, que é racy entre dois operadores simultâneos — aceito por ser ação humana de baixa concorrência, enquanto o caminho da IA (o de alta concorrência) fica 100% coberto. `packages/db` ganha sua terceira peça de lógica de negócio compartilhada, confirmando que esse pacote deixou de ser só "models + tenantScoped"; uma feature futura com escrita dos dois lados deve seguir o mesmo caminho em vez de duplicar.
- **Scope**: `packages/db` (`appointments`, `professionals`, `spaces`, `schedulingSettings`, `scheduling.ts`, `appointmentTransitions.ts`), `apps/crm-api`, `apps/ai-gateway`/`packages/ai-kit`, `docs/architecture.md`.
- **Date**: 2026-09-10
- **Status**: active

### AD-036
- **Decision**: Convenção de tempo do projeto, nascida em `scheduling` e válida para toda feature futura: (1) **instante** é sempre gravado em UTC, sem exceção; (2) **regra recorrente** (ex.: "seg a sex, 08:00") não é instante e não tem UTC próprio — é gravada como hora de parede (`HH:mm`) e interpretada numa constante única de exibição, `DISPLAY_TIMEZONE = 'America/Sao_Paulo'`, exportada por `packages/db/src/scheduling.ts`; (3) a conversão hora de parede ↔ instante resolve o offset pelo `Intl.DateTimeFormat` com `timeZoneName: 'longOffset'` **na data alvo**, em duas passadas, nunca por offset fixo em string; (4) a conversão para horário local acontece só na borda de apresentação (tela e texto que a IA envia), em nenhuma outra camada. `contextBuild.ts` passa a importar `DISPLAY_TIMEZONE` em vez de repetir a string `'America/Sao_Paulo'` que já carrega hoje.
- **Reason**: Instrução literal do usuário na sessão de Discuss de `scheduling` ("evitar fuso, sempre o fuso vai ser em +0 e apenas no momento de apresentação deve ser calculado e aplicado o timezone partindo do +0"), com a ressalva técnica de que a grade semanal não é um instante — converter a regra recorrente para UTC na gravação deforma o dado (uma janela 21:00–23:00 local vira o dia seguinte em UTC e muda o dia da semana gravado, verificado por execução). O offset resolvido por `Intl` em vez de `-03:00` cravado (o que a referência DentalEase faz) mantém o cálculo correto se o horário de verão brasileiro voltar, e já funciona para outros fusos sem reescrita.
- **Trade-off**: Não existe fuso por tenant — um tenant fora do horário de Brasília (Manaus, Rio Branco) vê horários deslocados; aceito explicitamente pelo usuário. Como a matemática já resolve offset por data e por fuso nomeado, adotar fuso por tenant depois é trocar a constante por um campo, não reescrever o cálculo. Toda leitura de "agora" no domínio de agenda tem que passar pelos helpers, não por `new Date().getHours()`, sob pena de reintroduzir hora local do servidor.
- **Scope**: todo o projeto — `packages/db` (`scheduling.ts`), `packages/ai-kit` (`contextBuild.ts`), `apps/crm-api`, `apps/web`, e qualquer feature futura que grave data/hora.
- **Date**: 2026-09-10
- **Status**: active
- **Correção (fase Tasks, 2026-09-11)**: o item (2) acima dizia que `DISPLAY_TIMEZONE` é exportada por `packages/db/src/scheduling.ts`. Ao planejar as telas, o grafo de dependências mostrou que o `apps/web` depende só de `@crm/contracts`/`@crm/field-engine` e nunca de `@crm/db` — importar `packages/db` levaria Mongoose para o bundle do navegador —, e o front precisa da mesma constante para exibir horário igual ao que a IA escreve, qualquer que seja o fuso do navegador. A constante passa a ser exportada por **`packages/contracts`** (o único pacote sem dependência `@crm`, importado pelos dois backends e pelo `web`); `packages/db/src/scheduling.ts` e `contextBuild.ts` a importam de lá. Consequência de fronteira, no mesmo espírito do item (4): a API do operador recebe data e hora **em hora de parede** (`YYYY-MM-DD` + `HH:mm`) e o servidor converte para UTC com a implementação única de `packages/db`; o `apps/web` só formata UTC → exibição, nunca converte no sentido contrário.

---

## Handoff

- **Feature**: `scheduling` (feature 9 de 11) — **planejamento completo (Specify → Discuss →
  Design → Tasks); Execute NÃO iniciado**, parado por instrução do usuário. Artefatos em
  `.specs/features/scheduling/`: `context.md` (4 zonas cinzentas, todas discutidas),
  `spec.md` (40 requisitos `SCH-01..40`, 4 histórias P1 + 1 P2, todos mapeados), `design.md`
  (abordagem confirmada: lógica compartilhada em `packages/db`, bloqueio na mesma coleção com
  `kind`) e `tasks.md` (47 tasks em 9 fases).
- **Phase / Task**: Tasks concluída. Próximo: Execute a partir de T1.
- **Completed**: planejamento. Commits de docs em `feature/scheduling`: `23921e9` (context +
  spec), `dbe988e` (design + AD-035/AD-036) e o commit de tasks + correções desta sessão.
- **Decisões novas**: AD-035 (os dois apps escrevem `appointments`; índice único parcial como
  garantia de dupla reserva, em vez de checar-antes-de-gravar) e AD-036 (convenção de tempo:
  instante UTC, grade em hora de parede, `DISPLAY_TIMEZONE` em `packages/contracts` — com
  bullet de correção da fase Tasks).
- **Já verificado por execução no Design (não refazer)**: hora de parede → UTC via `Intl` em
  duas passadas; `$in` em índice parcial no mongod 8.2.6; 5 reservas concorrentes → 1 vence;
  token `apt_`+base62 sobrevive ao `guard.output` (base64url não).
- **Correções pegas na fase Tasks** (já refletidas no design): `ToolContext` ganha
  `webBaseUrl?`, porque nenhum pacote lê `process.env`; `DISPLAY_TIMEZONE` fica em `contracts`,
  não em `db`, porque o `web` não importa `db` — e a API do operador passa a receber hora de
  parede.
- **In-progress**: nenhum.
- **Next step**: revisar `tasks.md` (matriz de testes, gates, MCPs/skills) e iniciar o Execute
  com a skill `tlc-spec-driven`, lendo `implement.md` inteiro antes. As 47 tasks empacotam em 8
  lotes de ~7, então a oferta de sub-agentes (offer-then-confirm) vem antes da T1.
- **Blockers**: nenhum. Pendência herdada da feature 8 (mergeada em `main` pelo PR #8): UAT
  interativo do badge de pagamento na tela de Pedidos.
- **Uncommitted files**: `docs/architecture.md` — atualização pós-feature-8 feita fora desta
  sessão (visão geral com Asaas, `payments`/`asaasEvents`/`asaasIntegrations` na tabela de
  propriedade, fluxo de pedido e pagamento, comandos reais). Não pertence a esta feature e ficou
  fora dos commits de `scheduling` de propósito. A T47 edita o mesmo arquivo: commitar ou
  descartar essa alteração antes do Execute chegar lá.
- **Branch**: `feature/scheduling` — contém `41b5f79` (docs pós-feature-8, já em `main` pelo
  PR #9) + os commits de planejamento desta sessão, sem push. `main` está em `e61f417`.
- **Nota operacional — skill não registrada**: desde `114e0cc` a skill `tlc-spec-driven` vive
  em `.claude/tlc-spec-driven/`, fora de `.claude/skills/`, e por isso não aparece no listing —
  ler `SKILL.md` + `references/` manualmente. Lições:
  `python3 .claude/tlc-spec-driven/scripts/lessons.py`. Os `tasks.md` das features 1–8 citam o
  caminho antigo; são registro histórico, não atualizar.
