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
