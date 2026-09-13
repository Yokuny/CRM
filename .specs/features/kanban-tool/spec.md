# kanban-tool Specification

## Problem Statement

O CRM hoje só organiza trabalho de duas formas: pelo `Process` (fluxo formal, `stage` fixado
pelo template do tenant) ou pela lista/kanban de `Customer` agrupado por `status` (feature 4).
Nenhuma das duas serve para um quadro ad-hoc — um board livre de tarefas que não segue um fluxo
de processo formal e que pode ou não referenciar um dado real do CRM (ex.: "quadro de cobranças
em atraso", "board de instalação pendente"). O ADR-0011 já resolveu a decisão arquitetural
(kanban como ferramenta à parte, card pode referenciar um `Process` mas não é um `Process`);
falta a implementação (roadmap, feature 10).

## Goals

- [ ] Operador cria e organiza boards nomeados livremente, sem depender de nenhum template ou
      fluxo de processo pré-existente.
- [ ] Card é opcionalmente vinculável a `Customer`, `Process`, `Order` e a um `User` responsável
      — mas nenhuma referência é obrigatória; um card pode ser uma tarefa pura.
- [ ] Arrastar-e-soltar entre colunas (e reordenar dentro da mesma coluna) reflete no servidor,
      reaproveitando o primitivo `apps/web/src/components/ui/kanban.tsx` já em produção.
- [ ] Nenhuma referência ou board vaza entre tenants (AD-010).

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Item | Motivo |
| --- | --- |
| Compartilhamento granular (`owner` + `collaborators`, `PUT /:id/share`) | Decidido no Discuss: todo board é visível/editável por qualquer usuário operacional do tenant, sem ownership por registro — consistente com o resto do `crm-api` |
| Sincronia automática entre `stage` do `Process` referenciado e a coluna do card | Trade-off já aceito explicitamente pelo ADR-0011 ("se essa sincronia for desejada depois, vira feature explícita") |
| Status-base seedado / template de colunas reutilizável entre boards | Decidido no Discuss: colunas 100% livres, cada board nasce do zero |
| Atalho de criar card pré-preenchido a partir das telas de detalhe de Customer/Process | Tocaria telas de outras features (fora do boundary desta); pode virar ajuste futuro se um caso de uso real pedir |
| Kanban de `Customer` por `status` (feature 4, `crm-web-shell`) | Já existe — modelo de coluna diferente (status do field-engine, não coluna livre de board). Ver `glossary.md`, *Board / Card* |
| Referenciar `Professional` (agenda) no card | Decidido no Discuss: o campo de responsável aponta pra `User` (mesmo papel do `Professional`→`User` do DentalEase), não pro model `Professional` da feature scheduling |

---

## Assumptions & Open Questions

Toda ambiguidade é resolvida ou registrada aqui — nada fica silenciosamente em aberto.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Apagar uma coluna que ainda tem cards | Bloqueado até a coluna ficar vazia | Evita perder cards numa reorganização de coluna; não discutido explicitamente, extensão natural da regra "board sempre tem ≥1 coluna" | n (assumption) |
| Apagar um board inteiro | Cascata total — remove todos os cards junto, sem passo extra de confirmação | `cards` vive embutido no documento do board (mesmo formato Mongoose do DentalEase); a ação já exige role `admin` | n (assumption) |
| Paginação de boards (hub) ou cards por board | Sem paginação nesta feature | Volume esperado baixo — ferramenta ad-hoc, não o dado principal do CRM (mesmo raciocínio já aceito para `professionals`/`spaces`) | n (assumption) |
| Referência (`customer`/`process`/`order`/`assignee`) apontando pra um registro apagado depois de vinculado | N/A — nenhuma dessas entidades tem hard-delete hoje no crm-api | Nenhuma rota atual apaga `Customer`/`Process`/`Order`/`User` de verdade (só estados terminais/`active:false`) | y |
| Concorrência ao mover/reordenar card | Last-write-wins, sem índice único nem guard especial | Ao contrário da agenda (AD-035, dupla-reserva), não existe invariante de negócio a proteger num board livre — dois operadores movendo o mesmo card só faz o último vencer, sem corromper dado | y |
| Rate limiting nas rotas de board/card | N/A — sem precedente de rate limit em rota de CRUD autenticado no `crm-api` | Mesma convenção já usada por `professional`/`product`/`space` | y |
| Observabilidade (métricas de latência por operação) | Reusa `dbReqResTime` já usado em todo `*.repository.ts` do `crm-api` | Convenção já estabelecida (AD-031 CI, instrumentação Prometheus existente) — sem decisão nova | y |
| Rate/formato de erro ao criar card com referência cross-tenant ou coluna inexistente | 400 com mensagem de validação Zod, mesmo padrão dos demais routers | Consistente com `professional.router.ts`/`order.router.ts` | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Board CRUD e hub de boards ⭐ MVP

**User Story**: Como operador, eu quero criar e ver os boards do meu tenant para organizar
trabalho ad-hoc que não é coberto por `Process`.

**Why P1**: Sem o board em si (criar, listar, editar), nenhuma outra história tem onde existir.

**Acceptance Criteria**:

1. WHEN operador (`admin`/`gestor`/`operador`) cria um board informando nome e ao menos 1 coluna
   inicial THEN o sistema SHALL persistir o board com essas colunas e nenhum card.
2. WHEN operador tenta criar um board sem nenhuma coluna THEN o sistema SHALL rejeitar com erro
   de validação.
3. WHEN operador acessa o hub de boards THEN o sistema SHALL listar todos os boards do tenant
   atual — independente de quem criou cada um — ordenados por atualização mais recente.
4. WHEN operador edita nome ou descrição de um board existente do próprio tenant THEN o sistema
   SHALL persistir a mudança.
5. WHEN um usuário autenticado sem nenhum papel operacional (`role` vazio) tenta qualquer
   operação de board ou card THEN o sistema SHALL responder 403.
6. WHEN operador tenta ler ou editar um board que pertence a OUTRO tenant THEN o sistema SHALL
   responder 404 (nunca revelar existência entre tenants — AD-010).

**Independent Test**: Criar um board com 2 colunas via API/tela, confirmar que aparece no hub;
tentar acessar o `id` de um board criado sob outro tenant e confirmar 404.

---

### P1: Gerenciar colunas do board ⭐ MVP

**User Story**: Como operador, eu quero customizar livremente as colunas de um board para
modelar qualquer fluxo ad-hoc que eu tiver em mente.

**Why P1**: ADR-0011 e o roadmap descrevem o kanban como "liberdade de montar quadros ad-hoc" —
sem colunas totalmente livres, a ferramenta vira só uma cópia do kanban de status fixo que já
existe (feature 4).

**Acceptance Criteria**:

1. WHEN operador adiciona uma coluna a um board THEN o sistema SHALL persistir a nova coluna ao
   final da ordem atual.
2. WHEN operador renomeia uma coluna THEN o sistema SHALL persistir o novo nome sem mover os
   cards já associados a ela.
3. WHEN operador reordena as colunas de um board THEN o sistema SHALL persistir a nova ordem.
4. WHEN operador tenta remover uma coluna que ainda tem ao menos 1 card THEN o sistema SHALL
   rejeitar a remoção.
5. WHEN operador tenta remover a única coluna restante de um board (mesmo vazia) THEN o sistema
   SHALL rejeitar, garantindo que todo board tenha sempre ao menos 1 coluna.
6. WHEN operador remove uma coluna vazia de um board com mais de 1 coluna THEN o sistema SHALL
   remover a coluna.

**Independent Test**: Num board com 2 colunas vazias, remover uma e confirmar que sobra 1;
tentar remover a última e receber rejeição; colocar 1 card na coluna restante e confirmar que a
remoção agora também é rejeitada.

---

### P1: CRUD de card ⭐ MVP

**User Story**: Como operador, eu quero criar e gerenciar cards dentro de um board, vinculando
opcionalmente a um Customer, Process, Order ou a um responsável.

**Why P1**: É a unidade de trabalho do board — sem card gerenciável, o board é só uma lista de
colunas vazias.

**Acceptance Criteria**:

1. WHEN operador cria um card informando apenas título e a coluna de destino THEN o sistema
   SHALL persistir o card sem nenhuma referência de negócio nem responsável.
2. WHEN operador cria ou edita um card com `customer`/`process`/`order`/`assignee` apontando pra
   um id que não existe ou não pertence ao tenant atual THEN o sistema SHALL rejeitar com erro
   de validação.
3. WHEN operador cria um card numa coluna que não existe naquele board THEN o sistema SHALL
   rejeitar.
4. WHEN operador edita título, descrição ou referências de um card THEN o sistema SHALL
   persistir as mudanças sem alterar a coluna atual do card.
5. WHEN operador apaga um card THEN o sistema SHALL removê-lo do board.

**Independent Test**: Criar um card só com título numa coluna existente; editar adicionando um
`customer` válido; tentar vincular um `customer` de outro tenant e receber rejeição; apagar o
card e confirmar que some da listagem do board.

---

### P1: Mover card entre colunas (drag-and-drop) ⭐ MVP

**User Story**: Como operador, eu quero arrastar um card entre colunas (ou reordenar dentro da
mesma coluna) para refletir o progresso de um relance.

**Why P1**: É a interação central de qualquer kanban — sem isso a ferramenta não tem o
comportamento que o próprio nome promete.

**Acceptance Criteria**:

1. WHEN operador arrasta um card para uma coluna diferente na tela do board THEN o sistema SHALL
   persistir a nova coluna do card através da rota de mover.
2. WHEN operador arrasta um card para uma posição diferente dentro da MESMA coluna THEN o
   sistema SHALL persistir a nova ordem do card.
3. WHEN a chamada de mover falha (erro de rede ou servidor) THEN a UI SHALL reverter o card
   visualmente para a coluna/posição de origem e exibir um erro — mesmo padrão otimista já usado
   no kanban de `Customer` (`customers/kanban/index.tsx`).
4. WHEN um payload de mover referencia uma coluna que não existe naquele board THEN o sistema
   SHALL rejeitar no backend, independente de qualquer validação client-side.

**Independent Test**: Arrastar um card entre 2 colunas na tela e confirmar persistência após
reload; simular falha de rede (ex.: interceptar a chamada) e confirmar que o card volta
visualmente pra coluna de origem com um erro visível.

---

### P2: Apagar board (admin, cascata)

**User Story**: Como admin, eu quero apagar um board inteiro para remover quadros ad-hoc que
ficaram obsoletos.

**Why P2**: Importante para manter o hub limpo, mas não bloqueia o uso inicial da ferramenta —
um board obsoleto pode ficar visível sem prejuízo funcional até esta história existir.

**Acceptance Criteria**:

1. WHEN um usuário com role `admin` apaga um board THEN o sistema SHALL remover o board e todos
   os seus cards.
2. WHEN um usuário com role `gestor` ou `operador` (sem `admin`) tenta apagar um board THEN o
   sistema SHALL responder 403.

**Independent Test**: Tentar apagar um board como `operador` e receber 403; apagar o mesmo board
como `admin` e confirmar que board e cards somem.

---

### P2: Card exibe as entidades vinculadas

**User Story**: Como operador, eu quero ver o cliente/processo/pedido/responsável vinculado a um
card direto no board, sem precisar abrir cada registro pra saber do que se trata.

**Why P2**: Melhora a usabilidade do board, mas o board já é funcional (P1) sem esse resumo
visual — o operador pode abrir o card pra ver os vínculos.

**Acceptance Criteria**:

1. WHEN um card tem `customer` vinculado THEN o board SHALL exibir o nome do cliente no card.
2. WHEN um card tem `process` vinculado THEN o board SHALL exibir um identificador amigável do
   processo (nome do template + estágio atual).
3. WHEN um card tem `order` vinculado THEN o board SHALL exibir um identificador amigável do
   pedido (valor total + status).
4. WHEN um card tem `assignee` vinculado THEN o board SHALL exibir o nome do usuário
   responsável.
5. WHEN um card não tem nenhuma referência opcional preenchida THEN o board SHALL exibir apenas
   título/descrição, sem seção vazia.

**Independent Test**: Criar 1 card de cada combinação (nenhuma referência, só customer, todas as
referências) e confirmar visualmente que cada um mostra exatamente o que tem.

---

### P3: Cor por coluna

**User Story**: Como operador, eu quero atribuir uma cor a cada coluna para distinguir estágios
visualmente.

**Why P3**: Puramente cosmético — o board funciona igual sem cor, mas o padrão já existe no
kanban de `Customer` (`customerStatusColumns`) e é barato de replicar aqui.

**Acceptance Criteria**:

1. WHEN operador define uma cor (hex) para uma coluna THEN o sistema SHALL persistir e exibir
   essa cor como indicador visual no cabeçalho da coluna.

**Independent Test**: Definir uma cor numa coluna e confirmar o indicador visual no cabeçalho;
deixar outra coluna sem cor e confirmar que não aparece indicador quebrado.

---

## Edge Cases

- WHEN o tenant ainda não tem nenhum board THEN o hub SHALL exibir estado vazio (`DefaultEmptyData`) com atalho para criar o primeiro board.
- WHEN uma coluna não tem nenhum card THEN ela SHALL aparecer vazia sem erro.
- WHEN um campo de referência opcional (`customer`/`process`/`order`/`assignee`) é enviado como string vazia THEN o sistema SHALL tratar como "sem referência", não como erro de validação.
- WHEN dois operadores movem cards diferentes no mesmo board ao mesmo tempo THEN cada movimentação SHALL ser persistida independentemente (sem lock de board inteiro).
- WHEN o título de um card ou nome de um board/coluna excede o limite de caracteres THEN o sistema SHALL rejeitar com erro de validação (limites definidos no Design, mesma ordem de grandeza do DentalEase: título de card ≤120, nome de board ≤80, label de coluna ≤60).

---

## Requirement Traceability

Cada requisito recebe um ID único para rastreio entre design, tasks e validação.

| Requirement ID | Story | Phase | Status | Task(s) |
| --- | --- | --- | --- | --- |
| KAN-01 | P1: Board CRUD e hub | Tasks | In Tasks | T1, T3, T6, T8, T10, T12, T14, T16 |
| KAN-02 | P1: Board CRUD e hub | Tasks | In Tasks | T1, T3, T8, T10, T12, T16 |
| KAN-03 | P1: Board CRUD e hub | Tasks | In Tasks | T6, T10, T12, T14, T15, T20 |
| KAN-04 | P1: Board CRUD e hub | Tasks | In Tasks | T3, T6, T8, T10, T12, T14 |
| KAN-05 | P1: Board CRUD e hub | Tasks | In Tasks | T12 |
| KAN-06 | P1: Board CRUD e hub | Tasks | In Tasks | T6, T8, T10, T12, T20 |
| KAN-07 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T6, T8, T10, T12, T14, T19 |
| KAN-08 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T6, T8, T10, T12, T14, T19 |
| KAN-09 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T6, T8, T10, T12, T14, T19 |
| KAN-10 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T8, T10, T12, T19 |
| KAN-11 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T8, T10, T12, T19 |
| KAN-12 | P1: Gerenciar colunas | Tasks | In Tasks | T4, T6, T8, T10, T12, T14, T19 |
| KAN-13 | P1: CRUD de card | Tasks | In Tasks | T2, T5, T7, T9, T11, T13, T14, T18 |
| KAN-14 | P1: CRUD de card | Tasks | In Tasks | T2, T5, T9, T11, T13, T18 |
| KAN-15 | P1: CRUD de card | Tasks | In Tasks | T5, T9, T11, T13 |
| KAN-16 | P1: CRUD de card | Tasks | In Tasks | T5, T7, T9, T11, T13, T14, T18 |
| KAN-17 | P1: CRUD de card | Tasks | In Tasks | T7, T9, T11, T13, T14, T18 |
| KAN-18 | P1: Mover card | Tasks | In Tasks | T5, T7, T9, T11, T13, T14, T20 |
| KAN-19 | P1: Mover card | Tasks | In Tasks | T5, T7, T9, T11, T13, T14, T20 |
| KAN-20 | P1: Mover card | Tasks | In Tasks | T13, T14, T20 |
| KAN-21 | P1: Mover card | Tasks | In Tasks | T5, T9, T11, T13, T20 |
| KAN-22 | P2: Apagar board | Tasks | In Tasks | T8, T10, T12, T14 |
| KAN-23 | P2: Apagar board | Tasks | In Tasks | T12 |
| KAN-24 | P2: Card exibe vínculos | Tasks | In Tasks | T7, T11, T13, T17 |
| KAN-25 | P2: Card exibe vínculos | Tasks | In Tasks | T7, T11, T13, T17 |
| KAN-26 | P2: Card exibe vínculos | Tasks | In Tasks | T7, T11, T13, T17 |
| KAN-27 | P2: Card exibe vínculos | Tasks | In Tasks | T7, T11, T13, T17 |
| KAN-28 | P2: Card exibe vínculos | Tasks | In Tasks | T7, T11, T13, T17 |
| KAN-29 | P3: Cor por coluna | Tasks | In Tasks | T1, T4, T12, T19 |

**ID format:** `KAN-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 29 total, 29 mapped to tasks, 0 unmapped ✅

---

## Success Criteria

Como saberemos que a feature foi bem-sucedida:

- [ ] Operador cria um board com colunas customizadas sem nenhum dado pré-existente exigido
      (nem Customer, nem Process, nem Order).
- [ ] Um card pode nascer 100% "vazio" (só título) e ainda ser útil dentro do board.
- [ ] Arrastar um card entre colunas — ou reordenar dentro da mesma coluna — reflete no servidor
      sem exigir reload da página.
- [ ] Nenhuma referência ou board vaza entre tenants (teste estrutural/AD-010 continua 100%
      verde com as novas collections).
- [ ] Apagar um board exige `admin` e remove todos os cards junto, sem deixar card órfão.
