# Foundation: Tenancy & Auth — Specification

**Escopo:** Large · **Fase seguinte:** Design (arquitetura + componentes) → Tasks → Execute

## Problem Statement

Não existe projeto ainda. Toda feature do roadmap — motor de campos dinâmicos, CRM, canal
de WhatsApp, harness de IA — depende de três coisas que ainda não existem: o workspace do
monorepo, o modelo de tenant com injeção server-side, e a sessão autenticada que carrega
`Tenant` e `role`. Sem isso, nada mais pode ser especificado sem inventar fundação.

Esta feature entrega a base mínima **demo-ável**: a plataforma provisiona um tenant,
convida o primeiro admin, ele completa o cadastro, entra e vê o CRM vazio com o nome da
empresa dele. Nenhuma outra feature começa antes disso fechar.

## Goals

- [ ] Monorepo pnpm com os 3 apps e 2 dos 4 packages (`contracts`, `db`) rodando `pnpm check` limpo
- [ ] `Tenant` presente e obrigatório em todo model criado a partir daqui, injetado por middleware
- [ ] Login funcional end-to-end: provisionar → convidar → aceitar → autenticar → ver o app
- [ ] Autorização por papel (`admin`, `gestor`, `operador`) aplicável em qualquer rota
- [ ] Teste estrutural de isolamento entre tenants rodando no CI desde o primeiro dia

## Out of Scope

| Feature | Motivo |
| --- | --- |
| Passkey / WebAuthn | Decidido: subsistema inteiro que atrasaria a fundação da qual tudo depende |
| Self-service signup | Decidido: tenant é provisionado por convite (o canal WhatsApp exige setup manual na Meta) |
| Motor de campos dinâmicos | Feature 2 (`dynamic-field-engine`) |
| Telas de CRM, `DataTable`, sistema de layout, i18n completo | Feature 4 (`crm-web-shell`) — aqui só o mínimo para o slice ser vertical |
| `packages/field-engine` e `packages/ai-kit` | Criados vazios ou nem criados; sem código nesta feature |
| Recuperação de senha | Feature própria depois; o convite já cobre o primeiro acesso |
| Billing / assinatura da plataforma | Fora do roadmap atual |
| Métricas Prometheus/Grafana completas | Só o instrumento base (`dbReqResTime`); dashboards depois |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Racional | Confirmado? |
| --- | --- | --- | --- |
| Escopo de auth | Porte do DentalEase sem passkey: sessão em cookie httpOnly com device binding, verificada no banco a cada request (revisado no Design — ver AD-014; a redação original citava um access token separado, descartado por não poupar leitura) | Padrão já provado em `authentication.middleware.ts`; passkey é subsistema à parte | **sim** |
| Entrada de Tenant | Convite — plataforma provisiona o tenant e convida o primeiro admin | Casa com 1 número de WhatsApp por tenant, que exige setup manual na Meta | **sim** |
| Papéis | `admin`, `gestor`, `operador` | Quem aprova venda (gestor) não é necessariamente quem administra o sistema | **sim** |
| A feature inclui front-end? | Sim, o mínimo: login, aceitar-convite e shell autenticado com nome do tenant | O tip da skill exige P1 = fatia vertical demo-ável; o shell completo continua na feature 4 | **sim** (Design) |
| Quem é "admin da plataforma"? | Um flag `isPlatformAdmin` no `User`, sem tenant vinculado — não um papel dentro de tenant | Evita criar um segundo sistema de identidade só para provisionar | **sim** (Design) |
| Identificação do Tenant na URL | Nenhuma — o tenant vem sempre do token, nunca de path ou subdomínio | AD-010: tenant jamais aceito de entrada controlável pelo cliente | **sim** (conformidade AD-010) |
| Hash de senha | bcrypt (cost 10), como no DentalEase | Consistência com o stack existente; sem motivo para divergir | **sim** (Design) |
| Idioma das mensagens de erro | pt-BR, padrão `{ success, data?, message? }` | Consistência com o back-end de referência | **sim** (Design) |
| Modelo de sessão | Token único DB-verificado; sem access token separado (AD-014) | FND-05 obriga leitura do banco em todo request, o que anula o ganho do access token | **sim** (Design) |
| Unicidade de e-mail | Global; um `User` pertence a um único `Tenant` (AD-016) | `POST /auth/signin` recebe só e-mail e senha e nenhum AC prevê seletor de empresa. Satisfaz o AC4 de P1-1 e não deixa o login ambíguo | **sim** (Design) |
| Runner de testes | Vitest 4 em workspace, um gate para tudo (AD-015) | Cobre back-ends, packages isomórficos e `web` sem ts-jest nem atrito de ESM | **sim** (Design) |

