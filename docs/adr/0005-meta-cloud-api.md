# ADR-0005 — Meta Cloud API como canal de WhatsApp

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Três caminhos possíveis: API oficial da Meta, biblioteca não oficial (Evolution/Baileys)
sobre um número comum, ou um BSP intermediário (Twilio, 360dialog, Z-API).

## Decisão

Meta Cloud API, integração direta.

## Consequências

Duas regras do WhatsApp deixam de ser detalhe de integração e viram **regra de negócio
de primeira classe**, presentes no modelo e na UI:

- **Janela de 24h**: fora dela só é possível enviar template aprovado. O operador precisa
  ver isso na interface *antes* de digitar, não descobrir no erro de envio.
- **Templates HSM**: iniciar conversa exige template aprovado previamente pela Meta.

Além disso:

- Sem risco de banimento do número e sem quebra a cada update do WhatsApp Web.
- Custo por conversa.
- O webhook resolve tenant pelo `phone_number_id` do payload — nunca por algo que o
  remetente controle (ver ADR-0010).
- A Meta reenvia webhooks: idempotência por `wamid` é obrigatória, não otimização.

## Alternativas consideradas

- **Evolution API / Baileys**: sem custo por mensagem e sem templates, mas risco real de
  ban do número — inaceitável para um produto multi-tenant onde o número é do cliente.
- **BSP**: onboarding mais simples, ao custo de lock-in e margem sobre cada mensagem.
