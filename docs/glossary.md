# Glossário

Linguagem ubíqua do projeto. Estes nomes são os mesmos no código, nas specs e na
conversa — se um termo aqui aparecer com outro nome numa collection, numa rota ou num
componente, é o código que está errado.

Estabelecido na sessão de `grill-with-docs` de 2026-09-02.

---

## Tenancy

**Tenant**
A empresa cliente da plataforma. Presente em toda collection como campo `Tenant`.
Injetado por middleware a partir do token (no `crm-api`) ou do `phone_number_id` do
webhook (no `ai-gateway`) — **jamais** aceito do corpo da requisição ou de input do
modelo. Ver [ADR-0010](adr/0010-tenant-injetado-no-servidor.md).

**Channel**
Vínculo entre um `phone_number_id` da Meta e um Tenant. Índice único no
`phone_number_id`: é a única rota de resolução de tenant no webhook. Guarda o token da
Meta criptografado. Um tenant tem um channel na v1.

**User**
Operador humano dentro de um Tenant. Tem `role` (admin, operador) no padrão do
`checkRole` do DentalEase.

---

## Atendimento

**Customer**
A pessoa do outro lado do WhatsApp. Núcleo **fixo** (nome, telefone, documento) mais
campos dinâmicos definidos pelo tenant. O núcleo é fixo porque o roteamento por telefone
não pode depender de um campo que o tenant possa remover.

**Conversation**
Thread com um Customer num Channel. Carrega:
- `mode`: `'bot'` ou `'human'` — quando `human`, o `ai-gateway` pula o modelo
- `assignee`: operador que assumiu
- estado da janela de 24h

**Takeover**
Ato de um operador assumir a conversa, mudando `mode` para `'human'`. Volta a `'bot'`
sozinho após N minutos ocioso, para que um takeover esquecido não mate a automação
em silêncio.

**Message**
Turno individual. `direction` (`'in'` | `'out'`), `status`
(`queued` → `sending` → `sent` → `delivered` → `read`, ou `failed`), e `wamid`.

**wamid**
Identificador da mensagem atribuído pela Meta. Chave de idempotência: a Meta reenvia
webhooks, então o mesmo `wamid` nunca pode gerar duas `Message`.

**Janela de 24h**
Período após a última mensagem do cliente em que se pode responder com texto livre.
Fora dela, só template aprovado. Não é detalhe de integração — é regra de negócio que
a UI precisa mostrar ao operador **antes** de ele digitar.
Ver [ADR-0005](adr/0005-meta-cloud-api.md).

**Template (WhatsApp / HSM)**
Mensagem pré-aprovada pela Meta, única forma de iniciar conversa ou responder fora da
janela de 24h. **Não confundir com ProcessTemplate.**

**Outbox**
Mensagens `out` com `status: 'queued'` aguardando claim do `ai-gateway`. Não é uma
collection separada — é um estado dentro de `messages`.
Ver [ADR-0007](adr/0007-outbox-no-mongo-com-claim-atomico.md).

**Claim**
Reivindicação atômica de uma mensagem da outbox via `findOneAndUpdate`, que impede dois
consumidores de enviarem a mesma mensagem duas vezes.

---

## CRM e campos dinâmicos

**ProcessTemplate**
Definição de um tipo de processo (compra, agendamento, aviso, resposta a informação):
árvore de campos + estágios. Mutável; aponta para a versão corrente.

**ProcessTemplateVersion**
Snapshot **imutável** dos campos de uma versão do template. Registros antigos renderizam
contra a versão que usaram, sem duplicar a definição dentro de cada documento.
Ver [ADR-0003](adr/0003-definicao-e-valor-separados.md).

**Process**
Instância de um ProcessTemplate para um Customer. Guarda `values` por `fieldId`,
`templateVersion` e o `stage` atual. É o objeto de trabalho do CRM.

**Stage**
Etapa dentro de um ProcessTemplate (ex.: `aguardando_pagamento`). **Não confundir com
o `status` de um card de kanban**, que é outra coisa, nem com o tipo de campo `status`.