**Open questions:** nenhuma — tudo resolvido ou registrado acima.

---

## Varredura de dimensões implícitas

Escopo Large: toda dimensão resolve em requisito ou `N/A` explícito.

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada & limites | FND-11 — Zod em todo body/params/query; limites de nome, e-mail e senha |
| Falha / falha parcial | FND-12 — usuário criado mas e-mail falhou não bloqueia; convite reenviável |
| Idempotência / retry / duplicata | FND-13 — convite repetido para o mesmo e-mail reaproveita; token de convite é uso único |
| Fronteiras de auth & rate limit | FND-14 — rate limit em login e em convite; só `admin` convida |
| Concorrência / ordenação | FND-15 — aceite concorrente do mesmo convite resolve em um único usuário |
| Ciclo de vida / expiração | FND-16 — TTL de convite (7 dias) e de refresh token; limpeza de tokens revogados |
| Observabilidade | FND-17 — métrica de latência por operação de banco; log estruturado em anomalia de auth |
| Falha de dependência externa | FND-18 — SMTP indisponível não derruba a operação; Mongo indisponível falha o boot com erro claro |
| Integridade de transição de estado | FND-19 — máquinas de estado de `Tenant` e `Invite` com transições guardadas |

---

## User Stories

### P1: Plataforma provisiona um Tenant e convida o primeiro admin ⭐ MVP

**User Story:** Como admin da plataforma, quero provisionar uma empresa e convidar o
primeiro administrador dela, para que ela possa começar a usar o sistema.

**Why P1:** É o único caminho de entrada no sistema. Sem ele não existe tenant, e sem
tenant nenhuma outra feature tem onde escrever.

**Acceptance Criteria**

1. WHEN um admin da plataforma envia nome e documento de uma empresa THEN o sistema SHALL criar um `Tenant` com `status: 'provisioned'` e devolver seu id.
2. WHEN um admin da plataforma convida um e-mail para um `Tenant` THEN o sistema SHALL criar um `Invite` com token opaco, papel `admin`, `status: 'pending'` e expiração em 7 dias, e disparar o e-mail.
3. WHEN um usuário **sem** `isPlatformAdmin` tenta provisionar um Tenant THEN o sistema SHALL responder 403 sem criar nada.
4. WHEN o e-mail convidado já pertence a um usuário **deste mesmo** Tenant THEN o sistema SHALL responder 409 e não criar convite duplicado.

**Independent Test:** com um usuário `isPlatformAdmin` semeado, chamar provisionar + convidar e ver o `Invite` gravado com token e expiração; repetir a chamada e receber 409.

---

### P1: Convidado completa o cadastro e obtém sessão ⭐ MVP

**User Story:** Como pessoa convidada, quero definir minha senha pelo link do convite e
entrar no sistema, para começar a trabalhar na minha empresa.

**Why P1:** Fecha o caminho de entrada. Sem isso o convite não vira usuário.

**Acceptance Criteria**

1. WHEN o convidado abre o link com um token `pending` e não expirado THEN o sistema SHALL devolver o nome do Tenant e o e-mail convidado, **sem** exigir autenticação.
2. WHEN o convidado envia nome e senha válidos com um token `pending` THEN o sistema SHALL criar o `User` com o `Tenant` e o papel do convite, marcar o convite como `accepted` e abrir sessão.
3. WHEN o token está expirado, já `accepted` ou não existe THEN o sistema SHALL responder 410 com mensagem que distingue expirado de inválido, sem revelar o e-mail associado.
4. WHEN a senha não atinge o mínimo de 8 caracteres THEN o sistema SHALL responder 400 e não criar o usuário.

**Independent Test:** aceitar um convite e receber cookie de refresh; reusar o mesmo token e receber 410.

---

### P1: Sessão autenticada carrega Tenant e papel ⭐ MVP

**User Story:** Como usuário autenticado, quero que toda requisição minha já saiba a que
empresa pertenço e o que posso fazer, para que nenhuma rota precise perguntar isso.

