# Ops-Hardening Specification

## Problem Statement

O roadmap fecha 5 itens de dívida transversal (`docs/roadmap.md`, seção 11) que nenhuma feature
anterior cobriu: replay de conversas reais antes de promover prompt (AD-013), retenção/LGPD de
dado de conversa, dashboards sobre o `prom-client` já instrumentado, deploy + pin de Node na CI
(AD-031), e revisão do threshold de cache de prompt (AD-008). O roadmap amarra a "Dependência"
desta feature a "features com uso real em produção" — mas nenhuma feature do projeto foi
deployada ainda (`scheduling` e `kanban-tool` estão prontas e verificadas, ainda na branch
`feature/scheduling`, sem merge em `main`). Fechar esta feature sem resolver esse paradoxo
deixaria o projeto sem nunca poder fechar seu próprio roadmap.

## Goals

- [ ] Fechar os itens que não dependem de tráfego real (pin de Node na CI, endpoint `/metrics` +
      dashboard-as-code) prontos para uso imediato.
- [ ] Entregar o mecanismo de retenção/LGPD implementado mas inativo por padrão, pronto para ligar
      quando houver uma política de prazo definida.
- [ ] Entregar o pipeline de replay e o script de auditoria de cache como *scaffolding* — testados
      contra dado sintético/golden-set, prontos para apontar a dado real sem código novo quando
      houver tráfego de produção.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature                                                              | Reason                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Deploy real de produção (hospedagem, DNS, secrets, provedor)          | Decisão de infra/negócio maior que o escopo técnico desta rodada; usuário confirmou explicitamente que "Deploy" aqui significa só pipeline/CI, não subir ao ar. |
| Execução do replay contra conversas reais                             | Não existe tráfego real ainda. O pipeline fica pronto; apontar para exports reais é ação futura sem código novo.               |
| Habilitar `RETENTION_PURGE_ENABLED` em produção / calibrar prazo real  | Decisão de política legal/produto que o usuário explicitamente adiou; a feature entrega o mecanismo desligado por padrão.       |
| Ativar `cache_control` explícito no prompt                            | AD-008 pede só a revisão do limiar; ativar cache manual é uma mudança de comportamento/custo separada, decidida depois com base no resultado do script de auditoria. |
| Instrumentação de métricas em `apps/ai-gateway`                       | O roadmap fala em dashboards sobre o `prom-client` "já instrumentado" — hoje só `apps/crm-api` tem instrumentação; adicionar a `ai-gateway` é instrumentação nova, não hardening do que existe. |
| `engine-strict` bloqueando instalação em Node divergente da pinada    | Quebraria o ambiente de desenvolvimento atual (Node 26.x local vs. 24.x pinado); o pin fica como alvo documentado de CI/produção, não enforcement duro local. |

---

## Assumptions & Open Questions

Toda ambiguidade foi resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision                                                                 | Chosen default                                                                 | Rationale                                                                                                    | Confirmed? |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Escopo de "Deploy" no roadmap                                                          | Só pipeline/CI (pin de Node); sem subir infra ao ar                              | Confirmado com o usuário — evita a circularidade de precisar desta feature para justificar o deploy que a gera. | y          |
| Tratamento de replay (AD-013) e revisão de threshold (AD-008)                          | Scaffolding agora, contra dado sintético/golden-set; aponta pra dado real depois | Confirmado com o usuário — nenhum dos dois precisa esperar tráfego real para existir como mecanismo testável.   | y          |
| Escopo de retenção/LGPD                                                                | Implementar o job de hard delete, mas desligado por padrão (flag off)            | Confirmado com o usuário — período real ainda não definido por política legal/produto.                          | y          |
| Prazo default de retenção (usado só quando a flag for ligada manualmente)               | 12 meses (constante, configurável)                                                | Confirmado com o usuário como default recomendado.                                                              | y          |
| Mecanismo de expurgo                                                                    | Hard delete (não anonimização in-place)                                          | Confirmado com o usuário.                                                                                        | y          |
| Formato de entrega de dashboards                                                       | Endpoint `/metrics` + JSON de dashboard Grafana versionado no repo               | Confirmado com o usuário — sem Grafana implantado ainda, dashboard-as-code evita infra nova nesta rodada.       | y          |
| Versão de Node pinada na CI                                                             | `24` (Active LTS atual)                                                          | Confirmado com o usuário.                                                                                        | y          |
| `/metrics` sem autenticação                                                             | Segue o precedente de `/health` (sem `validToken`)                               | Não há camada de rede/deploy ainda para proteger por infra; revisar quando houver deploy real (fora de escopo). | não confirmado |
| Corte de retenção usa `Conversation.createdAt` (não `updatedAt`/última mensagem)        | Início da conversa marca o relógio de retenção                                   | Mais simples de indexar/consultar; alternativa (última mensagem) fica para o Design se necessário.              | não confirmado |
| Contagem de tokens do script de auditoria de cache usa a API/SDK real da Anthropic (chamada de rede, sob demanda, fora do `pnpm check`) | Contagem real, não estimativa por caracteres | Nenhum tokenizer offline está no projeto hoje; estimativa por caracteres seria imprecisa para uma decisão de limiar binário. | não confirmado |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Pin de versão de Node na CI ⭐ MVP

