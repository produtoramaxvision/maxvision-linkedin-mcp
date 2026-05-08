# Deploy — Docker & Docker Swarm

Guia consolidado dos três modos de deploy suportados pelo MaxVision LinkedIn MCP. Aplicável às duas variantes (A standalone, B híbrida).

---

## Sumário dos modos

| Modo | Comando-chave | Quando usar |
|---|---|---|
| **Docker Engine standalone** | `docker compose up -d` | Dev local, single-host pequeno, primeiro setup |
| **Docker Swarm CLI** | `docker stack deploy -c docker-stack.yml maxv-linkedin` | Produção self-managed, multi-node, controle total |
| **Portainer Stack (Compose ou Swarm)** | UI → Stacks → Add stack | Produção com gestão visual, GitOps via repo, equipes |

Os três usam a **mesma imagem Docker** (`ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:<tag>`). A diferença está apenas no orquestrador e no formato de secrets/configs.

---

## Pré-requisitos comuns

- Docker Engine 24.0+ ou Docker Desktop com Compose v2.
- Para Swarm: 1+ node (single-node Swarm é válido).
- Para Portainer: instância 2.19+ acessível.
- Domínio com DNS apontando para o host/cluster (ex: `linkedin-mcp.seu-dominio.com`).
- Traefik v2/v3 já rodando como ingress no mesmo network `traefik-public` (ou alternativa: editar labels para Caddy/Nginx Proxy Manager).
- 2 vCPU + 4 GB RAM mínimos para o stack completo. 4 vCPU + 8 GB RAM recomendado para tier Pro+ multi-conta.

---

## Modo 1 — Docker Engine standalone

Mais simples. Usa `docker-compose.yml` com `secrets:` baseado em arquivo.

```bash
git clone https://github.com/produtoramaxvision/maxvision-linkedin-mcp
cd maxvision-linkedin-mcp/mcp-server/docker

# 1. Criar overlay network (se ainda não existe)
docker network create traefik-public 2>/dev/null || true

# 2. Preparar secrets locais
mkdir -p secrets
echo "$(openssl rand -hex 32)" > secrets/master_key.txt
echo "$(openssl rand -base64 24)" > secrets/postgres_password.txt
echo "$(openssl rand -hex 32)" > secrets/webhook_secret.txt
echo "MAXV-PRO-XXXX-XXXX-XXXX" > secrets/license_key.txt
cat > secrets/li_cookies.json <<'EOF'
{
  "default": "COLE-AQUI"
}
EOF
chmod 600 secrets/*

# 3. Configurar env vars (versão, host, etc.)
cp .env.example .env
${EDITOR:-nano} .env

# 4. Subir
docker compose up -d

# 5. Verificar
docker compose ps
docker compose logs -f mcp
curl -fsS http://localhost:3000/health
```

### Atualizar versão

```bash
# Editar .env: MCP_VERSION=1.2.3
docker compose pull mcp
docker compose up -d mcp
```

### Rodar migrations Postgres

```bash
docker compose exec mcp pnpm migrate:up
```

---

## Modo 2 — Docker Swarm CLI

Recomendado para self-hosted produção sem Portainer. Usa `docker-stack.yml` com **Swarm secrets** (não baseados em arquivo).

### 2.1 — Inicialização

```bash
# Em um node de manager:
docker swarm init --advertise-addr <ip-publico-do-manager>

# Output dará comando para outros workers fazerem `docker swarm join`.
```

### 2.2 — Network overlay

```bash
docker network create --driver overlay --attachable traefik-public
```

> **Importante:** Traefik deve estar no MESMO network `traefik-public` para descobrir os serviços. Se Traefik está em outro stack, certifique que está conectado a `traefik-public`.

### 2.3 — Labels nos nodes (placement)

`docker-stack.yml` usa constraints para distribuir serviços. Aplicar:

```bash
# Identificar nodes
docker node ls

# Aplicar labels
docker node update --label-add maxv.db=true <node-id-do-db>
docker node update --label-add maxv.cache=true <node-id-do-cache>
docker node update --label-add zone=us-east <node-id>  # opcional para spread
```

Em single-node Swarm, todas as constraints podem apontar para o mesmo node:

```bash
NODE_ID=$(docker node ls -q)
docker node update --label-add maxv.db=true $NODE_ID
docker node update --label-add maxv.cache=true $NODE_ID
```

### 2.4 — Criar secrets externos

