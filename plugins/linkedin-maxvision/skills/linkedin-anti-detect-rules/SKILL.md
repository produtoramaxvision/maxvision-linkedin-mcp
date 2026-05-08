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