**User Story**: Como mantenedor do projeto, quero que a CI use uma versão de Node fixa (não
`lts/*`) para que uma atualização automática de LTS não mude o comportamento da build sem aviso.

**Why P1**: Menor risco, zero ambiguidade, fecha o gap nomeado no trade-off do AD-031 sem tocar
em nenhum outro sistema.

**Acceptance Criteria**:

1. **(OPS-01)** WHEN o workflow `.github/workflows/ci.yml` executa `actions/setup-node` THEN o
   sistema SHALL usar `node-version: '24'` fixo, não `lts/*`.
2. **(OPS-02)** WHEN o `package.json` da raiz é lido por qualquer gerenciador de pacotes THEN o
   sistema SHALL declarar `engines.node` compatível com a major 24 (ex.: `>=24 <25`), como aviso
   não-bloqueante (sem `engine-strict`) — instalar numa major diferente localmente continua
   funcionando, só emite aviso.

**Independent Test**: Diff do `ci.yml` mostra `node-version: '24'`; rodar `pnpm install`
localmente numa major diferente da 24 emite warning do gerenciador de pacotes, não erro.

---

### P1: Endpoint `/metrics` + dashboard-as-code ⭐ MVP

**User Story**: Como responsável por operação, quero um endpoint Prometheus e um dashboard
pronto para importar, para enxergar latência HTTP e de banco assim que houver um Grafana
apontando para o `crm-api`.

**Why P1**: O instrumento (`dbReqResTime`, `reqResTime`) já existe e está parado sem nenhum
scrape point — é o menor esforço com maior valor de observabilidade imediata.

**Acceptance Criteria**:

1. **(OPS-03)** WHEN `GET /metrics` é chamado em `apps/crm-api` THEN o sistema SHALL responder
   `200` com o corpo gerado pelo `register.metrics()` do `prom-client` (formato de exposição
   Prometheus), incluindo as séries já registradas (`db_operation_duration_seconds`,
   `http_request_duration_seconds`).
2. **(OPS-04)** WHEN `/metrics` é chamado THEN o sistema SHALL responder sem exigir o middleware
   `validToken` (mesmo padrão não-autenticado de `/health` — ver Assumptions).
3. **(OPS-05)** WHEN `/metrics` é chamado antes de qualquer requisição ter passado pelo
   middleware `responseTime` THEN o sistema SHALL responder normalmente com os histogramas vazios
   (sem séries populadas ainda), nunca erro.
4. **(OPS-06)** WHEN o JSON de dashboard versionado no repo (`ops/grafana/crm-api-dashboard.json`)
   é importado num Grafana apontando para uma instância Prometheus que faz scrape do `crm-api`
   THEN o painel SHALL exibir no mínimo 3 gráficos: (a) latência HTTP p50/p95 por rota, (b) taxa
   de erro HTTP (`status_code >= 500`) por rota, (c) latência de operação de banco por `operation`.
