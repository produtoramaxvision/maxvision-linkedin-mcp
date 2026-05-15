---
name: lgpd-gdpr-handling
paths: ["**/compliance*", "**/lgpd*", "**/gdpr*", "**/privacy*", "**/dpia*"]
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

---

## 9. Cookies e rastreamento

### Base legal para cookies de sessão LinkedIn

O plugin opera com o **cookie de sessão** que o próprio usuário fornece voluntariamente para autenticação. Esse cookie é armazenado encriptado (`cookie_encrypted`, AES-256-GCM) e nunca transmitido a terceiros — o plugin apenas o reutiliza para autenticar requisições em nome do usuário, exatamente como um navegador faria.

**Base legal aplicável (LGPD art. 7º, IX — legítimo interesse)**: a reutilização do cookie de sessão é necessária para a execução do serviço contratado. O usuário configura o cookie conscientemente como parte do onboarding. Não se aplica consentimento (inciso I) aqui porque o cookie não é coletado pelo plugin — ele já existe na plataforma LinkedIn e o usuário o transfere voluntariamente.

### O que não capturar

- Cookies de terceiros (analytics, ads) que o LinkedIn injeta no browser — o plugin não extrai esse tráfego.
- Identifiers de rastreamento cross-site (`_gcl_au`, `bscookie`, `li_sugr`, `UserMatchHistory`) — não persistir localmente, descartar após uso da sessão.
- Cookies de outros domínios retornados em redirects — ignorar.

### Cookie funcional vs cookie analytics

| Tipo | Definição | Nosso tratamento |
|---|---|---|
| **Funcional** | Necessário para autenticação e manutenção de sessão (ex: `li_at`, `JSESSIONID`). | Armazenado encriptado; base legal = legítimo interesse (LGPD art. 7º, IX). |
| **Analytics / rastreamento** | Mede comportamento do usuário para fins de marketing ou melhoria de produto LinkedIn (ex: `lidc`, `AnalyticsSyncHistory`). | Não persistido; sem base legal ativa no plugin — o plugin não realiza analytics sobre o usuário. |

### LGPD art. 7º — inciso I (consentimento) vs inciso IX (legítimo interesse)

| Critério | Inciso I — Consentimento | Inciso IX — Legítimo interesse |
|---|---|---|
| **Quando usar** | Quando a operação vai além do serviço contratado e o titular não poderia razoavelmente esperar o tratamento. | Quando o tratamento é estritamente necessário para executar o serviço solicitado pelo próprio titular. |
| **Requisitos** | Livre, informado, inequívoco; revogável a qualquer momento sem prejuízo. | Finalidade legítima; necessidade; não prevalecer sobre direitos fundamentais do titular. |
| **Uso no plugin** | Aplicar em: ativação de telemetria externa (Sentry/PostHog); integração com serviços de terceiros fora do escopo contratado. | Aplicar em: cookie de sessão LinkedIn; cache de perfis públicos; audit log operacional. |
| **Ônus** | Alto — coletar e registrar consentimento; gerenciar revogações. | Médio — documentar o "legítimo interesse test" no DPIA; garantir que não sobrepõe direitos do titular. |

**Regra prática**: para qualquer novo cookie ou tracker que o plugin venha a introduzir, perguntar: "o usuário contratou isso implicitamente?" → se sim, legítimo interesse é suficiente, documente no DPIA. Se não, colete consentimento explícito (opt-in).

---

## 10. Transferência internacional de dados

### LGPD art. 33 — quando os dados cruzam fronteira

A LGPD art. 33 restringe a **transferência internacional de dados pessoais** (envio para destinatários em outros países). Situações que configuram transferência no contexto do plugin:

1. **Chamada à LinkedIn API** (`linkedin.com`) — os dados do usuário (cookie, queries) trafegam para servidores nos EUA (sede LinkedIn/Microsoft). Configura transferência.
2. **Uso de provider de IA cloud** (ex: Anthropic API, Claude API) — currículo ou perfil enviado como contexto. Configura transferência.
3. **Proxy/Web Unlocker externo** (ex: Bright Data, Apify) — requisições passam por infraestrutura em outros países. Configura transferência se houver persistência de dados no intermediário.
4. **Telemetria externa** (Sentry.io, PostHog cloud) — erros/eventos com PII. Configura transferência.

**Operações locais** (DB SQLite/Postgres na máquina do usuário, MCP server local) — não configuram transferência internacional.

### Países reconhecidos pelo ANPD (adequação)

A ANPD pode reconhecer países ou organismos com proteção equivalente à LGPD. Até 2026, a lista formal ainda é limitada. Para fins práticos, tratar todos os países como sem reconhecimento formal e basear-se nas salvaguardas abaixo.

