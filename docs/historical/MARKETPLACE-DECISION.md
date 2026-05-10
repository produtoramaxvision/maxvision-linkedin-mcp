# Decisão de Marketplace — MaxVision LinkedIn MCP

## Pergunta

Onde hospedar e distribuir o plugin/MCP LinkedIn MaxVision, dado que será comercializado como infoproduto?

Três candidatos:

1. **`maxvision-orchestration`** — plugin existente de roteamento.
2. **`maxvision-claude-plugins`** — repositório/marketplace existente de plugins MaxVision.
3. **Marketplace novo dedicado** — `maxvision-linkedin-suite` (ou similar).

---

## Análise comparativa

| Critério | `maxvision-orchestration` | `maxvision-claude-plugins` | **Marketplace novo dedicado** |
|---|---|---|---|
| Propósito original do repo | Roteamento interno de skills/agents | Suite genérica de plugins MaxVision (mistos free + privados) | **Produto comercial isolado** |
| Branding/marketing | Confunde com infra interna | Mistura com utilidades não-comerciais | **Branding próprio, landing dedicada** |
| Versionamento | Acoplado a outros plugins do repo | Acoplado | **Independente, semver puro** |
| License clarity | AGPL/MIT genérico | Misto, ambíguo | **Dual claro: AGPL free + comercial Pro** |
| GitHub stars/SEO | Diluído | Diluído | **Concentrado no produto** |
| Distribuição comercial | Não previsto | Não previsto | **Suporte nativo: Stripe webhook, license key, gating de features** |
| Risco de vazamento de código pago | Alto (mistura free/paid no mesmo repo) | Alto | **Baixo: tier Pro em repo privado separado, tier Free em repo público** |
| Roadmap independente | Não | Parcial | **Sim** |
| Possibilidade de evoluir para suite (Twitter, Instagram, multi-platform) | Não | Possível | **Natural — namespace `maxvision-<plataforma>-suite`** |
| Onboarding de cliente final | Confuso | Confuso | **Página única, instalação 1-click** |
| Métricas analytics (downloads, conversões) | Compartilhadas | Compartilhadas | **Isoladas — fácil medir conversão por canal** |
| CI/CD pipeline | Genérico do repo pai | Genérico | **Customizado: Playwright LinkedIn, license-gate tests, Stripe sandbox** |
| Suporte a multi-tenant (Agency tier) | Inviável | Inviável | **Possível: feature flag por license key** |
| Bus factor / manutenção | Risco médio (acoplamento) | Risco médio | **Risco isolado** |

---

## Recomendação: **criar marketplace novo dedicado**

### Estrutura proposta

**Repositório público (free tier + landing):**
```
github.com/produtoramaxvision/maxvision-linkedin-mcp
├── .claude-plugin/
│   ├── marketplace.json       # marketplace "MaxVision LinkedIn Suite"
│   └── plugin.json
├── plugins/
│   └── linkedin-maxvision/    # plugin Claude Code free tier
├── mcp-server/                # MCP server free (single-account)
├── docs/
├── examples/
├── LICENSE                    # AGPL-3.0
└── README.md                  # marketing + setup
```

**Repositório privado (tier Pro/Agency):**
```
github.com/produtoramaxvision/maxvision-linkedin-mcp-pro  (private)
├── pro-features/              # auto-apply, multi-conta, Sales Nav
├── n8n-workflows-premium/
├── license-server/            # validação de license key (Cloudflare Worker)
├── stripe-integration/
└── LICENSE-COMMERCIAL.md
```

### Por que não `maxvision-orchestration`

`maxvision-orchestration` é plugin **interno** que orquestra skills/agents do desenvolvedor MaxVision. Adicionar produto comercial ali:
- Polui o catálogo `discover-skill` / `discover-agent` com componentes pagos.
- Forçaria todo usuário interno do orchestration a baixar dependências comerciais (Stripe SDK, license server).
- Mistura governance (orchestrator é AGPL aberto; o produto LinkedIn precisa de dual license).

### Por que não `maxvision-claude-plugins`

Provavelmente é um marketplace genérico interno MaxVision. Misturar produto vendável com utilitários internos:
- Dificulta marketing focado.
- Cliente final que comprar não quer ver 10 plugins não relacionados.
- Suporte pago ficaria confuso (qual plugin tem suporte pago, qual não?).
- License heterogênea no mesmo repo = pesadelo legal.

### Vantagens do marketplace novo

