# ADR-0009 — Dois anéis de tools: dinheiro exige aprovação

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

A IA precisa ser autônoma o bastante para justificar o produto ("atendimento rápido"),
mas erro de modelo em operação financeira vira cobrança indevida a um cliente real.

## Decisão

A superfície de tools é dividida em dois anéis, **em código**:

**Anel A — autônomo.** `get_process_template`, `search_products`,
`find_or_create_customer`, `open_process`, `set_process_fields`, `get_order_status`,
`get_available_slots`, `book_appointment`.

**Anel B — exige aprovação.** `create_order`, `issue_payment_link`. Essas tools gravam
com `status: 'pending_approval'` e retornam um resumo que o modelo tem de ler de volta
ao cliente. A transição para `confirmed` exige duas coisas: confirmação explícita do
cliente na conversa **e** liberação do operador no CRM.

## Consequências

- A regra vive no código, não no prompt. Um prompt pode ser contornado por injeção;
  uma máquina de estados não.
- O fluxo de compra ganha um passo. É o custo de não errar com dinheiro.
- O golden set precisa de um caso que afirme que `issue_payment_link` **não** é chamada
  antes da confirmação, e que o pedido nasce `pending_approval`.

## Alternativas consideradas

- **Escrita totalmente livre**: mais rápido, mas erro do modelo vai direto ao dado
  e ao bolso do cliente.
- **Toda escrita sob revisão humana**: máxima segurança, mas mata a promessa central
  de atendimento automatizado.
