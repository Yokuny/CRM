# ADR-0011 — Kanban é ferramenta à parte, referencia processos

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

Havia a hipótese de unificar: o template de processo definiria os estágios, e o kanban
seria só uma view — colunas = estágios, cards = instâncias. Um modelo só.

## Decisão

Manter separado. `Process` tem entidade e telas próprias (lista, detalhe, formulário
dinâmico). O kanban é um board genérico, portado do `DentalEase`, cujo card **pode**
referenciar um `Process` — como hoje referencia `Patient`, `Financial` e `Odontogram`.

## Consequências

- Porte quase direto de `database/kanban.database.ts`, `services/kanban.service.ts` e
  do front em `routes/_private/tools/kanban/` — inclusive o `dnd-kit` e o
  `KanbanProvider` já existentes.
- Board é livre: um quadro pode misturar processos de tipos diferentes, ou nem ter
  processo nenhum.
- Custo: dois modelos de "coluna" no sistema — `stage` do template e `status` do board.
  O card não herda automaticamente o estágio do processo; se essa sincronia for
  desejada depois, vira feature explícita.
- O campo `status` do field-engine e o `status` do kanban são coisas distintas e
  precisam de nomes distintos na UI para não confundir o usuário.

## Alternativas consideradas

- **Card = instância de processo**: modelo mais elegante e menos código, mas amarra o
  board ao template e tira a liberdade de montar quadros ad-hoc.
