# RUN_BOOK — subir o CRM localmente (Docker Compose)

Sobe o ambiente inteiro (Mongo + crm-api + ai-gateway + web) em containers, com
hot-reload do código-fonte via bind mount. Uso local/dev — não é imagem de produção.

## Pré-requisitos

- Docker Desktop rodando.
- Arquivo `.env` na raiz (copie de `.env.example` se ainda não existir). O
  `ai-gateway` **não sobe** se `ANTHROPIC_API_KEY`, `META_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN` ou `OPENAI_API_KEY` estiverem vazios — para
  teste visual, qualquer string placeholder serve (não há chamada real a
  essas APIs só de navegar no sistema).

## Subir o ambiente

```bash
docker compose up --build -d
```

`--build` só é necessário na primeira vez ou depois de mudar dependências
(`package.json`/lockfile). Nas próximas vezes, `docker compose up -d` basta —
o código é montado por bind mount, então editar arquivos localmente já
reflete nos containers (tsx watch / Vite HMR).

Acompanhar os logs:

```bash
docker compose logs -f crm-api ai-gateway web
```

## Rodar o `web` fora do Docker (Mongo/crm-api/ai-gateway continuam no compose)

Sem conflito nenhum: `crm-api`/`ai-gateway`/`mongo` publicam a porta no host
(`8080`/`8081`/`27017`) e o `.env` da raiz já usa `localhost` em todo lugar
que cruza serviço (`VITE_API_URL`, `CORS_ORIGIN`, `WEB_BASE_URL`) — nunca o
nome do serviço do compose (`crm-api`/`ai-gateway`) como hostname. O
navegador acessa `http://localhost:5173` do mesmo jeito rodando o `web` no
container ou local, então o `Origin` que o `crm-api` vê pro CORS é idêntico
nos dois casos.

1. Pare só o container do `web` (mantém mongo/crm-api/ai-gateway rodando):
   ```bash
   docker compose stop web
   ```
2. Rode o front localmente (lê o mesmo `.env` da raiz via `envDir` do
   `vite.config.ts`, sem configuração extra):
   ```bash
   pnpm run dev:web
   ```
   Isso te devolve o Vite/TanStack Router rodando no processo local — Cmd/Ctrl+click
   nos DevTools do TanStack Router volta a abrir o arquivo de verdade no editor,
   o que não funciona quando o `web` roda dentro do container (source maps
   apontam pro path `/app/...` de dentro do container, não pro path local).

Pra voltar ao modo 100% Docker depois:

```bash
docker compose up -d web
```

## Serviços

| Serviço      | URL                          | Healthcheck                    |
| ------------ | ----------------------------- | ------------------------------- |
| web (Vite)   | http://localhost:5173         | —                                |
| crm-api      | http://localhost:8080         | `curl localhost:8080/health`    |
| ai-gateway   | http://localhost:8081         | `curl localhost:8081/health`    |
| mongo        | localhost:27017                | container `healthy` no `docker compose ps` |

## Primeiro acesso (bootstrap de tenant)

Não existe usuário/tenant algum numa base nova — é preciso criar via API.

1. **Seed do admin de plataforma** (idempotente):
   ```bash
   docker compose exec crm-api /app/node_modules/.bin/tsx scripts/seed-platform-admin.ts
   ```
   Cria `admin@platform.local` / `plataforma123`.

2. **Login como admin de plataforma** e guardar o cookie de sessão:
   ```bash
   curl -c /tmp/crm.cookies -X POST http://localhost:8080/auth/signin \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@platform.local","password":"plataforma123"}'
   ```

3. **Criar um tenant** (`document` = 14 dígitos, precisa ser único):
   ```bash
   curl -b /tmp/crm.cookies -X POST http://localhost:8080/platform/tenants \
     -H 'Content-Type: application/json' \
     -d '{"name":"Empresa Teste","document":"11222333000181"}'
   ```
   Guarde o `id` retornado.

4. **Convidar um usuário admin do tenant** (`role`: `admin` | `gestor` | `operador`):
   ```bash
   curl -b /tmp/crm.cookies -X POST http://localhost:8080/platform/tenants/<TENANT_ID>/invites \
     -H 'Content-Type: application/json' \
     -d '{"email":"voce@teste.local","role":"admin"}'
   ```

5. **Pegar o link do convite no log do crm-api** (`MAIL_PROVIDER=log` escreve
   o e-mail no stdout em vez de enviar):
   ```bash
   docker compose logs crm-api | grep mail.log_send
   ```
   Abra `http://localhost:5173/invite?token=...` no navegador com o token do
   log, defina nome/senha e você cai logado como admin do tenant.

## Comandos úteis

```bash
docker compose ps               # status dos serviços
docker compose restart crm-api  # reinicia um serviço específico
docker compose down             # para e remove os containers (mantém dados do Mongo)
docker compose down -v          # idem, e apaga o volume do Mongo (reset total)
```

## Limitações conhecidas

- Sem botão de logout no `web` ainda — para testar um novo login, limpe os
  cookies e acesse `/auth` direto.
- Templates de processo e profissionais **não são seedados** por tenant novo
  — crie o primeiro em `/processes/add` → "Adicionar" e em
  `/schedule/professionals` → "Adicionar" antes de usar essas telas.
- `/auth/signin` tem rate limit de 5 tentativas/15min por e-mail+IP.
