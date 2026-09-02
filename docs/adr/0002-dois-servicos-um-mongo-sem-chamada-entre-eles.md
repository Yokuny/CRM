# ADR-0002 — Dois serviços, um MongoDB, zero chamada entre eles

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Requisito do produto: o processamento de IA/WhatsApp e o CRM são microserviços com
responsabilidades separadas, mas compartilham a mesma string de conexão. Foi decidido
explicitamente que **não** há notificação entre serviços — o `ai-gateway` apenas
processa e grava/altera no Mongo, e o `crm-api` consome.

Compartilhar banco entre serviços é acoplamento conhecido: sem disciplina, os dois
lados passam a escrever nas mesmas collections e o schema vira contrato implícito
que ninguém versiona.

## Decisão

Manter o banco compartilhado, sem broker, sem outbox de eventos e sem HTTP interno —
mas com **dono único de escrita por collection**, tratado como invariante do projeto:

| Collection | Escreve | Lê |
|---|---|---|
| `messages` (`direction: 'in'`) | `ai-gateway` | ambos |
| `messages` (`direction: 'out'`) | `crm-api` cria como `queued`; `ai-gateway` só transiciona status | ambos |
| `conversations` | `ai-gateway` | ambos |
| `aiSessions` | `ai-gateway` | `ai-gateway` |
| `customers`, `processes`, `processTemplates`, `processTemplateVersions`, `orders`, `products` | `crm-api` | ambos |
| `channels`, `tenants`, `users` | `crm-api` | ambos |

Os schemas Mongoose vivem só em `packages/db` — nenhum app declara model próprio.

## Consequências

- Arquitetura simples, sem infra extra para operar.
- Não há replay nem versionamento de evento; um bug de escrita corrompe o dado direto,
  sem log intermediário para reprocessar.
- A coordenação que sobra (inbox ao vivo, envio outbound) precisa de mecanismo próprio
  — ver ADR-0006 e ADR-0007.
- Se o acoplamento doer no futuro, o caminho de saída é introduzir uma collection
  `outbox` com evento versionado, sem mudar a topologia.

## Alternativas consideradas

- **Outbox + Change Streams**: entrega garantida e evento versionado, mas exige replica set.
- **HTTP interno**: acopla disponibilidade dos serviços.
- **Broker (Redis Streams / RabbitMQ)**: desacopla de verdade, mas é infra a mais cedo demais.
