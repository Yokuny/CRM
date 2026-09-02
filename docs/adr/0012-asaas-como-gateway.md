# ADR-0012 — Asaas como gateway de pagamento

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

O fluxo de compra pelo WhatsApp termina em link de pagamento. Precisa de Pix, boleto e
cartão, com webhook de confirmação e conciliação — e é multi-tenant, então cada tenant
tem sua própria conta e sua própria chave.

## Decisão

Asaas.

## Consequências

- Existe implementação de referência completa no `DentalEase-BackEnd`: chave criptografada
  por tenant (`config/asaas.config.ts`, `helpers/crypto.helper.ts`), webhook com resolução
  de tenant por token (`middlewares/asaas-webhook.middleware.ts`), subscriber de eventos
  e job de sincronização. É porte, não pesquisa.
- Pix, boleto e cartão cobertos, com o atrito fiscal brasileiro já resolvido.
- Lock-in num gateway nacional. Se surgir necessidade internacional, a saída é uma porta
  `PaymentGateway` — que não vale abstrair agora, com um provedor só.
- A chave do Asaas é do tenant, nunca da plataforma: criptografada em repouso e
  nunca exposta ao modelo nem ao front.

## Alternativas consideradas

- **Mercado Pago**: forte em Pix, mas integração do zero.
- **Stripe**: melhor DX e webhooks, mas Pix limitado e mais atrito fiscal no Brasil.