**Why P1:** É o contrato que todas as features seguintes consomem. Errar aqui contamina o
projeto inteiro (AD-010).

**Acceptance Criteria**

1. WHEN uma requisição chega com refresh token válido em cookie httpOnly THEN o sistema SHALL popular `req.tenantUser = { tenant, user, role[] }` a partir do **banco**, não apenas do payload do token.
2. WHEN o `user-agent` da requisição difere do registrado para aquele token THEN o sistema SHALL revogar **todos** os refresh tokens do usuário, registrar log estruturado e responder 401.
3. WHEN um corpo de requisição contém um campo `Tenant`, `tenantId` ou `orgId` THEN o sistema SHALL ignorá-lo — o tenant vem exclusivamente da sessão.
4. WHEN um usuário sem `Tenant` vinculado acessa rota que exige tenant THEN o sistema SHALL responder 424 com mensagem orientando concluir o vínculo.
5. WHEN o papel do usuário não está na lista permitida da rota THEN o sistema SHALL responder 403 antes de qualquer acesso a dados.
6. WHEN dois tenants têm dados espelhados THEN nenhuma rota SHALL devolver registro de tenant diferente do da sessão.

**Independent Test:** teste de integração com dois tenants espelhados afirmando zero cruzamento; teste que envia `Tenant` forjado no body e confirma que foi ignorado.

---

### P1: Front-end mínimo prova a fatia vertical ⭐ MVP

**User Story:** Como convidado, quero abrir o link, definir senha, entrar e ver o nome da
minha empresa na tela, para saber que estou dentro do sistema certo.

**Why P1:** Sem tela, a fundação não é demo-ável e o contrato de sessão não foi exercido
de ponta a ponta.

**Acceptance Criteria**

1. WHEN o convidado abre a rota pública de aceite com token válido THEN a UI SHALL exibir o nome do Tenant e o e-mail, e o formulário de nome e senha.
2. WHEN o login é bem-sucedido THEN a UI SHALL redirecionar para a área privada e exibir o nome do Tenant e o papel do usuário.
3. WHEN a sessão expira ou é revogada THEN a UI SHALL redirecionar para o login sem loop de redirecionamento.
4. WHEN uma requisição falha THEN a UI SHALL exibir a `message` do padrão de resposta, nunca um erro cru.

**Independent Test:** rodar `pnpm dev` nos três apps e percorrer convite → senha → área privada no navegador.

---

### P2: Admin do tenant gerencia usuários

**User Story:** Como admin de um Tenant, quero convidar e desativar pessoas da minha
empresa e definir o papel de cada uma.

**Why P2:** Um tenant funciona com um único admin no dia 1; gestão de equipe é a segunda
necessidade, não a primeira.

**Acceptance Criteria**

1. WHEN um `admin` convida um e-mail com papel `gestor` ou `operador` THEN o sistema SHALL criar o convite escopado ao Tenant dele.
2. WHEN um `gestor` ou `operador` tenta convidar THEN o sistema SHALL responder 403.
3. WHEN um `admin` desativa um usuário THEN o sistema SHALL revogar todos os refresh tokens dele e impedir novo login.
4. WHEN um `admin` tenta desativar a si mesmo sendo o último admin ativo do Tenant THEN o sistema SHALL responder 409 e manter o acesso.

**Independent Test:** convidar como `admin` (sucesso) e como `operador` (403); desativar o último admin e receber 409.

---

### P2: Encerrar sessão e revogar acessos

**User Story:** Como usuário, quero sair do sistema e poder derrubar todas as minhas
sessões, para não deixar acesso aberto em máquina que não é minha.

**Acceptance Criteria**

1. WHEN o usuário faz logout THEN o sistema SHALL remover **aquele** refresh token e limpar o cookie.
2. WHEN o usuário pede "sair de todos os dispositivos" THEN o sistema SHALL remover todos os refresh tokens dele.
3. WHEN um refresh token removido é reapresentado THEN o sistema SHALL responder 401 e registrar log estruturado da tentativa.

**Independent Test:** logar em dois user-agents, derrubar todos, e confirmar 401 nos dois.

---

### P3: Suspender e reativar um Tenant

**User Story:** Como admin da plataforma, quero suspender uma empresa inadimplente sem
apagar os dados dela.

