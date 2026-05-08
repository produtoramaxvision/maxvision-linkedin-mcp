---
name: lgpd-gdpr-handling
description: "Use when projetar/operar features que tocam dado pessoal — definir o que é PII no contexto do plugin, entender o que armazenamos, retenção, direitos do titular (LGPD art. 18 / GDPR), e o que devs MUST fazer em logs e prompts."
---

# LGPD + GDPR — handling de dados pessoais no plugin

Política operacional para tratamento de dados pessoais nos componentes `linkedin-maxvision` e `mcp-server`. Prioriza LGPD (Brasil, Lei 13.709/2018) com sobreposição GDPR (UE, Reg. 2016/679) onde divergem.

---

## 1. O que conta como PII neste contexto

**Dado pessoal** (LGPD art. 5º, I): "informação relacionada a pessoa natural identificada ou identificável."

Identificadores diretos:
- Nome completo.
- E-mail pessoal/profissional.
- Telefone.
- CPF, RG, CNH, passaporte.
- Endereço residencial.
- Foto identificável.

**Dado pessoal sensível** (LGPD art. 5º, II) — proteção reforçada:
- Origem racial/étnica, convicção religiosa, opinião política.
- Filiação a sindicato/organização.
- Dado referente a saúde, vida sexual.
- Dado genético/biométrico.
- Dado de criança/adolescente.

Combinações que viram PII mesmo individualmente não-PII:
- `(cidade + cargo + empresa)` → frequentemente identifica um único indivíduo em empresa < 200 pessoas.
- `(perfil LinkedIn URL slug)` → identifica diretamente.
- `(IP + timestamp)` → identifica em janelas curtas.
- `(currículo body + universidade + ano)` → muito frequentemente único.

**Conclusão prática**: tratar QUALQUER dado retornado por `get_profile`, payload de currículo do usuário, e identificadores de aplicação como PII.

---

## 2. O que nossas ferramentas armazenam (Sprint 1)

Tabela autoritativa do schema vive em `mcp-server/PLAN.md` e `mcp-server/db/schema.sql`. Réplica resumida:

| Tabela | Coluna(s) com PII | Estado | Justificativa de armazenamento |
|---|---|---|---|
| `accounts` | `cookie_encrypted` (sessão LinkedIn do dono) | **Encriptado em rest** com chave em variável de ambiente (`MCP_DB_KEY`) | Necessário para autenticar requisições; sem ele, não há produto. |
| `applications` | `notes` (texto livre escrito pelo usuário; pode conter nomes de recrutadores, observações) | Plaintext local. | É o caderno do usuário — não pode ser encriptado sem perder UX de busca. |
| `applications` | `job_url` | Plaintext local. | Identificador da vaga; não é PII direto, mas combinado com timestamp pode revelar busca. |
| `profiles_cache` | `payload` (snapshot público de `/in/<slug>`: nome, cargo, empresa, sumário, experience) | Plaintext local; cache 24h. | Permite voltar a um perfil sem refazer hit no LinkedIn. Sempre dado **público**. |
| `audit_log` | `tool_name`, `arguments_redacted`, `status`, `latency_ms`, `timestamp` | Plaintext local. | Necessário para auditoria + telemetria de risco. **Sem PII nos arguments — redact obrigatório.** |
| `rate_limit_events`, `captcha_events` | Sem PII (apenas counters + timestamp). | Plaintext local. | Saúde de conta. |

**Local físico**: SQLite/Postgres na máquina/VPS do usuário. Sem replicação a terceiros.

---

## 3. O que NÃO armazenamos

- **Raw HTML** do scrape — descartado depois do parsing.
- **Contato direto de recrutador** (e-mail, telefone) — fora do escopo.
- **PII de terceiros** (recrutadores, candidatos do peer-network) sem consentimento.
- **IPs do usuário** em retenção longa — só ephemeral em memória de processo, nunca em DB.
- **Logs com `arguments` crus** — sempre passar por `redactor.ts` antes de gravar (mascara `cookie`, `email`, `phone`, `cpf`, `body` de currículo).
- **Telemetria externa** (Sentry/PostHog/etc) — não enviada por padrão. Se ativada, opt-in explícito do usuário + DPIA.

---

## 4. Política de retenção

Ver cron job (Sprint 1.5 vai implementar). Valores autoritativos em `mcp-server/db/retention.sql`:

| Dado | Retenção máxima | Mecanismo de purga |
|---|---|---|
| `accounts.cookie_encrypted` | Até logout manual ou cookie expirar | Manual via comando MCP. |
| `applications.*` | Indefinido (é o caderno do usuário) | User-driven (DELETE explícito). |
| `profiles_cache.payload` | **24h** (slug-level), **60min** (job-detail-level) | Cron horário (Sprint 1.5). |
| `audit_log` | **90 dias** | Cron diário (Sprint 1.5). |
| `rate_limit_events`, `captcha_events` | **30 dias** | Cron diário (Sprint 1.5). |
| Backups locais | Mesma retenção da fonte; nunca > 90d | Manual em Sprint 1; automatizar em Sprint 2. |

**Princípio**: retenção mínima necessária para entregar o serviço. Não estamos no negócio de armazenar dados.

---

## 5. Direitos do titular — LGPD art. 18

O usuário (titular dos dados) tem direito a, gratuitamente:

