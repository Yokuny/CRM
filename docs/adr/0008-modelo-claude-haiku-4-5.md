# ADR-0008 — `claude-haiku-4-5` no loop conversacional

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

O padrão recomendado pela referência atual da API é `claude-opus-5`. O volume de um
canal de WhatsApp torna o custo por conversa uma variável de produto, e o
`DentalEase-BackEnd` já roda `claude-haiku-4-5` em produção no assistente de agendamento.

## Decisão

`claude-haiku-4-5` no loop conversacional. Model ID exato, sem sufixo de data.

## Consequências

Três diferenças em relação ao Opus 5 que o desenho precisa absorver:

1. **Prompt cache só a partir de 4096 tokens.** O prefixo do assistente atual
   (~600 tokens) nunca cacheia — a marcação `cache_control` seria no-op. Ainda assim
   mantemos a disciplina de montagem (system congelado, contexto dinâmico depois),
   para que trocar de modelo depois ligue o cache sem refatorar nada.
2. **Sem `role: "system"` no meio da conversa** (disponível só em Opus 5/4.8/Fable/Mythos).
   O contexto dinâmico — nome do tenant, data/hora, status da janela — vai como texto
   no turno de usuário, nunca interpolado no system prompt.
3. **Sem `output_config.effort`; thinking só via `budget_tokens`.** No loop de WhatsApp
   thinking fica **desligado**: o fluxo é raso e o Haiku 4.5 remove blocos de thinking
   anteriores do contexto, o que provocaria rewrite de cache a cada turno pós-tool.

Trade-off aceito: menor robustez em cadeias longas de tool-calling. Mitigado pelo teto
de iterações e pela superfície de tools pequena (ADR-0004).

A troca por `claude-opus-5` deve ser uma mudança de constante — nenhuma outra parte
do harness pode depender de particularidade do Haiku.

## Alternativas consideradas

- **`claude-opus-5`**: melhor tool-calling, cache a partir de 512 tokens, system message
  mid-conversation. Descartado por custo por conversa.
- **Roteador haiku/opus**: economiza, mas cache é escopo de modelo — perde-se reuso entre
  as duas pontas, e ganha-se complexidade de roteamento.
