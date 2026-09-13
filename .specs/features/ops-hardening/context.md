# Ops-Hardening Context

**Gathered:** 2026-09-13
**Spec:** `.specs/features/ops-hardening/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Fechar os 5 itens de dívida transversal do roadmap (seção 11) sem esperar tráfego real que ainda
não existe: pin de Node na CI, endpoint `/metrics` + dashboard-as-code, mecanismo de
retenção/LGPD implementado-mas-inativo, script de auditoria do threshold de cache de prompt
(AD-008), e scaffolding do pipeline de replay (AD-013) testado contra dado sintético/golden-set.

---

## Implementation Decisions

### O paradoxo da dependência ("uso real em produção")

- Nenhuma feature do projeto foi deployada ainda — `scheduling` (9) e `kanban-tool` (10) estão
  prontas/verificadas, ainda na branch `feature/scheduling`, sem merge em `main`.
- Decisão: dividir os 5 itens em dois grupos em vez de bloquear a feature inteira.
  - **Sem dependência real de tráfego** (fazer completo agora): pin de Node, dashboards.
  - **Scaffolding agora, dado real depois** (construir o mecanismo/pipeline testado contra dado
    sintético, sem esperar produção): replay (AD-013) e auditoria de threshold de cache (AD-008)
    — este último nem precisa de tráfego real, porque o `SYSTEM_PROMPT` é estático (`AIG-13`) e
    dá para medir hoje.
  - **Implementado mas inativo por padrão** (categoria própria, nem "pronto pra usar" nem
    "esperando dado"): retenção/LGPD — mecanismo existe e é testado, mas fica desligado até
    existir política de prazo definida.

### Escopo de "Deploy" (item 4 do roadmap)

- O roadmap junta "Deploy e pin de versão de Node na CI" numa frase só. Discutido e separado:
  - Pin de Node: nesta feature, decisão fechada (`24`).
  - Deploy real (hospedagem, DNS, secrets, provedor): **fora de escopo** — usuário confirmou
    explicitamente que faria essa feature gerar o próprio tráfego que ela diz depender, o que é
    circular. Deploy real é decisão de infra/negócio separada, sem código nesta rodada.

### Retenção/LGPD

- Usuário inicialmente hesitou entre "não implementar" e "implementar e deixar inativo" — pedida
  clarificação direta.
- Decisão final: **implementar o job de hard delete, desligado por padrão** (env flag
  `RETENTION_PURGE_ENABLED=false` default). Prazo default de 12 meses fica como constante,
  configurável, só usada quando alguém ligar a flag manualmente.
- Mecanismo: hard delete (não anonimização in-place) — mais simples, mais alinhado ao direito de
  eliminação da LGPD, aceito o custo de perder valor analítico agregado.

### Dashboards

- Não existe `/metrics` nem Grafana implantado hoje — o `prom-client` roda instrumentado
  (`dbReqResTime`, `reqResTime`) mas sem nenhum scrape point.
- Decisão: expor `GET /metrics` em `apps/crm-api` (formato Prometheus) + commitar um JSON de
  dashboard Grafana no repo (`ops/grafana/crm-api-dashboard.json`), pronto para importar quando
  houver Grafana real — sem subir nenhuma infra nova nesta rodada.

### Pin de Node na CI

- `lts/*` hoje resolve ~24.x (Active LTS); a máquina de desenvolvimento local roda 26.x (Current,
  vira LTS em ~3 semanas a partir de 2026-09-13).
- Decisão: pinar `24` (Active LTS atual, suportado até abril/2028) — sem `engine-strict`, para
  não quebrar o ambiente local que já roda 26.x.

### Agent's Discretion

- Nome exato dos comandos novos (`pnpm run replay`, script de auditoria de cache) — Design
  decide.
- Formato exato do arquivo de transcript de replay (`evals/replay/samples/*.json`) — Design
  decide o schema, desde que cubra: mensagens do cliente + tools esperadas + texto final.
- Mecanismo exato de contagem de tokens do script de auditoria (qual chamada do SDK/API da
  Anthropic) — Design decide; a única restrição fechada no spec é "contagem real, não estimativa
  por caracteres".
- Local exato do worker de retenção no código (`apps/ai-gateway/src/workers/`, mesmo padrão do
  `reaper.ts`) — Design confirma a colocação exata.

### Declined / Undiscussed Gray Areas → Assumptions

- **Autenticação do `/metrics`**: não foi discutido explicitamente com o usuário. Assumido:
  segue o precedente de `/health` (sem `validToken`), registrado como "não confirmado" no spec —
  revisar quando houver deploy real (fora de escopo desta feature).
- **Campo usado como corte de retenção** (`createdAt` vs. última mensagem): não discutido em
  profundidade. Assumido `Conversation.createdAt` por simplicidade, registrado como "não
  confirmado" no spec — Design pode revisar se necessário.

---

## Specific References

Nenhuma referência de produto externa mencionada — as decisões seguem precedentes já
estabelecidos no próprio repo (`reaper.ts` como padrão de worker, `/health` como padrão de
endpoint sem auth, `evals/cases/*.int.test.ts` como padrão de golden set determinístico).

---

## Deferred Ideas

- Deploy real de produção (hospedagem, DNS, secrets, provedor) — decisão de infra/negócio
  separada, fora do escopo técnico desta feature.
- Execução do replay contra conversas reais — sem tráfego real, não há o que reprocessar; o
  pipeline fica pronto para quando houver.
- Habilitar `RETENTION_PURGE_ENABLED=true` em produção / calibrar o prazo real de retenção —
  decisão de política legal/produto, não técnica.
- Ativar `cache_control` explícito no prompt — decisão que depende do resultado do script de
  auditoria (item desta feature), tratada como ação separada se o script apontar necessidade.
- Instrumentação de métricas em `apps/ai-gateway` — hoje só `apps/crm-api` tem `prom-client`; o
  roadmap pede dashboard sobre o que "já está instrumentado", não instrumentação nova.