**FieldDef**
Nó da árvore de definição: tipo mais configuração. Recursivo em `array` (que tem `of`)
e `group` (que tem `fields`). Nunca contém valor.

**FieldValues**
Mapa `fieldId → valor` gravado no Process. Nunca contém label, tipo ou configuração —
só o valor.

**RenderNode**
Resultado de `hydrate(fields, values)`: um `FieldDef` acrescido da key `value`.
É o que o renderizador recursivo do front consome. A key `value` existe — só que
produzida no render, não gravada no documento.

**field-engine**
Pacote isomórfico (`packages/field-engine`) que define os tipos de campo e expõe
`validate`, `hydrate` e `toToolSchema`. Roda igual no `crm-api` e no `web`. É a razão
principal do monorepo. Ver [ADR-0001](adr/0001-monorepo-pnpm-workspaces.md).

**Board / Card**
Kanban. Ferramenta à parte, portada do DentalEase. Um Card **pode** referenciar um
Process, mas não é um Process. Ver [ADR-0011](adr/0011-kanban-como-ferramenta-separada.md).

---

## Comércio

**Product**
Item do catálogo do tenant.

**Order**
Pedido montado na conversa. Nasce `pending_approval` e só vira `confirmed` com
confirmação explícita do cliente **e** liberação do operador.
Ver [ADR-0009](adr/0009-dois-aneis-de-tools.md).

**Link de pagamento**
Cobrança gerada no Asaas (Pix, boleto ou cartão) e enviada ao cliente.
Ver [ADR-0012](adr/0012-asaas-como-gateway.md).

---

## Harness de IA

**Harness**
O pipeline completo em `packages/ai-kit` que transforma uma mensagem recebida numa
resposta enviada: `ingest → guard.input → context.build → loop → guard.output →
persist → dispatch`. Cada etapa é função pura, testável isolada.

**ToolContext**
Contexto server-side do turno: `{ tenantId, channelId, conversationId }`. Nunca exposto
ao modelo. É o guardrail central do sistema.

**TenantScopedRepo**
Wrapper de repositório que **exige** `Tenant` no filtro. Chamada sem tenant é erro de
tipo, não convenção.

**Anel A / Anel B**
Divisão da superfície de tools. Anel A é autônomo (consultar, coletar, abrir processo).
Anel B exige aprovação — são as tools que envolvem dinheiro (`create_order`,
`issue_payment_link`). A divisão vive em código, não no prompt.

**Superfície de tools**
O conjunto de tools oferecido ao modelo. É **fixo e idêntico entre tenants**; o schema
dinâmico de cada template chega por *resultado* de tool, nunca por *definição*.
Ver [ADR-0004](adr/0004-superficie-de-tools-fixa.md).

**Golden set**
Conversas versionadas em `evals/cases/` com asserções determinísticas sobre
comportamento observável (qual tool, com quais argumentos, o que não vazou). Trava o
comportamento do harness no CI.

**Replay**
Reprocessamento de conversas reais anonimizadas contra um prompt novo, antes de promover.
Mostra diff de comportamento, não placar.
Ver [ADR-0013](adr/0013-evals-golden-set-e-replay.md).

**Guardrail**
Restrição em código, não em prompt. Prompt pode ser contornado por injeção; máquina de
estados e assinatura de tipo não. Os três centrais: tenant fora do input do modelo,
dinheiro sob aprovação, e preço citado só a partir de tool result desta conversa.

---

## Termos que colidem — atenção

| Termo | Sentido A | Sentido B |
|---|---|---|
| **Template** | ProcessTemplate (definição de campos) | Template HSM da Meta (mensagem aprovada) |
| **Status** | Tipo de campo `status` do field-engine | `status` de card do kanban · `status` de Message |
| **Stage** | Etapa do ProcessTemplate | — (não usar para kanban; lá é coluna/`status`) |

Sempre qualificar na UI e nos nomes de variável. `processTemplate` e `waTemplate`,
nunca `template` solto.