1. **Identidade comercial clara.** README é landing page de venda. Stars do repo viram social proof.
2. **Compliance legal limpa.** AGPL no público + EULA comercial no privado. Sem ambiguidade.
3. **Roadmap independente.** Versionamento próprio (`v1.0.0` da Suite ≠ versão de outros plugins MaxVision).
4. **Escalável para suite.** Próximos produtos: `maxvision-twitter-suite`, `maxvision-instagram-suite`, `maxvision-cold-outreach-suite`. Padrão consistente.
5. **CI/CD especializado.** Pipeline com testes Playwright LinkedIn em conta sandbox, smoke tests Stripe, license-key validation.
6. **Métricas de produto.** Plausible/Umami no landing → conversões mensuráveis.
7. **Reutilização cross-product.** MCP core (Patchright pool, cookie rotation, anti-detect) vira lib `@maxvision/scraping-core` consumida por todos os produtos da suite.

---

## Estrutura de marketplace `marketplace.json`

```json
{
  "name": "MaxVision LinkedIn Suite",
  "owner": {
    "name": "Produtora MaxVision",
    "url": "https://maxvision.com.br",
    "email": "produtoramaxvision@gmail.com"
  },
  "metadata": {
    "description": "Automação LinkedIn nativa para Claude Code: busca de vagas, candidatura, outreach, profile optimization e engagement com anti-detect production-ready.",
    "version": "1.0.0",
    "homepage": "https://linkedin.maxvision.com.br",
    "repository": "https://github.com/produtoramaxvision/maxvision-linkedin-mcp",
    "license": "AGPL-3.0-or-later WITH Commercial-Available"
  },
  "plugins": [
    {
      "name": "linkedin-maxvision",
      "source": "./plugins/linkedin-maxvision",
      "description": "Plugin Claude Code com 6 skills + 1 subagent + 4 commands para fluxo completo LinkedIn.",
      "tier": "free",
      "version": "1.0.0"
    },
    {
      "name": "linkedin-maxvision-pro",
      "source": "./plugins/linkedin-maxvision-pro",
      "description": "Tier Pro: Easy Apply automático, multi-account pool, Sales Navigator, n8n workflows premium.",
      "tier": "pro",
      "version": "1.0.0",
      "requires_license": true,
      "license_check_url": "https://license.linkedin.maxvision.com.br/v1/check"
    }
  ]
}
```

---

## Decisão final recomendada

**Criar marketplace novo `maxvision-linkedin-suite` desde o dia zero.**

Justificativa em uma frase: você está construindo produto comercial, não utilitário interno. A separação física do código no GitHub espelha a separação comercial do produto e elimina ambiguidades de licença, governance e marketing.

Custo da decisão: 1 hora extra para criar repo público + privado + DNS de landing. Retorno: clareza para todos os ciclos de vida do produto (dev, marketing, suporte, vendas, legal).

---

## Status — APROVADA (2026-05-07)

Decisão ratificada. Próxima sessão Claude Code deve executar o **Sprint 0** seguindo [MARKETPLACE-CREATION-RUNBOOK.md](MARKETPLACE-CREATION-RUNBOOK.md).

### Identidade definitiva do produto

| Atributo | Valor |
|---|---|
| Nome comercial | MaxVision LinkedIn Suite |
| Slug do marketplace | `maxvision-linkedin-suite` |
| Slug do plugin free | `linkedin-maxvision` |
| Slug do plugin Pro | `linkedin-maxvision-pro` |
| Repo público | `github.com/produtoramaxvision/maxvision-linkedin-mcp` |
| Repo privado | `github.com/produtoramaxvision/maxvision-linkedin-mcp-pro` |
| Domínio landing | `linkedin.maxvision.com.br` |
| Domínio MCP cloud | `linkedin-mcp.meuagente.api.br` |
| Domínio license server | `license.linkedin.maxvision.com.br` |
| Imagem Docker | `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp` |
| License free | AGPL-3.0-or-later |
| License Pro/Agency | Proprietária (EULA — ver `LICENSE-COMMERCIAL.md`) |

### O que NÃO entra no marketplace

- Auto-apply em escala industrial sem revisão humana → bloqueado por design (`confirm_required=true` default).
- Dados de terceiros não-públicos → fora do escopo.
- Recursos que dependam de bypass de captcha → fora do escopo.

### Roadmap futuro do marketplace

Próximos produtos previstos no mesmo padrão:
- `maxvision-twitter-suite` (X/Twitter automation)
- `maxvision-instagram-suite`
- `maxvision-cold-outreach-suite` (Apollo/Hunter/email genérico)
- `maxvision-recruiter-suite` (CRM de candidatos para agências)

Cada um vira repo público próprio. Lib comum extraída como `@maxvision/scraping-core` no monorepo.