| Direito (art. 18) | O que significa | Como atender |
|---|---|---|
| **I — Confirmação de tratamento** | Saber se temos dados sobre ele. | Comando MCP `data_export` (Sprint 1.5) lê todos os registros indexados pelo `account_id` ou e-mail. |
| **II — Acesso** | Receber cópia dos dados. | Mesmo `data_export` retorna JSON com todas as linhas. |
| **III — Correção** | Corrigir dado incompleto/desatualizado. | Edição direta nas tabelas locais (interface Sprint 2). |
| **IV — Anonimização / bloqueio / eliminação** de dados desnecessários | Apagar o que não se precisa mais. | Comando `data_purge` (Sprint 1.5). |
| **V — Portabilidade** | Exportar para outro fornecedor. | `data_export --format=json` ou `--format=csv`. |
| **VI — Eliminação** dos dados tratados com consentimento | Apagar tudo. | `account_delete` cascade nas tabelas. |
| **VII — Informação sobre compartilhamento** | Saber com quem compartilhamos. | Resposta documentada: "compartilhamos apenas com o LinkedIn ao executar buscas em seu nome — esse é o serviço. Nenhum terceiro recebe seus dados." |
| **VIII — Informação sobre não fornecer consentimento** | Saber consequências. | Documentado em onboarding. |
| **IX — Revogação do consentimento** | Voltar atrás. | `account_logout` + `data_purge`. |

**Canal oficial de exercício de direitos**: e-mail `produtoramaxvision@gmail.com`. Tempo de resposta legal: até **15 dias** (LGPD art. 19, §1º).

> GDPR art. 12 dá 1 mês (extensível para 3 em casos complexos). Como atendemos LGPD com 15 dias, automaticamente cobrimos GDPR.

---

## 6. DPIA (Data Protection Impact Assessment) — quando disparar

DPIA é obrigatória sob LGPD art. 38 e GDPR art. 35 quando o tratamento "**em larga escala envolva categoria sensível**" ou "**atinja decisão automatizada com efeitos significativos**". Em nossa escala, disparar DPIA antes de:

1. **Adicionar nova categoria de dado** (ex: começar a guardar mensagens de InMail Sprint 2).
2. **Adicionar destinatário externo** (ex: integrar telemetria para SaaS terceiro).
3. **Cruzar dados de múltiplos usuários** (ex: feature de matching peer-to-peer).
4. **Adicionar perfilamento automatizado com efeito** (ex: scoring de candidatura que oculta vagas).
5. **Mudar de modelo local-only para cloud-multi-tenant**.

**Output mínimo do DPIA**:
- Descrição da operação de tratamento + finalidade.
- Necessidade e proporcionalidade.
- Riscos aos direitos do titular.
- Medidas para mitigar.

Documento vive em `docs/compliance/DPIA-<slug>.md` — committed.

---

## 7. O que devs MUST fazer

Não-negociáveis. Se algum destes for violado em PR, **bloquear merge**.

1. **PII redaction em todos os logging sites**.
   - Função canônica: `redact(obj, keys=['cookie', 'email', 'phone', 'cpf', 'body', 'resume', 'notes'])` em `mcp-server/src/observability/redactor.ts`.
   - Aplicar em: `console.log`, structured logger, audit_log writes, error reporting.
   - Test coverage obrigatório: `redactor.test.ts` cobrindo cada chave com input contendo PII.

2. **Nunca logar valores de `.env`**.
   - No load do dotenv: nunca `console.log(process.env)`.
   - Em init de DB: nunca logar `MCP_DB_KEY`, `LINKEDIN_COOKIE`, etc.
   - CI: rodar `gitleaks` ou `trufflehog` em pre-commit.

3. **Nunca paste raw user resume em prompt cacheable**.
   - Razão: prompts cacheáveis ficam no provider (Anthropic) por janelas estendidas. Resume bruto = PII completo.
   - Padrão correto: extrair fields normalizados (skills, titles, dates) e cachear apenas isso. Manter PII fora de cache.
   - Quando precisar passar resume completo ao modelo: `cache_control: false` na mensagem específica.

4. **Encrypt-at-rest para campos sensíveis**.
   - `cookie_encrypted` usa AES-256-GCM (lib `node:crypto`) com chave em `MCP_DB_KEY`.
   - Rotação de chave: documento em `docs/compliance/key-rotation.md` (Sprint 1.5).
   - Nunca logar chave nem cookie em texto claro, nem em stderr de erro.

5. **HTTPS para qualquer transporte fora-da-máquina**.
   - MCP server local usa Unix socket / stdio (sem rede). Quando expor via HTTP (Sprint 2), TLS obrigatório.
   - Certificado: Let's Encrypt; sem `--insecure`.

6. **Acesso ao DB com least privilege**.
   - Conta de aplicação não tem `DROP TABLE` em produção.
   - Backup access separado.

7. **Retention enforcement em cron** (Sprint 1.5).
   - Job diário roda `DELETE FROM profiles_cache WHERE created_at < NOW() - INTERVAL '24 hours'`.
   - Idem audit_log (90d), rate_limit_events (30d).
   - Falha do cron = alerta crítico.

8. **DPIA antes de feature nova**.
   - Toda PR que adiciona coluna nova em tabela com PII OU adiciona nova categoria de captura: documento DPIA antes do merge.

---

## 8. Em caso de incidente de segurança

Se houver vazamento (cookie comprometido, dump de DB, leak de log com PII):

1. **Conter**: revogar cookie comprometido, rotacionar `MCP_DB_KEY`, derrubar logs.
2. **Investigar**: identificar dados afetados, escala, causa raiz.
3. **Notificar ANPD** (LGPD art. 48): "em prazo razoável" — interpretado como **72h** seguindo GDPR. Canal: ANPD via formulário oficial.
4. **Notificar titulares afetados** se risco relevante.
5. **Documentar**: post-mortem em `docs/compliance/incidents/<date>-<slug>.md`.
