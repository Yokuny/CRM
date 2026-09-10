# Architecture Decision Records

Decisões arquiteturais deste projeto, uma por arquivo. Registradas durante a sessão de
`grill-with-docs` de 2026-09-02, antes da primeira linha de código.

Formato: contexto → decisão → consequências → alternativas consideradas.
Um ADR não se edita depois de aceito; ele é **substituído** por outro que o supersede.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm-workspaces.md) | Monorepo com pnpm workspaces | Aceito |
| [0002](0002-dois-servicos-um-mongo-sem-chamada-entre-eles.md) | Dois serviços, um MongoDB, zero chamada entre eles | Aceito |
| [0003](0003-definicao-e-valor-separados.md) | Definição e valor separados, com versões imutáveis | Aceito |
| [0004](0004-superficie-de-tools-fixa.md) | Superfície de tools fixa; schema dinâmico por tool result | Aceito |
| [0005](0005-meta-cloud-api.md) | Meta Cloud API como canal de WhatsApp | Aceito |
| [0006](0006-inbox-realtime-websocket-com-poller.md) | Inbox ao vivo: WebSocket com poller interno | Aceito |
| [0007](0007-outbox-no-mongo-com-claim-atomico.md) | Envio outbound por fila no Mongo com claim atômico | Aceito |
| [0008](0008-modelo-claude-haiku-4-5.md) | `claude-haiku-4-5` no loop conversacional | Aceito |
| [0009](0009-dois-aneis-de-tools.md) | Dois anéis de tools: dinheiro exige aprovação | Aceito |
| [0010](0010-tenant-injetado-no-servidor.md) | Tenant injetado no servidor, nunca no schema de tool | Aceito |
| [0011](0011-kanban-como-ferramenta-separada.md) | Kanban é ferramenta à parte, referencia processos | Aceito |
| [0012](0012-asaas-como-gateway.md) | Asaas como gateway de pagamento | Aceito |
| [0013](0013-evals-golden-set-e-replay.md) | Evals: golden set determinístico + replay anonimizado | Aceito |

---

## Decisões posteriores (AD-014 em diante)

As decisões tomadas durante a execução das features não ganharam arquivo aqui. O registro
completo delas (decisão, motivo, trade-off, escopo) fica no log de
[`.specs/STATE.md`](../../.specs/STATE.md#decisions). No `STATE.md`, AD-001..AD-013 são os
mesmos ADRs 0001–0013 da tabela acima.

| AD | Decisão | Data |
|---|---|---|
| [AD-014](../../.specs/STATE.md#ad-014) | Sessão de token único verificada no banco — cookie `refreshToken`, sem access token | 2026-09-02 |
| [AD-015](../../.specs/STATE.md#ad-015) | Vitest 4 como único runner de testes do monorepo | 2026-09-02 |
| [AD-016](../../.specs/STATE.md#ad-016) | E-mail globalmente único; um `User` pertence a um único `Tenant` | 2026-09-02 |
| [AD-017](../../.specs/STATE.md#ad-017) | Convenção de testes: projects `unit`/`integration`/`e2e`/`structural` e gates Quick/Full/Build | 2026-09-02 |
| [AD-018](../../.specs/STATE.md#ad-018) | `.env` único na raiz, script `dev` por app, bootstrap só por seed idempotente | 2026-09-03 |
| [AD-019](../../.specs/STATE.md#ad-019) | Motor de campos genérico por tipo de entidade (`customer` e `process`) | 2026-09-03 |
| [AD-020](../../.specs/STATE.md#ad-020) | Um único par `fieldTemplates`/`fieldTemplateVersions` discriminado por `targetType` | 2026-09-03 |
| [AD-021](../../.specs/STATE.md#ad-021) | Migração destrutiva via interface `FieldValueStore` injetada por `targetType` | 2026-09-03 |
| [AD-022](../../.specs/STATE.md#ad-022) | Bloquear registro novo contra template arquivado cabe a quem cria o registro | 2026-09-03 |
| [AD-023](../../.specs/STATE.md#ad-023) | `stages` versionado em `FieldTemplateVersion`, só para `process` | 2026-09-04 |
| [AD-024](../../.specs/STATE.md#ad-024) | Migração de valores como bulk update filtrado e idempotente, sem transação | 2026-09-04 |
| [AD-025](../../.specs/STATE.md#ad-025) | Filtro por campo dinâmico via wildcard index composto, sem desnormalizar | 2026-09-04 |
| [AD-026](../../.specs/STATE.md#ad-026) | Núcleo fixo, `values` e ponteiro de template no mesmo documento | 2026-09-04 |
| [AD-027](../../.specs/STATE.md#ad-027) | Stack de UI do `web`: Tailwind 4, ShadCN/Radix, dnd-kit, react-table | 2026-09-05 |
| [AD-028](../../.specs/STATE.md#ad-028) | Tabelas sempre server-side (paginação, ordenação e filtro manuais) | 2026-09-05 |
| [AD-029](../../.specs/STATE.md#ad-029) | Entidade validada contra o template corrente avança o ponteiro de versão a cada escrita | 2026-09-05 |
| [AD-030](../../.specs/STATE.md#ad-030) | Roteamento file-based do TanStack Router; registro via `search`, nunca `$id` | 2026-09-05 |
| [AD-031](../../.specs/STATE.md#ad-031) | CI no GitHub Actions rodando o Build gate em todo push/PR | 2026-09-07 |
| [AD-032](../../.specs/STATE.md#ad-032) | Propriedade de escrita por write-path dentro da collection | 2026-09-09 |
| [AD-033](../../.specs/STATE.md#ad-033) | Transição multi-documento compartilhada em `packages/db` (`orderTransitions.ts`) | 2026-09-09 |
| [AD-034](../../.specs/STATE.md#ad-034) | Collections de pagamento, `paymentTransitions.ts` e webhook do Asaas no `ai-gateway` | 2026-09-09 |
