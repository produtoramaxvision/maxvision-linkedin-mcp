---
name: resume-tailoring
description: "Use when adaptar currículo do usuário a uma vaga específica — otimização ATS, match-score, estrutura de bullets, densidade de keywords e regras de formatação. Cobre seções obrigatórias, evitadas e limite de página."
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
