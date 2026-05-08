---
name: interview-prep-pt-br
description: "Use when preparar usuário para entrevistas técnicas e culturais no mercado brasileiro de tech — pipeline típico, perguntas BR-específicas, STAR, pesquisa salarial, negociação CLT vs PJ e perguntas reversas."
---

# Interview prep — mercado pt-BR

Conhecimento operacional para suportar o usuário antes/durante/depois de entrevistas em vagas de tech no Brasil (com nuances para vagas globais que recrutam BR-based).

---

## 1. Pipeline típico — vagas tech no Brasil

Timeline médio: 10–30 dias do `Apply` ao `Offer`.

| # | Etapa | Quem conduz | Duração | O que avaliam |
|---|---|---|---|---|
| 1 | **Triagem RH** | Recrutador / talent acquisition | 30min | Encaixe básico: pretensão salarial, localidade, modelo (CLT/PJ), inglês, motivação para sair, soft skills iniciais. |
| 2 | **Técnica** | Tech lead / EM / IC sênior | 60–120min | System design, problem-solving, code review, perguntas profundas em stack-chave. Pode ser pair programming ou take-home. |
| 3 | **Cultural** | Hiring manager + 1-2 do time | 45–60min | Fit cultural, valores declarados, comportamento sob pressão, conflict, feedback. STAR-heavy. |
| 4 | **Ofertamento** | Recrutador → hiring manager (conversa final) | 30min + papo | Negociação salarial, benefícios, data de início, próximos passos. |

**Variações comuns:**
- **Big-tech (Google/Amazon/Meta)**: + 1 etapa de "behavioral / leadership principles" entre 3 e 4. Múltiplas técnicas.
- **Consultoria (Accenture, Thoughtworks)**: + 1 etapa de case/business problem.
- **Startups early-stage (<50 pessoas)**: pode pular "Cultural" e fazer founder-direct chat.
- **Vaga pj-only / contractor**: pode não ter etapa Cultural; foco em entregas anteriores.

---

## 2. Perguntas BR-específicas — e como responder

### 2.1 "Por que você quer sair da empresa atual?"

Aparece em 95% das triagens RH no Brasil. Recrutador BR aprende em treinamento que esta pergunta detecta:
- Se você está fugindo (red flag) ou avançando (green).
- Se vai trash-talkar a empresa atual (red flag absoluto).

**Resposta calibrada**: 2 frases.
1. Razão profissional positiva (procurando crescimento em X, fechando ciclo em Y, mudando de área).
2. Por que esta vaga específica encaixa.

Exemplo: `Estou buscando uma role onde possa atuar mais próximo de [contexto], que é onde quero crescer. Vi que essa vaga combina exatamente isso com [aspecto da empresa].`

**Não dizer**: salário ruim, líder tóxico, política de RTO, demissão iminente — mesmo se for verdade.

### 2.2 "Qual sua preferência: CLT ou PJ?"

Pergunta comum. Implicações:

- **CLT**: vínculo empregatício formal. Salário tem 13.33 (13º + férias + INSS empregador). Benefícios: VR/VA, plano de saúde, vale-transporte. Demissão tem multa rescisória. Tax burden: ~27% sobre o salário gross.
- **PJ (pessoa jurídica)**: contrato civil entre empresas. Sem 13º/férias/FGTS/INSS empregador. Benefícios via reembolso. Tributação: Simples Nacional ~6-15.5%. Sem proteção CLT mas mais flexível para múltiplos clientes.

**Como responder**: dizer preferência honesta + abertura para negociar. `Atualmente prefiro [modelo] porque [razão], mas estou aberto a [outro] se a proposta total fizer sentido.`

**Se a empresa só oferece um modelo**: alinhe ao deles na conversa, mas calcule por sua conta antes de aceitar. Calcule **gross-equivalent** entre os dois modelos (ver seção 7).

### 2.3 "Qual sua expectativa salarial?"

Aparece **cedo demais** no processo BR — frequentemente na primeira call de 30min. Por quê: empresas usam para filtrar antes de gastar tempo da banca técnica.

**Estratégias**:

a) **Devolver com pesquisa**: `Para a senioridade e stack desta vaga, vejo o mercado entre R$ X e R$ Y para CLT. Estou nessa faixa, com flexibilidade dependendo do pacote total.` (Funciona quando você pesquisou — ver seção 5.)

b) **Devolver com pergunta**: `Antes de definir, posso entender melhor o escopo da role e o pacote completo (benefícios, bônus, equity)?` (Funciona se o recrutador for paciente; alguns vão insistir.)

c) **Abrir com âncora alta**: dizer um número 10-20% acima do que você aceitaria. Funciona em mercados aquecidos (mid-2024 onwards: cuidado, mercado esfriou).

