# DNS Records — Sprint 0 (zone única produtoramaxvision.com.br)

**Estratégia**: tudo concentrado na zone `produtoramaxvision.com.br` (Cloudflare). Sem Vercel, sem `meuagente.api.br`. Cloudflare Pages para landing, Cloudflare Worker para license server, VPS vmmvp para MCP server.

VPS vmmvp: `163.176.233.224` (Oracle Cloud, ARM64). Já aliased como `hostinger.produtoramaxvision.com.br` no padrão da zone.

## Status atual

| Subdomínio | Tipo | Target | Proxy | Status | Quem cria |
|---|---|---|---|---|---|
| `linkedin-mcp.produtoramaxvision.com.br` | CNAME | `hostinger.produtoramaxvision.com.br` | DNS only | ✅ **CRIADO** (2026-05-08) | Cloudflare MCP |
| `linkedin.produtoramaxvision.com.br` | CNAME | `<projeto>.pages.dev` | Auto (proxied) | ⏳ Sprint 0 (1.10) | Cloudflare Pages auto-cria |
| `license.linkedin.produtoramaxvision.com.br` | CNAME | Worker route | Proxied | ⏸ Sprint 3 (deferido) | `wrangler deploy` auto-cria |
| `api.linkedin.produtoramaxvision.com.br` | A | `163.176.233.224` | DNS only | ⏸ Sprint 2+ (skip) | Manual quando precisar |

## Detalhes

### 1. `linkedin-mcp.produtoramaxvision.com.br` ✅ CRIADO

Aponta para a VPS vmmvp via CNAME pra `hostinger.produtoramaxvision.com.br` (que resolve `163.176.233.224`).

**DNS only obrigatório**: Traefik na VPS usa Let's Encrypt HTTP-01 (porta 80). Cloudflare proxy bloqueia esse fluxo.

ID Cloudflare: `025bfd71f5774784945deef3e3699b0a`.

Verificação:
```bash
nslookup linkedin-mcp.produtoramaxvision.com.br      # → 163.176.233.224
```

### 2. `linkedin.produtoramaxvision.com.br` (landing) — Sprint 0 etapa 1.10

Cloudflare Pages cria o registro automaticamente quando você adicionar custom domain ao projeto Pages. Você não precisa criar manualmente.

Workflow:
1. Deploy projeto Pages via `wrangler pages deploy` ou GitHub integration.
2. Pages → Custom domains → Add → `linkedin.produtoramaxvision.com.br`.
3. Pages injeta CNAME automaticamente na zone (mesma conta Cloudflare, sem token extra).

### 3. `license.linkedin.produtoramaxvision.com.br` (Worker) — DEFERIDO Sprint 3

`wrangler deploy` com `[[routes]] custom_domain = true` cria registro DNS automático na zone.

Pré-requisito: API token wrangler com scope `Workers Routes:Edit` + `Zone.DNS:Edit`.

**Defer**: feature Pro ainda não existe. Sem nada pra proteger, license server fica idle.

### 4. `api.linkedin.produtoramaxvision.com.br` — Sprint 2+

API REST pública. Sem propósito hoje. **Não criar.**

## Verificação manual via Cloudflare MCP

```javascript
// Listar todos registros da zone
await cloudflare.request({
  method: "GET",
  path: "/zones/3fc393601085cf68630fb42fac795bf0/dns_records",
  query: { name: "linkedin-mcp.produtoramaxvision.com.br" }
});
```

Zone ID: `3fc393601085cf68630fb42fac795bf0` (produtoramaxvision.com.br).
Account ID: `e15749486b97b79128b82f1cc87a7d16`.
