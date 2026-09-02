# ADR-0004 — Superfície de tools fixa; schema dinâmico chega por tool result

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Cada tenant define seus próprios tipos de processo com árvores de campos próprias.
O caminho intuitivo seria gerar, por tenant, uma tool por template — `criar_compra`,
`criar_agendamento` — com `input_schema` derivado dos campos.

Dois problemas. Primeiro, as definições de tools renderizam na **posição 0** do prompt:
qualquer variação por tenant invalida todo o prefixo e elimina reuso de cache entre
tenants. Segundo, o número de tools cresce com o número de templates, e uma lista longa
degrada a escolha do modelo.

## Decisão

Superfície de tools **fixa e pequena**, idêntica para todos os tenants. O schema
dinâmico entra pelo *resultado* de uma tool, nunca pela *definição*:

```
get_process_template(key) -> { fields: JSONSchema, stages: [...] }
set_process_fields(processId, values)  // values validado server-side pelo field-engine
```

A validação real acontece em `packages/field-engine`, com o Zod construído a partir
da árvore — o `input_schema` da tool só declara `values` como objeto livre.

## Consequências

- Prefixo do prompt é byte-idêntico entre tenants: cache compartilhado quando o modelo
  suportar (ver ADR-0008).
- O modelo precisa de um turno a mais para buscar o template antes de preencher.
- A validação fica inteiramente no servidor, que é onde ela tem de estar de qualquer forma.

## Alternativas consideradas

- **Tool por template**: melhor ergonomia para o modelo, custo inaceitável em cache e
  em tamanho da lista de tools.
