---
name: resume-tailoring
description: "Use when adaptar currículo do usuário a uma vaga específica — otimização ATS, match-score, estrutura de bullets, densidade de keywords e regras de formatação. Cobre seções obrigatórias, evitadas e limite de página."
paths: ["**/*.pdf", "**/*.docx", "**/resume*", "**/curriculo*", "**/cv*"]
---

# Resume tailoring — guia ATS

Conhecimento operacional para o agente `linkedin-resume-tailor`. Foco em maximizar score em ATS (Applicant Tracking System) sem comprometer leitura humana.

---

## 1. ATS — o básico

**O que é ATS**: software (Greenhouse, Lever, Workday, Gupy no BR, iCIMS) que recrutadores usam para filtrar currículos antes da leitura humana. Faz parsing do PDF/docx, extrai texto, indexa keywords, calcula match contra a job description.

**O que ATS parseia bem:**
- Texto plano em fluxo linear (top→bottom, left→right).
- Seções com títulos óbvios (Experience, Education, Skills).
- Bullets simples (• ou -).
- Datas em formato consistente (`MMM YYYY` ou `MM/YYYY`).

**O que ATS parseia MAL (e por que evitar):**
- Múltiplas colunas → ordem de leitura quebra; bullets podem ser ignorados.
- Tabelas para layout → texto interno frequentemente perdido.
- Headers/footers → ignorados em muitos ATS (Workday, iCIMS).
- Text boxes (Word) → idem.
- Imagens com texto (logos, ícones com label) → invisíveis.
- Fontes não-padrão → caracteres trocados por glyphs vazios.
- Cor → ignorada; design visual é puro overhead.

**Implicação**: design bonito vendido por templates do Canva/Notion costuma destruir ATS score. Single-column simples vence sempre.

---

## 2. Match score — fórmula operacional

Score normalizado 0-100 que o `linkedin-resume-tailor` calcula:

```
score = 0.60 * required_skill_match
      + 0.30 * nice_to_have_match
      + 0.10 * recency_factor
```

Onde:
- `required_skill_match` = (keywords required presentes no resume) / (total required na vaga). Faixa 0-1.
- `nice_to_have_match` = (nice-to-have presentes) / (total nice-to-have). Faixa 0-1.
- `recency_factor` = peso da experiência mais recente vs requirement. Se a skill X é "required" e o usuário usou X há 1 ano = 1.0; há 3 anos = 0.7; há 5+ anos = 0.4.

**Threshold para aplicar**: score ≥ 65. Abaixo disso, customização não compensa — vaga não é bom match.

**Threshold para alta confiança**: score ≥ 80.

---

## 3. Estrutura de bullet point

Fórmula: **Verbo de ação (passado) + O quê + Resultado quantificado**.

Exemplos bons:
- `Liderei migração de monolito Rails para microserviços Go, reduzindo p95 de 1.8s para 320ms (5.6x) em 6 meses.`
- `Implementei pipeline CI/CD em GitHub Actions cobrindo 47 repositórios, cortando tempo médio de build de 14min para 3min.`
- `Refatorei módulo de billing crítico (Stripe + LGPD), reduzindo bugs em produção em 73% (Q3 vs Q4).`

Exemplos ruins:
- `Responsável por trabalhar com banco de dados.` — sem verbo forte, sem métrica, sem o quê.
- `Ajudei o time a melhorar performance.` — vago, ajudei é fraco.
- `Trabalhei com React, Redux, TypeScript, Node, Postgres, Docker, Kubernetes, AWS, GCP, Azure.` — keyword stuffing sem contexto.

**Verbos fortes** (passado): liderei, implementei, projetei, refatorei, otimizei, migrei, integrei, reduzi, escalei, automatizei, padronizei, mentorei, lancei, desbloqueei.

**Métricas válidas**: tempo (ms, %), custo (R$, $), volume (req/s, MAU), qualidade (% bugs, NPS, MTTR), pessoas (tamanho de time).

**Densidade alvo**: 1 métrica por bullet quando possível; mínimo 1 por bullet a cada 3.

---

## 4. Densidade de keywords

**Alvo: 1.5–2.5% do total de palavras do corpo**.

Cálculo prático:
- Resume de 600 palavras → 9–15 ocorrências de keywords prioritárias.
- Resume de 1000 palavras → 15–25 ocorrências.

