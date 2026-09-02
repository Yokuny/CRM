# ADR-0013 — Evals: golden set determinístico + replay anonimizado

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Mudança de prompt é mudança de comportamento sem diff legível. Sem eval, toda alteração
no system prompt é uma aposta, e regressão só aparece em produção — na conversa de um
cliente real.

## Decisão

Duas camadas.

**1. Golden set determinístico** (`evals/cases/*.yaml`), rodando contra o harness real
com `mongodb-memory-server`. Asserções sobre comportamento observável, não sobre texto:

```
expectTool('search_products', { q: ... })
expectNoTool('issue_payment_link')
expectNoLeak(outroTenantId)
expectPricesOnlyFrom(toolResults)
```

Mais um teste estrutural que varre todos os `input_schema` e falha se algum contiver
campo de tenant (ver ADR-0010).

**2. Replay anonimizado** (`evals/replay/`): conversas reais com telefone, nome e
documento removidos na exportação, reprocessadas contra o prompt novo antes de promover.
O relatório mostra o diff de comportamento, não um placar.

LLM-judge entra **só para tom**. Correção nunca depende de julgamento de modelo.

## Consequências

- Gate de CI: asserções determinísticas em 100%. Prompt não sobe com eval vermelho.
- O replay exige pipeline de anonimização e política de retenção — dado de conversa real
  é dado pessoal.
- Escrever caso de eval vira parte de fechar qualquer feature que toque o harness.

## Alternativas consideradas

- **Ferramenta externa (Promptfoo, Braintrust)**: dashboard pronto, mas mais uma conta e
  mais um pipeline; o Jest já está no stack.
- **Só golden set, sem replay**: mais barato, mas casos sintéticos não capturam como
  cliente real escreve — abreviação, áudio transcrito, mensagem quebrada em cinco linhas.
