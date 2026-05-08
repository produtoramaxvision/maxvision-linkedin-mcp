# DNS Records — Sprint 0

VPS public IP: **163.176.233.224** (Oracle Cloud, ARM64).

## Cloudflare zone: `maxvision.com.br`

| Subdomínio | Tipo | Aponta para | Proxy | TTL | Uso |
|---|---|---|---|---|---|
| `linkedin.maxvision.com.br` | CNAME | `cname.vercel-dns.com` | DNS only | Auto | Landing Vercel |
| `license.linkedin.maxvision.com.br` | CNAME | `linkedin-license.<workers-subdomain>.workers.dev` | Proxied | Auto | Cloudflare Worker license server |
| `api.linkedin.maxvision.com.br` | A | `163.176.233.224` | DNS only | Auto | API pública (futuro Sprint 2+) |

## Cloudflare zone: `meuagente.api.br`

| Subdomínio | Tipo | Aponta para | Proxy | TTL | Uso |
|---|---|---|---|---|---|
| `linkedin-mcp.meuagente.api.br` | A | `163.176.233.224` | DNS only | Auto | MCP server prod (Traefik http-challenge precisa DNS only) |

## Notas críticas

1. **Traefik na VPS usa `letsencryptresolver` com httpchallenge** (porta 80). Cloudflare proxy (laranja) **bloqueia** esse fluxo — manter como `DNS only` (cinza) para qualquer host que precise de cert via Traefik.
2. **Worker** pode (e deve) ficar com proxy laranja — Cloudflare gera cert automaticamente no Worker route.
3. **Vercel** entrega cert via Vercel ACME — manter DNS only.
4. Para `api.linkedin.maxvision.com.br`, criar somente quando Sprint 2 expor REST/SSE público — não precisa hoje.

## Comando wrangler para criar custom domain do Worker (executar APÓS deploy do Worker)

```bash
# Cloudflare API token deve ter scope: Zone.DNS:Edit + Workers:Edit
# Adicionar em wrangler.toml > [[routes]]:
# pattern = "license.linkedin.maxvision.com.br/*"
# zone_name = "maxvision.com.br"
# Quando rodar `npx wrangler deploy`, Cloudflare cria o DNS automaticamente.
```

## Verificação pós-criação

```bash
# Esperado depois de propagação (1–5 min):
dig +short linkedin.maxvision.com.br                    # → IPs Vercel
dig +short license.linkedin.maxvision.com.br            # → IPs Cloudflare proxy
dig +short linkedin-mcp.meuagente.api.br                # → 163.176.233.224

curl -fsS https://linkedin-mcp.meuagente.api.br/health   # 200 (após stack deployada)
curl -fsS https://license.linkedin.maxvision.com.br/health  # 200 (após Worker live)
```
