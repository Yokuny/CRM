# ADR-0001 — Monorepo com pnpm workspaces

- **Status:** Aceito
- **Data:** 2026-09-02

## Contexto

O sistema tem três deployáveis (`crm-api`, `ai-gateway`, `web`) que compartilham
schemas Zod, models Mongoose e — o caso mais forte — o motor de campos dinâmicos,
que precisa rodar **igual** no back-end (validação) e no front-end (renderização
recursiva). Nos projetos de referência (`DentalEase` / `DentalEase-BackEnd`) esses
contratos são duplicados entre repositórios, e cópia diverge.

## Decisão

Monorepo único com pnpm workspaces:

```
apps/      crm-api · ai-gateway · web
packages/  contracts · db · field-engine · ai-kit
```

Deploy continua independente: cada app tem seu Dockerfile e seu manifesto k8s.

## Consequências

- Mudança de contrato é atômica — um PR muda schema, API e UI juntos.
- `packages/field-engine` é isomórfico: uma definição de tipo, dois consumidores.
- CI fica mais pesado (roda tudo). Mitigar com cache de task por workspace.
- Permissão de repositório passa a ser tudo-ou-nada; se um dia houver time externo
  para um dos serviços, reavaliar.

## Alternativas consideradas

- **Três repositórios separados** (padrão atual do DentalEase): máxima independência,
  mas os contratos compartilhados virariam pacote publicado ou cópia manual.
- **Monorepo só dos back-ends, front à parte**: não resolve o problema principal,
  que é justamente back-end e front compartilharem o motor de campos.
