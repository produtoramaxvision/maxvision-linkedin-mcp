# Architecture — MaxVision LinkedIn MCP

Documento técnico unificado das duas variantes (A e B). Schemas, decisões de design, contratos de API.

---

## Visão geral por camada

| Camada | Responsabilidade | Tecnologia |
|---|---|---|
| **Cliente** | Conversação, comandos, skills | Claude Code (CLI/Desktop) + plugin `linkedin-maxvision` |
| **Transporte** | MCP stdio (local) ou HTTP/SSE (remoto) | `@modelcontextprotocol/sdk` + Hono |
| **Core** | Tools MCP, browser pool, fontes LinkedIn, cache | Node 20 + TS + Patchright + Python subprocess |
| **Persistência** | Cache, tracking, sessions | Postgres 16 + Redis 7 |
| **Orquestração** (apenas Variante B) | Cron, batch, notify, tracking visual | n8n |
| **License** | Validação tier Pro/Agency | Cloudflare Worker + Stripe webhook |

---

## Schemas MCP — todas as 10 tools

### Tipos compartilhados

```typescript
const JobSchema = z.object({
  id: z.string(),
  source: z.enum(["linkedin", "indeed", "glassdoor", "ziprecruiter"]),
  url: z.string().url(),
  title: z.string(),
  company: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    logo: z.string().url().optional()
  }),
  location: z.string(),
  remote_type: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  posted_at: z.string().datetime(),
  applicants_count: z.number().optional(),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default("USD"),
    period: z.enum(["hour", "month", "year"]).optional()
  }).optional(),
  description: z.string(),
  easy_apply: z.boolean(),
  match_score: z.number().min(0).max(1).optional()
});

const ProfileSchema = z.object({
  public_id: z.string(),
  url: z.string().url(),
  full_name: z.string(),
  headline: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    start_date: z.string(),
    end_date: z.string().nullable(),
    description: z.string().optional()
  })),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    start_year: z.number().optional(),
    end_year: z.number().optional()
  })),
  skills: z.array(z.string()),
  followers: z.number().optional()
});
```

### Tools (10)

#### 1. `search_jobs`
```typescript
{
  inputSchema: z.object({
    keywords: z.string(),
    location: z.string().optional(),
    remote: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
    experience: z.array(z.enum(["internship", "entry", "associate", "mid-senior", "director", "executive"])).optional(),
    posted_within_hours: z.number().int().min(1).max(720).default(168),
    salary_min: z.number().optional(),
    sources: z.array(z.enum(["linkedin", "indeed", "glassdoor", "ziprecruiter"])).default(["linkedin"]),
    limit: z.number().int().min(1).max(100).default(25),
    easy_apply_only: z.boolean().default(false),
    account_id: z.string().default("default")
  }),
  outputSchema: z.array(JobSchema)
}
```

#### 2. `get_job_details`
```typescript
{
  inputSchema: z.object({
    job_url: z.string().url(),
    include_applicants_demo: z.boolean().default(false)
  }),
  outputSchema: JobSchema.extend({
    full_description_html: z.string(),
    requirements: z.array(z.string()),
    benefits: z.array(z.string()),
    hiring_team: z.array(ProfileSchema.partial()).optional()
  })
}
```

#### 3. `apply_easy`
```typescript
{
  inputSchema: z.object({
    job_url: z.string().url(),
    resume_path: z.string().describe("Caminho local de resume PDF/DOCX"),
    cover_letter: z.string().optional(),
    answers: z.record(z.string()).optional().describe("Respostas a perguntas custom da vaga"),
    confirm_required: z.boolean().default(true).describe("Se true, retorna preview e exige segunda chamada com confirm=true"),
    confirm: z.boolean().default(false),
    application_id: z.string().optional().describe("Para retomar com confirm após preview"),
    account_id: z.string().default("default")
  }),
  outputSchema: z.object({
    status: z.enum(["preview", "submitted", "needs_review", "blocked", "failed"]),
    application_id: z.string(),
    preview: z.object({
      questions_answered: z.record(z.string()),
      resume_used: z.string(),
      screenshot_path: z.string()
    }).optional(),
    error: z.string().optional()
  })
}
```

