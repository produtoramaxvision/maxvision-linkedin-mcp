# Setup — Variante A (Claude Code only)

Guia passo-a-passo para instalar a Variante A. Voltado para o cliente final do tier Free e Pro standalone.

---

## Pré-requisitos

- **Sistema operacional**: Linux (Ubuntu 22.04+), macOS 12+, ou Windows 11 com WSL2.
- **Claude Code**: v2.1.0 ou superior. ([Instalação oficial](https://docs.anthropic.com/claude-code))
- **Node.js**: v20 LTS ou superior.
- **Docker**: 24.0+ com docker-compose.
- **VPS** (opcional para Free, recomendado): Ubuntu 22.04, 2 vCPU, 4GB RAM, 30GB SSD. Provedores: Hetzner, DigitalOcean, Vultr.
- **Cookie LinkedIn `li_at`**: extraído da própria conta. (Veja seção "Extrair cookie" abaixo.)

---

## Passo 1 — Instalar plugin Claude Code

```bash
# Adicionar marketplace MaxVision LinkedIn Suite
claude /plugin marketplace add produtoramaxvision/maxvision-linkedin-mcp

# Instalar plugin free
claude /plugin install maxvision-linkedin-suite:linkedin-maxvision

# Verificar
claude /plugin list
```

Você deve ver:
```
linkedin-maxvision (1.0.0) — instalado [free]
  skills: linkedin-job-search, linkedin-resume-tailor, ...
  commands: /linkedin-scan, /linkedin-tailor, /linkedin-audit
```

---

## Passo 2 — Iniciar MCP server

Três modos de deploy suportados — escolha conforme sua infraestrutura. Guia consolidado: [deploy-docker-swarm.md](deploy-docker-swarm.md).

### Modo A — Docker Engine standalone (mais simples)

Recomendado para dev local, single-host pequeno, primeiro setup.

```bash
git clone https://github.com/produtoramaxvision/maxvision-linkedin-mcp
cd maxvision-linkedin-mcp/mcp-server/docker

# 1. Network externa (se ainda não existe)
docker network create traefik-public 2>/dev/null || true

# 2. Gerar secrets locais
mkdir -p secrets
echo "$(openssl rand -hex 32)" > secrets/master_key.txt
echo "$(openssl rand -base64 24)" > secrets/postgres_password.txt
echo "$(openssl rand -hex 32)" > secrets/webhook_secret.txt
echo "" > secrets/license_key.txt   # vazio se Free
cat > secrets/li_cookies.json <<'EOF'
{ "default": "COLE-AQUI-O-COOKIE-LI_AT" }
EOF
chmod 600 secrets/*

# 3. Configurar env
cp .env.example .env
${EDITOR:-nano} .env

# 4. Subir
docker compose up -d

# 5. Validar
curl http://localhost:3000/health
docker compose logs -f mcp
```

### Modo B — Docker Swarm CLI (recomendado para uso contínuo)

Recomendado para produção self-managed, multi-node ou single-node Swarm. Suporta rolling updates com rollback automático.

```bash
ssh root@<seu-host>
git clone https://github.com/produtoramaxvision/maxvision-linkedin-mcp
cd maxvision-linkedin-mcp/mcp-server/docker

# 1. Init Swarm
docker swarm init --advertise-addr <ip-publico>

# 2. Network overlay
docker network create --driver overlay --attachable traefik-public

# 3. Labels nos nodes (single-node OK)
NODE_ID=$(docker node ls -q)
docker node update --label-add maxv.db=true $NODE_ID
docker node update --label-add maxv.cache=true $NODE_ID

# 4. Secrets externos
echo "$(openssl rand -hex 32)" | docker secret create maxv_master_key -
echo "$(openssl rand -base64 24)" | docker secret create maxv_postgres_password -
echo "$(openssl rand -hex 32)" | docker secret create maxv_webhook_secret -
echo "MAXV-PRO-XXXX" | docker secret create maxv_license_key -
cat > /tmp/li.json <<'EOF'
{ "default": "AQED..." }
EOF
docker secret create maxv_li_cookies /tmp/li.json
shred -u /tmp/li.json

# 5. Env vars
cp .env.example .env
${EDITOR:-nano} .env   # MCP_HOST, MCP_VERSION, MCP_REPLICAS

# 6. Deploy
docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin

# 7. Validar
docker stack services maxv-linkedin
docker service logs -f maxv-linkedin_mcp
curl -fsS https://linkedin-mcp.seu-dominio.com/health
```

### Modo C — Portainer Stack

Recomendado para gestão visual + GitOps. Funciona em Compose ou Swarm.

1. **Portainer UI → Stacks → Add stack → Repository**.
2. Repository URL: `https://github.com/produtoramaxvision/maxvision-linkedin-mcp`.
3. Compose path: `mcp-server/docker/portainer-stack.yml`.
4. GitOps updates: ON (polling 5min ou webhook).
5. Environment variables: `MCP_HOST`, `MCP_VERSION`, `POSTGRES_PASSWORD`, `MASTER_KEY`, `WEBHOOK_SECRET`, `LICENSE_KEY`, `LI_COOKIES_JSON`.
6. Para Swarm via Portainer: criar secrets em **Secrets → Add secret** com nomes `maxv_master_key`, `maxv_postgres_password`, etc, antes de criar a stack.
7. **Deploy the stack**.

Detalhes: [deploy-docker-swarm.md](deploy-docker-swarm.md) seção 3.

---

## Passo 3 — Adicionar conta LinkedIn

### 3.1 Extrair cookie `li_at`

**Chrome/Edge:**
1. Logar em [linkedin.com](https://linkedin.com).
2. Abrir DevTools (F12) → aba **Application** → **Cookies** → `https://www.linkedin.com`.
3. Copiar valor de `li_at` (string longa começando com `AQED...`).

**Firefox:**
1. Logar em LinkedIn.
2. F12 → **Storage** → **Cookies** → copiar `li_at`.

⚠️ **Cuidado:** este cookie é equivalente à sua sessão. Não compartilhe.

### 3.2 Cadastrar no MCP

```bash
# Tier Free: 1 conta apenas
mcp-cli account add default --cookie "AQED..."

# Tier Pro: até 3 contas
mcp-cli account add main --cookie "..."
mcp-cli account add backup --cookie "..."
mcp-cli account add personal --cookie "..."

# Listar
mcp-cli account list
```

### 3.3 Validar

```bash
mcp-cli account health-check default
```

Esperado:
```
✓ Account "default": status=ok, cookie_expires_at=2027-05-07
```

---

## Passo 4 — Configurar plugin

Editar `~/.claude/plugins/linkedin-maxvision/config.json`:

```json
{
  "mcp_server": {
    "transport": "http",
    "url": "https://linkedin-mcp.seu-dominio.com",
    "license_key": null
  },
  "default_account": "default",
  "resume_path": "~/Documents/resume.yaml",
  "preferences": {
    "language": "pt-BR",
    "tone": "formal",
    "target_roles": ["Senior Backend Engineer", "Tech Lead"],
    "remote_only": true,
    "salary_min_usd": 80000
  }
}
```

Para tier Pro:
```json
{
  "license_key": "MAXV-PRO-XXXX-XXXX-XXXX"
}
```

---

## Passo 5 — Primeiro fluxo

### Buscar vagas

```
Você: /linkedin-scan "Senior Backend Python remoto"

Claude: Encontrei 18 vagas. Top 5 por match score:

  1. Acme Corp        | Senior Python Backend     | $120-150k | 0.91
  2. Beta LLC         | Backend Engineer (Python) | $100-130k | 0.88
  3. Gamma Inc        | Tech Lead Backend         | $130-160k | 0.85
  ...
```

### Customizar resume

```
Você: /linkedin-tailor 1

Claude: [analisa JD da Acme Corp + seu resume YAML]
        Sugestões de tailoring:
          - Headline: enfatizar "Python + AWS"
          - Bullet 3 da experiência atual: trocar X por Y
          - Adicionar keyword "FastAPI" em skills
        Confirma gerar resume customizado? [y/N]

Você: y

Claude: Resume gerado: ~/Documents/resumes/acme-tailored.pdf
```

### Aplicar

```
Você: /linkedin-apply 1 --resume ~/Documents/resumes/acme-tailored.pdf

Claude: [Patchright preenche form, mostra screenshot]
        Pré-submissão:
          Empresa: Acme Corp
          Resume: acme-tailored.pdf
          Total apply hoje: 3/50

        Confirma submit? [y/N]

Você: y

Claude: ✓ Aplicado. Application ID: app_xyz123
        Tracked em ~/Documents/linkedin-tracking.db
```

### Subagent autônomo (até 10 vagas em batch)

```
Você: @linkedin-job-hunter aplica em até 10 vagas matches > 0.75 hoje,
       customiza resume pra cada uma

Subagent: [executa em sequência]
          Sumário final: 8 submitted, 1 needs_review (captcha), 1 skipped (já apliquei)
```

---

## Passo 6 — Audit semanal de perfil

```
Você: /linkedin-audit

Claude: [analisa perfil próprio]
        Score: 78/100
        Top 3 melhorias:
          1. Headline tem 60 chars, ideal é 100-120
          2. Skills incompletos: faltam "FastAPI", "Kubernetes" (top 5 das suas vagas-alvo)
          3. Última atividade: 22 dias atrás (recomendado: postar a cada 7d)

        Relatório completo: ~/Documents/linkedin-audits/2026-05-07.md
```

---

## Troubleshooting comum

### "Cookie inválido"

Cookie expirou ou foi invalidado. Extrair novo:
```bash
mcp-cli account update default --cookie "AQED..."
```

### "Captcha encontrado"

LinkedIn detectou atividade suspeita. Soluções:
1. Pausar uso por 24h.
2. Logar no LinkedIn manualmente, resolver captcha.
3. Reduzir limites diários:
   ```bash
   mcp-cli account config default --apply-per-day 20 --message-per-day 10
   ```

### "MCP server unreachable"

Verificar:
```bash
docker-compose ps
docker-compose logs linkedin-mcp --tail 100
```

### "License key inválido" (Pro)

```bash
mcp-cli license validate
# Se inválido, re-autenticar via portal
```

---

## Limites recomendados (anti-ban)

| Ação | Free (1 conta) | Pro (3 contas pool) | Agency (ilimitado) |
|---|---|---|---|
| Search/dia | 100 | 100/conta | 100/conta |
| Apply/dia | 10 | 50/conta | 50/conta |
| Message/dia | 5 | 30/conta | 30/conta |
| Post/dia | 2 | 5/conta | 5/conta |

⚠️ Estes números **respeitam padrões humanos**. Forçar acima = ban quase certo.

---

## Próximos passos

- Para integrar n8n (cron, Telegram, Sheets): ver [setup-hybrid-n8n.md](setup-hybrid-n8n.md).
- API reference: [api-reference.md](api-reference.md).
- FAQ: [faq.md](faq.md).
