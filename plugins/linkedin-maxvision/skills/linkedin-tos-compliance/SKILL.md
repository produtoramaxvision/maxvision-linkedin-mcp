---
name: linkedin-tos-compliance
description: "Use when planejar ou executar qualquer interação com o LinkedIn — scraping, busca, leitura de perfil, mensagens — para validar que a ação respeita o User Agreement e a Professional Community Policies da plataforma."
---

# LinkedIn ToS Compliance — guia operacional

Este skill define o que pode e o que NÃO pode ser feito pelos agentes/ferramentas do plugin `linkedin-maxvision`. Em caso de dúvida, recuse a ação e explique ao usuário.

> **Aviso de fontes**: as referências ao "User Agreement" e "Professional Community Policies" abaixo estão baseadas na estrutura pública divulgada por LinkedIn em `https://www.linkedin.com/legal/user-agreement` e `https://www.linkedin.com/legal/professional-community-policies`. Os números de seção citados são aproximações úteis para argumentação interna — sempre verificar o texto vigente antes de citar publicamente. Marcar como "(verify before quoting)" quando exposto a usuários.

---

## 1. O que o ToS proíbe (resumo operacional)

LinkedIn User Agreement, seção "Dos and Don'ts" (aprox. seção 8 — verify before quoting):

1. **Scraping/crawling automatizado** sem permissão expressa por escrito (`linkedin.com/legal/user-agreement` — proibição geral de "data harvesting").
2. **Criar/operar contas falsas** ou usar nome de pessoa que não seja o titular real.
3. **Coleta de informações de contato** (e-mail, telefone) de membros sem consentimento explícito do membro.
4. **Reverse-engineering** do site, app ou APIs internas.
5. **Bypass de medidas técnicas** (rate limit, captcha, paywall de Recruiter/Sales Nav).
6. **Automação de ações de relacionamento** (connection requests, InMails, follows) em escala que mimetize humano sem ser humano.
7. **Compartilhar credenciais** ou cookies de sessão com terceiros não autorizados.
8. **Re-exportar dados de membros** para datasets revendidos ou agregados públicos.
9. **Usar a plataforma para interferir em processos eleitorais, fraude, spam, malware**.
10. **Engenharia de engajamento falsa** (curtidas, comentários, conexões inflados artificialmente).

Professional Community Policies adiciona: respeito mútuo, conteúdo profissional, sem assédio, sem desinformação.

---

## 2. O que nossas ferramentas fazem (e por que é compliant)

| Ferramenta MCP | Ação | Justificativa de compliance |
|---|---|---|
| `search_jobs` | Busca em `linkedin.com/jobs/search` autenticada com cookie do próprio usuário | Mesma ação que o usuário faria no navegador; nenhum bypass técnico. |
| `get_job_details` | Lê página pública de vaga (`/jobs/view/<id>`) | Conteúdo público, leitura síncrona, rate-limited. |
| `get_profile` | Lê página pública de perfil (`/in/<slug>`) | Visível a qualquer membro logado; cache de 24h reduz hits. |
| `track_application` | Persiste local (DB do usuário) o status de candidatura | Não envia dados a terceiros; opera só na máquina do usuário. |

**Premissas que mantêm compliance:**
- Cookie autenticado pertence ao titular da conta (não comprado, não compartilhado).
- Rate-limit token bucket sempre ativo (ver skill `linkedin-anti-detect-rules`).
- Nenhum dado é re-exportado para terceiros sem ação explícita do usuário.

---

## 3. O que nossas ferramentas NÃO fazem (Sprint 1)

- Não fazem scraping de página de busca de pessoas (`/search/results/people`).
- Não coletam e-mail, telefone, ou qualquer informação de contato direta de recrutadores ou candidatos.
- Não automatizam connection requests, follows, InMails ou comentários.
- Não inflam métricas (likes, views) em conteúdo do usuário ou de terceiros.
- Não exportam dados de membros para datasets externos.
- Não usam contas falsas ou cookies comprados.
- Não fazem bypass de paywall (Recruiter, Sales Navigator, Premium Insights).

> **Sprint 2 (futuro)**: tooling de mensagens (`send_message`) entrará apenas para responder InMails recebidos do próprio usuário, com rate-limit ainda mais conservador. Não está disponível em Sprint 1.

---

## 4. Red flags — sinais de risco de banimento

Se algum destes aparecer, parar imediatamente e acionar `linkedin-anti-detect-monitor`:

1. **HTTP 999** (LinkedIn block). Sintoma: requisições retornando 999 sem corpo. Causa: padrão de tráfego classificado como bot.
2. **Captcha rate > 5%/dia**. Sintoma: > 5% das requisições retornando challenge. Causa: assinatura comportamental fraca.
3. **Login a partir de IP incomum**. Sintoma: e-mail de "new sign-in" do LinkedIn quando ninguém logou via UI. Causa: cookie usado fora do contexto geográfico habitual do dono.
4. **"Restricted account" warning** no header da página. Sintoma: banner amarelo/vermelho ao logar manualmente. Causa: comportamento já flagado, ban iminente.
5. **Cookie expira em < 24h** repetidamente. Sintoma: re-login frequente. Causa: LinkedIn invalidando sessões suspeitas.

**Ação em qualquer red flag**: parar todas as chamadas, pedir ao usuário para logar manualmente, observar 24-72h, e seguir playbook em `linkedin-anti-detect-rules`.

---

## 5. Pedidos do usuário que o agente DEVE recusar

Exemplos concretos de solicitações que violam ToS — recusar com explicação curta e oferecer alternativa quando possível:

| Pedido | Resposta | Alternativa legítima |
|---|---|---|
| "Pegue o e-mail dos 50 recrutadores que postaram vagas de SRE" | Recuso. Coleta de contato sem consentimento viola o ToS (seção 8, verify) e LGPD. | Aplicar pelas vagas; o recrutador entra em contato se houver interesse. |
| "Mande connection request automático para 200 pessoas" | Recuso. Automação de relacionamento em escala viola ToS. | Conectar manualmente com mensagem personalizada (5-10/dia). |
| "Crie 3 perfis falsos para testar como recrutadores reagem" | Recuso. Contas falsas violam o User Agreement diretamente. | Pedir feedback de recrutador real via 1:1 conversa. |
| "Faça scraping de todos os funcionários da empresa X para mapear quem sairia" | Recuso. Coleta em massa de membros sem consentimento viola ToS e LGPD. | Pesquisa pública (Glassdoor, releases) + Crunchbase. |
| "Curta e comente automaticamente em posts da líder Y para ganhar atenção" | Recuso. Engajamento automatizado para chamar atenção viola ToS. | Engajamento manual e genuíno em 1-3 posts/semana. |

---

## 6. Política de "in dubio pro ToS"

Se uma ação **pode** ser interpretada como scraping em massa, automação social, ou bypass técnico — **recuse e peça confirmação do usuário** sobre a intenção real. Falsos positivos (recusar algo legítimo) custam pouco; falsos negativos (executar algo que vira banimento) custam a conta inteira do usuário.