5. **(OPS-07)** WHEN nenhum Prometheus está de fato fazendo scrape (estado atual, sem deploy)
   THEN a importação do dashboard SHALL funcionar mesmo assim — painéis carregam vazios, nunca
   erro de importação.

**Independent Test**: Subir `crm-api` localmente, `GET /metrics` manualmente e conferir presença
das duas métricas no corpo da resposta; importar o JSON num Grafana local (docker) e confirmar os
3 painéis renderizando sem erro (vazios, por falta de scrape real).

---

### P2: Retenção/LGPD — mecanismo de expurgo desligado por padrão

**User Story**: Como responsável por compliance, quero o mecanismo de expurgo de dado de
conversa pronto e testado, mas desligado, para poder ligá-lo assim que o prazo de retenção for
decidido formalmente — sem esperar por uma nova rodada de desenvolvimento.

**Why P2**: Fecha o "N/A explícito" deixado pela feature `ai-gateway`, mas não é urgente: sem
tráfego real, não há dado de conversa real para expurgar ainda.

**Acceptance Criteria**:

1. **(OPS-08)** WHEN a env var `RETENTION_PURGE_ENABLED` não está definida ou é `"false"`
   (default) THEN o worker de expurgo SHALL não iniciar nenhum agendamento automático — nenhum
   documento é excluído por este mecanismo.
2. **(OPS-09)** WHEN `RETENTION_PURGE_ENABLED="true"` THEN o worker SHALL rodar periodicamente
   (mesmo padrão de `startReaper`: `intervalMs` configurável) chamando uma função pura que
   hard-deleta `Conversation`, `Message` e `AiSession` cujo `Conversation.createdAt` seja mais
   antigo que o `retentionMs` configurado (default: constante de 12 meses).
3. **(OPS-10)** WHEN uma `Conversation` é excluída pelo expurgo THEN todo `Message` e `AiSession`
   vinculados a ela SHALL ser excluído junto, na mesma execução — nenhum `Message`/`AiSession`
   órfão permanece.
4. **(OPS-11)** WHEN o expurgo roda e não há nenhuma `Conversation` vencida THEN o sistema SHALL
   retornar 0 exclusões sem erro (idempotente — seguro rodar a qualquer intervalo).
5. **(OPS-12)** WHEN o expurgo encontra um erro ao excluir um lote THEN o sistema SHALL logar o
   erro (mesmo padrão de `reaper.tick_failed`) e continuar tentando no próximo tick, sem derrubar
   o processo.

**Independent Test**: Teste de integração com `MongoMemoryServer` — criar `Conversation`s com
`createdAt` antigo e recente, chamar a função de expurgo diretamente (sem depender do
`setInterval`) e verificar contagem + cascata; testar que com a flag desligada, iniciar o worker
não agenda nenhum `setInterval` (nenhuma exclusão ocorre mesmo esperando um tick).

---

### P2: Auditoria do threshold de cache de prompt (AD-008)

**User Story**: Como mantenedor do `ai-kit`, quero um script que meça o tamanho real do prompt
congelado e sinalize quando ele se aproximar do teto de cache, para que trocar de modelo
(`claude-haiku-4-5` → `claude-opus-5`) não seja uma aposta sobre custo.

**Why P2**: Item concreto e barato — o prompt é estático (`AIG-13`, nunca interpolado), então dá
para medir hoje sem esperar nenhum dado real.

**Acceptance Criteria**:

1. **(OPS-13)** WHEN o script de auditoria roda THEN o sistema SHALL calcular a contagem real de
   tokens (não estimativa por caracteres) do `SYSTEM_PROMPT` (`contextBuild.ts`) somado aos
   `input_schema` de todas as tools em `TOOL_DEFINITIONS` (`toolDefinitions.ts`).
2. **(OPS-14)** WHEN o total calculado é `>= 4096` THEN o script SHALL sair com código de saída
   não-zero e uma mensagem recomendando revisar `cache_control` explícito (AD-008).
