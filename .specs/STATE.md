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

---

## Handoff

- **Feature**: `dynamic-field-engine` (.specs/features/dynamic-field-engine) — feature 2 de 11, **Execute completo, Verifier PASS**. `crm-core` (.specs/features/crm-core, feature 3) é a próxima — ainda só Specify, e depende desta feature estar pronta (está).
- **Phase / Task**: Execute concluído (T1..T20, 3 batches de sub-agentes) + ciclo fix→re-verify de 1 iteração. Verifier independente (author ≠ verifier) rodou 2 vezes: iteração 1 achou 8 gaps ranqueados (2 Blocker, 4 Major, 2 Minor) via sensor de discriminação (16 mutações, 12 mortas/4 sobreviventes); 7 fix tasks fecharam os 6 gaps acionáveis (2 Minor ficaram como deferral documentado — `SPEC_DEVIATION` para `reference`/`target`, resolução em `crm-core`); iteração 2 confirmou os 4 mutantes antes sobreviventes agora mortos, 7/7 fixes genuínos, zero regressão. **PASS final.** `spec.md` traceability FLD-01..19 → Execute/Verified; Goals e Success Criteria marcados.
- **Completed**: Specify + Discuss (AD-019) → Design (AD-020, AD-021, confirmados com o usuário) → Tasks (20 tasks/6 fases) → Execute (T1..T20) → Verify (2 iterações, PASS). `packages/field-engine` (motor isomórfico completo: `hydrate`/`validate`/`toToolSchema`/`diffFields`), `packages/contracts` (`fieldDefSchema` + 3 schemas de API, todos em `schemaRegistry`), `packages/db` (`FieldTemplate`/`FieldTemplateVersion` + seed idempotente), `apps/crm-api` módulo `field-template` completo (router/controller/service/repository + `providers/fieldValueStore`) montado em `buildApp()`, seed plugado em `provisionTenant` (FND-01), isolamento entre tenants estendido. AD-022 registra o deferral explícito de FLD-08/AC6 ("bloquear novo uso") para `crm-core`. 281 testes passando (era 125 antes desta feature), `pnpm check` limpo.
- **In-progress**: nenhuma — feature fechada.
- **Next step**: iniciar Design de `crm-core` (feature 3) — consome `packages/field-engine` e o módulo `field-template` como estão; implementa `Customer`/`Process` com núcleo fixo + `values`, e os adapters reais de `FieldValueStore` (substituindo o no-op via AD-021) e a enforcement de "não usar template arquivado" (via AD-022).
- **Blockers**: nenhum.
- **Uncommitted files**: nenhum — todo o Execute e Verify desta feature está commitado (`267559a`..`3cbcbcc` na branch, mais o fechamento de traceability que segue este commit).
- **Branch**: `feature/dynamic-field-engine`, pronta para merge/PR a critério do usuário — não foi pedido push nem abertura de PR nesta sessão.
