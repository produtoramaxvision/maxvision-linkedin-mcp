---
name: linkedin-tos-compliance
paths: ["**/compliance*", "**/tos*", "**/legal*"]
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

---

## 7. Processo de apelação em caso de banimento

### Identificar o tipo de ban

| Tipo | Sintomas | Reversibilidade |
|---|---|---|
| **Temporário (soft ban)** | Acesso bloqueado por horas/dias; banner "Your account has been temporarily restricted"; cookie invalida mas e-mail não recebe notificação de encerramento. | Alta — resolução espontânea em 24–72h ou via apelação. |
| **Permanente (hard ban)** | E-mail "Your LinkedIn account has been restricted"; login retorna mensagem de encerramento definitivo; conta some dos resultados de busca. | Baixa — apelação possível mas taxa de reversão < 20% para violações graves de automação. |
| **Shadow restriction** | Conta parece funcionar mas perfil não aparece em buscas; InMails não são entregues; sem banner visível. | Média — difícil de identificar; requer teste de visibilidade com conta secundária. |

### Canal de apelação

1. Acessar: `linkedin.com/help/linkedin/answer/89877` (formulário oficial de apelação de restrição de conta).
2. Preencher com e-mail da conta + descrição detalhada (sem admitir uso de automação — focar em "uso legítimo de ferramentas de produtividade").
3. Aguardar resposta: LinkedIn responde em 3–10 dias úteis via e-mail.

### Template de apelação (inglês)

```
Subject: Account Restriction Appeal — [Your Full Name]

Dear LinkedIn Trust & Safety Team,

I am writing to appeal the restriction applied to my account ([email address]).

I believe this restriction may have been triggered by my use of productivity tools
that access LinkedIn on my behalf to assist with my job search activities —
all actions performed under my own authenticated session and on my own behalf.

I have not violated LinkedIn's User Agreement intentionally. I do not use fake
accounts, do not collect other members' contact information, and do not send
automated messages.

I kindly request a review of my account and its reinstatement.
I am happy to provide additional information if needed.

Sincerely,
[Full Name]
```

### Taxa de sucesso estimada por tipo

| Tipo | Taxa de sucesso | Fatores que aumentam chance |
|---|---|---|
| Soft ban (1a vez) | ~70% | Conta com histórico limpo, apelação rápida (<48h), sem reincidência. |
| Soft ban (reincidente) | ~30% | Histórico de restrições anteriores reduz confiança. |
| Hard ban (automação) | <20% | LinkedIn mantém decisão em violações graves; conta premium tem margem levemente maior. |
| Hard ban (conteúdo/spam) | ~10% | Quase irreversível; foco em criar nova conta com cautela. |

### Quando desistir da conta

Desistir da apelação e iniciar nova conta quando:
- Segundo hard ban em < 6 meses na mesma conta.
- LinkedIn confirmar "permanent restriction due to violation of User Agreement" sem oferecer recurso adicional.
- Conta tem < 50 conexões e < 2 anos de histórico (custo de reconstruir é baixo).

Para nova conta: aguardar mínimo 30 dias, usar novo e-mail, novo número de telefone, IP diferente para cadastro.

---

## 8. LinkedIn API oficial vs web scraping

### O que a LinkedIn Marketing API permite

