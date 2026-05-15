---
name: interview-prep-pt-br
description: "Use when preparar usuário para entrevistas técnicas e culturais no mercado brasileiro de tech — pipeline típico, perguntas BR-específicas, STAR, pesquisa salarial, negociação CLT vs PJ e perguntas reversas."
paths: ["**/interview*", "**/entrevista*"]
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

---

## 8. Entrevistas assíncronas (HireVue, Spark Hire)

### 8.1 Como o sistema funciona

Plataformas de entrevista assíncrona (HireVue, Spark Hire, VidCruiter, Jobma) funcionam assim:

1. Candidato recebe link com convite por email.
2. Acessa a plataforma e vê perguntas uma por uma.
3. Para cada pergunta: tempo de preparação (0–3 min) + tempo de gravação (1–5 min).
4. Gravação é enviada automaticamente; sem possibilidade de regravar na maioria das plataformas.
5. Recrutador e hiring manager assistem assincronamente — pode ser em horas ou dias depois.
6. Plataformas modernas (HireVue) usam análise de IA para pontuação de expressão facial, velocidade de fala e palavras-chave — contestável, mas existe.

**Deadline típico**: 3-7 dias após receber o link. Não deixe para a última hora — qualidade cai sob pressão de tempo.

### 8.2 Dicas de câmera e setup técnico

| Elemento | Especificação recomendada | Erro comum |
|---|---|---|
| **Câmera** | Altura dos olhos (laptop elevado ou webcam externa em tripé). Não olhar para baixo. | Câmera no colo apontando para o queixo. |
| **Iluminação** | Key light frontal (janela ou ring light a ~45° lateral-frontal). Sem luz vindo de trás. | Fundo iluminado, rosto escuro (janela atrás). |
| **Fundo** | Parede lisa, fundo virtual neutro ou bookshelf arrumada. Sem movimento. | Cama visível, roupa espalhada, familiar passando. |
| **Áudio** | Headset com microfone posicionado 2-3cm da boca OU microfone de mesa a < 30cm. Ruído ambiente < 40dB. | Áudio do laptop com eco do quarto; buzz de AC. |
| **Conexão** | Cabo Ethernet sempre que possível. Wi-Fi 5GHz se não houver cabo. Fechar outras abas e apps antes de gravar. | Wi-Fi 2.4GHz com interferência; videochamada cai. |
| **Vestuário** | Mesma roupa que usaria para entrevista presencial. Cores sólidas (sem listras finas — efeito moiré em câmera). | Camiseta casual demais; listras que vibram na tela. |

### 8.3 Tempo de resposta e estratégia de gravação

- **Use o tempo de preparação inteiro** — não pule para gravar logo; organize mentalmente com estrutura STAR.
- **Primeiros 5 segundos são decisivos**: comece com afirmação direta, não com "Boa pergunta" ou longa pausa.
- **Ritmo de fala**: 130–150 palavras por minuto é o ideal para entrevista em vídeo. Mais rápido = nervoso. Mais lento = desinteressado.
- **Contato visual**: olhar para a câmera, não para a própria imagem na tela. Cobre sua miniatura com um post-it se necessário.
- **Encerre antes do fim**: terminar a resposta 15-30s antes do timeout soa mais seguro do que ser cortado abruptamente.

### 8.4 Como praticar

1. **Grave a si mesmo** respondendo perguntas comuns no celular ou câmera. Assista com som desligado (só visual) e depois com som (só áudio).
2. **Use Loom ou OBS** para simular ambiente de gravação com timer — treina a pressão do countdown visível.
3. **Banco de perguntas comuns**: "Conte sobre um projeto desafiador", "Como lida com conflito em time", "Por que quer trabalhar aqui?", "Qual seu maior ponto de melhoria?"
4. **Limite de prática**: 3-5 gravações por pergunta. Mais do que isso produz resposta decorada que soa robótica.

### 8.5 Perguntas comuns em formato assíncrono

- `"Conte sobre você em 2 minutos."` — quem você é, o que faz, por que esta empresa.
- `"Descreva um desafio técnico recente e como resolveu."` — STAR comprimido em 3 min.
- `"Por que você quer trabalhar na [Empresa]?"` — missão + role específica; sem genérico.
- `"Qual sua maior fraqueza?"` — fraqueza real + o que você está fazendo para trabalhar nela.
- `"Onde você se vê em 3 anos?"` — alinhado à trajetória da empresa; sem "CEO da sua empresa".

