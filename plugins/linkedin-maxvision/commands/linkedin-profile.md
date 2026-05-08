---
name: linkedin-profile
description: Lê perfil público do LinkedIn por URL
argument-hint: <linkedin-profile-url>
allowed-tools: mcp__linkedin-maxvision__get_profile
---

Você está ajudando o usuário a fazer lookup de um perfil público do LinkedIn — experiência, formação, skills, sumário.

# Workflow

1. Valide que `$ARGUMENTS` contém uma URL no formato `https://www.linkedin.com/in/<slug>`.
   - Aceite `https://linkedin.com/in/<slug>` (sem `www`).
   - Remova trailing query strings (`?utm=...`, `?originalSubdomain=...`).
   - Se inválido, peça URL no formato correto e pare antes de chamar a tool.

2. Chame `mcp__linkedin-maxvision__get_profile` com:
   ```json
   {
     "accountId": "default",
     "profileUrl": "<canonical_url>"
   }
   ```

3. Estruture a resposta em seções:
   - **Cabeçalho** — nome · headline · localização · conexões (se disponível)
   - **Sumário** — texto do "About" (preserve quebras de linha)
   - **Experiência** — timeline reversa, formato:
     - `<cargo>` · `<empresa>` · `<período>` · `<localização>`
     - 1-2 linhas de descrição se disponível
   - **Formação** — instituição · grau · período
   - **Skills** — lista compacta separada por `·`

4. Sugira próximos passos contextuais:
   - Se o perfil tem cargo de recruiter/HR: `/linkedin-find-jobs <empresa>` para vagas dessa empresa
   - Se o perfil é de candidato: oferecer comparar com vaga aberta

# Constraints

- Cache: 24 h server-side.
- ToS: somente dados visíveis a qualquer usuário logado. **Não** acesse seções privadas.
- LGPD: não copie/cole o perfil em prompts de outras tools sem consentimento explícito do dono do dado.
- Se a tool retornar `profile_not_found` ou captcha, mostre o erro literal e sugira `/linkedin-status`.