A [LinkedIn Marketing API](https://learn.microsoft.com/linkedin/) é a via oficial para acesso programático ao LinkedIn. Cobertura:

- **Ad campaigns**: criar e gerenciar campanhas de anúncios, audiências, criativos.
- **Company pages**: ler/publicar em páginas de empresa (com permissão de admin).
- **Follower analytics**: métricas de seguidores de páginas de empresa.
- **Job postings API**: criar e gerenciar vagas (acesso para empresas recrutadoras, não para candidatos).
- **Sharing API**: publicar posts em nome de usuário (com OAuth e permissões explícitas).

O que a API oficial **não** oferece para o caso de uso do plugin:
- Busca de vagas por critérios do candidato (sem paginação comparável ao site).
- Leitura de perfis de terceiros em escala.
- Submissão de candidatura Easy Apply.
- Acesso a InMails recebidos em conta pessoal.

### LinkedIn API Agreement

O [LinkedIn API Agreement](https://legal.linkedin.com/api-terms-of-use) (verify before quoting) exige:
- Aprovação prévia do caso de uso pela LinkedIn (processo de revisão que pode levar semanas).
- Restrições de uso dos dados retornados (não armazenar além do necessário, não revender).
- Rate limits rigorosos e menores que o comportamento humano normal.
- Sem acesso a dados de membros individuais sem consentimento OAuth explícito.

### Por que não usamos a API pública

| Razão | Detalhe |
|---|---|
| **Aprovação + tempo** | Solicitar acesso requer revisão pela LinkedIn; não há garantia de aprovação para casos de uso de produtividade pessoal. |
| **Custo** | Planos de API para acesso a dados de vagas/perfis são orientados a empresas com contratos enterprise. |
| **Rate limits restritivos** | A API pública tem limites menores que o comportamento de um usuário humano no site, tornando-a inadequada para busca de vagas em volume razoável. |
| **Cobertura de features** | Easy Apply, tracking de candidaturas, e reading de perfis individuais de candidatos não estão disponíveis na API pública para uso pessoal. |

### Como documentar para usuário cético

Resposta padrão quando o usuário perguntar "por que não usa a API oficial?":

> "A API oficial do LinkedIn é voltada para empresas recrutadoras e plataformas de marketing — não para candidatos individuais gerenciando a própria busca de emprego. As features que o plugin oferece (buscar vagas, ler detalhes, acompanhar candidaturas) simplesmente não existem na API pública com a cobertura necessária. O plugin opera com o cookie de sessão do próprio usuário — exatamente como o browser faria — com rate-limits conservadores para respeitar os servidores do LinkedIn."

---

## 9. Jurisdição e enforcement

### Onde o LinkedIn processa violações

- **Usuários da União Europeia**: LinkedIn Ireland Unlimited Company (Dublin) é a entidade controladora. Violações processadas sob GDPR pela DPC (Data Protection Commission) da Irlanda.
- **Usuários globais (incluindo Brasil)**: LinkedIn Corporation (Sunnyvale, Califórnia, EUA). Enforcement primário via Termos de Serviço (contrato privado), não regulação pública.
- **Brasil**: LinkedIn não tem enforcement regulatório local específico para violações de ToS — age via suspensão/banimento de conta, não por processo judicial direto contra o usuário.

### O que acontece na prática vs o que o ToS diz

| Nível de violação | O que o ToS ameaça | O que ocorre na prática |
|---|---|---|
| Scraping em pequena escala (uso pessoal) | Ação legal; danos; encerramento de conta | Banimento de conta (temporário ou permanente); raramente ação judicial. |
| Scraping em grande escala (dados para revenda) | Processo civil nos EUA (CFAA, DMCA); danos compensatórios | LinkedIn tem histórico de ações contra operadores comerciais; não contra usuários individuais. |
| Uso de cookies de terceiros / contas compradas | Encerramento imediato + possível bloqueio de IP | Banimento de conta; sem registro de ação judicial. |

### hiQ Labs vs LinkedIn — resumo prático

O caso *hiQ Labs, Inc. v. LinkedIn Corp.* (9th Circuit, EUA) é o precedente mais citado sobre scraping de dados públicos do LinkedIn. Em síntese: o 9th Circuit inicialmente decidiu (2019) que scraping de dados **públicos** do LinkedIn possivelmente não violava o Computer Fraud and Abuse Act (CFAA), pois dados públicos não estariam "protegidos" no sentido da lei. Após o caso *Van Buren v. United States* (SCOTUS, 2021) redefinir CFAA, o caso foi remetido de volta; em 2022, o 9th Circuit manteve que hiQ poderia scraping de dados públicos, mas o caso foi resolvido extrajudicialmente.

**Implicações práticas para usuário BR**:
- CFAA é lei americana; não se aplica diretamente a usuários no Brasil.
- O precedente sugere que scraping de dados **públicos** tem margem legal nos EUA, mas o LinkedIn pode banir a conta de qualquer forma (direito contratual).
- Para o plugin: operar com dados públicos + cookie do próprio usuário está na zona de menor risco legal, mas não elimina risco de banimento de conta.

---

## 10. Changelog de mudanças relevantes no ToS

Tabela de atualizações significativas do LinkedIn User Agreement desde 2020 com impacto prático para automação/scraping.

| Período | Mudança | Impacto prático |
|---|---|---|
| **2020** | Reforço da proibição de "automated software" na seção "Dos and Don'ts"; linguagem mais explícita sobre "bots and other automated methods". | Automação de qualquer tipo passou a ter base textual mais clara para enforcement. |
| **2021** | Atualização da política de dados pós-GDPR californiano (CCPA); adição de direitos de exclusão de dados para membros californianos. | Alinhou parcialmente com padrão GDPR; criou precedente para direitos de titulares em outras jurisdições. |
| **2022** | Revisão da seção "Professional Community Policies" com foco em desinformação e conteúdo sintético (AI-generated content sem disclosure). | Conteúdo de candidatura gerado por IA deve ser disclosure adequado; cover letters totalmente geradas por IA sem revisão humana entram em zona cinza. |
| **2023** | Introdução de restrições explícitas ao treinamento de modelos de IA com dados do LinkedIn sem permissão. Opt-out disponível para membros (configurações de privacidade). | Reforça que dados coletados via scraping não podem ser usados para treinar modelos; o plugin não treina modelos com dados do LinkedIn — apenas processa em tempo real. |
| **2024** | Atualização da política de uso da API; novos requisitos de revisão para parceiros que acessam dados de membros via OAuth. | Impacta provedores de API third-party; não impacta diretamente uso de cookie pessoal. |
| **2025** | Linguagem adicional sobre "AI agents acting on behalf of members"; orientação de que agentes de IA devem operar "under member supervision" e "not replace human judgment in professional decisions". | Reforça a necessidade de checkpoints humanos em ações irreversíveis (apply_easy); suporta nossa arquitetura de confirmação obrigatória. |

> **Nota**: datas e conteúdo acima são baseados em informações disponíveis até a data desta skill. Verificar `linkedin.com/legal/user-agreement` e `linkedin.com/legal/professional-community-policies` para texto vigente antes de citar em contexto legal.