**Acima de 3.5%** = keyword stuffing → ATS modernos (e humanos) penalizam.

**Como distribuir**:
1. Keywords required → presentes 2x cada (uma em Skills, uma em bullet de experiência).
2. Keywords nice-to-have → 1x cada (Skills ou Summary).
3. Variantes naturais OK (`React` + `React.js` + `ReactJS` contam separadamente em ATS naive; em ATS modernos com lemmatização, conta como 1).

**Princípio**: cada keyword deve aparecer em contexto narrativo, não em lista solta no rodapé.

---

## 5. Seções obrigatórias (e ordem)

1. **Header/Contato**: nome completo, e-mail, telefone (opcional), LinkedIn URL, GitHub URL, cidade-estado (não endereço completo).
2. **Summary** (3-4 linhas): pitch profissional. Quem você é, anos de XP, especialidade, valor entregue. Customizar por vaga.
3. **Skills**: agrupado por categoria (Languages, Frameworks, Cloud, Tools). Concentra keywords ATS.
4. **Experience**: ordem cronológica reversa. Empresa, role, datas, 3-6 bullets por role.
5. **Education**: instituição, curso, ano (omitir ano se causa age bias e a vaga é em mercado ageist).

Ordens alternativas:
- **Júnior/recém-formado**: Education antes de Experience.
- **Career transition**: Skills antes de Experience, com bullets temáticos.
- **Acadêmico/research role**: Publications/Patents após Experience.

---

## 6. Seções a EVITAR

| Seção | Por quê |
|---|---|
| **Foto** | Causa age/race/gender bias; ilegal no Brasil para algumas vagas (CLT). Em UE/UK/US: não incluir. |
| **Data de nascimento / idade** | Bias e ilegal em algumas jurisdições (US ADEA, UK Equality Act). |
| **CPF / RG / passport** | Nunca em currículo público. Coletado só em onboarding pós-oferta. |
| **Estado civil / filhos** | Irrelevante; bias. |
| **Referências disponíveis sob solicitação** | Linha morta — recrutador assume isso. Desperdiça 1 linha. |
| **Hobbies genéricos** | "Gosto de viajar e ler" → noise. Só incluir se diretamente relevante (ex: open source maintainer, palestrante, atleta de alto rendimento). |
| **Objective statement** (`Procuro vaga onde possa crescer...`) | Substituído por Summary moderno. |
| **Salário atual / pretendido** | Negociação separada; nunca em currículo. |

---

## 7. Regras de formatação

- **Coluna**: single-column. Sempre.
- **Formato**: `.docx` ou `.pdf` — ambos OK. PDF gerado de Word/Pages é melhor que PDF de Canva (Canva embute fonts/images problemáticos).
- **Sem tabelas, text boxes, headers/footers** com conteúdo crítico.
- **Fonte**: Arial, Calibri, Helvetica, Georgia, Times New Roman. Sans-serif para tech.
- **Tamanho**: 10–11pt corpo, 14–16pt nome.
- **Margens**: 1.5–2cm. Não comprimir abaixo de 1.2cm.
- **Espaçamento**: 1.0–1.15 line height.
- **Bullets**: `•` ou `-`. Evitar emojis, símbolos exóticos.
- **Datas**: formato consistente. `MMM YYYY – MMM YYYY` (ex: `Jan 2022 – Mar 2024`) ou `MM/YYYY – MM/YYYY`.
- **Links**: usar URL completa OU texto + URL no header. Markdown puro `[texto](url)` falha em PDF de Word.

---

## 8. Comprimento

| Anos de experiência | Páginas |
|---|---|
| 0–10 | 1 página |
| 10+ | 2 páginas (não mais) |
| Acadêmico/CV completo (research) | 3+ páginas, com seção de Publications |

**Razão**: recrutador médio gasta 6-10s no primeiro scan. Currículo de 3 páginas para SWE com 5 anos de XP transmite "não sabe priorizar".

**Compactação**: cortar bullets que não suportam o pitch da vaga atual. Manter histórico completo no LinkedIn; resume é destilado por vaga.

---

## 9. Padrões específicos para vagas de tech

### 9.1 SWE generalista vs especialista

