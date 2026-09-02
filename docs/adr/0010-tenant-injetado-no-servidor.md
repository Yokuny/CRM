# ADR-0010 — Tenant injetado no servidor, nunca no schema de tool

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Num sistema multi-tenant com IA, a falha mais cara é vazamento entre tenants. O vetor
óbvio é o modelo escolher (ou ser induzido a escolher) o identificador do tenant.

O `DentalEase-BackEnd` já resolve isso corretamente: o `ToolContext` de
`use-cases/assistant-tools.ts` carrega o `clinicId` do contexto do servidor, e nenhum
`input_schema` de tool expõe esse campo. O comentário no código é explícito:
*"O clinicId nunca é exposto"*. Este ADR generaliza o padrão.

## Decisão

1. `ToolContext { tenantId, channelId, conversationId }` é montado no servidor a partir
   do `phone_number_id` do webhook — nunca de conteúdo controlado pelo remetente.
2. Nenhum `input_schema` de tool contém `tenant`, `Tenant`, `orgId` ou equivalente.
3. Todo acesso a dados dentro do `ai-kit` passa por um `TenantScopedRepo` que **exige**
   o `Tenant` no filtro — chamada sem tenant é erro de tipo, não convenção.
4. No `crm-api`, o tenant vem do middleware de autenticação, no padrão do
   `clinicAssignmentCheck`, e nunca é aceito do corpo da requisição.

## Consequências

- O isolamento vira propriedade estrutural, não disciplina de revisão.
- Teste no CI varre todos os `input_schema` e falha se qualquer um contiver campo de
  tenant. É a asserção mais barata e mais valiosa do projeto.
- Teste de integração cria dois tenants com dados espelhados e afirma que nenhuma rota,
  tool ou query devolve dado cruzado.