---

## 9. Take-home assessment

### 9.1 O que recrutadores olham além de "funcionar"

Um take-home que funciona mas está mal estruturado perde para um take-home bem documentado com uma edge case faltando. Critérios reais de avaliação:

| Critério | Peso relativo | O que verifica |
|---|---|---|
| **Correção funcional** | Alto | Testes passam, casos básicos cobertos, sem crash em inputs válidos. |
| **Qualidade do código** | Alto | Legibilidade, nomes de variáveis/funções, separação de responsabilidades, sem magic numbers. |
| **README e documentação** | Médio-alto | Instruções claras para rodar, decisões explicadas, tradeoffs nomeados. |
| **Testes** | Médio | Unit tests para lógica crítica; pelo menos 1 teste de integração se aplicável. |
| **Tratamento de edge cases** | Médio | Input inválido, lista vazia, timeout, concorrência se relevante. |
| **Arquitetura e extensibilidade** | Médio | O código é fácil de estender? Ou resolve só o caso exato do enunciado? |
| **Git history** | Baixo-médio | Commits semânticos mostram como você pensa incrementalmente. |
| **Segurança** | Baixo (varia) | SQL injection, XSS, secrets hardcoded — sinal de senioridade quando bem tratado. |

### 9.2 Estrutura de README ideal para take-home

```
# [Nome do Projeto / Assessment]

## Como rodar
[3-5 comandos máximo. Deve funcionar em macOS e Linux sem configuração extra.]

## Decisões de design
[2-4 bullets sobre escolhas não-óbvias: por que essa estrutura de dados,
por que essa biblioteca, por que não fiz X.]

## Tradeoffs e o que faria diferente com mais tempo
[Honestidade aqui é sinal de senioridade. Ex: "O cache está em memória;
com mais tempo implementaria Redis para suportar múltiplas instâncias."]

## O que não foi implementado (e por quê)
[Se o enunciado pediu N features e você entregou N-1, explicar o critério
de priorização — não deixar em branco.]

## Como rodar os testes
[Comando único. Output esperado.]
```

### 9.3 Como documentar tradeoffs