| Sinal no JD | Abordagem no resume |
|---|---|
| "Full-stack", "product engineer", "generalist" | Evidenciar breadth: bullets que cruzam front+back+infra. Summary: "pragmatismo > pureza". |
| "Backend platform", "infra", "staff engineer" | Aprofundar em sistema de escala, design de API, ownership de serviço crítico. Remover bullets de UI. |
| "Frontend", "design system", "web perf" | Mostrar métricas de performance (LCP, CLS, bundle size), a11y, componente em produção usado por N engenheiros. |
| "ML engineer", "AI engineer" | Evidenciar pipeline end-to-end (data → model → deploy → monitoramento), não só notebooks. |

**Armadilha**: resume generalista enviado para vaga de especialista — ATS score cai por falta de profundidade nas keywords required.

### 9.2 Monorepo contributor vs maintainer de biblioteca

**Contributor de monorepo** (maioria das big-techs e scale-ups):
- Enfatizar escala de impacto: quantos serviços/features afetados, quantos engenheiros no repositório.
- Bullets sobre code review em PRs de outros times, RFC authorship, breaking changes coordenadas.
- Exemplo: `Propus e implementei RFC de padronização de error handling em monorepo com 120 services; adotado por 18 times sem breaking changes.`

**Maintainer de biblioteca/framework**:
- Número de downloads/semana, stars, empresas conhecidas que usam.
- Contribuições externas gerenciadas (issues resolvidas, PRs de terceiros revisados).
- Changelog público como evidência de ritmo de entrega.
- Exemplo: `Mantenho [lib] com 4.2k stars; 340+ issues fechadas, 87 contribuidores externos, adotada por [Empresa conhecida].`

### 9.3 Open source como signal profissional

Open source é signal relevante para vagas de infra, developer tools, e empresas com cultura de contribuição (ex: Stripe, Vercel, Hashicorp, Grafana Labs). Critérios para incluir:

- Repositório com atividade recente (último commit < 6 meses).
- Contribuição substancial: feature, not typo fix. Ou maintainer ativo.
- README em inglês se a vaga é em empresa global.

Como listar:
```
Open Source
• Contributor — [repo/org]: [o quê, impacto]. github.com/org/repo
• Maintainer — [lib]: [descrição], [N] stars, [N] contributors.
```

Não listar repositórios pessoais sem atividade ou com apenas 2-3 commits — sinal negativo.

### 9.4 Links de repositório no currículo

- **GitHub profile**: `github.com/username` no header — sempre.
- **Link de projeto específico**: incluir no bullet quando o repo é público e o trabalho é verificável. Formato: `github.com/username/repo`.
- **Portfolio / personal site**: incluir se tem demos ou case studies atualizados. Evitar sites gerados por IA sem conteúdo real.
- **LinkedIn**: `linkedin.com/in/username` no header. Usar URL customizada (não a hash default gerada).

**Regra de ouro**: só linkar o que você não se envergonharia de ter o recrutador clicando às 22h na véspera da entrevista.

---

## 10. Checklist pré-submissão

Executar cada item antes de enviar. Score mínimo: 13/15 itens OK.

| # | Item | Como verificar |
|---|---|---|
| 1 | **Spell check** em pt-BR ou en-US consistente | Rodar corretor no Word/Google Docs; atenção a falsos positivos em nomes próprios e siglas técnicas. |
| 2 | **PDF renderiza corretamente** | Abrir o PDF gerado; não confiar no preview do Word. Texto selecionável = OK. |
| 3 | **Header e footer vazios** | Scroll até topo e final do PDF; conteúdo de header/footer ATS-invisible. |
| 4 | **Keywords required presentes** | Copiar as 5-8 keywords required da JD; Ctrl+F no PDF. Todas devem aparecer pelo menos 1x. |
| 5 | **Datas consistentes** | Mesmo formato em todas as experiências. `Jan 2022` não pode estar lado a lado com `01/2022`. |
| 6 | **Sem gaps inexplicados > 6 meses** | Se gap existe, preparar resposta para a triagem; considerar nota curta (ex: `2022 — sabbatical / estudo`). |
| 7 | **Links clicáveis e funcionais** | Abrir cada URL do PDF. LinkedIn, GitHub, portfolio — sem 404 ou acesso privado. |
| 8 | **Bullets com pelo menos 1 métrica por 3** | Reler cada bullet; marcar os sem métrica e tentar adicionar ao menos estimativa (`~30%`, `2x`). |
| 9 | **Nome completo correto** | Nome exatamente igual ao LinkedIn e à documentação — facilita background check. |
| 10 | **E-mail profissional** | Sem `gamer_lord_2008@hotmail.com`. Usar nome real `@gmail.com` ou domínio próprio. |
| 11 | **Sem foto, data de nascimento, CPF** | Scroll completo; remover se presente. |
| 12 | **Fonte única, sem mistura** | Selecionar todo o texto; verificar que fonte não muda entre seções. |
| 13 | **Single-column verificado** | Abrir em leitor de PDF diferente do gerador (ex: Acrobat Reader vs browser). Layout não pode quebrar. |
| 14 | **Comprimento correto para XP** | 1 página para < 10 anos, 2 páginas para 10+. Nem mais, nem menos. |
| 15 | **Summary customizado para a vaga** | Summary menciona ao menos 1 termo da JD, não é genérico copiado de outra aplicação. |

