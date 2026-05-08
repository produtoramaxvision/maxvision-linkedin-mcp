# Deploy VPS — MaxVision LinkedIn MCP

Guia operacional para deployar o `maxvision-linkedin-mcp` na VPS arm64 `vmmvp`
(`163.176.233.224`) atrás do Traefik 3.4 já existente.

Stack: `maxv-linkedin` (Portainer) com 3 services: `mcp-server`, `mcp_postgres`,
`mcp_redis`. Domínio público: `linkedin-mcp.produtoramaxvision.com.br` com TLS
provisionado via Let's Encrypt HTTP-01 (cert resolver `letsencryptresolver`).

---

## 1. Pré-requisitos

Verifique antes de começar:

- VPS arm64 Ubuntu acessível via Portainer (`https://portainer.produtoramaxvision.com.br`).
- Docker em modo **Swarm** (a stack usa `deploy:` keys).
- Network overlay `net` existente:

  ```bash
  docker network ls | grep -E "\\bnet\\b"
  # Esperado: net   overlay   swarm
  ```

- Traefik 3.4 rodando com cert resolver chamado `letsencryptresolver`
  (NÃO `letsencrypt`):

  ```bash
  docker service inspect traefik --format '{{ json .Spec.TaskTemplate.ContainerSpec.Args }}' \
    | tr ',' '\n' | grep certresolver
  # Esperado: ...certresolvers.letsencryptresolver...
  ```

- DNS apontando para a VPS (DNS-only/gray no Cloudflare, NÃO Proxied — Traefik
  precisa acessar a porta 80 diretamente para o desafio HTTP-01):

  ```bash
  dig +short linkedin-mcp.produtoramaxvision.com.br
  # Esperado: 163.176.233.224
  ```

- Acesso ao GHCR. Imagem é **pública** (não precisa login para `docker pull`),
  mas o CI precisa de `GITHUB_TOKEN` (já provisionado por padrão).

---

## 2. Gerar secrets (no laptop, NÃO na VPS)

Execute em um terminal local. **Salve em vault/password manager. NÃO commite.**

```bash
# MASTER_KEY — chave de criptografia de cookies/sessão (64 hex chars, 32 bytes)
openssl rand -hex 32
# ex.: 1ed4eb1b6cf66e54aa1c...

# POSTGRES_PASSWORD — senha do Postgres dedicado da stack
openssl rand -hex 24
# ex.: ed4eb1b6cf66e54aa1c2...

# MCP_API_KEYS — 3 keys (1 self + 2 clientes Pro/Agency), CSV separado por vírgula
for i in 1 2 3; do echo "mxv_$(openssl rand -hex 24)"; done
# mxv_1ed4...
# mxv_ed4e...
# mxv_4eb1...
# Junte com vírgulas: mxv_1ed4...,mxv_ed4e...,mxv_4eb1...
```

Anote também:

- `ACME_EMAIL=produtoramaxvision@gmail.com` (pode reutilizar do template)
- `MCP_HOST=linkedin-mcp.produtoramaxvision.com.br` (default do stack)
- `MCP_VERSION=0.1.0-sprint1` (ou tag mais recente publicada no GHCR)

---

## 3. Verificar imagem GHCR

Antes de subir o stack, garanta que a imagem alvo existe no GHCR:

```bash
docker pull ghcr.io/produtoramaxvision/maxvision-linkedin-mcp:0.1.0-sprint1
```

Se falhar com `manifest unknown`:

