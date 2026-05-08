---
name: linkedin-find-jobs
description: Busca vagas no LinkedIn + agregadores (Indeed, Glassdoor, ZipRecruiter via JobSpy)
argument-hint: keywords [location] [--source linkedin|jobspy|both] [--max N]
allowed-tools: mcp__linkedin-maxvision__search_jobs
---

Você está ajudando o usuário a buscar vagas no LinkedIn e em quadros agregadores (Indeed, Glassdoor, ZipRecruiter via JobSpy).

# Workflow

1. Faça parse de `$ARGUMENTS` extraindo:
   - `keywords` (string obrigatória, primeiro argumento posicional ou tudo antes dos flags)
   - `location` (string opcional, segundo argumento posicional)
   - `--source linkedin|jobspy|both` (default: `both`)
   - `--max <N>` (default: `25`, máx: `100`)

2. Chame a tool `mcp__linkedin-maxvision__search_jobs` com:
   ```json
   {
     "accountId": "default",
     "keywords": "<parsed>",
     "location": "<parsed_or_omitted>",
     "sources": "<parsed_or_both>",
     "maxResults": <parsed_or_25>
   }
   ```

3. Formate a resposta como lista numerada com:
   - `[N]` Título da vaga
   - Empresa · Localização · `easy-apply: yes/no`
   - URL canônica (`linkedin.com/jobs/view/<id>` ou agregador)
   - Snippet curto (1 linha) se disponível

4. Sugira próximos passos:
   - `/linkedin-job-details <url>` para ver descrição completa de qualquer vaga
   - `/linkedin-track <url> saved` para salvar uma vaga no tracker

# Constraints

- `sources` default: `both` (LinkedIn + JobSpy).
- `maxResults` default: `25`. Validador rejeita > 100.
- ToS compliance: cite uma vez por sessão — "Search respeita LinkedIn ToS — sem scraping bruto, só dados públicos disponíveis ao seu cookie."
- Em caso de captcha ou rate-limit, mostre o erro do servidor e sugira `/linkedin-status`.
- Se `keywords` < 2 chars, peça ao usuário para refinar antes de chamar a tool.