---

## 11. Adaptação para vagas globais (remote-first US/EU)

### 11.1 Idioma

- **US/UK/CA/AU remote**: inglês americano-padrão (en-US) no documento inteiro. Não misturar com pt-BR.
- **EU multilíngue (Alemanha, França, Países Baixos)**: verificar se a JD está em inglês ou no idioma local. Se inglês → resume em en-US. Se idioma local → considerar duas versões.
- **Portugal**: português europeu (pt-PT) ou inglês dependendo da empresa. Startups tech lisboetas aceitam en-US.

### 11.2 Formato de data

| Mercado | Formato correto | Evitar |
|---|---|---|
| US | `Jan 2022 – Mar 2024` ou `01/2022 – 03/2024` | `01/03/2022` — ambíguo (DD/MM vs MM/DD) |
| UK/EU | `January 2022 – March 2024` ou ISO `2022-01 – 2024-03` | Formato curto sem ano explícito |
| BR | `Jan 2022 – Mar 2024` | `01/22` — muito abreviado para ATS |

**Regra**: sempre incluir mês e ano em ambas as datas (início e fim). `2022 – 2024` sem mês é ambíguo para ATS.

### 11.3 Endereço e localidade

- **Remote US/EU**: incluir apenas `[Cidade], Brasil (Remote)` ou simplesmente `Brazil — Open to Remote`. Não incluir endereço completo.
- **Se autorização de trabalho for necessária**: declarar `Brazilian citizen — eligible for [STEM OPT / EU Blue Card / etc.]` no header ou Summary, se aplicável. Não declarar se não souber — verificar com advogado de imigração.
- **Fuso horário**: para vagas remote-first, mencionar `UTC-3` ou `overlaps US Eastern / EU Central` no Summary quando o JD exige overlap de horário.

### 11.4 LinkedIn URL

- URL padrão gerada: `linkedin.com/in/nome-sobrenome-a1b2c3d4` — hash aleatória, não profissional.
- URL customizada: `linkedin.com/in/nome-sobrenome` — configurar em `linkedin.com/public-profile/settings`.
- Para vagas globais: nome em inglês transliterado (sem cedilha, sem acento) — `joao-silva` não `joão-silva`, que pode quebrar em formulários ATS legados.

### 11.5 GitHub — README em inglês

- Repositórios listados no currículo para vagas globais **devem ter README em inglês**.
- Commit messages em inglês são fortemente recomendados — reviewers técnicos abrem o histórico de commits.
- Commits em pt-BR não são bloqueantes, mas sinalizam "trabalhou só em contexto BR". Para vagas de developer tools ou OSS-heavy, impacto é maior.
- Profile README (`github.com/username`) deve estar em inglês se o target é mercado global.

### 11.6 Diferenças de expectativa cultural

| Elemento | Padrão BR | Padrão US/EU |
|---|---|---|
| Comprimento | 1-2 páginas OK | 1 página para < 10 anos XP é norma dura em US |
| Foto | Não incluir (mesmo padrão) | Não incluir — mais rigoroso ainda |
| Referências | Não listar no resume | Idem; "References available upon request" é dead phrase |
| GPA / coeficiente | Raramente exigido | Incluir se top university + < 3 anos de XP + > 3.5/4.0 |
| Objetivo profissional | Substituído por Summary | Idem; objective statement é considerado desatualizado |
