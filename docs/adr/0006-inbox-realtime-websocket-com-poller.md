# ADR-0006 — Inbox ao vivo: WebSocket no crm-api alimentado por poller interno

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

O operador precisa ver a conversa ao vivo para poder assumir o atendimento (takeover).
Mas por ADR-0002 o `ai-gateway` não avisa ninguém — ele só grava no Mongo. Falta,
portanto, um caminho para o front descobrir que chegou mensagem nova.

## Decisão

O `crm-api` mantém um poller interno (~2s) sobre `messages`, filtrando
`updatedAt > lastTick`, e faz fan-out por WebSocket em salas `tenant:conversation`.

**O poller só varre tenants que têm socket conectado.** Sem operador online, não há query.

## Consequências

- Não exige replica set nem change stream — funciona em Mongo standalone.
- Respeita a regra de que nenhum serviço chama o outro.
- Latência de até ~2s para a mensagem aparecer. Aceitável para atendimento humano.
- Carga contínua no Mongo proporcional ao número de tenants **ativos**, não ao total.
- Estado de conexão WS para gerenciar (reconexão, sala por conversa, autorização por tenant).
- Caminho de evolução se a latência incomodar: trocar o poller por change stream sem
  mexer no contrato do WS.

## Alternativas consideradas

- **Polling direto no front (TanStack Query `refetchInterval`)**: zero infra, mas cada
  operador vira uma fonte de carga e a latência aparece na lista inteira.
- **SSE lendo change stream**: inbox ao vivo de verdade, mas exige replica set.
