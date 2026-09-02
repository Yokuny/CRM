# ADR-0003 — Definição e valor separados, com versões imutáveis

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

O CRM é um JSON dinâmico de campos tipados, renderizado por uma função recursiva que
percorre a árvore e associa o valor preenchido. A tentação natural é guardar a árvore
inteira — tipo, label, config e `value` — dentro de cada registro.

Isso quebra em três frentes: renomear um campo vira `updateMany` em N registros;
filtrar por um campo vira `$elemMatch` sobre array (índice fraco); e não existe
histórico de qual definição o registro usou quando foi preenchido.

## Decisão

Três collections:

```ts
// processTemplates — mutável, aponta a versão corrente
{ _id, Tenant, key, name, currentVersion, stages, archived }

// processTemplateVersions — snapshot IMUTÁVEL dos campos
{ _id, Tenant, template, version, fields: FieldDef[] }

// processes — só os valores
{ _id, Tenant, template, templateVersion, Customer, stage,
  values: { [fieldId]: Value } }
```

O render chama `hydrate(fields, values) -> RenderNode[]`, onde cada nó é
`{ ...FieldDef, value }`. A key `value` continua existindo exatamente como desenhado —
só que produzida no render, não gravada no documento.

Evolução de template: mudança **aditiva** é bump de versão sem migração; mudança
**destrutiva** (remover campo, trocar tipo, remover opção em uso) exige passo de
migração explícito que descarta ou mapeia o valor — nunca silencioso.

## Consequências

- Indexável: wildcard index em `{ "values.$**": 1 }` cobre filtro ad-hoc.
- Editar a definição não toca nenhum registro.
- Registro antigo renderiza fiel, porque aponta para a versão imutável que usou.
- Custo: todo render exige carregar template + registro (join lógico). Mitigar com
  cache de `processTemplateVersions` em memória, já que são imutáveis.

## Alternativas consideradas

- **JSON único com `value` inline**: simples de renderizar, caro de manter e consultar.
- **Híbrido com snapshot da definição dentro de cada registro**: preserva histórico,
  mas duplica a definição N vezes — as versões imutáveis dão o mesmo benefício sem a cópia.
