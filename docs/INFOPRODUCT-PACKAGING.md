# Infoproduct Packaging — MaxVision LinkedIn MCP

Como empacotar para distribuição comercial: estrutura GitHub, licensing dual, CI/CD, distribuição, suporte, marketing.

---

## Estrutura de repositórios

### Repo público — `produtoramaxvision/maxvision-linkedin-mcp`

```
maxvision-linkedin-mcp/
├── .claude-plugin/
│   ├── marketplace.json                # Marketplace MaxVision LinkedIn Suite
│   └── plugin.json                     # Metadata do plugin free
├── plugins/
│   └── linkedin-maxvision/             # Plugin Claude Code free tier
│       ├── plugin.json
│       ├── skills/
│       │   ├── linkedin-job-search/
│       │   │   ├── SKILL.md
│       │   │   └── prompts/
│       │   ├── linkedin-resume-tailor/
│       │   ├── linkedin-profile-optimize/
│       │   └── linkedin-feed-engagement/
│       ├── agents/
│       │   └── linkedin-job-hunter.md
│       └── commands/
│           ├── linkedin-scan.md
│           ├── linkedin-tailor.md
│           └── linkedin-audit.md
├── mcp-server/                         # MCP standalone (Node + TS)
│   ├── src/
│   │   ├── index.ts
│   │   ├── server/
│   │   ├── tools/
│   │   ├── browser/
│   │   ├── cache/
│   │   └── auth/
│   ├── python/                         # Subprocess workers
│   │   ├── linkedin_api_wrapper.py
│   │   ├── jobspy_wrapper.py
│   │   └── requirements.txt
│   ├── docker/                         # Templates de deploy (TODOS suportados)
│   │   ├── Dockerfile                  # Multi-stage Node 20 + Python + Patchright
│   │   ├── docker-compose.yml          # Modo Compose standalone (single-host)
│   │   ├── docker-stack.yml            # Modo Swarm CLI (multi-node, secrets externos)
│   │   ├── portainer-stack.yml         # Modo Portainer (Compose ou Swarm via UI/Git)
│   │   ├── .env.example                # Variáveis não-sensíveis
│   │   ├── .gitignore                  # Bloqueia secrets locais
│   │   ├── traefik-labels.md           # Referência de labels Traefik
│   │   ├── postgres/
│   │   │   └── init.sql                # Schema inicial idempotente (10 tabelas)
│   │   └── secrets/
│   │       └── README.md               # Como gerar secrets localmente (Compose)
│   ├── tests/
│   │   ├── unit/
│   │   └── e2e/
│   ├── scripts/
│   │   ├── deploy.sh                   # Wrapper que detecta modo (compose/swarm/portainer)
│   │   ├── migrate.ts
│   │   ├── rotate-master-key.ts
│   │   └── account-cli.ts
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── tsconfig.json
├── n8n-workflows/                      # Variant B (free workflows básicos)
│   ├── linkedin-daily-scan-basic.json
│   └── README.md
├── docs/
│   ├── setup-claude-code-only.md
│   ├── setup-hybrid-n8n.md
│   ├── troubleshooting.md
│   ├── api-reference.md
│   ├── compliance.md
│   └── faq.md
├── examples/
│   ├── job-search-flow/
│   ├── resume-tailor-yaml/
│   └── profile-audit-output/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── release.yml
│   │   ├── playwright-canary.yml
│   │   └── docker-publish.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   ├── feature.yml
│   │   └── compliance.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   ├── FUNDING.yml
│   └── dependabot.yml
├── LICENSE                             # AGPL-3.0-or-later
├── COMMERCIAL-LICENSE-AVAILABLE.md     # link para EULA comercial
├── README.md                           # Marketing + setup
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── .gitignore
```

### Repo privado — `produtoramaxvision/maxvision-linkedin-mcp-pro`

```
maxvision-linkedin-mcp-pro/
├── plugins/
│   └── linkedin-maxvision-pro/         # Plugin Pro tier
│       ├── plugin.json                 # com requires_license: true
│       └── skills/
│           ├── linkedin-easy-apply/
│           ├── linkedin-outreach/
│           ├── linkedin-multi-account/
│           └── linkedin-sales-navigator/
├── mcp-server-pro/                     # Features Pro
│   ├── src/
│   │   ├── tools-pro/
│   │   ├── multi-account/
│   │   └── sales-navigator/
│   └── tests/
├── n8n-workflows-premium/
│   ├── linkedin-batch-apply.json
│   ├── linkedin-recruiter-reply.json
│   ├── linkedin-profile-weekly-audit.json
│   ├── linkedin-multi-account-pool.json (Agency)
│   └── linkedin-team-sync.json (Agency)
├── license-server/                     # Cloudflare Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── stripe-integration/
│   ├── webhooks.ts
│   └── checkout-config.ts
├── LICENSE-COMMERCIAL.md               # EULA proprietária
├── README.md                           # Apenas para colaboradores
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

---

## Licensing dual

### Tier Free — AGPL-3.0-or-later

Razões:
- **Protege contra fork comercial.** Qualquer fork comercial precisa abrir código.
- **Padrão de mercado** para SaaS open-core (n8n, Plausible, Cal.com).
- Permite uso pessoal e por empresas (modificação proprietária só sem distribuir).

`LICENSE`:
```
GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007