```bash
echo "$(openssl rand -hex 32)" | docker secret create maxv_master_key -
echo "$(openssl rand -base64 24)" | docker secret create maxv_postgres_password -
echo "$(openssl rand -hex 32)" | docker secret create maxv_webhook_secret -
echo "MAXV-PRO-XXXX-XXXX-XXXX" | docker secret create maxv_license_key -

# Cookie JSON: criar arquivo temporário, criar secret, deletar arquivo
cat > /tmp/li_cookies.json <<'EOF'
{ "default": "AQED...", "backup": "AQED..." }
EOF
docker secret create maxv_li_cookies /tmp/li_cookies.json
shred -u /tmp/li_cookies.json
```

Verificar:

```bash
docker secret ls
```

### 2.5 — Configs (não-sensíveis)

Postgres `init.sql` é montado como **config** (não secret):

```bash
# Criado automaticamente pelo stack-deploy a partir de ./postgres/init.sql
```

Se precisar atualizar SQL:

```bash
docker config rm maxv-linkedin_postgres_init
docker stack deploy -c docker-stack.yml maxv-linkedin  # recria
```

### 2.6 — Variáveis de ambiente

Criar `.env` na pasta de onde vai rodar `docker stack deploy`. Compose v3 lê automaticamente:

```bash
cp .env.example .env
${EDITOR:-nano} .env
```

Definir pelo menos:
- `MCP_HOST=linkedin-mcp.seu-dominio.com`
- `MCP_VERSION=1.0.0` (ou tag desejada)
- `MCP_REPLICAS=2` (se multi-node)
- `LOG_LEVEL=info`

### 2.7 — Deploy

```bash
cd maxvision-linkedin-mcp/mcp-server/docker
docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin
```

Saída esperada:

```
Creating service maxv-linkedin_mcp
Creating service maxv-linkedin_postgres
Creating service maxv-linkedin_redis
```

### 2.8 — Validação

```bash
# Status dos serviços
docker stack services maxv-linkedin

# Detalhes de cada réplica
docker service ps maxv-linkedin_mcp

# Logs (todas as réplicas)
docker service logs -f maxv-linkedin_mcp

# Healthcheck
curl -fsS https://linkedin-mcp.seu-dominio.com/health
```

### 2.9 — Update da imagem (rolling)

```bash
docker service update \
  --image ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:1.0.1 \
  --update-parallelism 1 \
  --update-delay 30s \
  --update-order start-first \
  --update-failure-action rollback \
  maxv-linkedin_mcp
```

Ou re-deploy da stack inteira após editar `.env`:

```bash
docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin
```

### 2.10 — Rollback

```bash
docker service rollback maxv-linkedin_mcp
```

### 2.11 — Remover stack

```bash
docker stack rm maxv-linkedin
# Aguardar: docker network rm pode falhar enquanto containers ainda saem
sleep 30
docker volume ls | grep maxv-linkedin   # listar volumes órfãos
docker volume prune  # opcional, cuidado com dados
```

> **Atenção:** `docker stack rm` NÃO remove secrets nem volumes. Volumes contêm Postgres, Redis e cache Patchright. Manter em rotina normal.

### 2.12 — Backup Postgres

```bash
# Identificar container Postgres ativo
PG_CONTAINER=$(docker ps -qf name=maxv-linkedin_postgres)

# Dump
docker exec $PG_CONTAINER pg_dump -U mcp mcp > backup-$(date +%F).sql

# Restore
docker exec -i $PG_CONTAINER psql -U mcp mcp < backup-2026-05-07.sql
```

---

## Modo 3 — Portainer Stack

Recomendado para gestão visual, GitOps com repo Git, e equipes.

### 3.1 — Modo Compose (single-host)

Mais simples. Portainer cria containers Docker direto.

1. **Stacks → Add stack → Web editor (ou Repository)**.
2. Cole `mcp-server/docker/portainer-stack.yml` ou aponte para Git.
3. **Environment variables**: preencher pelo menos:
   - `MCP_HOST=linkedin-mcp.seu-dominio.com`
   - `MCP_VERSION=latest`
   - `POSTGRES_PASSWORD=<gerar>`
   - `MASTER_KEY=<gerar com openssl rand -hex 32>`
   - `WEBHOOK_SECRET=<gerar>`
   - `LICENSE_KEY=<se Pro>`
   - `LI_COOKIES_JSON=<JSON inline>`
4. **Deploy the stack**.

### 3.2 — Modo Swarm via Portainer

Recomendado para produção. Combina UI + benefícios Swarm.

#### Pré-requisito

Portainer conectado a um endpoint Swarm. Em **Environments**, o tipo deve ser "Docker Swarm".

#### Criar secrets via UI

**Secrets → Add secret**:
- `maxv_master_key` → 64 chars hex
- `maxv_postgres_password` → 24 chars random
- `maxv_webhook_secret` → 64 chars hex
- `maxv_license_key` → license recebida
- `maxv_li_cookies` → upload JSON file