**Não fazer**: dar número exato baseado no salário atual; isso te ancora ao passado.

---

## 3. Perguntas técnicas por role

### 3.1 Backend Engineer

- **System design**: design Twitter, design WhatsApp, design Uber. Avalia API, DB, cache, queue, escala.
- **DB**: índices (B-tree vs hash), N+1, transactions, isolation levels, leitura/escrita em primary/replica, particionamento, sharding.
- **Concurrency**: race condition, deadlock, optimistic vs pessimistic locking, tipos de lock em RDBMS, throughput de fila.
- **Network**: HTTP semantics, idempotência, retries, timeouts, circuit breaker.
- **Específicos pt-BR**: integração com PIX, webhooks Bacen, NFe, mensageria com sistemas legados (SAP, TOTVS).

### 3.2 Frontend Engineer

- **React perf**: re-render avoidance (memo, useMemo, useCallback), code-splitting, suspense, server components.
- **Acessibilidade**: ARIA, contraste, keyboard navigation, screen reader testing — mais cobrado em 2024+.
- **Testing**: React Testing Library, Vitest/Jest, Playwright/Cypress, MSW para mocks.
- **Estado**: client state (zustand, Redux Toolkit, Jotai), server state (TanStack Query, SWR), URL state.
- **Específicos pt-BR**: empresas BR cobram menos perf hard-mode que big-tech US, mas a11y está crescendo (Lei Brasileira de Inclusão, eMAG no setor público).

### 3.3 Full-stack

Escolher um lado em que é **forte** + mostrar **breadth** no outro. Não tente parecer expert em ambos — recrutadores notam.

Padrão: aprofundar em um (ex: backend system design + DB) e mostrar que sabe operar no outro (ex: já fez componente React, entende CSR vs SSR, sabe ler bundle size).

### 3.4 SRE / DevOps / Platform

- IaC: Terraform, Pulumi.
- K8s: deployments, services, ingress, HPA, PDB, network policies.
- Observability: três pilares (logs/metrics/traces), SLI/SLO/SLA, error budget.
- Incidents: postmortem blameless, MTTR, runbooks.

---

## 4. STAR framework

Usado na etapa Cultural para estruturar respostas comportamentais.

```
S — Situation (contexto): onde, quando, qual era o cenário.
T — Task (responsabilidade): o que precisava ser feito; seu papel.
A — Action (ação): o que VOCÊ fez (não o time); decisões; tradeoffs.
R — Result (resultado): impacto, métrica, aprendizado.
```

**Exemplo completo (pt-BR)**:

> **S**: "No segundo semestre de 2023, na [Empresa], nosso pipeline de billing começou a falhar 1-2 vezes por semana — sempre na virada do mês, quando processávamos ~200k faturas em 4h."
>
> **T**: "Eu era tech lead do time e o impacto direto era: cliente recebia fatura duplicada ou atrasada, chamados no suporte triplicavam, e o CFO já estava cobrando o CTO. Minha responsabilidade era diagnosticar a causa raiz e desenhar a solução."
>
> **A**: "Primeiro instrumentei o pipeline com tracing distribuído (OpenTelemetry → Jaeger). Identifiquei que o gargalo era contention de lock em uma tabela de controle. Em vez de simplesmente refatorar o código, propus mudar a estratégia: substituí lock pessimista por outbox pattern com workers idempotentes. Vendi a proposta em RFC interno. Implementei junto com 2 colegas em 3 sprints."
>
> **R**: "O processamento mensal caiu de 4h para 35min. Zero falhas nos 6 meses seguintes. O outbox pattern virou padrão para mais 3 pipelines. Apresentei o aprendizado em tech talk interno e recebi promoção para Senior em ciclo seguinte."

Tempo de resposta STAR: **2-4 minutos**. Mais que isso vira monólogo. Recrutador interrompe se quiser mais profundidade.

---

## 5. Fontes de pesquisa salarial

| Fonte | Cobertura | Confiabilidade |
|---|---|---|
| **Glassdoor BR** | Médio. Muito ruído. | Baixa-média (usuários inflam). |
| **Levels.fyi** | Forte para big-tech (Google/Amazon/Meta/Stripe BR). | Alta para empresas listadas. |
| **Trampos.co / Vagas.com** | Médio. Mostra range de algumas vagas. | Média. |
| **Caça-Talentos / Empregos.com.br** | Pouco útil para tech sênior. | Baixa. |
| **InfoMoney / Catho — relatórios anuais** | Visão macro setor. | Média; lag de 6-12 meses. |
| **Comunidades**: Discord [Frontend Brasil], [Backend Brasil], [Eng Brasil], grupos privados. | Alta resolução; fresh data. | Alta — peer survey real. |
| **Twitter/X BR-tech** | Comentários públicos sobre faixa. | Variável. |
| **LinkedIn Salary Insights** | Médio; ranges por role+cidade. | Média. |
| **Conversas 1:1** com 3-5 pares no mesmo nível | Best signal. | Alta — mas custa relação social. |

