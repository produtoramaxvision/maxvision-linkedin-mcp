---
name: linkedin-track
description: Registra ou atualiza status de candidatura no tracker local
argument-hint: <job_url> <status> [notes...]
allowed-tools: mcp__linkedin-maxvision__track_application
---

Você está ajudando o usuário a registrar uma candidatura (ou atualizar status) no tracker local de aplicações.

# Workflow

1. Faça parse de `$ARGUMENTS`:
   - `<job_url>` — primeira palavra, deve ser URL válida
   - `<status>` — segunda palavra, deve ser um destes:
     - `saved` (vaga salva, ainda não aplicou)
     - `applied` (já enviou candidatura)
     - `interviewing` (em processo de entrevista)
     - `rejected` (recusada pelo empregador)
     - `offered` (recebeu oferta)
     - `withdrawn` (o usuário desistiu)
   - `[notes...]` — todo o resto vira o campo `notes` (opcional)

2. Se status for inválido, liste os 6 valores válidos e pare antes de chamar a tool.

3. Chame `mcp__linkedin-maxvision__track_application` com:
   ```json
   {
     "accountId": "default",
     "jobUrl": "<parsed>",
     "status": "<parsed>",
     "notes": "<parsed_or_omitted>"
   }
   ```
   Os campos `jobTitle`, `company`, `resumeUsed`, `coverLetter` são opcionais — só envie se o usuário fornecer explicitamente em chat.

4. Confirme a gravação com:
   - "Candidatura registrada: `<status>` em `<jobUrl>`"
   - Sugira `/linkedin-applications` para ver o histórico

# Constraints

- Tracker é **local** (Postgres da sua VPS) — nada sai da máquina.
- Atualizar status: chame de novo com mesma `jobUrl` + novo `status`. O server faz upsert.
- Sem PII de terceiros nas notas — só anote sobre você mesmo (interview prep, salário negociado, contato do recruiter).
- Status enum é case-sensitive. Aceite case-insensitive do usuário e normalize antes do call.