#### Aplicar labels nos nodes via UI

**Cluster → Nodes** → editar cada node → adicionar label:
- `maxv.db=true`
- `maxv.cache=true`

#### Adicionar stack

**Stacks → Add stack → Repository**:

```
Name:                 maxv-linkedin
Repository URL:       https://github.com/produtoramaxvision/maxvision-linkedin-mcp
Repository ref:       refs/heads/main
Compose path:         mcp-server/docker/docker-stack.yml
Authentication:       (token apenas se repo privado Pro)
GitOps updates:       ON
Mechanism:            Polling - 5 minutes
                      OU
                      Webhook (pega URL gerada)
Re-pull image:        ON
Force redeploy:       OFF (deixa OFF, usar webhook se quiser forçar)
```

Environment variables: mesmas do modo Compose. Portainer permite editar depois sem mexer no compose.

**Deploy the stack**.

#### Webhook GitOps

Portainer gera URL tipo:

```
https://portainer.seu-dominio.com/api/stacks/webhooks/<uuid>
```

Configurar no GitHub repo → **Settings → Webhooks**:
- Payload URL: a URL acima.
- Content type: `application/json`.
- Events: apenas `push` em `main`.

A cada push, Portainer pulls + redeploys automaticamente.

#### Webhook com env override

Para forçar versão específica via webhook:

```
https://portainer:9443/api/stacks/webhooks/<uuid>?MCP_VERSION=1.0.2
```

E no compose:

```yaml
image: ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:${MCP_VERSION:-latest}
```

### 3.3 — Update via Portainer UI

**Stacks → maxv-linkedin → Editor** → editar variáveis ou compose → **Update the stack**.

Para forçar re-pull mesmo sem mudança:

**Stacks → maxv-linkedin → Pull and redeploy**.

---

## Comparação rápida

| Capacidade | Compose standalone | Swarm CLI | Portainer Compose | Portainer Swarm |
|---|---|---|---|---|
| Multi-node | Não | Sim | Não | Sim |
| Rolling updates | Não (recreate) | Sim | Não | Sim |
| Secrets em runtime | File mount | Swarm secrets | Env vars | Swarm secrets |
| GitOps (auto-pull) | Não (manual) | Não (script) | Sim | **Sim** |
| Replicas auto-scaling | Não | Manual | Não | Manual |
| UI de gestão | Não | Não | Sim | **Sim** |
| Webhook deploy | Não | Não | Sim | **Sim** |
| Backup automatizado | Manual | Manual | Sim (CE) | Sim |

---

## Troubleshooting comum

### `network traefik-public not found`

```bash
# Compose:
docker network create traefik-public

# Swarm:
docker network create --driver overlay --attachable traefik-public
```

### Pull falha com `unauthorized` (imagem privada GHCR)

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <user> --password-stdin
docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin
```

### Réplicas em `Pending` em Swarm

```bash
docker service ps --no-trunc maxv-linkedin_mcp
```

Causas comuns:
- Constraint sem node compatível → ajustar labels.
- Resources reservation maior que disponível → ajustar `reservations`.
- Imagem indisponível → testar `docker pull` manual.

### Healthcheck falhando

```bash
docker service logs maxv-linkedin_mcp | tail -100
docker exec -it $(docker ps -qf name=maxv-linkedin_mcp) curl http://localhost:3000/health
```

Frequente: cookies expirados, MASTER_KEY ausente, Postgres não pronto na startup. Conferir `docker service ps maxv-linkedin_postgres`.

### Patchright crash com `Failed to launch chromium`

Container não tem GPU/sandbox. `Dockerfile` já roda Chromium com `--no-sandbox`. Se erro persistir, conferir `kernel.unprivileged_userns_clone=1` no host:

```bash
sysctl kernel.unprivileged_userns_clone
# Se 0, ajustar:
echo "kernel.unprivileged_userns_clone=1" | sudo tee /etc/sysctl.d/99-userns.conf
sudo sysctl --system
```

### Portainer GitOps não atualiza

- Verificar webhook (Settings → Webhooks → recent deliveries).
- Conferir credenciais Git (se privado).
- Logs do Portainer: `docker logs portainer | grep -i stack`.

---

## Migrar de Compose → Swarm

```bash
# 1. Backup Postgres
docker compose exec postgres pg_dump -U mcp mcp > backup.sql

# 2. Stop compose
docker compose down

# 3. Inicializar Swarm e criar secrets (ver seção 2)

# 4. Deploy stack
docker stack deploy -c docker-stack.yml maxv-linkedin

