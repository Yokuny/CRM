# kanban-tool Context

**Gathered:** 2026-09-12
**Spec:** `.specs/features/kanban-tool/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Kanban livre como ferramenta à parte (AD-011, ADR-0011): models `Board`/`Card` escopados por
Tenant, distintos do kanban de `Customer` por `status` (feature 4). Um tenant pode ter vários
boards nomeados; cada board tem colunas 100% livres e cards que **podem** referenciar
opcionalmente `Process`, `Customer`, `Order` e um `User` responsável — nenhuma referência é
obrigatória. Porte quase direto do `DentalEase` no formato geral (board como documento único com
`columns[]`/`cards[]` embutidos), adaptado aos ajustes de domínio abaixo.

---

## Implementation Decisions

### Referências do Card

- Além do `Process` (já travado pelo AD-011), o Card pode referenciar opcionalmente `Customer` e
  `Order`.
- Campo de responsável (`assignee`) aponta para `User` (o operador/tenant user já existente),
  não para `Professional` — no DentalEase esse campo ("Professional") apontava pra um `User` de
  equipe, não pra uma entidade de negócio; papel equivalente aqui é `User`, não o `Professional`
  novo da feature scheduling (que é prestador de serviço da agenda, um conceito diferente).
- Card é **100% livre**: `title` é o único campo obrigatório. `Customer`, `Process`, `Order` e
  `assignee` são todos opcionais e independentes — um card pode ser uma tarefa pura de quadro,
  sem nenhum vínculo de dado do CRM. Mantém a liberdade de "quadro ad-hoc" que o ADR-0011 e o
  roadmap descrevem.

### Escopo do Board

- Um tenant pode ter **vários boards nomeados** (não um único board implícito) — tela de hub
  lista os boards do tenant, cada um leva a uma tela de detalhe com colunas e cards.
- **Sem owner/collaborators**: ao contrário do DentalEase (dono + compartilhamento granular por
  usuário, endpoint `PUT /:id/share`), todo board é visível e editável por qualquer usuário do
  tenant com papel operacional (`admin`/`gestor`/`operador`) — consistente com o resto do
  `crm-api`, que nunca introduziu ownership por registro dentro de um tenant. Não há sub-rota de
  compartilhamento nesta feature.

### Colunas (status do board)

- Colunas são **totalmente livres**, sem nenhum status-base seedado automaticamente (ao
  contrário dos 5 status fixos do DentalEase). Quem cria o board define as colunas iniciais;
  qualquer usuário do tenant pode depois renomear, reordenar, adicionar ou remover colunas — sem
  coluna protegida.
- Board precisa ter **ao menos 1 coluna sempre** (mesma regra do DentalEase: não pode ficar com
  zero colunas) — criação exige ao menos uma; tentativa de remover a última coluna é rejeitada.

### Permissões

- `admin`/`gestor`/`operador` (mesmo `canOperate` já usado em `professional.router.ts`,
  `product.router.ts`, `space.router.ts`) podem criar e editar boards e cards, e criar/editar/
  apagar cards e colunas.
- **Apagar um board inteiro exige role `admin`** — única ação com gate mais restrito que
  `canOperate`, mais perto do `isAdmin` do DentalEase, porque remove todos os cards do board de
  uma vez (ação destrutiva de maior raio).

### Agent's Discretion

- Layout exato da tela de hub e da tela de detalhe do board (cards de navegação, disposição das
  colunas) — seguir a referência do DentalEase (`routes/_private/tools/kanban/**`) adaptada às
  convenções deste repo (`apps/web/CLAUDE.md`: hub/index.tsx, `Card asPage`, painel inline em vez
  de Dialog — AD-037 — para os formulários de criar/editar board/card/coluna).
- Estrutura exata dos endpoints de sub-recurso (coluna e card) — seguir o padrão REST do
  DentalEase (`POST/PUT/DELETE /:id/card(/:cardId)`, mover card) adaptado ao Zod/Express deste
  repo.
- Nome exato dos campos internos de coluna (`key`/`label`/`order` vs. outra nomenclatura) fica a
  critério do Design, desde que não colida com o vocabulário de `status`/`stage` do field-engine
  (glossary.md já avisa para não confundir).

### Declined / Undiscussed Gray Areas → Assumptions

- **O que acontece ao apagar uma coluna que ainda tem cards?** Não discutido explicitamente.
  Assumption: bloquear a remoção de uma coluna não-vazia (mesmo espírito do "board precisa ter
  ao menos 1 coluna" — nunca perder cards por uma ação de reorganização de coluna). Usuário
  precisa mover os cards pra outra coluna antes de remover a coluna de origem.
- **O que acontece com os cards ao apagar um board inteiro?** Não discutido. Assumption: cascata
  total — apagar o board (`admin`-only) remove todos os seus cards junto, já que `cards` vive
  embutido no documento do board (mesmo formato Mongoose do DentalEase); não há necessidade de
  um segundo passo de confirmação além do já exigido pela role `admin`.
- **Paginação/limite de boards ou cards por board?** Não discutido. Assumption: sem paginação
  nesta feature — volume esperado de boards/cards por tenant é baixo (ferramenta ad-hoc, não o
  dado principal do CRM), mesmo raciocínio que já vale para a lista de `professionals`/`spaces`.
  Revisitar se o volume real justificar.

---

## Specific References

- Porte quase direto de `../DentalEase/DentalEase-BackEnd/src/{database,repositories,services,
  controllers,routers,schemas}/kanban.*` para a forma geral do model (board = 1 documento com
  `columns[]`/`cards[]` embutidos) e do CRUD, adaptando: `Clinic`→`Tenant`, remoção de
  `owner`/`collaborators`/`share`, `Patient`→`Customer` opcional, `Professional`→`assignee`
  (`User`) opcional, `Odontogram`/`Financial` removidos, `Order` adicionado.
- Front-end: reaproveitar `apps/web/src/components/ui/kanban.tsx` (já confirmado no pedido do
  usuário como o primitivo de drag-and-drop certo, já em uso pelo kanban de `Customer`) — não
  reportar o `kanban.tsx` visual do DentalEase (stack diferente). Estrutura de telas
  (hub → detalhe do board → dialog/painel de card → gerenciador de colunas) inspirada em
  `../DentalEase/DentalEase/src/routes/_private/tools/kanban/**`, mas com painel inline em vez
  de `Dialog` (AD-037) e demais convenções de `apps/web/CLAUDE.md`.

---

## Deferred Ideas

- Compartilhamento granular (owner + collaborators, `PUT /:id/share`) — explicitamente decidido
  fora de escopo agora; todo board é tenant-wide. Se um caso de uso real pedir board privado por
  usuário depois, vira feature/ajuste próprio.
- Sincronizar `Card` com o `stage` do `Process` referenciado (herdar coluna automaticamente) —
  já era um trade-off aceito explicitamente pelo ADR-0011 ("se essa sincronia for desejada
  depois, vira feature explícita"); não faz parte desta feature.
- Status-base seedado / template de colunas reutilizável entre boards — fora de escopo; cada
  board começa do zero.
