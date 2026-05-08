---
name: linkedin-cookie-refresh
description: Re-importa o cookie li_at do LinkedIn quando expirado
argument-hint: [paste-li_at-value-here]
allowed-tools: []
---

Você está guiando o usuário pelo processo de re-importar o cookie `li_at` do LinkedIn quando ele expirou ou foi invalidado.

# Status Sprint 1

> O tool MCP admin `update_cookie` chega na **Sprint 1.5**. Na Free tier atual o procedimento é manual via SQL. O `allowed-tools` deste comando está vazio de propósito.

# Workflow — extrair o cookie

Guie o usuário, passo-a-passo:

1. Abra o LinkedIn em qualquer navegador (Chrome/Firefox/Edge) e faça login normalmente.

2. Abra o DevTools:
   - Chrome/Edge: `F12` ou `Ctrl+Shift+I`
   - Firefox: `F12`

3. Navegue para:
   - Chrome/Edge: aba **Application** → **Storage** → **Cookies** → `https://www.linkedin.com`
   - Firefox: aba **Storage** → **Cookies** → `https://www.linkedin.com`

4. Localize o cookie chamado **`li_at`**.

5. Clique no valor e copie tudo (string longa começando com `AQE...`).

   > **Atenção:** esse cookie é equivalente ao seu login. Não compartilhe, não cole em chat público, não envie por email. Trate como senha.

# Workflow — atualizar o servidor (Sprint 1, manual)

Como o tool admin ainda não existe, o usuário precisa rodar SQL direto:

```bash
# 1. Encriptar o novo cookie (helper já existe no mcp-server)
cd mcp-server
node -e "
  const { encryptCookie } = require('./dist/auth/cookie.js');
  console.log(encryptCookie(process.argv[1]));
" "<COLE_AQUI_O_li_at>"

# 2. Atualizar no banco
psql \"\$DATABASE_URL\" -c \"
  UPDATE accounts
  SET cookie_li_at = '<output_do_passo_1>',
      cookie_updated_at = NOW(),
      cookie_expires_at = NOW() + INTERVAL '60 days'
  WHERE id = 'default';
\"

# 3. Validar
psql "$DATABASE_URL" -c "SELECT id, cookie_updated_at, cookie_expires_at FROM accounts WHERE id = 'default';"
```

Depois, rode `/linkedin-status` para confirmar que o probe retorna `account_status: healthy`.

# Workflow desta sessão

1. **Não** chame nenhum tool MCP — `allowed-tools` está vazio.
2. Se o usuário colar o `li_at` em chat, **avise** que valor secreto não deve ficar em transcrição persistida e ofereça redigir após uso.
3. Mostre os comandos SQL/node acima como bloco que o usuário copia e roda no terminal dele — você não executa nada.

# Constraints

- **Nunca** ecoe o valor do `li_at` na resposta — sempre redirija para `<COLE_AQUI_O_li_at>`.
- Sprint 1.5 substituirá esse fluxo manual por `mcp__linkedin-maxvision__update_cookie` (admin tool, requer auth local).
- Se o usuário usar 2FA, o procedimento é o mesmo — o `li_at` válido captura a sessão pós-2FA.
