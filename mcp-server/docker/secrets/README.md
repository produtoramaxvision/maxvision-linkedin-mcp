# Secrets — MaxVision LinkedIn MCP

Esta pasta contém placeholders para os secrets usados pelo `docker-compose.yml` (modo single-host).

> **NUNCA commitar valores reais.** Apenas exemplos vão neste repo. `.gitignore` já bloqueia `*.txt` e `li_cookies.json` reais.

---

## Secrets necessários

| Arquivo | Conteúdo | Como gerar |
|---|---|---|
| `master_key.txt` | 64 chars hex (chave AES-256-GCM) | `openssl rand -hex 32` |
| `postgres_password.txt` | senha do banco | `openssl rand -base64 24` |
| `webhook_secret.txt` | 64 chars hex | `openssl rand -hex 32` |
| `license_key.txt` | license key recebida no email Stripe | (tier Pro/Agency) |
| `li_cookies.json` | JSON com cookies `li_at` por conta | extrair via DevTools (ver `docs/setup-claude-code-only.md`) |

### Formato de `li_cookies.json`

```json
{
  "default": "AQED...",
  "backup": "AQED...",
  "personal": "AQED..."
}
```

---

## Modo Compose (single-host)

Os arquivos desta pasta são montados como Docker secrets via `secrets:` block do `docker-compose.yml`:

```bash
# 1. Criar arquivos
mkdir -p secrets
echo "$(openssl rand -hex 32)" > secrets/master_key.txt
echo "$(openssl rand -base64 24)" > secrets/postgres_password.txt
echo "$(openssl rand -hex 32)" > secrets/webhook_secret.txt
echo "MAXV-PRO-XXXX-XXXX-XXXX" > secrets/license_key.txt
nano secrets/li_cookies.json   # ver formato acima

# 2. Permissões restritas
chmod 600 secrets/*

# 3. Subir compose
docker compose up -d
```

---

## Modo Swarm (multi-node ou single-node Swarm)

NÃO usar esta pasta. Criar Swarm secrets via CLI antes de `docker stack deploy`:

```bash
# 1. Inicializar Swarm (se ainda não fez)
docker swarm init

# 2. Criar overlay network
docker network create --driver overlay --attachable traefik-public

# 3. Criar secrets externos
echo "$(openssl rand -hex 32)" | docker secret create maxv_master_key -
echo "$(openssl rand -base64 24)" | docker secret create maxv_postgres_password -
echo "$(openssl rand -hex 32)" | docker secret create maxv_webhook_secret -
echo "MAXV-PRO-XXXX-XXXX-XXXX" | docker secret create maxv_license_key -
docker secret create maxv_li_cookies ./li_cookies.json

# 4. Aplicar labels nos nodes (placement constraints)
docker node update --label-add maxv.db=true <db-node-id>
docker node update --label-add maxv.cache=true <cache-node-id>

# 5. Deploy
docker stack deploy -c ../docker-stack.yml maxv-linkedin
```

Ver `mcp-server/docker/docker-stack.yml` para detalhes de placement.

---

## Modo Portainer

Usar `portainer-stack.yml` com env vars no painel Portainer.

Para Portainer Swarm, criar secrets antes via UI **Secrets → Add secret** com nomes:
- `maxv_master_key`
- `maxv_postgres_password`
- `maxv_webhook_secret`
- `maxv_license_key`
- `maxv_li_cookies`

Depois importar `portainer-stack.yml` ajustado para usar `secrets:` (ver `docs/deploy-docker-swarm.md` seção "Portainer + Swarm").

---

## Rotação de secrets

| Secret | Frequência sugerida | Procedimento |
|---|---|---|
| `master_key` | Anual ou em incidente | Re-encrypt tabela `accounts.cookie_encrypted` com nova chave (script `scripts/rotate-master-key.ts`) |
| `postgres_password` | Anual | `ALTER USER` + atualizar secret |
| `webhook_secret` | Trimestral | Atualizar secret + re-config webhooks no n8n |
| `license_key` | Conforme renovação Stripe | Atualizar via portal cliente |
| `li_cookies` | A cada 60-90 dias ou se health-check falhar | Extrair novo cookie + atualizar secret |

Em Swarm, rotação requer:
```bash
docker secret create maxv_master_key_v2 - < new_key.txt
# editar docker-stack.yml para apontar maxv_master_key_v2
docker stack deploy -c docker-stack.yml maxv-linkedin
docker secret rm maxv_master_key  # após validar
```
