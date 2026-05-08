# Traefik Labels — Referência

Este documento explica os labels Traefik usados nos compose/stack files do MaxVision LinkedIn MCP. Aplica-se a Traefik v2 e v3.

---

## Pré-requisitos

- Traefik rodando como ingress no mesmo Docker host/cluster.
- Network externa `traefik-public` criada.
- Resolvers ACME configurados (Let's Encrypt, Cloudflare DNS, etc.).
- Entrypoints `web` (80) e `websecure` (443) ativos.

Exemplo mínimo de Traefik config (referência, não pertence ao MCP):

```yaml
# traefik.yml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
  swarm:
    exposedByDefault: false
    network: traefik-public

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@maxvision.com.br
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
```

---

## Labels usados nos compose

```yaml
labels:
  traefik.enable: "true"
  traefik.docker.network: "traefik-public"

  # Router
  traefik.http.routers.linkedin-mcp.rule: "Host(`linkedin-mcp.seu-dominio.com`)"
  traefik.http.routers.linkedin-mcp.entrypoints: "websecure"
  traefik.http.routers.linkedin-mcp.tls: "true"
  traefik.http.routers.linkedin-mcp.tls.certresolver: "letsencrypt"

  # Service
  traefik.http.services.linkedin-mcp.loadbalancer.server.port: "3000"
  traefik.http.services.linkedin-mcp.loadbalancer.healthcheck.path: "/health"
  traefik.http.services.linkedin-mcp.loadbalancer.healthcheck.interval: "30s"

  # Middleware: rate limit
  traefik.http.middlewares.linkedin-mcp-ratelimit.ratelimit.average: "100"
  traefik.http.middlewares.linkedin-mcp-ratelimit.ratelimit.burst: "50"

  # Aplicar middleware ao router
  traefik.http.routers.linkedin-mcp.middlewares: "linkedin-mcp-ratelimit@swarm"
```

---

## Diferenças Compose vs Swarm

### Modo Compose (engine standalone)

Labels ficam **no service** (`services.<name>.labels:`).

Provider Traefik: `docker`.

Sufixo do middleware: `@docker`.

```yaml
traefik.http.routers.linkedin-mcp.middlewares: "linkedin-mcp-ratelimit@docker"
```

### Modo Swarm

Labels ficam **em `deploy.labels`** (não em `services.<name>.labels`). Traefik Swarm provider só lê labels de `deploy:`.

Provider Traefik: `swarm`.

Sufixo do middleware: `@swarm`.

```yaml
deploy:
  labels:
    traefik.http.routers.linkedin-mcp.middlewares: "linkedin-mcp-ratelimit@swarm"
```

> **Erro comum:** colocar labels Swarm em `services.<name>.labels:` — Traefik não os enxerga.

---

## Configurações adicionais opcionais

### Sticky sessions (necessário se usar SSE/WebSocket)

```yaml
traefik.http.services.linkedin-mcp.loadbalancer.sticky.cookie.name: "maxv_session"
traefik.http.services.linkedin-mcp.loadbalancer.sticky.cookie.secure: "true"
traefik.http.services.linkedin-mcp.loadbalancer.sticky.cookie.httpOnly: "true"
```

### Headers de segurança

```yaml
traefik.http.middlewares.maxv-secure-headers.headers.framedeny: "true"
traefik.http.middlewares.maxv-secure-headers.headers.contenttypenosniff: "true"
traefik.http.middlewares.maxv-secure-headers.headers.browserxssfilter: "true"
traefik.http.middlewares.maxv-secure-headers.headers.referrerpolicy: "strict-origin-when-cross-origin"
traefik.http.middlewares.maxv-secure-headers.headers.stsseconds: "31536000"
traefik.http.middlewares.maxv-secure-headers.headers.stsincludesubdomains: "true"
```

Aplicar:

```yaml
traefik.http.routers.linkedin-mcp.middlewares: "maxv-secure-headers@swarm,linkedin-mcp-ratelimit@swarm"
```

### Restringir IP (whitelist)

```yaml
traefik.http.middlewares.maxv-ip-whitelist.ipallowlist.sourcerange: "10.0.0.0/8,192.168.0.0/16,<seu-ip>/32"
```

### Basic auth para endpoints sensíveis (ex: `/admin`)

```yaml
# Gerar hash: htpasswd -nbB admin senha
traefik.http.middlewares.maxv-admin-auth.basicauth.users: "admin:$2y$05$..."

# Router separado para /admin
traefik.http.routers.linkedin-mcp-admin.rule: "Host(`linkedin-mcp.seu-dominio.com`) && PathPrefix(`/admin`)"
traefik.http.routers.linkedin-mcp-admin.middlewares: "maxv-admin-auth@swarm"
```

### CORS para landing/clientes web

```yaml
traefik.http.middlewares.maxv-cors.headers.accesscontrolalloworiginlist: "https://linkedin.maxvision.com.br"
traefik.http.middlewares.maxv-cors.headers.accesscontrolallowmethods: "GET,POST,OPTIONS"
traefik.http.middlewares.maxv-cors.headers.accesscontrolallowheaders: "Authorization,Content-Type,X-License-Key"
traefik.http.middlewares.maxv-cors.headers.accesscontrolmaxage: "86400"
```

### Compressão gzip

```yaml
traefik.http.middlewares.maxv-compress.compress: "true"
```

---

## Múltiplos hosts/domains

Para servir o mesmo MCP em vários domínios:

```yaml
traefik.http.routers.linkedin-mcp.rule: "Host(`linkedin-mcp.maxvision.com.br`) || Host(`api.linkedin.maxvision.com.br`)"
```

---

## Subpath em vez de subdomínio

Se preferir `https://maxvision.com.br/linkedin-mcp/...`:

```yaml
traefik.http.routers.linkedin-mcp.rule: "Host(`maxvision.com.br`) && PathPrefix(`/linkedin-mcp`)"
traefik.http.middlewares.linkedin-mcp-strip.stripprefix.prefixes: "/linkedin-mcp"
traefik.http.routers.linkedin-mcp.middlewares: "linkedin-mcp-strip@swarm,linkedin-mcp-ratelimit@swarm"
```

---

## Validação

```bash
# Listar routers ativos
curl -s http://traefik-host:8080/api/http/routers | jq '.[] | select(.name | startswith("linkedin-mcp"))'

# Listar services
curl -s http://traefik-host:8080/api/http/services | jq '.[] | select(.name | startswith("linkedin-mcp"))'

# Conferir TLS cert
curl -vI https://linkedin-mcp.seu-dominio.com 2>&1 | grep -i "subject:"
```

---

## Alternativas a Traefik

Se preferir outro reverse proxy, substituir a seção labels por:

### Caddy (com label provider)

```yaml
labels:
  caddy: linkedin-mcp.seu-dominio.com
  caddy.reverse_proxy: "{{upstreams 3000}}"
  caddy.encode: gzip
```

### Nginx Proxy Manager

Configurar via UI apontando para `<container-ip>:3000`. Não usa labels.

### Apache (mod_proxy)

VirtualHost externo com `ProxyPass /` para `http://<host-ip>:3000/`.

Para os modos não-Traefik, **remover todo o bloco `labels:`** dos compose files.
