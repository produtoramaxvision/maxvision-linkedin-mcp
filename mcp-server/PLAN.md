# Sprint 1 Implementation Plan — MaxVision LinkedIn MCP

> Este documento descreve arquivo-por-arquivo o que será implementado no Sprint 1.
> Nenhum código de implementação deve ser escrito antes deste plano ser aprovado.
> Snippets aqui são contratos de interface e schemas — não implementação completa.

---

## Source-of-truth resolution

### Conflito schema (resolvido)

O `mcp-server/docker/postgres/init.sql` define 8 tabelas. A especificação do Sprint 1 menciona "4 tabelas". Resolução:

- **"4 tabelas Sprint 1"** = 4 entidades de domínio que as tools do Sprint 1 operam: `jobs_cache`, `profiles_cache`, `applications`, `audit_log`
- **Tabelas de suporte** criadas pelo mesmo init.sql desde o início: `accounts`, `messages_drafts`, `rate_limit_events`, `captcha_events`, `license_cache`
- **`accounts` precisa de seed** "default" no Sprint 1 — FK obrigatória de `applications`
- **Drizzle schema** (`src/db/schema.ts`) é source-of-truth para tipos TypeScript. `init.sql` é o bootstrap Docker e deve ser mantido em sincronismo manualmente.
- **`audit_log` mudança**: init.sql atual tem colunas `action/resource_type/resource_id/metadata`. Sprint 1 adota spec `tool/input_hash/output_hash/success/latency_ms/error_msg`. **init.sql deve ser atualizado** na Fase 2 do build sequence.
- **Nomes de tabelas**: usar `jobs_cache` e `profiles_cache` (conforme init.sql e ARCHITECTURE.md) — não `jobs` e `profiles` (spec simplificada do brief).

### Drizzle vs init.sql

Drizzle não gera nem aplica migrations em produção. `drizzle-kit push` não é usado. O fluxo é:

1. Dev altera `src/db/schema.ts` (source-of-truth)
2. Dev atualiza `docker/postgres/init.sql` manualmente para refletir a mudança
3. `drizzle-kit generate` pode ser usado para comparação/studio apenas
4. Em produção, Postgres container executa init.sql via `/docker-entrypoint-initdb.d/`
5. Em dev local, `scripts/migrate.ts` aplica o init.sql via pg driver

---

## File tree

```
mcp-server/
├── package.json
├── pnpm-lock.yaml                   # gerado após pnpm install
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── drizzle.config.ts
├── .nvmrc                           # "20"
├── .env.example
├── PLAN.md                          # este arquivo
├── src/
│   ├── index.ts                     # entrypoint: detect stdio vs http, init sequência
│   ├── server.ts                    # McpServer bootstrap + tool registration
│   ├── http.ts                      # Hono: /health /metrics /mcp (SSE 501 em Sprint 1)
│   ├── env.ts                       # Zod env validation + file coalescing
│   ├── logger.ts                    # Pino singleton
│   ├── tools/
│   │   ├── _base.ts                 # ToolDefinition interface + withInstrumentation
│   │   ├── _registry.ts             # array de todas as tools
│   │   ├── schemas.ts               # JobSchema, ProfileSchema compartilhados
│   │   ├── search_jobs.ts
│   │   ├── get_profile.ts
│   │   ├── get_job_details.ts
│   │   └── track_application.ts
│   ├── browser/
│   │   ├── pool.ts                  # BrowserPool singleton
│   │   ├── context.ts               # createContext por accountId
│   │   └── anti-detect.ts           # humanDelay, smoothScroll, humanClick, humanType, randomUA
│   ├── db/
│   │   ├── client.ts                # drizzle + pg.Pool
│   │   ├── schema.ts                # 8 tabelas completas
│   │   └── repos/
│   │       ├── jobs.repo.ts
│   │       ├── profiles.repo.ts
│   │       ├── applications.repo.ts
│   │       └── audit.repo.ts
│   ├── rate-limit/
│   │   ├── strategy.ts              # ACTION_LIMITS const
│   │   └── token-bucket.ts          # Redis-backed token bucket
│   ├── auth/
│   │   └── cookies.ts               # lê LI_COOKIES_FILE/JSON, AES-GCM, seed accounts
│   └── scrapers/
│       ├── linkedin-jobs.ts         # Patchright: busca vagas + detalhes
│       ├── linkedin-profile.ts      # Patchright: scrape perfil público
│       └── jobspy.ts                # Python subprocess wrapper
├── python/
│   ├── requirements.txt
│   └── jobspy_runner.py
├── scripts/
│   ├── migrate.ts                   # aplica init.sql no DB local
│   └── seed.ts                      # seed account "default"
├── tests/
│   ├── unit/
│   │   ├── tools/
│   │   │   ├── search_jobs.test.ts
│   │   │   ├── get_profile.test.ts
│   │   │   ├── get_job_details.test.ts
│   │   │   └── track_application.test.ts
│   │   ├── browser/
│   │   │   └── anti-detect.test.ts
│   │   ├── rate-limit/
│   │   │   └── token-bucket.test.ts
│   │   └── auth/
│   │       └── cookies.test.ts
│   └── e2e/
│       └── search_jobs.e2e.ts       # scheduled only, conta sandbox
└── docker/                          # JÁ EXISTE — não modificar neste sprint (exceto init.sql)
    ├── Dockerfile
    ├── docker-compose.yml
    ├── docker-stack.yml
    ├── portainer-stack.yml
    ├── .env.example
    ├── .gitignore
    ├── traefik-labels.md
    ├── postgres/
    │   └── init.sql                 # ATUALIZAR audit_log columns em Fase 2
    └── secrets/
        └── README.md
```

**Total de arquivos novos a criar: 37** (docker/ excluído)

---

## Per-file detail

### `package.json`

Campos obrigatórios:

```json
{
  "name": "@maxvision/linkedin-mcp-server",
  "version": "1.0.0-alpha.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "main": "dist/index.js"
}
```

Scripts:

```json
{
  "build": "tsc -p tsconfig.build.json",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src tests --ext .ts",
  "test:unit": "vitest run tests/unit",
  "test:e2e": "vitest run tests/e2e",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:seed": "tsx scripts/seed.ts",
  "db:generate": "drizzle-kit generate",
  "db:studio": "drizzle-kit studio"
}
```

Dependências de produção:

- `@modelcontextprotocol/sdk` — SDK MCP oficial Anthropic
- `hono` + `@hono/node-server` — HTTP server
- `patchright` — fork anti-detect Playwright
- `drizzle-orm` + `pg` + `@types/pg` — ORM + driver
- `ioredis` — Redis client
- `zod` — validação runtime
- `pino` + `pino-pretty` — logging JSON estruturado
- `node-cron` — health check periódico (*/15 * * * *)
- `dotenv` — load .env em dev

Dependências dev:

