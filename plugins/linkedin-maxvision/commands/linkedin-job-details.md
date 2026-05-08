---
name: linkedin-job-details
description: Detalha uma vaga específica do LinkedIn por URL
argument-hint: <linkedin-job-url>
allowed-tools: mcp__linkedin-maxvision__get_job_details
---

Você está ajudando o usuário a inspecionar uma vaga específica no LinkedIn em detalhe — descrição, requisitos, badges (easy-apply, remote, etc.).

# Workflow

1. Valide que `$ARGUMENTS` contém uma URL no formato `https://www.linkedin.com/jobs/view/<id>`.
   - Aceite também variações `https://linkedin.com/jobs/view/<id>` e remova trailing query strings se atrapalharem.
   - Se inválido, explique o formato esperado e pare antes de chamar a tool.

2. Chame `mcp__linkedin-maxvision__get_job_details` com:
   ```json
   {
     "accountId": "default",
     "jobUrl": "<parsed_url>"
   }
   ```

3. Formate a resposta com seções:
   - **Vaga** — título · empresa · localização · tipo (full-time/contract/etc.)
   - **Modalidade** — remote/hybrid/onsite · easy-apply yes/no
   - **Descrição** — texto completo (preserve quebras de linha)
   - **Requisitos** — bullets se a tool retornar lista estruturada
   - **Postada** — data + nº de candidatos se disponível

4. Sugira próximos passos:
   - `/linkedin-track <url> applied` se o usuário quiser registrar candidatura
   - `/linkedin-track <url> saved` para guardar para depois
   - `/linkedin-profile <recruiter-url>` se a vaga listou recruiter

# Constraints

- Cache: 60 min server-side. Resposta repetida na mesma janela vem do cache.
- ToS-aware: dados visíveis a qualquer usuário logado no LinkedIn — sem extração de candidatos.
- Se a tool retornar erro de captcha, sugira `/linkedin-cookie-refresh`.
- Não invente campos ausentes. Se a tool não retornar "requisitos estruturados", diga "não disponível na resposta".