Tradeoff bem documentado: `"Escolhi [opção A] em vez de [opção B] porque [razão técnica concreta]. O custo dessa escolha é [consequência], que seria mitigado com [solução] se houvesse mais tempo/escala."

Exemplos:
- `"Usei SQLite em vez de Postgres para facilitar o setup local. Em produção, a migração para Postgres exigiria apenas trocar o driver e ajustar tipos de data."`
- `"Não implementei autenticação porque o enunciado não exigiu. Se implementasse, usaria JWT stateless com refresh token em httpOnly cookie."`
- `"Os testes cobrem 80% do core path; não cobrí a camada de retry por limitação de tempo. O mock de rede já está estruturado para facilitar esse teste."`

### 9.4 Tempo máximo razoável no Brasil

| Nível | Tempo razoável | Além desse limite |
|---|---|---|
| Júnior / estágio | até 3h | Red flag acima de 5h sem pagamento |
| Pleno | até 4h | Red flag acima de 6h sem pagamento |
| Sênior | até 4h (escopo menor por sênior = mais criterioso, não mais longo) | Red flag acima de 6h |
| Staff / Principal | até 3h (contexto maior, escopo mais definido esperado) | Red flag acima de 4h |

**Regra geral**: take-home não deve ultrapassar **4h de trabalho efetivo** para nenhum nível no mercado BR. Acima disso sem remuneração é exploração do candidato.

### 9.5 Quando take-home é red flag

- **Mais de 8h de trabalho estimado** para uma primeira etapa sem remuneração.
- **Pedido de take-home em múltiplos rounds** (ex: primeiro take-home, depois pair programming, depois outro take-home).
- **Enunciado vago demais**: "faça um sistema de e-commerce" sem critérios claros — impossível saber quando parar.
- **Prazo de 24h para projeto de 8h+**: pressão artificial que favorece candidatos sem emprego atual.
- **Trabalho que parece problema real da empresa não anonimizado**: cuidado — pode ser extração de trabalho gratuito.
- **Sem feedback após envio**: empresa que não dá feedback mínimo após take-home não respeita o tempo investido.

---

## 10. Plano de ação 5 dias pré-entrevista

Estrutura day-by-day para maximizar preparo sem entrar em pânico de última hora.

### D-5 (5 dias antes): Pesquisa de empresa e contexto

**Objetivo**: entender quem é a empresa profundamente antes de preparar qualquer resposta técnica.

- Ler a **job description** completa. Sublinhar: 3 skills required, 2 nice-to-have, 1 frase sobre missão/produto.
- Pesquisar a empresa: site, blog de engenharia, últimas notícias (Crunchbase, press), posts recentes no LinkedIn da empresa.
- Identificar o **hiring manager** (LinkedIn) — ler posts, background, empresa anterior.
- Anotar **3 perguntas específicas** para fazer no final da entrevista (seção 6).
- Verificar **glassdoor** e comunidades para entender cultura e possíveis red flags.
- Tempo estimado: **1.5–2h**.

### D-4 (4 dias antes): STAR stories

**Objetivo**: ter 5-6 histórias STAR prontas cobrindo os principais comportamentos avaliados.

- Listar as situações mais impactantes da sua carreira (máximo 3 anos atrás, salvo exceção).
- Estruturar cada uma no formato STAR com resultado quantificado.
- Cobrir esses eixos:
  1. Conflito com colega ou stakeholder — como resolveu.
  2. Falha técnica ou projeto que deu errado — o que aprendeu.
  3. Entrega sob pressão de tempo ou recursos.
  4. Influência sem autoridade (convenceu time de decisão técnica).
  5. Mentoria ou ajuda a colega júnior.
  6. Decisão com informação incompleta.
- Tempo estimado: **2h** (30min por história).

### D-3 (3 dias antes): Mock técnico

**Objetivo**: simular a etapa técnica com pressão real de tempo.

- Resolver 2-3 problemas no estilo do que a empresa costuma fazer (pesquisar Glassdoor, Leetcode Company Tags).
- Se system design: desenhar em papel ou miro o design de um sistema relevante (cache, fila, API gateway).
- Se code review: pegar código de um projeto anterior e identificar problemas em voz alta.
- Praticar **verbalizar o raciocínio** enquanto resolve — entrevistador avalia como você pensa, não só o resultado.
- Pedir para alguém cronometrar ou usar timer visível.
- Tempo estimado: **2–3h**.

### D-2 (2 dias antes): Mock behavioral

**Objetivo**: simular a etapa cultural/STAR com outro humano (ou gravação).

- Pedir para amigo, colega ou mentor fazer perguntas comportamentais e cronometrar suas respostas.
- Se não tiver parceiro: gravar a si mesmo respondendo e assistir criticamente.
- Verificar: respostas ficam dentro de 3 minutos? Há métricas concretas? A ação (A do STAR) é pessoal, não coletiva?
- Revisar as **perguntas reversas** preparadas no D-5 — checar se ainda fazem sentido com o que aprendeu sobre a empresa.
- Preparar a resposta para **"por que você quer sair da empresa atual?"** se aplicável.
- Tempo estimado: **1.5h**.

### D-1 (dia anterior): Logística e descanso

**Objetivo**: eliminar variáveis de logística e descansar o cérebro.

- **Não estudar conteúdo novo**. Se não sabe até agora, não vai fixar em 12h com o cérebro em estado de alerta.
- Confirmar logística: horário, formato (presencial/remoto), plataforma (Zoom, Meet, Teams — testar câmera/microfone), link da reunião, nome do entrevistador.
- Preparar o **ambiente físico**: roupa separada, setup de câmera testado, água na mesa, notificações do celular em silêncio.
- Ler **uma vez** as notas do D-5 sobre a empresa — só para refrescar, não para memorizar.
- Dormir **7h mínimo**. Cognição cai 20-30% com menos de 6h de sono — mais impactante do que qualquer revisão de última hora.
- Tempo estimado: **30min de prep** + descanso intencional.

### Tabela-resumo do plano

| Dia | Foco | Entregável | Horas |
|---|---|---|---|
| D-5 | Pesquisa de empresa | 3 perguntas reversas, notas de missão/produto | 1.5–2h |
| D-4 | STAR stories | 5-6 histórias estruturadas com métricas | 2h |
| D-3 | Mock técnico | 2-3 problemas resolvidos com verbalização | 2–3h |
| D-2 | Mock behavioral | Respostas gravadas ou com parceiro, < 3min cada | 1.5h |
| D-1 | Logística e descanso | Setup testado, 7h de sono | 30min |