3. **(OPS-15)** WHEN o total calculado é `< 4096` THEN o script SHALL sair com código `0` e
   reportar o número exato calculado (nunca só "ok" sem o valor).
4. **(OPS-16)** WHEN a chamada de contagem de tokens falha (rede indisponível, API key ausente)
   THEN o script SHALL sair com um erro claro que identifica falha de rede/configuração, distinto
   da mensagem de "acima do limite".

**Independent Test**: Rodar o script localmente contra o prompt atual (deve reportar bem abaixo
de 4096, exit `0`); em teste unitário, injetar uma contagem de tokens sintética `>= 4096` (mesmo
padrão de `AnthropicClient` injetável — a lógica de limiar nunca chama a API real em teste) e
confirmar exit não-zero; injetar uma falha simulada de rede e confirmar a mensagem de erro
distinta.

---

### P3: Scaffolding do pipeline de replay (AD-013)

**User Story**: Como mantenedor do `ai-kit`, quero o pipeline de anonimização + replay pronto e
testado contra dado sintético, para que promover uma mudança de prompt no futuro seja só apontar
o runner para exports reais anonimizados — sem escrever infraestrutura nova naquele momento.

**Why P3**: É o item mais especulativo dos 5 — mais complexo de construir e o que menos entrega
valor até existir conversa real para de fato revelar uma regressão de comportamento.

**Acceptance Criteria**:

1. **(OPS-17)** WHEN um arquivo de transcript existe em `evals/replay/samples/*.json` (formato:
   sequência de mensagens do cliente + sequência esperada de tool calls/textos, mesmo espírito do
   golden set) THEN o runner de replay SHALL reprocessá-lo contra `runTurn` real (client Anthropic
   REAL — um client FAKE nunca detecta mudança de comportamento de prompt, ver design.md) e
   produzir um relatório por transcript com as tools chamadas (nome + ordem) e o texto final de
   saída.
2. **(OPS-18)** WHEN o relatório do replay é comparado a uma baseline salva anteriormente
   (`evals/replay/baselines/*.json`) THEN o sistema SHALL sinalizar quais transcripts tiveram
   divergência de comportamento (tool diferente, ordem diferente, tool esperado ausente) — sem
   depender de julgamento de LLM (ADR-0013: correção nunca depende de LLM-judge).
3. **(OPS-19)** WHEN nenhuma baseline existe ainda para um transcript (primeira execução) THEN o
   sistema SHALL gravar o resultado atual como baseline inicial, sem reportar divergência.
4. **(OPS-20)** WHEN a função de anonimização recebe um texto contendo padrões de telefone
   brasileiro, nome completo e CPF/CNPJ THEN o sistema SHALL substituí-los por placeholders (ex.:
   `[TELEFONE]`, `[NOME]`, `[DOCUMENTO]`) antes de qualquer gravação em `evals/replay/`.
5. **(OPS-21)** WHEN um transcript de replay referencia uma tool que não existe mais em
   `TOOL_DEFINITIONS` THEN o runner SHALL reportar esse transcript como quebrado/desatualizado,
   sem abortar o processamento dos demais transcripts do lote.
6. **(OPS-22)** WHEN o runner de replay roda (comando novo, ex.: `pnpm run replay`) THEN sua
   execução SHALL ficar fora do gate de CI (`pnpm run check`) — replay não é golden set, roda sob
   demanda antes de promover um prompt novo (ADR-0013).

**Independent Test**: Criar 1-2 transcripts sintéticos de exemplo em `evals/replay/samples/`,
rodar o runner localmente e confirmar relatório + baseline gravados; alterar deliberadamente o
`SYSTEM_PROMPT` num teste isolado (fixture, nunca o prompt real de produção) e confirmar que o
runner aponta divergência vs. baseline; teste unitário de `anonymizeTranscript` com PII
inteiramente sintética (nunca dado real).

---

## Edge Cases

- WHEN o expurgo está habilitado mas o Mongo está indisponível no tick THEN o sistema SHALL
  logar o erro e tentar de novo no próximo intervalo, sem derrubar o processo.