**Acceptance Criteria**

1. WHEN um Tenant está `suspended` THEN toda rota de tenant SHALL responder 402, exceto login e logout.
2. WHEN o Tenant volta a `active` THEN o acesso SHALL ser restaurado sem nova autenticação dos usuários.

---

## Edge Cases

- WHEN dois pedidos aceitam o mesmo convite simultaneamente THEN o sistema SHALL criar exatamente um usuário e responder 410 ao segundo (índice único no token + transição guardada).
- WHEN o convite é reenviado para um e-mail com convite `pending` THEN o sistema SHALL invalidar o token anterior e emitir um novo, nunca deixar dois válidos.
- WHEN o SMTP está indisponível no convite THEN o sistema SHALL persistir o convite, responder 202 informando que o envio falhou, e expor reenvio — nunca perder o convite criado.
- WHEN o Mongo está indisponível no boot THEN o processo SHALL falhar com mensagem explícita, não subir aceitando tráfego.
- WHEN o cookie de refresh chega ausente e o header `Authorization` presente THEN o sistema SHALL aplicar a mesma verificação de device antes de aceitar.
- WHEN uma variável de ambiente obrigatória falta THEN o boot SHALL falhar na validação Zod do `env`, nomeando a variável.
- WHEN o e-mail do convite difere em caixa (`A@x.com` vs `a@x.com`) THEN o sistema SHALL tratar como o mesmo e-mail (normalização em minúsculas).

---

## Requirement Traceability

| ID | Story | Fase | Status |
| --- | --- | --- | --- |
| FND-01 | P1: Provisionar Tenant | Tasks | Designed |
| FND-02 | P1: Convidar primeiro admin | Tasks | Designed |
| FND-03 | P1: Aceitar convite e criar usuário | Tasks | Designed |
| FND-04 | P1: Login e emissão de sessão | Tasks | Designed |
| FND-05 | P1: Injeção de `tenantUser` a partir do banco | Tasks | Designed |
| FND-06 | P1: Device binding e revogação em cascata | Tasks | Designed |
| FND-07 | P1: Tenant nunca aceito de entrada externa | Tasks | Designed |
| FND-08 | P1: Autorização por papel | Tasks | Designed |
| FND-09 | P1: Isolamento entre tenants provado por teste | Tasks | Designed |
| FND-10 | P1: Front mínimo — aceite, login, shell | Tasks | Designed |
| FND-11 | Dimensão: validação de entrada | Tasks | Designed |
| FND-12 | Dimensão: falha parcial no convite | Tasks | Designed |
| FND-13 | Dimensão: idempotência de convite | Tasks | Designed |
| FND-14 | Dimensão: rate limit em login e convite | Tasks | Designed |
| FND-15 | Dimensão: aceite concorrente | Tasks | Designed |
| FND-16 | Dimensão: TTL de convite e token | Tasks | Designed |
| FND-17 | Dimensão: métrica e log de anomalia | Tasks | Designed |
| FND-18 | Dimensão: SMTP e Mongo indisponíveis | Tasks | Designed |
| FND-19 | Dimensão: transições de `Tenant` e `Invite` | Tasks | Designed |
| FND-20 | P2: Gestão de usuários pelo admin do tenant | — | Fora do escopo da execução (costura documentada no design) |
| FND-21 | P2: Logout e revogação | — | Fora do escopo da execução (costura documentada no design) |
| FND-22 | P3: Suspender e reativar Tenant | — | Fora do escopo da execução (costura documentada no design) |

**Cobertura:** 22 requisitos · 19 desenhados (FND-01..19, aguardando Tasks) · 3 fora do escopo de execução desta feature (FND-20..22)

---

## Success Criteria

- [ ] `pnpm check` e `pnpm run format` limpos nos 3 apps e 2 packages
- [ ] `docker compose up` sobe Mongo e os serviços; `/health` responde nos dois back-ends
- [ ] Percurso convite → senha → login → área privada funciona no navegador
- [ ] Teste de dois tenants espelhados prova zero cruzamento de dados
- [ ] Teste estrutural varre `input_schema`/bodies e falha se algum aceitar campo de tenant
- [ ] Aceite concorrente do mesmo convite gera exatamente um usuário sob teste de corrida
- [ ] Nenhum model Mongoose declarado fora de `packages/db`
