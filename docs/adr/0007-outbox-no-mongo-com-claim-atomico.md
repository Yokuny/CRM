# ADR-0007 — Envio outbound por fila no Mongo com claim atômico

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Quando o operador digita no CRM, quem tem o token da Meta é o `ai-gateway`, não o
`crm-api`. E por ADR-0002 um não chama o outro.

## Decisão

O `crm-api` insere a mensagem como `{ direction: 'out', status: 'queued' }`.
O `ai-gateway` reivindica com uma operação atômica:

```js
findOneAndUpdate(
  { status: 'queued' },
  { $set: { status: 'sending', claimedBy, claimedAt } },
  { sort: { createdAt: 1 } }
)
```

Depois chama a Meta e grava `sent` (com o `wamid`) ou `failed` (com o erro).
Um reaper devolve para `queued` claims em `sending` há mais de N segundos.

A checagem da janela de 24h acontece **antes** do envio; fora da janela só passa
template aprovado, e a UI precisa sinalizar isso ao operador antes de ele digitar.

## Consequências

- O claim atômico garante que dois consumidores concorrentes não enviem duas vezes.
- A mensagem sobrevive a uma queda do `ai-gateway` — fica `queued` até alguém reivindicar.
- Latência de envio herda o intervalo do consumidor. Para ação de usuário isso é
  perceptível; mitigar com intervalo curto e, se necessário, `tailable cursor`.
- O reaper precisa ser idempotente: reenvio de uma mensagem já entregue à Meta é
  duplicata visível para o cliente. Gravar o `wamid` **antes** de marcar `sent`.

## Alternativas consideradas

- **`crm-api` chama `POST /send` no `ai-gateway`**: envio imediato e erro na hora,
  mas quebra a regra de não haver chamada entre serviços.
- **`crm-api` fala direto com a Meta**: duplica credencial e duplica a lógica de janela
  de 24h em dois lugares que podem divergir.