Copyright (C) 2026 Produtora MaxVision Ltda.
...
```

`COMMERCIAL-LICENSE-AVAILABLE.md`:
```markdown
# Commercial License Available

Para uso comercial sem obrigações AGPL (ex: SaaS proprietário, integração em produto comercial fechado), entre em contato:

- Email: comercial@maxvision.com.br
- LinkedIn: ...
- Pricing: ver linkedin.maxvision.com.br/pricing
```

### Tier Pro/Agency — EULA proprietária

`LICENSE-COMMERCIAL.md` (no repo privado):
```markdown
# MaxVision LinkedIn Suite — End User License Agreement

Esta licença é concedida ao titular do License Key correspondente, vinculado a uma conta Stripe ativa.

1. Direito de uso: instalar e usar o software em até N contas LinkedIn
   conforme tier (Pro: 3, Agency: ilimitado).

2. Restrições:
   - Não revender, sublicenciar ou redistribuir.
   - Não fazer engenharia reversa do license server.
   - Não compartilhar License Key.

3. Propriedade: código permanece propriedade da Produtora MaxVision Ltda.

4. Garantias e limitações: software fornecido "as is".
   Produtora MaxVision não se responsabiliza por bans em contas LinkedIn,
   perda de dados ou consequências do uso contra Termos de Serviço LinkedIn.

5. Rescisão: license key pode ser revogado em caso de violação ou
   chargeback. Acesso a updates cessa imediatamente.

6. Lei aplicável: jurisdição brasileira.
```

### Validação de license key

```typescript
// mcp-server-pro/src/license-check.ts
export async function validateLicense(key: string): Promise<LicenseInfo | null> {
  const cached = await redis.get(`license:${key}`);
  if (cached) return JSON.parse(cached);

  const res = await fetch("https://license.linkedin.maxvision.com.br/v1/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, fingerprint: getMachineFingerprint() })
  });

  if (!res.ok) return null;
  const info = await res.json();
  await redis.setex(`license:${key}`, 3600, JSON.stringify(info));
  return info;
}

// Middleware nas tools Pro:
async function requirePro(ctx: ToolContext) {
  const key = process.env.MAXVISION_LICENSE_KEY;
  if (!key) throw new Error("Tier Pro requer MAXVISION_LICENSE_KEY env var.");
  const info = await validateLicense(key);
  if (!info || info.tier === "free") throw new Error("License inválida ou expirada.");
  if (info.expires_at < new Date()) throw new Error("License expirada.");
  return info;
}
```

---

## CI/CD

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, homolog]
  pull_request:

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F mcp-server lint
      - run: pnpm -F mcp-server typecheck

  unit-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: [5432:5432]
      redis:
        image: redis:7
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F mcp-server test:unit

  plugin-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # Valida marketplace.json e plugin.json contra schemas
          node scripts/validate-plugin.js plugins/linkedin-maxvision

  docker-build:
    needs: [lint-typecheck, unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          context: ./mcp-server
          push: false
          tags: linkedin-maxvision-mcp:test
```

### `.github/workflows/playwright-canary.yml`

Roda diariamente em conta sandbox para detectar mudanças DOM no LinkedIn.

```yaml
name: Playwright Canary

on:
  schedule:
    - cron: "0 6 * * *"  # 06h UTC todo dia
  workflow_dispatch:

jobs:
  canary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F mcp-server install:browsers
      - name: Run canary E2E
        env:
          LI_COOKIE_SANDBOX: ${{ secrets.LI_COOKIE_SANDBOX }}
        run: pnpm -F mcp-server test:canary
      - if: failure()
        uses: ravsamhq/notify-slack-action@v2
        with:
          status: ${{ job.status }}
          notification_title: "🚨 LinkedIn DOM canary FAILED"
          message_format: "Selectors quebrados? Rodar `pnpm test:canary --update-selectors`"
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### `.github/workflows/release.yml`

Build multi-arquitetura (amd64 + arm64) para cobrir VPS x86 e ARM (Oracle Free Tier, Hetzner ARM, AWS Graviton).

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/produtoramaxvision/linkedin-maxvision-mcp
          tags: |
            type=ref,event=tag
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v5
        with:
          context: ./mcp-server
          file: ./mcp-server/docker/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Validate stack files
        run: |
          docker run --rm -v $PWD/mcp-server/docker:/work -w /work \
            mikefarah/yq:latest e '.services | keys' docker-compose.yml
          docker run --rm -v $PWD/mcp-server/docker:/work -w /work \
            mikefarah/yq:latest e '.services | keys' docker-stack.yml
          docker run --rm -v $PWD/mcp-server/docker:/work -w /work \
            mikefarah/yq:latest e '.services | keys' portainer-stack.yml
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            mcp-server/docker/docker-compose.yml
            mcp-server/docker/docker-stack.yml
            mcp-server/docker/portainer-stack.yml
            mcp-server/docker/.env.example
```