1. Cheque o run mais recente do workflow `mcp-server image` em
   [Actions](https://github.com/produtoramaxvision/maxvision-linkedin-mcp/actions/workflows/mcp-server-image.yml).
2. Se ainda não rodou, dispare um push em `homolog` ou rode manualmente
   (`workflow_dispatch`).
3. Aguarde 5-8 min (build multi-arch via QEMU é lento para arm64).

---

## 4. Portainer deploy

1. Login no Portainer.
2. Endpoint VPS → **Stacks → Add stack**.
3. Name: `maxv-linkedin`.
4. Build method: **Web editor** — cole o conteúdo de
   [`portainer-stack-vmmvp.yml`](./portainer-stack-vmmvp.yml).
5. **Environment variables** — adicione exatamente:

   | Variável            | Valor                                        |
   | ------------------- | -------------------------------------------- |
   | `MCP_VERSION`       | `0.1.0-sprint1`                              |
   | `MCP_HOST`          | `linkedin-mcp.produtoramaxvision.com.br`     |
   | `POSTGRES_PASSWORD` | (24 hex gerado no passo 2)                   |
   | `MASTER_KEY`        | (64 hex gerado no passo 2)                   |
   | `MCP_API_KEYS`      | `mxv_xxx,mxv_yyy,mxv_zzz` (CSV)              |
   | `ACME_EMAIL`        | `produtoramaxvision@gmail.com`               |

6. **Deploy stack**.

A stack sobe `mcp_postgres` e `mcp_redis` primeiro (depends_on), depois
`mcp-server`. Tempo total: ~30s para Postgres ficar healthy + ~10s para
o MCP iniciar.

---

## 5. Aguardar Traefik provisionar cert

Após o stack subir, Traefik detecta as labels do `mcp-server` e dispara
o desafio HTTP-01 com o Let's Encrypt. Tempo: 1-3 min.

Acompanhe os logs do Traefik:

```bash
docker service logs -f traefik 2>&1 | grep -i linkedin-mcp
# Esperado:
# ... msg="Adding route for linkedin-mcp.produtoramaxvision.com.br ..."
# ... msg="Try to challenge certificate ... using HTTP-01"
# ... msg="Domains [linkedin-mcp...] need ACME certificates ..."
# ... msg="Certificate obtained for domains [linkedin-mcp...]"
```

Se o cert demorar mais que 5 min: ver Troubleshooting (seção 9).

---

## 6. Smoke tests (do laptop)

Substitua `mxv_<your_key>` por uma key válida do `MCP_API_KEYS`.

```bash
# 6.1 — Health check (sem auth, público)
curl -sS https://linkedin-mcp.produtoramaxvision.com.br/health
# Esperado: {"status":"ok","uptime_ms":...,"version":"0.1.0","transport":"http"}

# 6.2 — Auth fail (sem key)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  https://linkedin-mcp.produtoramaxvision.com.br/mcp -d '{}'
# Esperado: 401

# 6.3 — Auth pass + initialize JSON-RPC
# IMPORTANTE: header `Accept: application/json, text/event-stream` é obrigatório
# (StreamableHTTPServerTransport rejeita sem ele com erro -32000 "Not Acceptable").
curl -sS -X POST https://linkedin-mcp.produtoramaxvision.com.br/mcp \
  -H "Authorization: Bearer mxv_<your_key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
# Esperado: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","serverInfo":{...},...}}

# 6.4 — tools/list (deve retornar 4 tools)
curl -sS -X POST https://linkedin-mcp.produtoramaxvision.com.br/mcp \
  -H "Authorization: Bearer mxv_<your_key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
# Esperado: result.tools = [search_jobs, get_profile, get_job_details, track_application]

# 6.5 — tools/call invoke real (mock retorna 3 jobs em Sprint 1)
curl -sS -X POST https://linkedin-mcp.produtoramaxvision.com.br/mcp \
  -H "Authorization: Bearer mxv_<your_key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_jobs","arguments":{"keywords":"backend engineer","location":"Remote","maxResults":3}}}'
# Esperado: result.content[0].text = JSON com count=3, jobs[]
```

Se algum teste falhar: ver Troubleshooting.

---

## 7. Configurar Claude Code (no laptop)

Plugin `linkedin-maxvision` ainda não publicado no marketplace público;
quando publicado:

```bash
claude /plugin install produtoramaxvision/maxvision-linkedin-mcp
```

Configure a env var com sua API key (PowerShell — persiste para o usuário):

```powershell
[Environment]::SetEnvironmentVariable("MAXVISION_API_KEY", "mxv_xxx", "User")
```

Reabra o Claude Code. O plugin conecta via HTTP em
`https://linkedin-mcp.produtoramaxvision.com.br/mcp` usando a key do env.

---

## 8. Injetar cookie LinkedIn (Sprint 1.5+)

A partir do Sprint 1.5 os scrapers usam Patchright para navegar LinkedIn real.
Cada `accountId` no DB precisa ter cookie `li_at` válido encriptado.

### 8.1 — Capturar `li_at` do navegador

A partir de Sprint 1.5.1 há dois caminhos. Prefira o automatizado (§8.2). O
manual (§8.3) fica como escape hatch para quando o automatizado falhar.

### 8.2 — Capturar via Claude Code (recomendado)

No Claude Code (com plugin `linkedin-maxvision` instalado + `MAXVISION_API_KEY`
no env do laptop):

```
/linkedin-cookie-refresh
```

Janela do navegador abre apontando para LinkedIn login. Faça login normalmente
(senha + 2FA se houver). O script captura o `li_at`, valida via `/feed`,
e POSTa o cookie cru ao servidor — que encripta com AES-256-GCM (`MASTER_KEY`
nunca sai da VPS) e grava em `accounts.cookie_encrypted`.

Pré-requisitos one-time no laptop:

- Node 20+
- `cd mcp-server && pnpm install` (instala `patchright` e `tsx`)
- Chromium do Patchright: `cd mcp-server && npx patchright install chromium`
- Env var `MAXVISION_API_KEY` setada com uma key válida do `MCP_API_KEYS` do stack

Argumentos opcionais:

```
/linkedin-cookie-refresh --account-id sandbox-01 --display-name "Sandbox 01" --expires-days 90
```

Tempo total: 30-60s (depende do quanto você demora para logar).

Exit codes do script (relayed pelo comando ao usuário): ver
`plugins/linkedin-maxvision/commands/linkedin-cookie-refresh.md`.

### 8.3 — Manual SQL (fallback avançado)

Use só se §8.2 falhar de forma reproduzível (Patchright corrompido, sem rede,
debug). Requer acesso SSH/Portainer console e o `MASTER_KEY` do stack — risco
operacional muito maior.

Capturar o cookie:

1. Login na sua conta LinkedIn (preferencialmente CONTA SANDBOX, não principal)
2. DevTools → Application → Cookies → `https://www.linkedin.com`
3. Localizar cookie `li_at`. Copiar o valor (string ~150 chars)

Opção A (script utilitário no laptop, fora da VPS):

```bash
cd mcp-server
node --import tsx -e "
import { encryptCookie } from './src/auth/cookies.js';
process.env.MASTER_KEY = '<MASTER_KEY do stack>';
const blob = encryptCookie('<COLE li_at AQUI>');
console.log(blob.toString('hex'));
"
# Output: blob hex (IV‖tag‖ciphertext)
```

Opção B (SQL direto via Portainer Postgres console):

```sql
INSERT INTO accounts (id, display_name, cookie_encrypted, cookie_expires_at, status)
VALUES (
  'default',
  'Conta Sandbox',
  decode('<HEX BLOB OPCAO A>', 'hex'),
  NOW() + INTERVAL '90 days',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  cookie_encrypted = EXCLUDED.cookie_encrypted,
  cookie_expires_at = EXCLUDED.cookie_expires_at,
  updated_at = NOW();
```

### 8.4 — Testar scraper real

```bash
curl -X POST https://linkedin-mcp.produtoramaxvision.com.br/mcp \
  -H "Authorization: Bearer mxv_<your_key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_jobs","arguments":{"keywords":"backend engineer","location":"São Paulo","maxResults":3,"sources":"linkedin"}}}'
```

Se retornar:
- 200 com jobs reais → cookie OK
- AppError code `COOKIE_EXPIRED` → cookie inválido, recapturar
- AppError code `CAPTCHA_DETECTED` → conta sinalizada, parar 24h e refresh cookie

### 8.5 — Rate-limit conservador Sprint 1.5

**IMPORTANTE:** Sprint 1.5 ainda é beta. LinkedIn detecta automação.

Recomendações para evitar ban:
- Máx **1 search/h** durante primeiras 48h (validar saúde da conta)
- Aumentar gradualmente até limite default (10 burst, 6/min sustained)
- Usar `/linkedin-status` diariamente para checar `captcha_events`
- NUNCA usar conta principal — sempre sandbox descartável
- Em caso de captcha: stop 24h, refresh cookie

Padrão por tier (Sprint 3+):
- Free: 5 searches/dia, 3 profile views/dia
- Pro: 50 searches/dia, 30 profile views/dia
- Agency: pool de N contas, sem limite agregado individual

---

## 9. Troubleshooting

### `502 Bad Gateway`

`mcp-server` crashou ou nem subiu. Investigar logs do service:

```bash
docker service logs maxv-linkedin_mcp-server --tail 100
```

Causas comuns:

- `MASTER_KEY` com formato inválido (precisa 64 hex chars exatos).
- `DATABASE_URL` errado (verifique se o nome do service Postgres na env é
  `mcp_postgres` e não `postgres`).
- Imagem ainda não disponível no GHCR (passo 3).

### `404 Not Found`

Traefik não roteou. Cheque:

- Labels do `mcp-server` corretas (rule, service, port=3000).
- DNS resolvendo para o IP correto (`dig +short`).
- Network `net` está external e o service está conectado a ela.

### SSL handshake fail / cert não provisiona

- Domínio precisa ser **DNS-only/gray** no Cloudflare (NÃO Proxied/orange).
- Porta 80 da VPS aberta (Traefik precisa para o HTTP-01 challenge).
- Logs do Traefik para erros do ACME (passo 5).
- Se persistir, force renew limpando o cache do Traefik (cuidado, afeta
  outros domínios; só em último caso).

### `401 unauthorized` mesmo com key correta

- Verifique o env `MCP_API_KEYS` no container:

  ```bash
  docker exec $(docker ps -qf "label=com.docker.swarm.service.name=maxv-linkedin_mcp-server" | head -1) \
    env | grep MCP_API_KEYS
  ```

- A string CSV NÃO pode ter espaços extras (`mxv_a,mxv_b`, NÃO `mxv_a, mxv_b`).
- A key deve estar exatamente igual à passada no header `Authorization: Bearer`.

### `Postgres connection refused`

`mcp_postgres` pode não ter subido. Cheque:

```bash
docker service ps maxv-linkedin_mcp_postgres
docker service logs maxv-linkedin_mcp_postgres --tail 50
```

Se mostra `restarting`, provável volume corrompido — em ambiente novo,
remova o volume e redeploy:

```bash
docker stack rm maxv-linkedin
docker volume rm maxv-linkedin_mcp_postgres_data
# redeploy via Portainer
```

### Stack não sobe / `network net not found`

A network overlay `net` precisa existir antes do deploy. Crie se
necessário (apenas em ambientes novos):

```bash
docker network create --driver overlay --attachable net
```

---

## 10. Update procedure (releases futuros)

Quando o CI publicar uma versão nova (ex: `0.1.1-sprint2`):

1. Confirme a tag no GHCR:
   ```bash
   docker pull ghcr.io/produtoramaxvision/maxvision-linkedin-mcp:0.1.1-sprint2
   ```
2. Portainer → Stacks → `maxv-linkedin` → **Editor**.
3. Em **Environment variables**, atualize `MCP_VERSION=0.1.1-sprint2`.
4. **Update the stack** (deixe `Re-pull image` marcado).

O `update_config: order: start-first` garante zero-downtime: a versão nova
sobe e fica healthy antes da antiga ser parada. Se a nova falhar healthcheck,
`failure_action: rollback` reverte automaticamente.