- `typescript@^5.4`, `tsx`, `vitest`, `@playwright/test`
- `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- `drizzle-kit`

**Constraint crítica**: Dockerfile Stage 3 faz `COPY package.json pnpm-lock.yaml ./`. O `pnpm-lock.yaml` deve existir antes do primeiro `docker build`. Executar `pnpm install` localmente primeiro.

---

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

**Nota NodeNext**: todos os imports internos precisam usar extensão `.js` mesmo em arquivos `.ts`. Exemplo: `import { env } from "./env.js"` dentro de `logger.ts`.

---

### `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["tests", "**/*.test.ts", "node_modules"]
}
```

Usado por `pnpm build` (tsc -p tsconfig.build.json). Exclui tests do build de produção.

---

### `vitest.config.ts`

Configurações:

- `environment: "node"`
- `globals: true`
- `include: ["tests/unit/**/*.test.ts"]`
- `coverage.provider: "v8"`, thresholds 80%
- `poolOptions.threads.singleThread: true` — evita race conditions em tests de DB/Redis
- Global mock de `patchright` via `vi.mock` para não baixar Chromium em unit tests

---

### `drizzle.config.ts`

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DB_URL! },
} satisfies Config;
```

Usado apenas para `drizzle-kit generate` (comparação) e `drizzle-kit studio` (dev UI). Não é usado em produção.

---

### `.nvmrc`

```
20
```

---

### `.env.example`

Cópia de `docker/.env.example` com adição das variáveis para desenvolvimento local sem Docker:

```dotenv
# Desenvolvimento local (sem Docker)
DB_URL=postgres://mcp:devpassword@localhost:5432/mcp
REDIS_URL=redis://localhost:6379
MASTER_KEY=0000000000000000000000000000000000000000000000000000000000000000
LI_COOKIES_JSON={"default":"COLE-AQUI-O-COOKIE-LI_AT"}

# Herdadas de docker/.env.example
MCP_VERSION=latest
MCP_HOST=localhost
PORT=3000
METRICS_PORT=9090
LOG_LEVEL=debug
MAXVISION_TELEMETRY=off
PATCHRIGHT_HEADLESS=false
SSE_ENABLED=false
```

---

### `src/env.ts`

Responsabilidades:

1. Ler variáveis `*_FILE` e fazer coalescing (se `MASTER_KEY_FILE` existe e `MASTER_KEY` não, lê o arquivo)
2. Validar todas as variáveis via Zod
3. Exportar singleton `env` tipado

Variáveis validadas:

| Variável | Tipo Zod | Default | Obrigatório |
|---|---|---|---|
| `NODE_ENV` | `z.enum(["development","production","test"])` | — | sim |
| `PORT` | `z.coerce.number()` | 3000 | não |
| `METRICS_PORT` | `z.coerce.number()` | 9090 | não |
| `DB_URL` | `z.string().url()` | — | sim |
| `REDIS_URL` | `z.string()` | `redis://localhost:6379` | não |
| `MASTER_KEY` | `z.string().min(64)` | — | sim (após coalescing) |
| `MASTER_KEY_FILE` | `z.string().optional()` | — | não |
| `LI_COOKIES_JSON` | `z.string().optional()` | — | não |
| `LI_COOKIES_FILE` | `z.string().optional()` | — | não |
| `LICENSE_KEY` | `z.string().optional()` | — | não |
| `LICENSE_KEY_FILE` | `z.string().optional()` | — | não |
| `WEBHOOK_SECRET` | `z.string().optional()` | — | não |
| `WEBHOOK_SECRET_FILE` | `z.string().optional()` | — | não |
| `SSE_ENABLED` | `z.coerce.boolean()` | true | não |
| `PATCHRIGHT_HEADLESS` | `z.coerce.boolean()` | true | não |
| `MAXVISION_TELEMETRY` | `z.enum(["on","off"])` | "on" | não |
| `LOG_LEVEL` | `z.enum(["trace","debug","info","warn","error","fatal"])` | "info" | não |
| `ACCOUNT_TIMEZONE` | `z.string()` | "America/Sao_Paulo" | não |

Validação: se `LI_COOKIES_JSON` e `LI_COOKIES_FILE` ambos ausentes, logger de warning (não erro — server pode subir sem cookies, mas tools de scraping falharão).

Exports:

```typescript
export type Env = z.infer<typeof envSchema>;
export const env: Env;
```

---

### `src/logger.ts`

```typescript
import pino from "pino";
import { env } from "./env.js";

const transport = env.NODE_ENV === "development"
  ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
  : undefined;

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  redact: ["*.cookie", "*.li_at", "*.master_key", "db.password"],
  base: { pid: process.pid },
});

export const childLogger = (module: string) => logger.child({ module });
```

Cada arquivo importa `childLogger("nome/do/modulo")` para rastreabilidade nos logs estruturados.

---

### `src/index.ts`

Sequência de inicialização:

```
1. loadEnv() — env.ts (falha fast se inválido)
2. initLogger()
3. await checkDbConnectivity() — SELECT 1
4. await checkRedisConnectivity() — PING
5. await cookies.initializeDefaultAccount() — seed conta "default"
6. BrowserPool.getInstance() — cria singleton (lazy, não lança Chromium ainda)
7. const server = createMcpServer() — server.ts
8. if (SSE_ENABLED || MCP_TRANSPORT==="http"):
     await startHonoServer(server)   — http.ts
9. else:
     await connectStdioTransport(server)
10. registerShutdownHandlers()
```

Graceful shutdown (SIGTERM, SIGINT):

```
1. logger.info("Shutting down gracefully...")
2. await BrowserPool.getInstance().closeAll()
3. await db.pool.end()
4. await redis.quit()
5. process.exit(0)
```

Entry point compila para `dist/index.js` — alinhado com `CMD ["node", "dist/index.js"]` do Dockerfile.

---

### `src/server.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolRegistry } from "./tools/_registry.js";
import pkg from "../package.json" assert { type: "json" };

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "linkedin-maxvision",
    version: pkg.version,
    description: "Automate LinkedIn actions for job search, profile management, and outreach",
  });

  for (const tool of toolRegistry) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,    // Zod schema
      tool.wrappedHandler, // withInstrumentation aplicado em _registry.ts
    );
  }

  return server;
}
```

Sem lógica de negócio neste arquivo — apenas wiring SDK ↔ tools.

---

### `src/http.ts`

Hono app com dois sub-apps: porta 3000 (MCP + health) e porta 9090 (metrics).

Rotas na porta 3000:

| Rota | Método | Status Sprint 1 | Descrição |
|---|---|---|---|
| `/health` | GET | Implementado | JSON com status de DB, Redis, browser |
| `/health/live` | GET | Implementado | 200 se processo vivo |
| `/health/ready` | GET | Implementado | 200 se DB + Redis ok |
| `/mcp` | POST | Implementado | MCP stateless over HTTP |
| `/mcp/sse` | GET | 501 reservado | MCP over SSE (Sprint 5) |

Rota na porta 9090:

| Rota | Método | Descrição |
|---|---|---|
| `/metrics` | GET | Prometheus text format via `prom-client` |

Middleware:

- Request ID (`X-Request-ID` gerado se ausente)
- Pino request logging
- Error handler que retorna JSON `{ error: "..." }` em vez de HTML

Health check format:

```json
{
  "status": "ok",
  "version": "1.0.0-alpha.0",
  "uptime_seconds": 3600,
  "checks": {
    "db": "ok",
    "redis": "ok",
    "browser_contexts": 1
  }
}
```

Retorna 503 se qualquer check falhar.

Métricas registradas:

- `mcp_tool_calls_total{tool, status}` — counter
- `mcp_tool_duration_ms{tool}` — histogram (buckets: 100, 500, 1000, 3000, 10000, 30000)
- `browser_contexts_active` — gauge
- `rate_limit_blocks_total{action, account_id}` — counter

---

### `src/tools/_base.ts`

Interface central:

```typescript
import type { ZodSchema, z } from "zod";

