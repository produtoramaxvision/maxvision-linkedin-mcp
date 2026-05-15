---
name: linkedin-anti-detect-rules
description: "Use when configurar rate-limits, planejar janelas de execução, interpretar métricas de saúde da conta LinkedIn, ou decidir como reagir a captcha/HTTP 999. Cobre token-bucket, behavioral mimicry e playbook de recuperação."
---

# LinkedIn anti-detect rules — Sprint 1

Política técnica para minimizar risco de detecção/banimento ao operar com cookie autenticado do usuário. Complementar a `linkedin-tos-compliance` (regras legais).

---

## 1. Token bucket por ferramenta

Valores autoritativos vivem em `mcp-server/src/rate-limit/strategy.ts`. Replicados aqui para referência rápida — em caso de divergência, o código tem precedência.

| Ferramenta | Capacidade (burst) | Refill (tokens/s) | Sustentado (req/min) | Observação |
|---|---|---|---|---|
| `search_jobs` | 10 | 0.1 | 6 | Busca em `/jobs/search`. |
| `get_profile` | 5 | 0.05 | 3 | Mais sensível — leitura de `/in/<slug>`. |
| `get_job_details` | 20 | 0.3 | 18 | Vagas individuais; cache 60min ajuda. |
| `track_application` | 100 | 1.0 | — | Local-only, sem hit no LinkedIn. |
| `send_message` *(Sprint 2)* | 3 | 0.01 | 0.6 | Reservado; ainda não implementado. |

**Como funciona o token bucket**: cada chamada consome 1 token. O bucket inicia cheio (capacity) e refila à `refill_rate`. Se vazio, a chamada espera (back-pressure) ou é rejeitada — depende do caller.

**Regra de ouro de uso**: ao planejar batches, multiplicar `req_count × 1/refill_rate` para estimar tempo total. Ex: 30 perfis × 1/0.05 = 600s = 10min.

---

## 2. Pacing por hora do dia

LinkedIn analisa padrão temporal de uso. Comportamento humano concentra-se em horário comercial; tráfego às 03h BRT é forte sinal de bot.

| Janela (BRT) | Política |
|---|---|
| 02:00–06:00 | **Não rodar** buscas/scrapes. Apenas operações locais (track_application). Madrugada = bot signal. |
| 06:00–09:00 | OK, mas com volume reduzido (~30% do diário). Mimetiza pessoa abrindo LinkedIn antes do trabalho. |
| 09:00–12:00 | Janela ideal. Volume máximo permitido pelo bucket. |
| 12:00–14:00 | OK; volume natural cai (almoço). |
| 14:00–18:00 | Janela ideal. Pico de uso humano. |
| 18:00–22:00 | OK; reduzir progressivamente. |
| 22:00–02:00 | Reduzir para ~20%. Pessoas reais ainda mexem mas é minoria. |

**Sazonalidade**: em fins de semana, comportamento humano cai a ~40% do volume de dia útil. Espelhar essa curva.

**Fuso**: o usuário está em BRT (UTC-3). Se a vaga/conta operar em outro fuso, alinhar à hora local do **dono do cookie**, não da vaga.

---

## 3. Behavioral signatures — o que Patchright cobre