- WHEN a chamada de contagem de tokens à API Anthropic falha (rede/chave ausente) THEN o script
  de auditoria SHALL sair com um erro claro e distinto do erro de "acima do limite" (ver AC4 da
  história de auditoria).
- WHEN um transcript de replay referencia uma tool que não existe mais THEN o runner SHALL
  reportar esse transcript isoladamente, sem abortar os demais (ver AC5 da história de replay).
- WHEN `/metrics` é chamado antes de qualquer tráfego passar pela aplicação THEN o sistema SHALL
  responder normalmente com histogramas vazios, nunca erro (ver AC3 da história de dashboards).

---

## Requirement Traceability

| Requirement ID | Story                                  | Phase  | Status       | Task(s)        |
| --------------- | --------------------------------------- | ------ | ------------- | -------------- |
| OPS-01          | P1: Pin de Node na CI                  | Tasks  | ✅ Verified  | T1             |
| OPS-02          | P1: Pin de Node na CI                  | Tasks  | ✅ Verified  | T1             |
| OPS-03          | P1: Endpoint `/metrics` + dashboard    | Tasks  | ✅ Verified  | T2             |
| OPS-04          | P1: Endpoint `/metrics` + dashboard    | Tasks  | ✅ Verified  | T2             |
| OPS-05          | P1: Endpoint `/metrics` + dashboard    | Tasks  | ✅ Verified  | T2             |
| OPS-06          | P1: Endpoint `/metrics` + dashboard    | Tasks  | ✅ Verified  | T3             |
| OPS-07          | P1: Endpoint `/metrics` + dashboard    | Tasks  | ✅ Verified  | T3             |
| OPS-08          | P2: Retenção/LGPD (expurgo inativo)    | Tasks  | ✅ Verified  | T4, T7         |
| OPS-09          | P2: Retenção/LGPD (expurgo inativo)    | Tasks  | ✅ Verified  | T5, T7         |
| OPS-10          | P2: Retenção/LGPD (expurgo inativo)    | Tasks  | ✅ Verified  | T5             |
| OPS-11          | P2: Retenção/LGPD (expurgo inativo)    | Tasks  | ✅ Verified  | T5             |
| OPS-12          | P2: Retenção/LGPD (expurgo inativo)    | Tasks  | ✅ Verified  | T6             |
| OPS-13          | P2: Auditoria de threshold de cache    | Tasks  | ✅ Verified  | T9             |
| OPS-14          | P2: Auditoria de threshold de cache    | Tasks  | ✅ Verified  | T8             |
| OPS-15          | P2: Auditoria de threshold de cache    | Tasks  | ✅ Verified  | T8             |
| OPS-16          | P2: Auditoria de threshold de cache    | Tasks  | ✅ Verified  | T9             |
| OPS-17          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T12            |
| OPS-18          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T12            |
| OPS-19          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T12            |
| OPS-20          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T11            |
| OPS-21          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T12            |
| OPS-22          | P3: Scaffolding de replay              | Tasks  | ✅ Verified  | T13            |

**ID format:** `OPS-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 22 total, 22 mapped to tasks, 0 unmapped. Verified by independent Verifier sub-agent
— see `.specs/features/ops-hardening/validation.md` (OPS-13/OPS-16 carry a documented coverage
caveat: correct by code inspection, no automated test for the CLI-wiring branch — not a functional
gap).

---

## Success Criteria

Como saberemos que a feature foi bem-sucedida:

- [ ] CI roda em Node `24` fixo; `pnpm run check` continua verde.
- [ ] `GET /metrics` responde com as métricas existentes; o JSON de dashboard importa sem erro
      num Grafana local.
- [ ] O job de expurgo existe, é testado, e comprovadamente não roda nada com a flag no default
      (`false`).
- [ ] O script de auditoria de cache roda contra o prompt atual e reporta um número exato,
      abaixo de 4096.
- [ ] O runner de replay processa os transcripts sintéticos de exemplo e produz relatório +
      baseline, sem tocar em nenhum dado real (porque nenhum existe ainda).
