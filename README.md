# MaxVision LinkedIn MCP — Blueprint Master

Plugin Claude Code + servidor MCP dedicado a automação LinkedIn para empacotamento como infoproduto comercial MaxVision.

> **Status:** Blueprint v0.2 — decisão de marketplace **APROVADA**. Repositório novo dedicado será criado no Sprint 0. Sem código ainda; este diretório agrupa documentos de design, roadmap e templates de deploy antes do início do desenvolvimento.

---

## Sumário

| Documento | Descrição |
|---|---|
| [MARKETPLACE-DECISION.md](MARKETPLACE-DECISION.md) | Análise das três opções de distribuição. Decisão final: criar marketplace novo dedicado. |
| [MARKETPLACE-CREATION-RUNBOOK.md](MARKETPLACE-CREATION-RUNBOOK.md) | Sprint 0 passo-a-passo. Ponto de entrada da próxima sessão. |
| [blueprints/PLAN-A-claude-code-only.md](blueprints/PLAN-A-claude-code-only.md) | Versão standalone — apenas Claude Code + MCP server, sem n8n. |
| [blueprints/PLAN-B-hybrid-n8n.md](blueprints/PLAN-B-hybrid-n8n.md) | Versão híbrida — mesmo MCP + 4 workflows n8n para cron, batch, notify e tracking. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack técnica, schemas MCP, diagramas, decisões de design. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Sprints, milestones, releases v0 → v1. |
| [docs/INFOPRODUCT-PACKAGING.md](docs/INFOPRODUCT-PACKAGING.md) | Estrutura GitHub, licensing dual, CI/CD, distribuição comercial. |
| [docs/RISKS-COMPLIANCE.md](docs/RISKS-COMPLIANCE.md) | LinkedIn ToS, anti-detect, cookie rotation, mitigação de ban. |
| [docs/deploy-docker-swarm.md](docs/deploy-docker-swarm.md) | Guia consolidado dos três modos de deploy: Docker standalone, Swarm CLI, Portainer (Compose ou Swarm). |
| [docs/setup-claude-code-only.md](docs/setup-claude-code-only.md) | Setup cliente Variante A. |
| [docs/setup-hybrid-n8n.md](docs/setup-hybrid-n8n.md) | Setup cliente Variante B. |
| [mcp-server/docker/](mcp-server/docker/) | Templates de deploy: `Dockerfile`, `docker-compose.yml`, `docker-stack.yml` (Swarm), `portainer-stack.yml`, `traefik-labels.md`, `postgres/init.sql`, `secrets/README.md`. |

---

## Decisão de marketplace (status: aprovado)

**Marketplace novo dedicado** — `maxvision-linkedin-suite`. Decisão tomada e ratificada.

Não será inserido em `maxvision-orchestration` (plugin interno de roteamento) nem em `maxvision-claude-plugins` (repositório genérico interno). Justificativa em [MARKETPLACE-DECISION.md](MARKETPLACE-DECISION.md).

- Repositório público: `produtoramaxvision/maxvision-linkedin-mcp` (free tier + landing).
- Repositório privado: `produtoramaxvision/maxvision-linkedin-mcp-pro` (Pro/Agency + license server + Stripe).
- License dual: AGPL-3.0-or-later para tier free, EULA proprietária para tier Pro/Agency.

Próximos passos da criação seguem em [MARKETPLACE-CREATION-RUNBOOK.md](MARKETPLACE-CREATION-RUNBOOK.md).

---

## Modos de deploy suportados

O MCP server pode rodar em qualquer um dos três modos abaixo. Mesma imagem Docker, mesmo binário. A escolha é só de orquestrador.

| Modo | Comando-chave | Quando usar |
|---|---|---|
| **Docker Engine standalone** | `docker compose up -d` | Dev local, single-host pequeno, primeiro setup |
| **Docker Swarm CLI** | `docker stack deploy -c docker-stack.yml maxv-linkedin` | Produção self-managed, multi-node, controle total |
| **Portainer Stack (Compose ou Swarm)** | UI → Stacks → Add stack | Produção com gestão visual, GitOps via repo, equipes |

Templates prontos em `mcp-server/docker/`. Guia completo em [docs/deploy-docker-swarm.md](docs/deploy-docker-swarm.md).

---

## Visão de produto

**Nome comercial sugerido:** MaxVision LinkedIn Suite
**Tagline:** *"O assistente LinkedIn nativo do Claude Code. Busca, aplica, otimiza e converte — sem você abrir o navegador."*

### Personas-alvo
1. **Job-seeker tech** — engenheiro/dev procurando vaga remota internacional. Quer aplicar em 30+ vagas/dia com resume customizado.
2. **Founder/creator** — usa LinkedIn como canal de growth. Quer publicação programada + engagement automático + outreach a leads.
3. **Recrutador/headhunter** — Sales Navigator power user. Quer extrair perfis, mensagens em massa com aprovação humana, tracking em CRM.
4. **Agência de carreira** — gerencia LinkedIn de múltiplos clientes. Multi-conta + white-label.

### Cobertura funcional

| Feature | Tier Free | Tier Pro | Tier Agency |
|---|---|---|---|
| Busca de vagas (multi-board) | ✓ | ✓ | ✓ |
| Resume tailoring por JD | ✓ | ✓ | ✓ |
| Profile audit | ✓ | ✓ | ✓ |
| Feed engagement (1 conta) | ✓ | ✓ | ✓ |
| Easy Apply automático | — | ✓ | ✓ |
| Outreach DM em massa (com aprovação) | — | ✓ | ✓ |
| Multi-conta cookie pool | — | até 3 | ilimitado |
| Sales Navigator scraping | — | ✓ | ✓ |
| Recruiter integration | — | — | ✓ |
| n8n workflows premium | — | ✓ | ✓ |
| MCP cloud-hosted (sem VPS própria) | — | opcional | incluso |
| White-label | — | — | ✓ |
| Priority support | — | — | ✓ |

### Pricing sugestão (a validar)
- Free — BYO infra, single account, open-source AGPL.
- Pro — USD 29/mês ou USD 290/ano.
- Agency — USD 99/mês ou USD 990/ano.

---

## Próximos passos

1. **Decisão de marketplace** — APROVADA. Marketplace novo dedicado `maxvision-linkedin-suite`.
2. **Sprint 0** — criar repos públicos/privados, DNS, license server, landing waitlist. Passo-a-passo em [MARKETPLACE-CREATION-RUNBOOK.md](MARKETPLACE-CREATION-RUNBOOK.md).
3. **Sprint 1** — implementar MCP core conforme [docs/ROADMAP.md](docs/ROADMAP.md).
4. **Variante inicial** sugerida: A primeiro (10 dias) → release v1.0 → B depois (5 dias) → release v1.5.
5. **Deploy** — todos os templates Docker/Swarm/Portainer estão em `mcp-server/docker/`. Validar em ordem: Compose local → Swarm single-node → Portainer Swarm produção.