**Heurística**: combine 3 fontes diferentes. Se concordam num range, confiar. Se divergem 30%+, há algo específico (cidade, tamanho de empresa, modelo CLT/PJ).

---

## 6. Perguntas reversas — para o usuário fazer ao final

Recrutador sempre dá 5-10min final para suas perguntas. Não fazer = sinal de desinteresse. Boas perguntas:

### 6a. Fortes (fazer 2-3 destas)

1. `Qual o problema principal que essa role precisa resolver nos primeiros 90 dias?` — concreto, mostra senioridade.
2. `Como o time mede sucesso? Quais métricas são olhadas semanalmente?` — calibra cultura de dados.
3. `Como funciona feedback no time? 1:1, retros, reviews — qual a cadência?` — sinaliza maturidade que você espera.
4. `Quem é a última pessoa a sair desse time, e por quê? (se posso perguntar)` — direta, separa empresas honestas das que não são.
5. `Qual decisão técnica recente o time se arrependeu, e o que aprenderam?` — testa autocrítica e cultura de blameless.

### 6b. Fracas (evitar)

1. `Qual a cultura da empresa?` — pergunta vazia; obriga resposta vaga.
2. `Há plano de carreira?` — todo mundo diz sim. Não diferencia.
3. `Tem home-office?` — já está no JD provavelmente; se não está, perguntar com naturalidade no início, não no final.
4. `Quanto a empresa cresceu ano passado?` — você devia ter pesquisado antes.
5. `Por que devo escolher [empresa] em vez de [concorrente]?` — desconfortável e ineficaz.

---

## 7. Negociação salarial — CLT vs PJ

Para comparar duas ofertas em modelos diferentes, normalize ao **custo total da empresa** vs **valor líquido na sua conta**.

### 7a. CLT — gross mensal × 13.33 + benefícios

```
Anual CLT bruto = salário_mensal * 13.33  (1 mês = 12 + 1.33 do 13º+férias)
+ benefícios anuais (VR/VA: ~R$ 1k/mês * 12)
+ plano saúde (~R$ 600-1500/mês * 12)
+ FGTS empresa (8% sobre salário) — fica em conta sua, sacável em rescisão/casa
+ bônus / PLR (variável; ~10-30% do anual em empresas que pagam)
- IR retido na fonte (~27.5% acima de R$ 4.6k/mês)
- INSS empregado (até teto, ~R$ 800/mês)
```

Líquido na conta: **~63-72% do bruto** depois de IR + INSS.

### 7b. PJ — hourly × hours - tax burden

```
Receita bruta = hourly * horas_mês  (160h fulltime padrão)
- impostos (Simples Nacional Anexo III/V: ~6-15.5% dependendo de pró-labore)
- contabilidade (~R$ 200-400/mês)
- INSS PJ (~R$ 400/mês teto baixo, mais para teto alto)
= líquido na conta
```

**Sem**: 13º, férias pagas, FGTS, plano de saúde subsidiado, vale (a menos que negocie reembolso).

### 7c. Equivalência aproximada

Para sair de PJ-equivalente para CLT-equivalente:

```
salário_clt_equivalente ≈ receita_pj_mensal * 0.70
```

Ou seja, **PJ 12k/mês ≈ CLT 8.4k/mês** em termos de líquido depois de tudo, considerando que CLT tem benefícios + segurança + 13º.

> Fórmula simplificada (verify before quoting). Variáveis: faixa de IR do indivíduo, optante Simples ou MEI, dependentes, gastos dedutíveis. Para decisão real, usar planilha + contador.

### 7d. Itens negociáveis além do salário base

1. Bônus de assinatura (signing bonus) — comum em big-tech, raro em médias BR.
2. Equity / stock options / RSU — pedir vesting schedule explícito por escrito.
3. Bônus anual / PLR — pisos e tetos.
4. Home-office allowance / setup R$.
5. Plano de saúde upgrade (incluir família, dental, oftalmo).
6. Education stipend (livros, conferências, MBA).
7. Sabbatical / leave depois de N anos.
8. Data de início (pode ganhar 2-4 semanas para fechar projeto atual).
9. PTO adicional além do CLT padrão (raro, mas alguns lugares dão).

**Princípio**: na negociação, pedir 2-3 itens não-salário primeiro. Recrutador escuta melhor; e para a empresa, equity/PTO são mais baratos que salário base.