# 5. Aguardar Postgres pronto
docker service ps maxv-linkedin_postgres

# 6. Restore
PG=$(docker ps -qf name=maxv-linkedin_postgres)
docker exec -i $PG psql -U mcp mcp < backup.sql
```

---

## n8n no mesmo Swarm (Variante B Agency)

Para tier Agency, é vantajoso rodar n8n no MESMO cluster Swarm que o MCP. Reduz latência (n8n→MCP via service-name interno), simplifica TLS (Traefik único), e centraliza backup.

### Stack n8n compartilhando overlay

```yaml
# n8n-stack.yml — referência mínima
version: "3.9"

services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_HOST: ${N8N_HOST}
      N8N_PROTOCOL: https
      N8N_PORT: 5678
      WEBHOOK_URL: https://${N8N_HOST}/
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: n8n-postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD_FILE: /run/secrets/n8n_db_password
      N8N_ENCRYPTION_KEY_FILE: /run/secrets/n8n_encryption_key
      EXECUTIONS_MODE: queue
      QUEUE_BULL_REDIS_HOST: n8n-redis
    secrets:
      - n8n_db_password
      - n8n_encryption_key
    volumes:
      - n8n-data:/home/node/.n8n
    networks:
      - traefik-public
      - n8n-internal
      - mcp-internal       # acesso ao MCP via service name
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == worker
      labels:
        traefik.enable: "true"
        traefik.docker.network: "traefik-public"
        traefik.http.routers.n8n.rule: "Host(`${N8N_HOST}`)"
        traefik.http.routers.n8n.entrypoints: "websecure"
        traefik.http.routers.n8n.tls.certresolver: "letsencrypt"
        traefik.http.services.n8n.loadbalancer.server.port: "5678"

  n8n-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: n8n
      POSTGRES_DB: n8n
      POSTGRES_PASSWORD_FILE: /run/secrets/n8n_db_password
    secrets:
      - n8n_db_password
    volumes:
      - n8n-pg-data:/var/lib/postgresql/data
    networks:
      - n8n-internal

  n8n-redis:
    image: redis:7-alpine
    volumes:
      - n8n-redis-data:/data
    networks:
      - n8n-internal

secrets:
  n8n_db_password:
    external: true
  n8n_encryption_key:
    external: true

volumes:
  n8n-data:
  n8n-pg-data:
  n8n-redis-data:

networks:
  traefik-public:
    external: true
  n8n-internal:
    driver: overlay
  mcp-internal:
    external: true
    name: maxv-linkedin_mcp-internal
```

### Service discovery entre n8n e MCP

Dentro do Swarm, os workflows n8n podem chamar o MCP via DNS interno **sem TLS**, evitando certificado e latência:

```
URL nas HTTP Request nodes do n8n:
  http://maxv-linkedin_mcp:3000/tools/search_jobs
```

Em vez de:
```
https://linkedin-mcp.cliente.com/tools/search_jobs
```

Vantagens:
- Latência ~5ms vs ~200ms (sem hop externo).
- Sem dependência de DNS público / TLS.
- Sem rate-limit do Traefik na rota interna.

### Multi-tenant (clientes Agency)

Cada cliente Agency tem seu próprio stack:

```bash
docker stack deploy -c docker-stack.yml -e CLIENT=acme maxv-acme
docker stack deploy -c docker-stack.yml -e CLIENT=beta maxv-beta
```

n8n compartilhado entre todos, mas cada workflow filtra por `client_id` no payload. Workflow `linkedin-team-sync.json` cuida disso.

### Ordem de deploy

```bash
# 1. Network compartilhada
docker network create --driver overlay --attachable traefik-public

# 2. MCP stack (cria network mcp-internal compartilhada)
docker stack deploy -c docker-stack.yml maxv-linkedin

# 3. n8n stack (consome mcp-internal como external)
docker stack deploy -c n8n-stack.yml n8n

# 4. Validar
docker stack ps maxv-linkedin
docker stack ps n8n
docker exec $(docker ps -qf name=n8n_n8n) curl http://maxv-linkedin_mcp:3000/health
```

---

## Próximos passos

- Setup do plugin Claude Code: [setup-claude-code-only.md](setup-claude-code-only.md).
- Setup com n8n: [setup-hybrid-n8n.md](setup-hybrid-n8n.md).
- Arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md).
- Compliance e ToS: [RISKS-COMPLIANCE.md](RISKS-COMPLIANCE.md).
- Sprint 0 — criação do marketplace: [MARKETPLACE-CREATION-RUNBOOK.md](../MARKETPLACE-CREATION-RUNBOOK.md).