#### 4. `get_profile`
```typescript
{
  inputSchema: z.object({
    profile_url: z.string().url().optional(),
    public_id: z.string().optional(),
    include: z.array(z.enum(["experience", "education", "skills", "recommendations", "activity", "contact"])).default(["experience", "education", "skills"]),
    account_id: z.string().default("default")
  }).refine(d => d.profile_url || d.public_id, "profile_url ou public_id obrigatório"),
  outputSchema: ProfileSchema
}
```

#### 5. `search_people`
```typescript
{
  inputSchema: z.object({
    keywords: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    location: z.string().optional(),
    school: z.string().optional(),
    industry: z.string().optional(),
    connection_degree: z.array(z.enum(["1", "2", "3"])).optional(),
    limit: z.number().int().min(1).max(100).default(25),
    use_sales_navigator: z.boolean().default(false).describe("Requer tier Pro+"),
    account_id: z.string().default("default")
  }),
  outputSchema: z.array(ProfileSchema.partial())
}
```

#### 6. `send_message` (com aprovação obrigatória)
```typescript
{
  inputSchema: z.object({
    recipient_url: z.string().url(),
    body: z.string().max(1900),
    confirm: z.boolean().default(false),
    draft_id: z.string().optional(),
    account_id: z.string().default("default")
  }),
  outputSchema: z.object({
    status: z.enum(["draft_created", "sent", "blocked", "failed"]),
    draft_id: z.string().optional(),
    preview: z.object({
      recipient: ProfileSchema.partial(),
      body: z.string(),
      conversation_url: z.string().url().optional()
    }).optional(),
    sent_at: z.string().datetime().optional()
  })
}
```

#### 7. `optimize_profile`
```typescript
{
  inputSchema: z.object({
    profile_url: z.string().url().optional().describe("Default: perfil próprio da conta autenticada"),
    target_roles: z.array(z.string()).optional().describe("Vagas-alvo para keyword density"),
    account_id: z.string().default("default")
  }),
  outputSchema: z.object({
    score: z.object({
      overall: z.number().min(0).max(100),
      headline: z.number(),
      summary: z.number(),
      experience: z.number(),
      skills: z.number(),
      activity: z.number(),
      featured: z.number()
    }),
    suggestions: z.array(z.object({
      area: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      current: z.string().optional(),
      suggested: z.string(),
      rationale: z.string()
    })),
    keyword_gaps: z.array(z.object({
      keyword: z.string(),
      relevance: z.number(),
      where_to_add: z.array(z.string())
    }))
  })
}
```

#### 8. `list_feed`
```typescript
{
  inputSchema: z.object({
    feed_type: z.enum(["home", "following", "company", "hashtag"]).default("home"),
    target: z.string().optional().describe("Company URL ou hashtag se feed_type != home"),
    limit: z.number().int().min(1).max(50).default(20),
    account_id: z.string().default("default")
  }),
  outputSchema: z.array(z.object({
    post_id: z.string(),
    url: z.string().url(),
    author: ProfileSchema.partial(),
    posted_at: z.string().datetime(),
    body: z.string(),
    media: z.array(z.object({ type: z.string(), url: z.string() })).optional(),
    reactions: z.number(),
    comments: z.number(),
    reposts: z.number()
  }))
}
```

#### 9. `post_update`
```typescript
{
  inputSchema: z.object({
    body: z.string().max(3000),
    media_paths: z.array(z.string()).optional(),
    visibility: z.enum(["public", "connections", "group"]).default("public"),
    group_id: z.string().optional(),
    confirm: z.boolean().default(false),
    draft_id: z.string().optional(),
    account_id: z.string().default("default")
  }),
  outputSchema: z.object({
    status: z.enum(["draft_created", "posted", "failed"]),
    post_url: z.string().url().optional(),
    draft_id: z.string().optional()
  })
}
```