### Salvaguardas aplicáveis

| Salvaguarda | Quando usar | Requisito LGPD (art. 33) |
|---|---|---|
| **Cláusulas Contratuais Padrão (CCPs)** | Integração com provedores SaaS estrangeiros (Apify, Bright Data, etc.). | Contratos que contenham obrigações equivalentes às da LGPD (art. 33, II). |
| **Consentimento do titular** | Usuário autoriza explicitamente o envio dos próprios dados a serviço específico. | Art. 33, VIII — consentimento livre, informado, para finalidade específica. |
| **Necessidade para execução de contrato** | Envio do cookie ao LinkedIn para executar busca contratada pelo usuário. | Art. 33, V — transferência necessária para execução de contrato do qual o titular seja parte. |

### O que fazer ao usar API US-based (ex: LinkedIn, Anthropic)

1. **Documentar no DPIA** que a chamada à API constitui transferência internacional e identificar a salvaguarda aplicada (consentimento via onboarding + necessidade para execução do serviço).
2. **Minimizar payload**: nunca enviar mais dados do que o necessário para a operação. Ex: ao enviar currículo ao modelo de IA, extrair apenas campos estruturados relevantes — não enviar raw PDF completo se não necessário.
3. **Garantir que o intermediário (Bright Data, Apify) tenha DPA** (Data Processing Agreement) que cobre LGPD/GDPR.
4. **Não enviar CPF, dados sensíveis** (LGPD art. 5º, II) para provedores externos sem base legal específica para dado sensível (art. 11).

---

## 11. Tabela de legal basis por operação de tratamento

Mapeamento autoritativo de cada ferramenta MCP para sua base legal LGPD e correspondente GDPR.

| Ferramenta MCP | Operação de tratamento | Base legal LGPD | Artigo LGPD | Base legal GDPR | Artigo GDPR | Observações |
|---|---|---|---|---|---|---|
| `search_jobs` | Transmitir cookie do usuário ao LinkedIn para autenticar busca | Execução de contrato / legítimo interesse | Art. 7º, V e IX | Execução de contrato | Art. 6º(1)(b) | Dado transmitido = cookie de sessão do próprio usuário. |
| `get_job_details` | Ler página pública de vaga; cache local 60min | Legítimo interesse | Art. 7º, IX | Legítimo interesse | Art. 6º(1)(f) | Dado da vaga é público; cache reduz hits; sem PII de terceiros. |
| `get_profile` | Ler perfil público `/in/<slug>`; cache local 24h | Legítimo interesse | Art. 7º, IX | Legítimo interesse | Art. 6º(1)(f) | Perfil público no LinkedIn; titular publicou voluntariamente. Cache 24h proporcional. |
| `apply_easy` | Submeter candidatura em nome do usuário (nome, currículo, campos do apply) | Execução de contrato + consentimento explícito do titular | Art. 7º, I e V | Execução de contrato + consentimento | Art. 6º(1)(a)(b) | Exige checkpoint humano obrigatório antes de submissão (ação irreversível). |
| `track_application` | Gravar status de candidatura em DB local | Legítimo interesse / execução de contrato | Art. 7º, V e IX | Execução de contrato | Art. 6º(1)(b) | Dado gerado pelo próprio usuário; sem transmissão externa. |
| `list_applications` | Ler registros de candidaturas do usuário | Execução de contrato | Art. 7º, V | Execução de contrato | Art. 6º(1)(b) | Leitura de dado próprio do titular; sem compartilhamento. |
| `data_export` | Exportar todos os dados do usuário (direito de acesso) | Obrigação legal | Art. 7º, II + Art. 18, II | Obrigação legal / direito do titular | Art. 6º(1)(c) + Art. 15 GDPR | Atende direito de acesso LGPD art. 18, II e GDPR art. 15. |
| `data_purge` | Deletar dados do usuário a pedido | Obrigação legal / revogação | Art. 7º, IX revogado + Art. 18, IV e VI | Direito ao apagamento | Art. 6º(1)(c) + Art. 17 GDPR | Atende "direito ao esquecimento" parcial; dados de audit log retidos 90d por obrigação. |
| `audit_log` (interno) | Gravar eventos de ferramenta sem PII nos arguments | Legítimo interesse (segurança operacional) | Art. 7º, IX | Legítimo interesse | Art. 6º(1)(f) | Arguments sempre redactados via `redactor.ts` antes de gravar. |
| Telemetria externa (opt-in) | Enviar eventos de erro/uso a Sentry/PostHog | Consentimento explícito | Art. 7º, I | Consentimento | Art. 6º(1)(a) | Off por padrão; opt-in explícito no onboarding; DPIA obrigatória antes de ativar. |