export interface ToolContext {
  accountId: string;
  requestId: string;
  logger: ReturnType<typeof childLogger>;
  db: DrizzleClient;
  redis: Redis;
  browserPool: BrowserPool;
}

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
  // wrappedHandler é atribuído pelo withInstrumentation em _registry.ts
  wrappedHandler?: (input: unknown) => Promise<unknown>;
}
```

`withInstrumentation` wrapper:

1. Recebe `ToolDefinition`, retorna handler `(input: unknown) => Promise<unknown>`
2. Valida input via `inputSchema.parse(input)` (lança erro MCP se inválido)
3. Constrói `ToolContext` com singletons de db, redis, browserPool
4. Inicia timer `performance.now()`
5. Chama `tool.handler(parsedInput, ctx)` em try/catch
6. Em sucesso: `audit.repo.insert({ tool, success: true, latencyMs, inputHash, outputHash })`
7. Em erro: `audit.repo.insert({ tool, success: false, latencyMs, errorMsg })`, re-throw como `McpError`
8. Incrementa métricas Prometheus

---

### `src/tools/_registry.ts`

```typescript
import { searchJobsTool } from "./search_jobs.js";
import { getProfileTool } from "./get_profile.js";
import { getJobDetailsTool } from "./get_job_details.js";
import { trackApplicationTool } from "./track_application.js";
import { withInstrumentation } from "./_base.js";

const tools = [searchJobsTool, getProfileTool, getJobDetailsTool, trackApplicationTool];

export const toolRegistry = tools.map((tool) => ({
  ...tool,
  wrappedHandler: withInstrumentation(tool),
}));
```

Sprints futuros adicionam imports aqui. Nenhuma magia de auto-discovery.

---

### `src/tools/schemas.ts`

Schemas Zod compartilhados entre múltiplas tools:

```typescript
export const JobSchema = z.object({
  id: z.string(),
  source: z.enum(["linkedin", "indeed", "glassdoor", "ziprecruiter"]),
  url: z.string().url(),
  title: z.string(),
  company: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    logo: z.string().url().optional(),
  }),
  location: z.string(),
  remote_type: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  posted_at: z.string().datetime(),
  applicants_count: z.number().optional(),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default("USD"),
    period: z.enum(["hour", "month", "year"]).optional(),
  }).optional(),
  description: z.string(),
  easy_apply: z.boolean(),
  match_score: z.number().min(0).max(1).optional(),
  scraped_at: z.string().datetime(),
});

export const ProfileSchema = z.object({
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
    description: z.string().optional(),
  })),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    start_year: z.number().optional(),
    end_year: z.number().optional(),
  })),
  skills: z.array(z.string()),
  followers: z.number().optional(),
  scraped_at: z.string().datetime(),
});