#### 10. `track_application`
```typescript
{
  inputSchema: z.object({
    job_url: z.string().url(),
    application_id: z.string(),
    status: z.enum(["submitted", "viewed", "rejected", "interview", "offer", "withdrawn"]),
    notes: z.string().optional()
  }),
  outputSchema: z.object({
    tracking_id: z.string(),
    history: z.array(z.object({
      status: z.string(),
      at: z.string().datetime(),
      notes: z.string().optional()
    }))
  })
}
```

---

## Schema Postgres

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cookie_encrypted BYTEA NOT NULL,
  cookie_expires_at TIMESTAMPTZ NOT NULL,
  rate_limit_bucket JSONB NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('active', 'paused', 'banned')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE jobs_cache (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  match_score REAL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_fetched ON jobs_cache (fetched_at DESC);
CREATE INDEX idx_jobs_source ON jobs_cache (source);

CREATE TABLE profiles_cache (
  public_id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT REFERENCES accounts(id),
  job_url TEXT NOT NULL,
  job_title TEXT,
  company TEXT,
  status TEXT NOT NULL,
  resume_used TEXT,
  cover_letter TEXT,
  answers JSONB,
  screenshot_path TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  history JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_applications_account ON applications (account_id, submitted_at DESC);

CREATE TABLE messages_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT REFERENCES accounts(id),
  recipient_url TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT CHECK (status IN ('draft', 'sent', 'rejected')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  action TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_account_time ON rate_limit_events (account_id, occurred_at DESC);

CREATE TABLE captcha_events (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  context TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Browser pool design (Patchright)

```typescript
// src/browser/pool.ts
export class BrowserPool {
  private contexts: Map<string, BrowserContext> = new Map();
  private rateLimiters: Map<string, TokenBucket> = new Map();

  async acquire(accountId: string): Promise<BrowserContext> {
    await this.rateLimiters.get(accountId)?.consume(1);
    let ctx = this.contexts.get(accountId);
    if (!ctx || !ctx.isConnected()) {
      ctx = await this.createContext(accountId);
    }
    return ctx;
  }

  private async createContext(accountId: string): Promise<BrowserContext> {
    const cookie = await this.loadCookie(accountId);
    const browser = await chromium.launchPersistentContext(
      `/var/data/profiles/${accountId}`,
      {
        headless: process.env.PATCHRIGHT_HEADLESS === "true",
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezoneId: "America/New_York",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
        ]
      }
    );
    await browser.addCookies([{
      name: "li_at",
      value: cookie,
      domain: ".linkedin.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None"
    }]);
    return browser;
  }

  async healthCheck(accountId: string): Promise<"ok" | "captcha" | "logged_out" | "banned"> {
    const ctx = await this.acquire(accountId);
    const page = await ctx.newPage();
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
    if (page.url().includes("checkpoint")) return "captcha";
    if (page.url().includes("uas/login")) return "logged_out";
    const title = await page.title();
    if (title.includes("restricted")) return "banned";
    return "ok";
  }
}
```

Token bucket por conta:
- Search: 100/dia, 10/hora.
- Profile fetch: 80/dia, 8/hora.
- Apply: 50/dia, 5/hora.
- Message: 30/dia, 3/hora.
- Post: 5/dia.

Quiet hours configuráveis (default 23h-07h timezone do account).

---

## Rate limiting estratégia

```typescript
// src/rate-limit/strategy.ts
export const ACTION_LIMITS = {
  search: { per_hour: 10, per_day: 100, jitter_ms: [800, 3000] },
  profile_fetch: { per_hour: 8, per_day: 80, jitter_ms: [1500, 5000] },
  apply: { per_hour: 5, per_day: 50, jitter_ms: [10_000, 30_000] },
  message: { per_hour: 3, per_day: 30, jitter_ms: [5000, 15_000] },
  post: { per_hour: 2, per_day: 5, jitter_ms: [60_000, 300_000] },
  feed_scroll: { per_hour: 30, per_day: 200, jitter_ms: [500, 2000] }
} as const;

// Jitter aplicado SEMPRE entre ações.
// Ações dentro de jitter_ms[0]-jitter_ms[1] random delay.
// Detect captcha → pause conta 24h, alert admin.
```

---

## Anti-detect

1. **Patchright** (não Playwright) — patches conhecidos para esconder `webdriver`, `chrome`, `permissions`, etc.
2. **Persistent context por conta** — `/var/data/profiles/<account_id>` mantém localStorage, cache, fingerprint estável.
3. **Cookies só** — nunca login com user/pass automatizado (LinkedIn detecta na hora).
4. **Headers e timezone** consistentes com região da conta.
5. **Mouse movement humanizado** — `playwright-extra` + plugin de human-like motion entre clicks.
6. **Scroll natural** — easeInOutQuad, não scroll instantâneo.
7. **Quiet hours** + jitter randomizado.
8. **Proxy residencial opcional** (tier Agency) — Bright Data / Oxylabs por conta.
9. **Health check periódico** — detect captcha precoce, pausa conta antes de ban.
10. **Multi-account rotation** — distribui carga, reduz signal por conta individual.

---

## Deployment options

A mesma imagem Docker (`ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:<tag>`) é o artefato único de release. Três orquestradores são suportados oficialmente.

### Matriz de modos

| Capacidade | Compose standalone | Swarm CLI | Portainer Compose | Portainer Swarm |
|---|---|---|---|---|
| Multi-node | Não | Sim | Não | Sim |
| Rolling updates com rollback | Não (recreate) | Sim | Não | Sim |
| Secrets em runtime | File mount | Swarm secrets | Env vars | Swarm secrets |
| Configs versionáveis (init.sql) | Volume mount | Swarm configs | Volume mount | Swarm configs |
| GitOps (auto-pull do repo) | Não (manual) | Não (script) | Sim | Sim |
| Webhook deploy | Não | Não | Sim | Sim |
| UI de gestão | Não | Não | Sim | Sim |
| Replicas | 1 fixa | N configurável | 1 fixa | N configurável |
| Healthcheck Traefik integrado | Sim (labels services) | Sim (labels deploy) | Sim | Sim |

### Templates fornecidos

| Arquivo | Modo | Uso |
|---|---|---|
| `mcp-server/docker/Dockerfile` | comum | Multi-stage Node 20 + Python 3.12 + Patchright + Chromium |
| `mcp-server/docker/docker-compose.yml` | Compose | Single-host, secrets via file |
| `mcp-server/docker/docker-stack.yml` | Swarm CLI | Multi-node, secrets externos, configs, placement, rolling update |
| `mcp-server/docker/portainer-stack.yml` | Portainer | Compose/Swarm via Portainer UI ou Git |
| `mcp-server/docker/.env.example` | comum | Variáveis não-sensíveis |
| `mcp-server/docker/postgres/init.sql` | comum | Schema inicial idempotente (10 tabelas) |
| `mcp-server/docker/secrets/README.md` | Compose | Instruções de geração local de secrets |
| `mcp-server/docker/traefik-labels.md` | comum | Referência de labels Traefik (router, service, middlewares) |

### Padrões de release

1. **Build CI** (GitHub Actions, on tag `v*`): build da imagem multi-arch (amd64 + arm64) → push para GHCR com tags `v1.0.0` + `latest`.
2. **Compose user**: `docker compose pull && docker compose up -d`.
3. **Swarm CLI user**: `docker service update --image ghcr.io/.../linkedin-maxvision-mcp:1.0.1 maxv-linkedin_mcp` ou re-deploy stack.
4. **Portainer GitOps user**: webhook do GitHub → Portainer pulls + redeploys.

### Quando recomendar cada modo (por persona)

| Persona | Modo recomendado | Motivo |
|---|---|---|
| Dev solo testando local | Compose standalone | Setup mais rápido; sem Swarm boilerplate |
| Job-seeker self-hosted (Free tier) | Compose standalone OU Portainer Compose | Single-host suficiente; volume baixo |
| Founder/creator (Pro tier) | Portainer Swarm OU Swarm CLI | Rolling updates seguras; deploy automatizado via webhook |
| Agency multi-tenant | Swarm + Portainer + n8n no mesmo cluster | Multi-node; isolamento via overlay; scale horizontal |
| MaxVision cloud-hosted | Swarm CLI + GitOps via Drone/GH Actions | Controle total; observability via Grafana |

### n8n no mesmo Swarm (Variante B Agency)

Para tier Agency, MCP e n8n podem co-existir no mesmo Swarm cluster:

```yaml
# docker-stack-n8n.yml (referência, fora deste blueprint)
services:
  n8n:
    image: n8nio/n8n:latest
    networks:
      - traefik-public  # mesmo overlay do MCP
    deploy:
      labels:
        traefik.http.routers.n8n.rule: "Host(`n8n.cliente.com`)"
        ...
```

Vantagens:
- n8n chama MCP via `http://maxv-linkedin_mcp:3000` (service discovery interna, sem TLS).
- Traefik único faz roteamento externo de ambos.
- Logs centralizados no mesmo stack.
- Backup unificado.

---

## Decisões de design relevantes

| Decisão | Alternativa rejeitada | Justificativa |
|---|---|---|
| Patchright sobre Playwright | Playwright vanilla | Anti-detect superior; comunidade ativa em 2025-26 |
| Python subprocess para `tomquirk/linkedin-api` | Reescrever em TS | Manutenção: lib upstream evolui rápido; subprocess isola crashes |
| Postgres + Redis sobre SQLite | SQLite só | Multi-tenant, multi-account, concorrência |
| `confirm_required=true` por default em apply/message | Auto-fire sempre | Compliance ToS + segurança UX (cliente revisa antes) |
| MCP transport stdio + HTTP | Só stdio | HTTP necessário para integração n8n e cloud-hosted |
| TypeScript strict + Zod | JS puro | Schemas tipados runtime + dev-time |
| License key via Cloudflare Worker | Servidor próprio | Latência baixa global; zero infra extra |
| AGPL-3.0 free + EULA Pro | MIT | Protege contra fork comercial; padrão de produtos similares (Plausible, n8n) |
| Marketplace dedicado | Adicionar a orchestration | Branding e licensing claros |
| Compose v3.9 (legacy) em todos os templates | Compose Spec moderno | `docker stack deploy` exige v3 legacy; v3.9 é o último sem breaking changes |
| Swarm secrets externos vs file mount | Tudo file-based | Em multi-node, file mount não funciona; secrets externos rotacionáveis |
| Imagem multi-arch (amd64 + arm64) | Só amd64 | VPS ARM (Oracle Free, Hetzner ARM) cada vez mais comum; build no CI uma vez |
| Patchright + Chromium pré-instalados na imagem | Install runtime | Reduz cold-start de 90s → 5s; aumenta tamanho de imagem (~600MB → ~1.2GB), aceitável |
| Healthchecks Compose v3 + Traefik labels | Só um dos dois | Compose detecta crash de container; Traefik retira do load-balancer mais rápido (30s) |

---

## Diagramas de fluxo

(versão texto — converter para Mermaid no docs site)

### Fluxo apply_easy com confirm

```
Cliente Claude Code
    │
    │ tool_call: apply_easy(confirm_required=true)
    ▼
MCP server
    │
    │ Patchright abre vaga
    │ Preenche form (resume + answers)
    │ Screenshot do form completo
    │
    │ INSERT applications (status='preview')
    │
    ▼ retorna {status: "preview", application_id: X, preview: {...}}
Cliente Claude Code
    │
    │ Mostra preview ao usuário
    │ Usuário aprova
    │
    │ tool_call: apply_easy(confirm=true, application_id=X)
    ▼
MCP server
    │
    │ Patchright clica "Submit"
    │ UPDATE applications SET status='submitted'
    │
    ▼ retorna {status: "submitted", application_id: X}
```

### Fluxo cookie rotation (background)

```
node-cron @ */6 * * *
    │
    │ Para cada account:
    │   health_check()
    │
    ├─ "ok" → nada
    ├─ "captcha" → pausa 24h, alert admin
    ├─ "logged_out" → notify cliente trocar cookie li_at
    └─ "banned" → desabilita account, alert admin
```