### `.github/workflows/swarm-deploy-test.yml`

Validação semanal que sobe um Swarm em GitHub Actions e faz `docker stack deploy` para garantir que `docker-stack.yml` continua válido.

```yaml
name: Swarm Deploy Test

on:
  schedule:
    - cron: "0 4 * * 1"  # Segunda 04h UTC
  pull_request:
    paths:
      - "mcp-server/docker/docker-stack.yml"
      - "mcp-server/docker/portainer-stack.yml"

jobs:
  swarm-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Init Swarm
        run: docker swarm init
      - name: Create overlay network
        run: docker network create --driver overlay --attachable traefik-public
      - name: Create test secrets
        run: |
          echo "test-master-key" | docker secret create maxv_master_key -
          echo "test-pg-password" | docker secret create maxv_postgres_password -
          echo "test-webhook-secret" | docker secret create maxv_webhook_secret -
          echo "test-license" | docker secret create maxv_license_key -
          echo '{"default":"test"}' | docker secret create maxv_li_cookies -
      - name: Apply test labels
        run: |
          NODE=$(docker node ls -q)
          docker node update --label-add maxv.db=true $NODE
          docker node update --label-add maxv.cache=true $NODE
      - name: Deploy stack
        run: |
          cd mcp-server/docker
          export MCP_VERSION=latest MCP_HOST=test.local
          docker stack deploy -c docker-stack.yml maxv-test
      - name: Wait for services
        run: |
          for i in {1..30}; do
            UP=$(docker stack services maxv-test --format "{{.Replicas}}" | grep -c "1/1" || true)
            [ "$UP" -ge 3 ] && exit 0
            sleep 10
          done
          docker stack services maxv-test
          docker service ps maxv-test_mcp --no-trunc
          exit 1
```

---

## Marketplace registration

Após release v1.0, submeter a:

1. **Awesome Claude Code** — github.com/awesome-claude-code/awesome-claude-code (PR adicionando em "Plugins").
2. **Awesome MCP Servers** — github.com/punkpeye/awesome-mcp-servers (PR em "Productivity").
3. **Smithery.ai** — registry de MCPs com instalação 1-click.
4. **Glama.ai** — diretório de MCPs.
5. **MCP.so** — diretório.
6. **Plugin marketplace MaxVision** — `marketplace.json` próprio em domínio.

---

## Distribuição

### Tier Free
- `pnpm dlx @claude-plugins/cli install maxvision-linkedin-suite:linkedin-maxvision`.
- Imagem Docker `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:latest`.
- README com 3 modos de deploy: local, Docker, VPS via script `deploy.sh`.

### Tier Pro/Agency
- Após compra Stripe: cliente recebe email com:
  - License key.
  - Comando customizado `pnpm dlx ... install --license <key>`.
  - Acesso a repo privado `maxvision-linkedin-mcp-pro` via GitHub team.
- Painel cliente: `linkedin.maxvision.com.br/dashboard` (auth via magic link).

---

## Suporte

| Tier | Canal | SLA |
|---|---|---|
| Free | GitHub issues público | best effort |
| Pro | Email `support@maxvision.com.br` | 48h |
| Agency | Slack Connect privado + email priority | 8h business |

Documentação:
- `docs/` no repo público.
- Vídeos curtos no YouTube canal MaxVision.
- FAQ no landing.

---

## Marketing

### Pré-launch (Sprint 0-3)
- Landing page com waitlist.
- 5 posts no LinkedIn da MaxVision documentando processo de build (engenharia em público).
- 1 thread no Twitter/X.

### Launch (Sprint 4)
- Vídeo demo 3min YouTube + LinkedIn.
- Post no r/ClaudeAI, r/LocalLLaMA.
- Post no Hacker News (Show HN).
- Newsletter Anthropic Discord (#showcase).

### Pós-launch
- Case studies de beta users.
- Comparativo vs concorrentes (LazyApply, Simplify, AIHawk) destacando segurança ToS.
- Webinar mensal "Job hunt with Claude Code".

---

## Métricas de sucesso (90 dias pós-launch)

| Métrica | Meta MVP | Meta v1.5 |
|---|---|---|
| GitHub stars | 100 | 500 |
| Free installs | 200 | 1.000 |
| Pro paying customers | 10 | 50 |
| Agency customers | 1 | 5 |
| MRR | USD 290 | USD 2.000 |
| Retention 30d Pro | 70% | 80% |
| Captcha rate | <10% | <5% |
| NPS | 30 | 50 |

---

## Riscos comerciais

| Risco | Mitigação |
|---|---|
| Cliente compra, conta bana | Disclaimer claro pré-compra; refund parcial; conta sandbox grátis para teste |
| Refund Stripe abusivo | License key revoga acesso; ToS proíbe re-uso |
| Concorrente faz fork AGPL e vende | AGPL exige abrir código; difícil escalar; nosso moat é UX + suporte |
| LinkedIn legal action | Disclaimer de uso pessoal; não armazenamos dados de terceiros; opt-in para tier Pro |
| Pirataria de license key | Fingerprint da máquina + revalidação periódica |
