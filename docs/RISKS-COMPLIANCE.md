# Riscos & Compliance — MaxVision LinkedIn MCP

Documento crítico para infoproduto. LinkedIn é hostil a automação. Lista riscos legais, técnicos, e mitigações implementadas no produto.

---

## Riscos legais

### LinkedIn Terms of Service

LinkedIn proíbe explicitamente:
- Scraping (manual ou automatizado).
- Browser extensions que contornam segurança.
- Envio programático de mensagens, conexões e candidaturas.
- Bypass de CAPTCHA.
- Criação de múltiplas contas falsas.

Referências:
- [User Agreement](https://www.linkedin.com/legal/user-agreement)
- [Prohibited Software & Extensions](https://www.linkedin.com/help/linkedin/answer/a1341387)
- [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies)

### Casos recentes (2024-2026)

| Caso | Resultado | Aprendizado |
|---|---|---|
| **hiQ Labs vs LinkedIn** (2019, US Supreme Court) | Vitória parcial hiQ — scraping de dados públicos não viola CFAA | Não cria imunidade contra ToS; LinkedIn ainda pode banir |
| **Apollo.io** (2024) | Acordo + restrições | Comercial larga escala = alvo |
| **Seamless.AI** (2024) | Banido + processo | Auto-apply em massa = alto risco |
| **Proxycurl** (2025) | Encerrou operações após pressão | Mesmo "API legítima" foi alvo |
| **AIHawk (feder-cr)** (2025) | Cobertura TechCrunch + remoção plugins | Auto-apply LinkedIn = trending issue |

### Posicionamento legal MaxVision

**O produto NÃO se posiciona como ferramenta de scraping.** Marketing e disclaimers enfatizam:

1. "Assistente pessoal para sua própria conta LinkedIn."
2. "Você fornece seu próprio cookie de sessão."
3. "Aprovação humana obrigatória em ações sensíveis (apply, message, post)."
4. "Uso limitado: máximos diários respeitam guidelines de uso humano."
5. "Você é responsável por aderir aos Termos de Serviço LinkedIn."

EULA Pro inclui cláusula explícita:
> *"O Usuário declara estar ciente de que o uso do Software pode violar Termos de Serviço de plataformas de terceiros, incluindo LinkedIn. Produtora MaxVision não se responsabiliza por suspensão de contas, perda de dados ou consequências decorrentes do uso. O Usuário assume total responsabilidade."*

### Jurisdição

- Empresa: Brasil.
- LinkedIn: Microsoft (US/Irlanda).
- Cliente final: global.

LinkedIn raramente processa usuários individuais. Risco principal: ban de conta. Risco secundário: cease-and-desist contra MaxVision se atingir escala visível (>10k usuários ativos). Mitigação: produto é ferramenta de **assistência pessoal**, não scraping em massa de dados de terceiros.

---

## Riscos técnicos

### 1. Detecção de bot

**Fatores que LinkedIn usa para detectar:**
- WebDriver/automation flags em `navigator`.
- Fingerprint de browser inconsistente (timezone vs IP, user-agent vs viewport).
- Padrão de mouse/scroll não-humano.
- Velocidade de ações (cliques < 200ms entre si).
- Login geográfico inconsistente.
- Requisições API privada sem CSRF token correto.
- Headers HTTP suspeitos.

**Mitigações implementadas:**

| Vetor | Mitigação |
|---|---|
| Automation flags | **Patchright** (não Playwright) — patches conhecidos |
| Fingerprint | `chromium.launchPersistentContext` por conta — fingerprint estável |
| Timezone/locale | Configurado por conta (env var `ACCOUNT_TIMEZONE`) |
| Mouse/scroll | Plugin de movimento humano (curvas Bezier + jitter) |
| Velocidade | Delay randomizado 800-3000ms entre ações; jitter especial em apply |
| Login geo | Cookie `li_at` mantido na máquina/proxy do account; nunca login automatizado |
| API privada | Wrap `tomquirk/linkedin-api` que reproduz CSRF correto |
| Headers | UA fixo realista por conta; `Accept-Language` consistente |

### 2. Bloqueio progressivo

LinkedIn aplica enforcement em níveis:

| Nível | Sinais | Ação MCP |
|---|---|---|
| 1 — Warning | "Unusual activity detected" | Pausa conta 4h, alert admin |
| 2 — Captcha | Redirect para `/checkpoint/challenge` | Pausa conta 24h, alert + instruções resolver manual |
| 3 — Feature limit | Bloqueio mensagens/conexões 7-30d | Marca account `paused`, esconde tools afetadas |
| 4 — Restricted | Conta restricted | Marca `banned`, remove do pool, alert urgente |
| 5 — Permanent ban | Conta deletada | Notifica usuário, oferece guia recovery (raríssimo) |

Health check periódico (`node-cron @ */15 * * * *`) detecta níveis 1-4 antes de tools tentarem usar a conta.

### 3. Cookie expiração

`li_at` cookie tem TTL ~1 ano, mas LinkedIn pode invalidar antes em caso de:
- Login do usuário em outro device.
- Mudança de senha.
- Logout ativo.
- Detecção de sessão suspeita.

**Mitigação:**
- Health check valida cookie a cada 6h.
- Se inválido: notifica usuário (Telegram/email) com instruções para extrair novo cookie.
- Tier Agency: rotação automática entre múltiplas contas — uma cair não para o sistema.

### 4. Mudanças DOM

LinkedIn pode alterar seletores DOM a qualquer momento.

**Mitigação:**
- **Canary E2E diário** (GitHub Actions) em conta sandbox.
- Falha → alerta Slack imediato.
- Hotfix release < 24h.
- Seletores resilientes: tenta múltiplos atributos (`data-test-*`, `aria-label`, classes), nunca um único seletor frágil.

```typescript
// Exemplo: extração resiliente do botão Easy Apply
const easyApplyButton = await page.locator([
  'button[data-control-name="easy_apply_top_button"]',
  'button[aria-label="Easy Apply"]',
  'button:has-text("Easy Apply")',
  'button.jobs-apply-button'
].join(', ')).first();
```

### 5. Ataques de credential stuffing contra MCP

**Vetor:** atacante consegue cookie `li_at` de cliente e usa para sequestrar conta.

**Mitigação:**
- Cookies armazenados encrypted (AES-256-GCM, master key via env).
- Master key nunca em filesystem — apenas env var em runtime.
- Tier Agency: HSM ou Vault opcional.
- License key vinculado a fingerprint da máquina.
- 2FA opcional para acesso a `account-cli`.

### 6. SSRF/SSPF via tools

**Vetor:** atacante envia URL malicioso para `get_profile` ou `get_job_details`.

**Mitigação:**
- Whitelist de domínios: apenas `*.linkedin.com`.
- Validação Zod com regex.
- Patchright sandboxed Docker (sem acesso a localhost VPS).

---

## Compliance & GDPR/LGPD

### Dados pessoais coletados

| Dado | Origem | Armazenado? | Compartilhado? |
|---|---|---|---|
| Cookie `li_at` do usuário | Usuário fornece | Sim, encrypted, na VPS dele/MaxVision | Não |
| Resume YAML/MD | Usuário fornece | Local na máquina dele ou VPS dele | Não |
| Job descriptions | LinkedIn público | Cache 7d | Não |
| Profiles públicos lidos | LinkedIn público | Cache 7d | Não |
| Mensagens enviadas | Usuário escreve/aprova | Log local com auditoria | Não |
| License key + email | Stripe checkout | License server (Cloudflare KV) | Não |

### Direitos do usuário

- **Acesso**: `mcp-cli export-data --account-id=X` exporta tudo em JSON.
- **Correção**: usuário edita Postgres direto na sua VPS.
- **Deleção**: `mcp-cli purge --account-id=X` apaga tudo.
- **Portabilidade**: export JSON.
- **Oposição**: usuário pode parar de usar a qualquer momento.

### Política de privacidade

Disponível em `linkedin.maxvision.com.br/privacy`. Pontos-chave:

1. MaxVision não tem acesso a dados do cliente em deploy self-hosted (free + Pro standard).
2. Cloud-hosted Pro: dados encriptados, MaxVision tem acesso via vault apenas para suporte mediante autorização explícita (ticket).
3. Telemetria opcional: apenas erros agregados (Sentry com PII redaction). Opt-out via env `MAXVISION_TELEMETRY=off`.
4. Stripe lida com dados de pagamento.

### Termos de serviço (cliente final)

- Disclaimer ToS LinkedIn (acima).
- Limitação de responsabilidade.
- Política de refund (7 dias se nunca usou apply/message; sem refund após uso intensivo).
- Foro: comarca de São Paulo, Brasil.

---

## Disclaimers obrigatórios

### Pré-instalação (na landing)

Banner em destaque:
> ⚠️ **Aviso importante:** Esta ferramenta automatiza interações com sua conta LinkedIn. O uso pode violar os Termos de Serviço LinkedIn e resultar em suspensão de conta. Use com moderação, em sua própria conta, e revise toda ação antes de submeter. MaxVision não se responsabiliza por consequências.

### Primeiro setup (CLI)

```
$ mcp-cli setup

⚠️  Você está prestes a configurar automação LinkedIn.

Antes de continuar, confirme:

  [ ] Vou usar apenas em conta(s) próprias.
  [ ] Estou ciente de que LinkedIn pode banir a conta.
  [ ] Vou respeitar limites diários sugeridos (50 apply, 30 msg).
  [ ] Li o disclaimer em docs/compliance.md.

Digite "EU CONCORDO" para continuar:
```

### Em cada apply

```
🚨 PRÉ-SUBMISSÃO

Você está prestes a aplicar em:
  Empresa: Acme Corp
  Vaga: Senior Backend Engineer
  Resume: ./resumes/acme-tailored.pdf

Total de aplications hoje: 3/50

Revise o screenshot: ./screenshots/2026-05-07_app_X.png

Confirma submit? [y/N]
```

---

## Plano de resposta a incidentes

### Cenário 1: cliente reporta ban

1. Coletar logs (`mcp-cli logs --account-id=X --tail=1000`).
2. Identificar gatilho (excesso? conexão suspeita? mudança DOM?).
3. Se bug do MCP: rollback feature flag, hotfix.
4. Refund parcial conforme política.
5. Adicionar caso ao postmortem (`docs/incidents/`).

### Cenário 2: LinkedIn cease-and-desist contra MaxVision

1. Notificar conselho jurídico.
2. Pausar landing/checkout.
3. Comunicar clientes ativos.
4. Avaliar mudanças no produto (limitar features, exigir contas próprias).
5. Pivot para tier "Manual Assist" (só sugere, cliente clica) se necessário.

### Cenário 3: vazamento de cookies/license keys

1. Revogar todos license keys afetados (Cloudflare KV purge).
2. Force re-auth Stripe.
3. Notificar usuários (LGPD: 72h obrigatórias).
4. Audit code para vetor de vazamento.
5. Bug bounty se aplicável.

### Cenário 4: bug crítico em apply submete sem confirmação

1. Hotfix imediato + force update via license server.
2. Post-mortem público.
3. Refund integral aos afetados.
4. Adicionar regression test.

---

## Auditoria pré-launch

Antes de Sprint 4 (release v1.0), executar:

- [ ] Code review por security-auditor (subagent VoltAgent).
- [ ] Pen test focado em SSRF, command injection, secrets exposure.
- [ ] Auditoria legal de EULA e privacy policy (advogado externo).
- [ ] Revisão landing page por consultor de marketing.
- [ ] Smoke test em 5 contas LinkedIn diferentes (evitar bias de conta única).
- [ ] Benchmark de captcha rate em 1 semana de uso real.
- [ ] Validação de license server sob carga.
- [ ] Backup/restore de Postgres testado.