[Patchright](https://github.com/Kaliiiiiiiiii-Vinyx/patchright) é um Playwright patched para evitar fingerprint de automação. O que ele neutraliza automaticamente:

- `navigator.webdriver === false` (em Playwright vanilla retorna `true`).
- Canvas fingerprint randomization (sutil, consistente por sessão).
- WebGL vendor/renderer spoofing.
- `navigator.languages` configurável (defaultamos `["pt-BR", "pt", "en-US", "en"]`).
- Plugins/MimeTypes: lista realista de Chrome estável.
- `chrome.runtime` populado.
- Permissions API consistente.
- User-Agent + UA-CH em sincronia (sem mismatch que vira flag).

**Conclusão**: para o vetor "headless detection clássico", confiamos no Patchright. Não precisamos camada extra de stealth no Sprint 1.

---

## 4. O que NÃO spoofamos (e por quê)

| Vetor | Por que não fazemos no Sprint 1 |
|---|---|
| **Rotação de IP** (proxy/VPN) | LinkedIn correlaciona IP com histórico de login do cookie. IP rotativo dispara "login from unusual location" — pior que IP estável. Solução correta exige residential proxy de alto custo + warm-up; fora do escopo. |
| **Mouse movement emulation** | Curvas Bezier humanas, micro-tremor — implementação cara e frágil. Patchright já remove os flags principais. Adicionamos só se taxa de captcha exceder 2%. |
| **Scroll real com viewport intersection** | Mesmo motivo acima. LinkedIn de fato olha scroll patterns, mas nossas ferramentas ainda não fazem deep-scroll de feeds. |
| **Variação de User-Agent por chamada** | UA estável por sessão é mais humano que UA rotativo. Patchright define UA fixo coerente com OS. |
| **Headless mode** | Sempre `headless: false` em produção quando tecnicamente possível; quando precisar headless, Patchright neutraliza. |

---

## 5. Métricas de saúde a monitorar

Operadas por `linkedin-anti-detect-monitor` agent. Coleta de `audit_log` do MCP:

| Métrica | Threshold verde | Amarelo | Vermelho |
|---|---|---|---|
| Latency p95 (ms) | < 3500 | 3500–6000 | > 6000 |
| Captcha rate (24h) | < 1% | 1–5% | > 5% |
| HTTP 999 count (24h) | 0 | 1–2 | ≥ 3 |
| HTTP 429 (rate-limit upstream) | 0 | 1–5 | > 5 |
| Cookie age válido | > 7 dias | 1–7 dias | < 1 dia (re-login forçado) |
| Erros de parsing (HTML mudou) | < 0.5% | 0.5–2% | > 2% |

**Frequência de check**: agent roda self-test a cada início de sessão + on-demand quando o usuário relata "lentidão" ou "tela em branco".

---

## 6. Playbook de recuperação

| Evento | Ação imediata | Janela de pausa | Pós-pausa |
|---|---|---|---|
| **1 captcha** | Pausa de 1h. Não tentar de novo dentro da janela. | 1h | Voltar com volume 50% por 24h. |
| **3+ captchas em 24h** | Pausa de 4h. Notificar usuário. | 4h | Voltar com volume 30% por 48h. Investigar padrão. |
| **HTTP 999 (1 ocorrência)** | Pausa de 24h. Disparar refresh de cookie ao final. | 24h | Reduzir refill_rate em 30% por 1 semana. |
| **HTTP 999 recorrente (3+ em semana)** | Pausa de 7 dias. Auditoria completa. Considerar nova máquina/perfil de browser. | 7 dias | Reavaliar se conta está em risco terminal — ler [linkedin-tos-compliance](../linkedin-tos-compliance/SKILL.md) red flags. |
| **"Restricted account" banner** | Stop completo. Não tocar mais por automação. | Indefinido | Apelar manualmente via UI; se LinkedIn restaurar, reentrar com 10% do volume. |
| **Cookie expirado < 24h após login** | Não re-logar imediatamente — espera mínima de 12h. | 12h | Login manual no horário típico do usuário (ex: 09:30 BRT). |

**Princípio**: ao detectar sinal de risco, sempre pausar mais do que parece necessário. Ban definitivo é assimétrico — perde-se a conta inteira; ganho de 10% de throughput não vale o risco.

---

## 7. Headers HTTP críticos

O LinkedIn analisa a coerência dos headers de cada requisição para distinguir browsers reais de automação. Abaixo os headers mais relevantes e o que cada um sinaliza.

| Header | O que o LinkedIn analisa | Como Patchright trata | O que NÃO sobrescrever |
|---|---|---|---|
| `User-Agent` | Versão do browser, OS, plataforma. Incoerência entre UA e outros signals = flag imediato. | Define UA fixo e coerente com o Chrome estável instalado + OS detectado. | Nunca rotacionar por chamada; nunca definir manualmente UA de versão antiga ou genérico (`python-requests`, `curl`). |
| `Accept-Language` | Idioma do usuário. Bot típico usa `en-US` fixo; usuário BR usa `pt-BR, pt, en-US, en`. | Configura `["pt-BR", "pt", "en-US", "en"]` por padrão. | Não sobrescrever para `*` ou lista vazia — sinaliza automação. |
| `Sec-CH-UA` | Client Hints: marca e versão do browser (Chrome/Edge). Deve ser sincronizado com UA string. | Patchright mantém sincronia automática entre UA string e `Sec-CH-UA`. | Nunca injetar `Sec-CH-UA` manualmente sem alterar o UA string de forma correspondente — mismatch é detectável. |
| `Sec-CH-UA-Platform` | OS da plataforma (`"Windows"`, `"macOS"`). Deve combinar com UA. | Definido automaticamente a partir do OS real do processo Patchright. | Não falsificar plataforma diferente do OS real — combinações impossíveis (Linux + Chrome Windows UA) são flags fortes. |
| `Accept-Encoding` | Suporte a compressão (gzip, br, deflate). | Browser padrão; Patchright não altera. | Não remover — ausência de `Accept-Encoding` é anomalia. |
| `Cookie` | Sessão autenticada (`li_at`, `JSESSIONID`, outros cookies de sessão). | Injetado via `page.context().addCookies()` com os cookies do usuário. | Nunca injetar parcialmente (só `li_at` sem os demais cookies da sessão) — cookie set incompleto = flag. Usar o conjunto completo de cookies exportados. |
| `Referer` | Origem da navegação. Requisição sem Referer coerente = possível bot direto. | Em navegação sequencial, Patchright popula automaticamente. | Não zerar o Referer manualmente em requisições XHR internas da página. |
| `X-Requested-With` | Usado em algumas requisições AJAX legacy. Presença inesperada (ex: em requisição de página principal) pode sinalizar script. | Patchright não injeta em requisições de page load — comportamento correto. | Não adicionar `X-Requested-With: XMLHttpRequest` em requisições de navegação normal; só presente em XHR legítimas da própria página. |

**Regra de ouro de headers**: não sobrescrever nada que o Patchright não expõe explicitamente para customização. Se um header precisa de ajuste, fazer via `page.setExtraHTTPHeaders()` apenas para headers complementares (ex: `Accept-Language` se necessário ajustar idioma por conta) — nunca via substituição de cabeçalhos base do browser.

---

## 8. Padrões de navegação seguros

### Fluxo mínimo antes de chamar uma tool

Toda sessão de automação deve começar com um "aquecimento de sessão" antes de executar a primeira tool de scraping:

1. Navegar para `linkedin.com/feed` (página inicial autenticada).
2. Aguardar carregamento completo da página (evento `networkidle` ou timeout de 2-4s — variar aleatoriamente).
3. Simular micro-pausa de 1.5–3s (aleatorizado com `Math.random() * 1500 + 1500`) antes de qualquer `page.goto()` subsequente.
4. Só então navegar para a URL-alvo da tool (ex: `linkedin.com/jobs/search`, `linkedin.com/in/<slug>`).

Justificativa: sessões que chegam diretamente em páginas de busca sem ter "vindo" de algum lugar apresentam padrão atípico. O feed simula o ponto de entrada natural de um usuário que abriu o LinkedIn.

### Profundidade de sessão antes de fechar

- Mínimo de 2 páginas visitadas por sessão (feed + alvo). Sessões de 1 hit são flag.
- Máximo recomendado: 15–20 ações por sessão (inclui navigations + interações). Sessões longas demais também são atípicas.
- Ao finalizar: não fechar browser abruptamente. Navegar de volta ao feed, aguardar 2s, então fechar.

### Pausa entre sessões distintas

Sessão = um conjunto coeso de operações (ex: uma rodada de `search_jobs` + N `get_job_details`). Entre sessões:

| Situação | Pausa mínima |
|---|---|
| Sessões de mesma conta, mesmo tool | 15 minutos |
| Sessões de mesma conta, tools diferentes | 10 minutos |
| Sessões de contas diferentes (múltiplas contas) | 5 minutos (browser profile isolado por conta) |
| Pós-captcha (1 evento) | 60 minutos (ver §6) |

Implementar via `sleep` com jitter: `pause = base_minutes * 60 * 1000 + (Math.random() * 120 * 1000)` (±2min de variação).

### Simulação de scroll — quando necessário e quando não

**Quando NÃO é necessário**: ferramentas que acessam APIs internas do LinkedIn (via XHR já mapeadas), `get_job_details` em URL direta, `get_profile` de perfil sem lazy-loaded sections.

**Quando é necessário**: `search_jobs` quando a página carrega resultados via scroll infinito; qualquer tool nova que precise de conteúdo abaixo do fold inicial.

**Como fazer scroll sem parecer bot**:
- Usar `page.evaluate(() => window.scrollBy(0, randomPixels))` com valor aleatório entre 200–600px por scroll.
- Pausa entre scrolls: 800ms–2000ms (aleatorizado).
- Nunca scroll instantâneo até o bottom (`window.scrollTo(0, document.body.scrollHeight)` é flag forte).
- Máximo de 3–5 scrolls por página; se o conteúdo necessário não carregou, registrar em audit_log e retornar parcial.

---

## 9. Bright Data Web Unlocker — Modo A vs Modo B

O plugin suporta integração com Bright Data Web Unlocker como camada alternativa ao Patchright quando o ambiente não permite browser headless ou quando o bloqueio é mais severo (Sprint 7+).

### Modo A — Proxy unlock padrão (default Sprint 7)

Modo A roteia a requisição HTTP pelo Web Unlocker como um proxy inteligente: o Bright Data injeta headers de browser realistas, seleciona IP residencial apropriado para a geo-alvo, e resolve CAPTCHAs simples automaticamente. O response é o HTML/JSON final, sem execução de JavaScript do lado do Bright Data.

- **Quando usar**: fetching de páginas que não dependem de JS client-side para renderizar o conteúdo necessário (ex: `get_job_details` em URLs de vaga com conteúdo server-side rendered).
- **Custo de créditos Apify**: baixo — 1–2 Apify compute units por 1.000 requisições (estimativa; verificar billing atual do workspace).
- **Configuração no mcp-server**: via variável `BRIGHT_DATA_MODE=A` e `BRIGHT_DATA_ZONE=web_unlocker` no `.env`.

### Modo B — Browser session completa com JS rendering

Modo B instrui o Bright Data a rodar um browser completo no lado deles, executar JavaScript e retornar o DOM renderizado. Equivale a um Playwright/Puppeteer gerenciado externamente, com IP residencial integrado.

- **Quando usar**: páginas que dependem de JS para carregar o conteúdo (ex: `search_jobs` com scroll infinito em JavaScript, `get_profile` com lazy-loaded sections que falham no Modo A).
- **Custo de créditos Apify**: alto — 10–20x o custo do Modo A por requisição. Usar com parcimônia.
- **Configuração no mcp-server**: via variável `BRIGHT_DATA_MODE=B` e `BRIGHT_DATA_ZONE=browser` no `.env`.

### Quando Modo B é necessário

| Situação | Modo recomendado |
|---|---|
| Conteúdo renderizado server-side; sem lazy load | Modo A |
| Conteúdo carregado via XHR após DOMContentLoaded | Modo B |
| Captcha rate > 5% persistindo com Patchright local | Modo B (IP residencial do Bright Data como alternativa) |
| Ambiente sem suporte a browser headless (ex: serverless) | Modo B |
| Testes de custo mínimo em desenvolvimento | Modo A sempre |

### Flags de configuração relevantes no mcp-server

```
BRIGHT_DATA_ENABLED=true          # ativa integração; false = usa Patchright local
BRIGHT_DATA_MODE=A                # "A" ou "B"
BRIGHT_DATA_ZONE=web_unlocker     # nome da zone no painel Bright Data
BRIGHT_DATA_API_TOKEN=<token>     # token de API do workspace Bright Data
BRIGHT_DATA_COUNTRY=br            # geo de saída dos IPs (br = Brasil; omitir para rotação global)
```

**Fallback**: se Modo B falhar (timeout, quota esgotada), o mcp-server deve retornar ao Patchright local automaticamente e registrar evento em `audit_log` com `source: brightdata_fallback`.