export type Job = z.infer<typeof JobSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
```

---

### `src/tools/search_jobs.ts`

Input schema:

```typescript
export const SearchJobsInput = z.object({
  keywords: z.string().min(1).max(500),
  location: z.string().optional(),
  remote: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
  experience: z.array(z.enum([
    "internship", "entry", "associate", "mid-senior", "director", "executive"
  ])).optional(),
  posted_within_hours: z.coerce.number().int().min(1).max(720).default(168),
  salary_min_usd: z.coerce.number().optional(),
  sources: z.array(z.enum(["linkedin", "indeed", "glassdoor", "ziprecruiter"]))
            .default(["linkedin"]),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  easy_apply_only: z.boolean().default(false),
  account_id: z.string().default("default"),
  use_cache: z.boolean().default(true),
});
```

Output: `z.array(JobSchema)`

Lógica do handler (sem implementação, descrição):

1. Verificar cache: `jobs.repo.findByKeywords(keywords, sources, maxAge=6h)`
2. Se cache hit e `use_cache=true`: retornar jobs do cache imediatamente
3. Verificar rate limit: `tokenBucket.tryConsume("search", accountId)`. Se bloqueado: erro MCP com mensagem de quando o próximo slot estará disponível
4. Para cada source em `input.sources`:
   - "linkedin": `scrapeLinkedInJobs(params, ctx)`
   - outros: `runJobSpy(params)` (Python subprocess)
5. Mesclar resultados, deduplicar por URL
6. Aplicar filtros pós-scrape: `easy_apply_only`, `salary_min_usd`, `posted_within_hours`
7. Ordenar por `posted_at DESC`, fatiar por `limit`
8. `jobs.repo.upsertMany(jobs)` com `expires_at = NOW() + 6h`
9. Retornar array

Fallback: se scraper falha, retornar cache stale se disponível (com campo `{ _from_stale_cache: true, cache_age_hours: N }` no output).

---

### `src/tools/get_profile.ts`

Input schema:

```typescript
export const GetProfileInput = z.object({
  profile_url: z.string().url().optional(),
  public_id: z.string().min(1).optional(),
  include: z.array(z.enum([
    "experience", "education", "skills", "recommendations", "activity", "contact"
  ])).default(["experience", "education", "skills"]),
  account_id: z.string().default("default"),
  use_cache: z.boolean().default(true),
  cache_max_age_hours: z.coerce.number().default(24),
}).refine(
  (d) => d.profile_url !== undefined || d.public_id !== undefined,
  { message: "profile_url ou public_id é obrigatório" }
);
```

Output: `ProfileSchema`

Lógica:

1. Normalizar: se `public_id` fornecido, construir URL `https://www.linkedin.com/in/{public_id}`
2. **Whitelist**: validar que URL começa com `https://www.linkedin.com/in/` ou `https://linkedin.com/in/`. Rejeitar qualquer outro domínio (SSRF mitigation — ver RISKS-COMPLIANCE.md#6)
3. `profiles.repo.findByUrl(url, cache_max_age_hours)` — verificar cache
4. Se cache hit: retornar `payload` parseado como ProfileSchema
5. Rate limit: `tryConsume("profile_fetch", accountId)`
6. `scrapeProfile(url, include, ctx)`
7. `profiles.repo.upsert(profile)` com `expires_at = NOW() + 24h`
8. Retornar ProfileSchema

---

### `src/tools/get_job_details.ts`

Input schema:

```typescript
export const GetJobDetailsInput = z.object({
  job_url: z.string().url().refine(
    (u) => /linkedin\.com\/jobs\//i.test(u),
    { message: "URL deve ser uma vaga LinkedIn (linkedin.com/jobs/)" }
  ),
  include_applicants_demo: z.boolean().default(false),
  account_id: z.string().default("default"),
  use_cache: z.boolean().default(true),
  cache_max_age_hours: z.coerce.number().default(12),
});
```

Output schema:

```typescript
export const JobDetailsSchema = JobSchema.extend({
  full_description_html: z.string(),
  requirements: z.array(z.string()),
  benefits: z.array(z.string()),
  hiring_team: z.array(ProfileSchema.partial()).optional(),
  application_instructions: z.string().optional(),
  job_id: z.string(),
});
```

Lógica:

1. Extrair `job_id` da URL: regex `/jobs/view/(\d+)/` ou query param `currentJobId=(\d+)`. Lança erro se não encontrar.
2. `jobs.repo.findById(job_id)` — verificar cache
3. Se cache hit: retornar `payload` parseado como JobDetailsSchema
4. Rate limit: `tryConsume("search", accountId)` (busca de detalhes conta como search)
5. `scrapeJobDetails(job_url, ctx)`
6. `jobs.repo.upsert(jobDetails)` com `expires_at = NOW() + 12h`
7. Retornar JobDetailsSchema

---

### `src/tools/track_application.ts`

Input schema:

```typescript
export const TrackApplicationInput = z.object({
  job_url: z.string().url(),
  job_id: z.string().optional(),
  status: z.enum([
    "interested", "submitted", "viewed", "rejected",
    "interview", "offer", "withdrawn"
  ]),
  notes: z.string().max(2000).optional(),
  resume_used: z.string().optional(),
  account_id: z.string().default("default"),
});
```

Output schema:

```typescript
export const TrackApplicationOutput = z.object({
  tracking_id: z.string().uuid(),
  job_url: z.string().url(),
  status: z.string(),
  history: z.array(z.object({
    status: z.string(),
    at: z.string().datetime(),
    notes: z.string().optional(),
  })),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
```

Lógica:

1. `applications.repo.findByJobUrl(job_url, accountId)`
2. Se existe:
   - `applications.repo.appendHistory(id, { status, at: new Date().toISOString(), notes })`
   - `applications.repo.updateStatus(id, status, notes)`
3. Se não existe:
   - `applications.repo.create({ jobUrl, accountId, status, notes, resumeUsed, history: [{ status, at, notes }] })`
4. Retornar TrackApplicationOutput

Esta é a única tool do Sprint 1 que faz escrita não-idempotente no DB (as outras fazem upsert de cache).

---

### `src/browser/pool.ts`

BrowserPool singleton. Interface pública:

```typescript
export class BrowserPool {
  private static instance: BrowserPool;

  static getInstance(): BrowserPool

  // Retorna context existente ou cria novo via context.ts
  async acquire(accountId: string): Promise<BrowserContext>

  // Verifica saúde: "ok" | "captcha" | "logged_out" | "banned" | "unknown"
  async healthCheck(accountId: string): Promise<AccountHealthStatus>

  // Remove e fecha context (após ban/logout detectado)
  async invalidate(accountId: string): Promise<void>

  // Fecha todos os contexts — chamar em graceful shutdown
  async closeAll(): Promise<void>

  get activeCount(): number
}
```

Internals:

- `contexts: Map<string, BrowserContext>` — Sprint 1: max 1 entry
- `chromium` importado de `patchright` (não `@playwright/test`)
- `launchPersistentContext` é chamado por `context.ts`

Health check cron: `node-cron` `*/15 * * * *` chama `healthCheck("default")`. Se status != "ok":

- `captcha`: `UPDATE accounts SET status='paused'`, log error, emitir webhook se configurado
- `logged_out`: log error + instrução para trocar cookie
- `banned`: `UPDATE accounts SET status='banned'`, log error urgente

---

### `src/browser/context.ts`

```typescript
export async function createContext(
  accountId: string,
  cookieValue: string,
  options?: Partial<BrowserContextOptions>
): Promise<BrowserContext>
```

Configurações `launchPersistentContext`:

```typescript
{
  headless: env.PATCHRIGHT_HEADLESS,
  viewport: { width: 1920, height: 1080 },
  locale: "en-US",
  timezoneId: env.ACCOUNT_TIMEZONE,
  userAgent: randomUserAgent(),        // estável por accountId (salvo em memória)
  extraHTTPHeaders: {
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
  },
  args: [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],
  ignoreDefaultArgs: ["--enable-automation"],
  chromiumSandbox: false,
}
```

Cookies injectados após criação:

- `li_at` — obrigatório
- `JSESSIONID` — se disponível no JSON de cookies
- `li_gc` — consent (opcional)
- `bcookie` — fingerprint LinkedIn (opcional)

Domain `.linkedin.com`, `httpOnly: true`, `secure: true`, `sameSite: "None"`.

Timeout `page.goto`: sempre `{ timeout: 30000, waitUntil: "domcontentloaded" }`. Não usar `networkidle` — LinkedIn carrega requests de telemetria infinitamente.

---

### `src/browser/anti-detect.ts`

```typescript
// Pool de ~20 UAs curados Chrome 120-130 em Windows 10/11 e macOS 14-15
export function randomUserAgent(): string

// Delay humanizado: distribuição beta (não uniforme), min-max ms
// Maioria das chamadas: 800-2000ms. Cauda longa ocasional até 5000ms.
export async function humanDelay(minMs: number, maxMs: number): Promise<void>

// Scroll suave: divide em steps de 10px com easeInOutQuad + jitter de tempo
export async function smoothScroll(page: Page, pixels: number): Promise<void>

// Click com mouse movement humanizado: curva Bezier de posição atual para target
export async function humanClick(page: Page, locator: Locator): Promise<void>

// Typing humanizado: ~80 WPM base com jitter por caractere, erros ocasionais corrigidos
export async function humanType(
  page: Page,
  locator: Locator,
  text: string
): Promise<void>
```

User-Agent é **estável por contexto**: ao criar contexto, `randomUserAgent()` é chamado uma vez e o resultado é salvo. Não muda entre páginas do mesmo contexto.

---

### `src/db/client.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { env } from "../env.js";

const pool = new Pool({
  connectionString: env.DB_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, {
  schema,
  logger: env.NODE_ENV === "development",
});

export type DrizzleClient = typeof db;

export async function checkDbConnectivity(): Promise<void> {
  const client = await pool.connect();
  try { await client.query("SELECT 1"); }
  finally { client.release(); }
}
```

Pool size 10: Sprint 1 usa ~2-3 conexões simultâneas. Pool de 10 é conservador e adequado.

---

### `src/db/schema.ts`

Schema completo Drizzle — espelha `docker/postgres/init.sql`:

```typescript
import {
  pgTable, text, bytea, timestamp, jsonb, real,
  uuid, bigserial, boolean, integer, index
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// accounts
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  cookieEncrypted: bytea("cookie_encrypted").notNull(),
  cookieExpiresAt: timestamp("cookie_expires_at", { withTimezone: true }).notNull(),
  rateLimitBucket: jsonb("rate_limit_bucket").notNull().default(sql`'{}'`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [index("idx_accounts_status").on(t.status)]);

// jobs_cache
export const jobsCache = pgTable("jobs_cache", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  url: text("url").notNull().unique(),
  payload: jsonb("payload").notNull(),
  matchScore: real("match_score"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("idx_jobs_fetched").on(t.fetchedAt),
  index("idx_jobs_source").on(t.source),
  index("idx_jobs_expires").on(t.expiresAt),
]);

// profiles_cache
export const profilesCache = pgTable("profiles_cache", {
  publicId: text("public_id").primaryKey(),
  url: text("url").notNull().unique(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [index("idx_profiles_expires").on(t.expiresAt)]);

// applications
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  jobUrl: text("job_url").notNull(),
  jobTitle: text("job_title"),
  company: text("company"),
  status: text("status").notNull(),
  resumeUsed: text("resume_used"),
  coverLetter: text("cover_letter"),
  answers: jsonb("answers"),
  screenshotPath: text("screenshot_path"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
  history: jsonb("history").notNull().default(sql`'[]'::jsonb`),
}, (t) => [
  index("idx_applications_account").on(t.accountId, t.submittedAt),
  index("idx_applications_status").on(t.status),
]);

// messages_drafts (Sprint 2, tabela criada desde início)
export const messagesDrafts = pgTable("messages_drafts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  recipientUrl: text("recipient_url").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [index("idx_drafts_account").on(t.accountId, t.createdAt)]);

// rate_limit_events
export const rateLimitEvents = pgTable("rate_limit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
}, (t) => [index("idx_rate_limit_account_time").on(t.accountId, t.occurredAt)]);

// captcha_events
export const captchaEvents = pgTable("captcha_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  context: text("context"),
  resolved: boolean("resolved").notNull().default(false),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
}, (t) => [index("idx_captcha_account").on(t.accountId, t.occurredAt)]);

// license_cache (Sprint 3, tabela criada desde início)
export const licenseCache = pgTable("license_cache", {
  keyHash: text("key_hash").primaryKey(),
  tier: text("tier").notNull(),
  features: jsonb("features").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow(),
});

// audit_log — versão Sprint 1 (breaking change vs init.sql atual)
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tool: text("tool").notNull(),
  accountId: text("account_id"),
  inputHash: text("input_hash"),
  outputHash: text("output_hash"),
  success: boolean("success").notNull(),
  latencyMs: integer("latency_ms"),
  errorMsg: text("error_msg"),
  ts: timestamp("ts", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_audit_account").on(t.accountId, t.ts),
  index("idx_audit_tool").on(t.tool, t.ts),
]);
```

**AÇÃO NECESSÁRIA**: atualizar `docker/postgres/init.sql` — substituir colunas de `audit_log` para alinhar com este schema.

---

### `src/db/repos/jobs.repo.ts`

```typescript
export interface JobsRepo {
  findByKeywords(
    keywords: string,
    sources: string[],
    maxAgeHours: number
  ): Promise<Job[]>
  findById(id: string): Promise<Job | null>
  findByUrl(url: string): Promise<Job | null>
  upsert(job: NewJob): Promise<Job>
  upsertMany(jobs: NewJob[]): Promise<void>
  deleteExpired(): Promise<number>
}

// Tipos inferidos do schema Drizzle — nunca definir manualmente
type Job = typeof jobsCache.$inferSelect;
type NewJob = typeof jobsCache.$inferInsert;
```

`findByKeywords`: Sprint 1 filtra por `source IN ? AND fetched_at > NOW() - ?h`. Sem full-text search (GIN index é Sprint 2+).

---

### `src/db/repos/profiles.repo.ts`

```typescript
export interface ProfilesRepo {
  findByPublicId(publicId: string, maxAgeHours: number): Promise<Profile | null>
  findByUrl(url: string, maxAgeHours: number): Promise<Profile | null>
  upsert(profile: NewProfile): Promise<Profile>
}
```

---

### `src/db/repos/applications.repo.ts`

```typescript
export interface ApplicationsRepo {
  findByJobUrl(jobUrl: string, accountId: string): Promise<Application | null>
  findAll(accountId: string, limit?: number): Promise<Application[]>
  create(application: NewApplication): Promise<Application>
  updateStatus(id: string, status: string, notes?: string): Promise<Application>
  appendHistory(id: string, entry: HistoryEntry): Promise<Application>
}

export interface HistoryEntry {
  status: string;
  at: string;         // ISO 8601
  notes?: string;
}
```

`appendHistory`: faz `UPDATE applications SET history = history || $1::jsonb WHERE id = $2` — append atômico no array JSONB.

---

### `src/db/repos/audit.repo.ts`

```typescript
export interface AuditRepo {
  insert(entry: {
    tool: string;
    accountId?: string;
    inputHash?: string;     // SHA-256 hex de JSON.stringify(input)
    outputHash?: string;    // SHA-256 hex de JSON.stringify(output)
    success: boolean;
    latencyMs?: number;
    errorMsg?: string;
  }): Promise<void>
}
```

Hash calculado em `_base.ts` via `crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex")`. Input/output nunca armazenados integrais — apenas hashes para auditoria LGPD.

---

### `src/rate-limit/strategy.ts`

```typescript
export const ACTION_LIMITS = {
  search:        { per_hour: 10,  per_day: 100, jitter_ms: [800, 3000]       },
  profile_fetch: { per_hour: 8,   per_day: 80,  jitter_ms: [1500, 5000]      },
  apply:         { per_hour: 5,   per_day: 50,  jitter_ms: [10_000, 30_000]  },
  message:       { per_hour: 3,   per_day: 30,  jitter_ms: [5000, 15_000]    },
  post:          { per_hour: 2,   per_day: 5,   jitter_ms: [60_000, 300_000] },
  feed_scroll:   { per_hour: 30,  per_day: 200, jitter_ms: [500, 2000]       },
} as const;

export type ActionType = keyof typeof ACTION_LIMITS;
```

---

### `src/rate-limit/token-bucket.ts`

Implementação Redis-backed. Chaves:

- `rl:hour:{accountId}:{action}:{YYYY-MM-DD-HH}` — TTL 2h
- `rl:day:{accountId}:{action}:{YYYY-MM-DD}` — TTL 25h

```typescript
export class TokenBucket {
  constructor(private redis: Redis) {}

  async tryConsume(
    action: ActionType,
    accountId: string
  ): Promise<{
    allowed: boolean;
    remaining_hour: number;
    remaining_day: number;
    reset_at_hour: Date;
    reset_at_day: Date;
  }>

  async status(
    action: ActionType,
    accountId: string
  ): Promise<{
    used_hour: number;
    used_day: number;
    limit_hour: number;
    limit_day: number;
  }>
}
```

Implementação via `INCR` + `EXPIRE`. Race condition aceitável em Sprint 1 (single-user). Sprint 3+ pode adicionar script Lua para atomicidade.

---

### `src/auth/cookies.ts`

```typescript
export interface CookieSet {
  li_at: string;
  JSESSIONID?: string;
  bcookie?: string;
  li_gc?: string;
}

export class CookieStore {
  // Retorna cookies decriptados em memória para o accountId
  async get(accountId: string): Promise<CookieSet | null>

  // Lê LI_COOKIES_FILE/JSON, criptografa com AES-256-GCM, faz UPSERT em accounts
  async initializeDefaultAccount(): Promise<void>
}
```

Criptografia:

- Algoritmo: AES-256-GCM via `crypto.createCipheriv`
- Key: `env.MASTER_KEY` (64 chars hex → 32 bytes)
- IV: 12 bytes aleatórios gerados por cookie
- Formato armazenado em `BYTEA`: `IV (12 bytes) || Auth Tag (16 bytes) || Ciphertext`
- Decripsão: primeiros 12 bytes = IV, bytes 12-27 = auth tag, resto = ciphertext

Erro com MASTER_KEY errada: capturado, logado com nível "error", servidor sobe mas accounts com cookie inválido não são adicionados ao pool.

---

### `src/scrapers/linkedin-jobs.ts`

```typescript
export async function scrapeLinkedInJobs(
  params: z.infer<typeof SearchJobsInput>,
  ctx: ToolContext
): Promise<Job[]>

export async function scrapeJobDetails(
  jobUrl: string,
  ctx: ToolContext
): Promise<z.infer<typeof JobDetailsSchema>>
```

URL de busca LinkedIn:

```
https://www.linkedin.com/jobs/search/?keywords={kw}&location={loc}&f_WT={remote}&f_E={exp}&f_TPR=r{seconds}&f_SB2={salMin}&f_LF={easyApply}&start={offset}
```

Seletores resilientes (múltiplos por elemento):

```typescript
const JOB_TITLE_SELECTORS = [
  "h1.t-24",
  "h1.job-details-jobs-unified-top-card__job-title",
  'h1[data-test="job-title"]',
  "h1",
];

const EASY_APPLY_SELECTORS = [
  'button[data-control-name="easy_apply_top_button"]',
  'button[aria-label*="Easy Apply"]',
  'button:has-text("Easy Apply")',
  "button.jobs-apply-button",
];
```

Paginação: até 4 pages (100 resultados). `start=0`, `start=25`, `start=50`, `start=75`.

Erros específicos:

- `CaptchaError` — URL contém `checkpoint/challenge`
- `AuthError` — URL contém `uas/login`
- `ScrapeError` — seletor não encontrado após tentar todos os fallbacks

---

### `src/scrapers/linkedin-profile.ts`

```typescript
export async function scrapeProfile(
  profileUrl: string,
  include: string[],
  ctx: ToolContext
): Promise<Profile>
```

Seções extraídas por XPath/CSS seletores resilientes:

- `h1` — nome completo
- `.text-body-medium.break-words` — headline
- `#about section` — summary
- `#experience ul li` — experiência
- `#education ul li` — educação
- `#skills ul li` — skills (máximo 50)

---

### `src/scrapers/jobspy.ts`

```typescript
export async function runJobSpy(params: {
  keywords: string;
  location?: string;
  sources: Array<"indeed" | "glassdoor" | "ziprecruiter">;
  limit: number;
  posted_within_hours: number;
}): Promise<Job[]>
```

Implementação:

1. `JSON.stringify(params)` → stdin do processo
2. `spawn("python", ["python/jobspy_runner.py"])` com env `PATH=/opt/venv/bin:...`
3. Timeout 60s via `AbortController`
4. `JSON.parse(stdout)` → normalizar para `Job[]`
5. Erros: subprocess code != 0 → log stderr, retornar `[]`

---

### `python/requirements.txt`

```
python-jobspy>=1.1.4
linkedin-api>=2.1.0
pandas>=2.0.0
```

Instalado em `/opt/venv` pelo Dockerfile Stage 3. Não adicionar dependências pesadas sem aprovação.

---

### `python/jobspy_runner.py`

Recebe JSON de params via stdin, chama `scrape_jobs` do jobspy, imprime array JSON no stdout.

```python
#!/usr/bin/env python3
import sys, json, traceback
import pandas as pd
from jobspy import scrape_jobs

try:
    params = json.load(sys.stdin)
    jobs = scrape_jobs(
        site_name=params["sources"],
        search_term=params["keywords"],
        location=params.get("location", ""),
        results_wanted=params["limit"],
        hours_old=params["posted_within_hours"],
    )
    output = jobs.where(pd.notna(jobs), None).to_dict("records")
    print(json.dumps(output))
    sys.exit(0)
except Exception as e:
    print(json.dumps({"error": str(e), "jobs": []}), file=sys.stdout)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
```

---

### `scripts/migrate.ts`

Aplica `docker/postgres/init.sql` no DB. Uso em dev local sem Docker.

```typescript
// Lê env.DB_URL, conecta via pg.Pool, executa init.sql, exit 0 ou 1
// Caminho para init.sql: path.join(import.meta.dirname, "../docker/postgres/init.sql")
```

---

### `scripts/seed.ts`

Seed conta "default" no DB para desenvolvimento.

```typescript
// Lê LI_COOKIES_JSON do .env
// Criptografa com MASTER_KEY via auth/cookies.ts
// UPSERT em accounts: { id: "default", display_name: "Default Account" }
// Log "Account 'default' seeded" e exit 0
```

---

## Tests — casos de teste

### `tests/unit/tools/search_jobs.test.ts`

1. Retorna jobs do cache quando `use_cache=true` e cache hit
2. Chama scraper quando cache miss
3. Aplica filtro `easy_apply_only=true`
4. Retorna array vazio quando scraper falha e sem cache (com warning)
5. Lança MCP error quando rate limit esgotado (com remaining/reset_at no erro)
6. Deduplica jobs com mesma URL de fontes diferentes
7. Respeita `limit` no output final

Mocks: `patchright`, `scrapers/linkedin-jobs`, `scrapers/jobspy`, `db/repos/jobs.repo`, `rate-limit/token-bucket`

### `tests/unit/tools/get_profile.test.ts`

1. Retorna perfil do cache dentro do `cache_max_age_hours`
2. Chama scraper quando cache expirado
3. Rejeita URL `https://evil.com/in/hack` (SSRF mitigation — whitelist)
4. Falha quando nem `profile_url` nem `public_id` fornecidos
5. Normaliza `public_id="williamhgates"` para URL `https://www.linkedin.com/in/williamhgates`

### `tests/unit/tools/get_job_details.test.ts`

1. Extrai `job_id` de `/jobs/view/3987654321/`
2. Extrai `job_id` de `?currentJobId=3987654321`
3. Retorna detalhes do cache quando disponível
4. Chama scraper quando cache miss
5. Rejeita URL sem `linkedin.com/jobs/`
6. Retorna `requirements` como array de strings parseadas do JD

### `tests/unit/tools/track_application.test.ts`

1. Cria novo registro quando job_url não existe para a conta
2. Atualiza status e appenda ao history quando já existe
3. Mantém entradas anteriores no history ao atualizar
4. Persiste `notes` e `resume_used`
5. Retorna history completo ordenado por `at`
6. Insere em audit_log em caso de sucesso e de erro

### `tests/unit/auth/cookies.test.ts`

1. Lê de `LI_COOKIES_JSON` env var — parse correto
2. Lê de arquivo JSON via `LI_COOKIES_FILE` — mock de `fs.readFileSync`
3. Round-trip: criptografa + decriptografa recupera o valor original
4. Falha com mensagem clara se MASTER_KEY tem menos de 64 chars
5. Falha graciosamente com JSON malformado — log warning, não throw

### `tests/unit/rate-limit/token-bucket.test.ts`

1. Permite chamadas dentro de `per_hour`
2. Bloqueia na chamada `per_hour + 1`
3. Reset após virada da hora (mock de Redis com chave diferente)
4. Permite dentro de `per_day` mas bloqueia após esgotar
5. `status()` retorna `used_hour` e `used_day` corretos

### `tests/e2e/search_jobs.e2e.ts`

Scheduled test — não executa em CI de push/PR. Executa em `schedule: "0 9 * * 1"` (segunda, 09h UTC).

1. `search_jobs({ keywords: "software engineer", location: "United States", limit: 5 })` retorna >= 1 vaga
2. Cada vaga tem `id`, `url`, `title`, `company.name` preenchidos
3. `get_profile({ profile_url: "https://www.linkedin.com/in/williamhgates" })` retorna `full_name: "Bill Gates"`
4. `get_job_details({ job_url: ... })` retorna `full_description_html` não vazio

Pré-requisito: `LINKEDIN_SANDBOX_COOKIE` em GitHub Secrets. Nunca usar conta pessoal.

---

## DB schema — Drizzle (tabela de decisões)

| Tabela | Sprint que usa | Papel no Sprint 1 |
|---|---|---|
| `accounts` | Sprint 1 | Seed "default" obrigatório (FK de applications) |
| `jobs_cache` | Sprint 1 | Cache de vagas — leitura e escrita |
| `profiles_cache` | Sprint 1 | Cache de perfis — leitura e escrita |
| `applications` | Sprint 1 | Tracking — leitura e escrita |
| `messages_drafts` | Sprint 2 | Criada mas vazia |
| `rate_limit_events` | Sprint 1+ | Criada; Redis é o counter real |
| `captcha_events` | Sprint 1+ | Criada; health check escreve aqui |
| `license_cache` | Sprint 3 | Criada mas vazia |
| `audit_log` | Sprint 1 | withInstrumentation escreve em toda tool call |

---

## Browser pool design

### Patchright vs Playwright vanilla

**Decisão**: Patchright. Justificativa:

- Patches `navigator.webdriver`, `chrome.runtime`, `navigator.plugins`, canvas/WebGL fingerprint
- LinkedIn detecta Playwright vanilla em ~2 dias de uso. Patchright mantém >30 dias (dados de comunidade 2025)
- API 100% compatível com Playwright — migração trivial se necessário
- Overhead: ~50MB extra de chromium patches pré-compilados. Aceitável.

### Single account Sprint 1

```
BrowserPool.instance
  └─ contexts: Map<string, BrowserContext> = new Map()  // 1 entry em Sprint 1
  └─ healthCron: node-cron "*/15 * * * *"
  └─ activeCount getter
```

**Lazy init**: `launchPersistentContext` chamado apenas na primeira `acquire("default")`.

**Persistent context**: `/var/data/profiles/default` (volume Docker `profile-data`). Persiste entre restarts — fingerprint estável, cookies, localStorage.

**Concorrência Sprint 1**: stdio transport é inerentemente sequencial. Sem mutex explícito necessário. Sprint 3: `async-mutex` por accountId.

**Token bucket antes de acquire**: `tryConsume` antes de abrir página. Se bloqueado, `acquire` lança `RateLimitError` — nunca bloqueia indefinidamente.

### Checklist de saúde `healthCheck()`

```
1. acquire("default")
2. ctx.newPage()
3. page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30000 })
4. if (page.url().includes("checkpoint")) → "captcha"
5. if (page.url().includes("uas/login")) → "logged_out"
6. const banner = await page.locator(".restricted-account-banner").count()
   if (banner > 0) → "banned"
7. → "ok"
8. await page.close()
```

---

## Build sequence

### Fase 1 — Scaffolding (Dia 1, manhã)

- [ ] `cd mcp-server && pnpm init` + editar `package.json` conforme spec
- [ ] `pnpm install` — gera `pnpm-lock.yaml` (OBRIGATÓRIO antes de docker build)
- [ ] Criar `tsconfig.json`, `tsconfig.build.json`, `.nvmrc`
- [ ] Criar `vitest.config.ts`, `drizzle.config.ts`
- [ ] Criar `.env.example`
- [ ] Criar estrutura de dirs: `src/{tools,browser,db/repos,rate-limit,auth,scrapers}`, `python/`, `scripts/`, `tests/...`
- [ ] Criar `src/env.ts` — validação completa
- [ ] Criar `src/logger.ts` — Pino singleton
- [ ] `pnpm typecheck` deve passar (0 erros)

### Fase 2 — Database (Dia 1, tarde)

- [ ] **Atualizar `docker/postgres/init.sql`** — audit_log com colunas Sprint 1
- [ ] Criar `src/db/schema.ts` — 8 tabelas
- [ ] Criar `src/db/client.ts`
- [ ] Criar `src/db/repos/*.ts` (4 repos)
- [ ] Criar `scripts/migrate.ts`, `scripts/seed.ts`
- [ ] `docker compose -f docker/docker-compose.yml up postgres redis -d`
- [ ] `pnpm db:migrate && pnpm db:seed` — testar conectividade
- [ ] `pnpm typecheck` deve passar

### Fase 3 — Auth e Rate Limit (Dia 1, fim do dia)

- [ ] Criar `src/auth/cookies.ts`
- [ ] Criar `src/rate-limit/strategy.ts`, `src/rate-limit/token-bucket.ts`
- [ ] Criar `tests/unit/auth/cookies.test.ts`
- [ ] Criar `tests/unit/rate-limit/token-bucket.test.ts`
- [ ] `pnpm test:unit` deve passar todos os casos

### Fase 4 — Browser pool (Dia 2, manhã)

- [ ] Criar `src/browser/anti-detect.ts`
- [ ] Criar `src/browser/context.ts`
- [ ] Criar `src/browser/pool.ts`
- [ ] Criar `tests/unit/browser/anti-detect.test.ts`
- [ ] Testar launch manual do Chromium via Patchright em Linux (WSL ou Docker): `node -e "import('patchright').then(({chromium})=>chromium.launchPersistentContext('/tmp/test',{headless:false}))"`

### Fase 5 — Scrapers e Python (Dia 2, tarde)

- [ ] Criar `python/requirements.txt`
- [ ] Criar `python/jobspy_runner.py`
- [ ] Testar: `echo '{"keywords":"engineer","sources":["indeed"],"limit":3,"posted_within_hours":168}' | python python/jobspy_runner.py`
- [ ] Criar `src/scrapers/linkedin-jobs.ts`
- [ ] Criar `src/scrapers/linkedin-profile.ts`
- [ ] Criar `src/scrapers/jobspy.ts`

### Fase 6 — Tools (Dia 2, fim do dia)

- [ ] Criar `src/tools/schemas.ts` — JobSchema, ProfileSchema
- [ ] Criar `src/tools/_base.ts` — interface + withInstrumentation
- [ ] Criar `src/tools/_registry.ts`
- [ ] Criar `src/tools/search_jobs.ts`
- [ ] Criar `src/tools/get_profile.ts`
- [ ] Criar `src/tools/get_job_details.ts`
- [ ] Criar `src/tools/track_application.ts`
- [ ] Criar `tests/unit/tools/*.test.ts` (4 arquivos)
- [ ] `pnpm test:unit` — todos os casos passando

### Fase 7 — Server e HTTP (Dia 3, manhã)

- [ ] Criar `src/server.ts`
- [ ] Criar `src/http.ts` — Hono com /health, /metrics, /mcp (SSE 501)
- [ ] Criar `src/index.ts` — entrypoint + graceful shutdown
- [ ] `pnpm build` — 0 erros TypeScript
- [ ] Testar stdio: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js`
- [ ] Testar HTTP: `MCP_TRANSPORT=http node dist/index.js &` + `curl localhost:3000/health`

### Fase 8 — Docker (Dia 3, tarde)

- [ ] `docker build -f docker/Dockerfile -t maxvision-mcp-test .` — 0 erros
- [ ] Verificar tamanho: esperado ~1.2-1.5GB
- [ ] `docker compose -f docker/docker-compose.yml up -d`
- [ ] `curl http://localhost:3000/health` — `{ "status": "ok" }`
- [ ] Smoke test via MCP inspector: `search_jobs`, `get_profile`, `get_job_details`, `track_application`

### Fase 9 — Validação final (Dia 3, fim do dia)

- [ ] `pnpm typecheck` — 0 erros
- [ ] `pnpm lint` — 0 warnings
- [ ] `pnpm test:unit` — 100% dos casos
- [ ] `/health` responde 200 com checks db/redis ok
- [ ] `/metrics` responde 200 com formato Prometheus
- [ ] Tool `search_jobs` retorna vagas reais (conta sandbox)
- [ ] Tool `track_application` persiste history corretamente
- [ ] `audit_log` tem entradas para cada tool call
- [ ] `rate_limit_events` registra após chamadas
- [ ] Push para `homolog` — CI verde (lint + typecheck + unit tests)

---

## Riscos Sprint 1

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| LinkedIn detecta Chromium na conta sandbox | Alta | Médio | Conta sandbox descartável; 3 contas backup; testar com headless=false primeiro |
| DOM do LinkedIn muda durante o sprint | Baixa | Alto | Seletores múltiplos por elemento; hotfix < 1h se ocorrer |
| JobSpy subprocess timeout em CI | Média | Baixo | Mock completo em unit tests; E2E só em scheduled |
| `pnpm-lock.yaml` ausente no primeiro docker build | Alta | Bloqueante | Fase 1 exige `pnpm install` explicitamente antes de qualquer build |
| MASTER_KEY errada invalida cookies | Baixa | Alto | env.ts valida >= 64 chars; error claro em startup; /health retorna 503/ready |
| Conflito de porta com Postgres v14 na VPS | Alta | Bloqueante | Postgres v16 não expõe porta externamente — rede interna Docker apenas |
| `audit_log` init.sql desalinhado com Drizzle schema | Alta (se não feito) | Médio | Fase 2 obriga atualizar init.sql como primeira ação |

---

## Decisões de design — justificativas

| Decisão | Alternativa rejeitada | Razão |
|---|---|---|
| Drizzle owns schema; init.sql é bootstrap | drizzle-kit push em produção | drizzle-kit push pode dropar colunas; init.sql IF NOT EXISTS é seguro e transparente |
| Repository pattern sobre Drizzle direto nas tools | Drizzle direto nas tools | Testabilidade — mock do repo, não do ORM; camada de cache transparente em Sprint 3 |
| Stdio-first; HTTP/SSE reservado (501) | Implementar SSE completo no Sprint 1 | Sprint 5 scope; reservar path evita conflito de roteamento futuro |
| Python subprocess para JobSpy | Port nativo TypeScript | jobspy e linkedin-api evoluem rápido upstream; subprocess isola crashes; venv já no Dockerfile |
| `account_id` em todas as tools desde Sprint 1 | Adicionar em Sprint 3 | Schema MCP não muda em Sprint 3 — só implementação do pool; Claude Code não precisa atualizar calls |
| `withInstrumentation` obrigatório em _registry | Cada tool implementa seu próprio logging | 100% das tools com audit/metrics sem dependência de cada desenvolvedor lembrar |
| TokenBucket via Redis INCR | Lua script atômico | Menor complexidade Sprint 1; race condition aceitável single-user; Lua em Sprint 3 se volume aumentar |
| Cookie storage AES-256-GCM em Postgres BYTEA | Arquivo criptografado no volume | DB é backup-friendly; Volume pode ser perdido; AES-GCM é autenticado (detecta tampering) |

---

## Referências cruzadas

- Riscos técnicos completos: `docs/RISKS-COMPLIANCE.md`
- Rate limits por ação: `docs/ARCHITECTURE.md#rate-limiting-estratégia`
- Anti-detect técnicas: `docs/ARCHITECTURE.md#anti-detect`
- Browser pool design: `docs/ARCHITECTURE.md#browser-pool-design-patchright`
- Deploy Docker: `docs/deploy-docker-swarm.md`
- Roadmap completo: `docs/ROADMAP.md`
- Schema SQL canônico: `mcp-server/docker/postgres/init.sql` (atualizar na Fase 2)
- Dockerfile multi-stage: `mcp-server/docker/Dockerfile`
- Env vars: `mcp-server/docker/.env.example`
- Fluxo apply_easy (Sprint 2): `docs/ARCHITECTURE.md#fluxo-apply_easy-com-confirm`

---

*Sprint 1 Implementation Plan — MaxVision LinkedIn MCP*
*Gerado em: 2026-05-08*
*Status: aguardando aprovação antes de implementação (Fase B)*
