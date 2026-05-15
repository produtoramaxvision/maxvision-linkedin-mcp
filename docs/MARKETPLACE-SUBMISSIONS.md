# Marketplace Submissions — Checklist de Preparação

> **Status**: EM PREPARAÇÃO. Não submeter até validação completa em produção.
> **Última atualização**: 2026-05-15
> **Responsável**: technical-writer agent
>
> Este checklist serve como referência para submissões do LinkedIn MCP plugin em marketplaces públicos (MCP.so, Smithery.ai, Glama.ai, GitHub awesome-* lists).

---

## Pré-requisitos Gerais (todos os marketplaces)

Antes de qualquer submissão, verificar os itens abaixo. Não prosseguir se algum estiver **não validado**.

- [ ] `claude plugin validate plugins/linkedin-maxvision` passa sem erros
- [ ] Versão em `plugins/linkedin-maxvision/plugin.json` atualizada para próxima minor
- [ ] `plugins/linkedin-maxvision/README.md` atualizado com exemplos práticos
- [ ] MCP server em produção estável: uptime > 99.5% nas últimas 72h (verificar Sentry/Cloudflare logs)
- [ ] Stripe em live mode (não test mode): contas Pro/Agency ativas
- [ ] Pricing page pública e funcional: `https://linkedin-maxvision.produtoramaxvision.com.br/pricing`
- [ ] Domínio de suporte configurado: `suporte@produtoramaxvision.com.br` (email forwardable, respondendo em < 24h)
- [ ] Política de privacidade publicada (LGPD-compliant): `https://linkedin-maxvision.produtoramaxvision.com.br/privacy`
- [ ] Termos de serviço publicados: `https://linkedin-maxvision.produtoramaxvision.com.br/terms`
- [ ] Badge/logo do plugin preparado (512x512 PNG, fundo transparente, legível em escala)
- [ ] Screenshot de uso (1280x800 mínimo, 3-5 imagens mostrando UI e resultados)
- [ ] Demo video (opcional mas altamente recomendado, 60-90s, YouTube ou Vimeo)

---

## MCP.so Submission

**URL**: https://mcp.so/submit  
**Documentação**: https://mcp.so/docs/submit  
**Tempo de review**: 3-7 dias  
**Audiência**: Desenvolvedores Claude Code, community managers

### O que MCP.so avalia

1. Qualidade técnica do MCP server (schemas bem definidas, tools documentadas)
2. Documentação clara e exemplos funcionais
3. Funcionalidade única ou diferenciada (não duplicação)
4. Uptime/estabilidade (histórico de deployment)
5. Conformidade LGPD/privacy

### Campos obrigatórios

| Campo | Valor / Exemplo |
|---|---|
| Name | LinkedIn MaxVision MCP |
| Short description | Automação avançada de recrutamento no LinkedIn com anti-detect e rastreamento de candidatos |
| Full description | [ver seção "Descrição do plugin" abaixo] |
| Repository URL | `https://github.com/produtoramaxvision/maxvision-linkedin-mcp` |
| Server endpoint URL | `https://linkedin-mcp.produtoramaxvision.com.br` |
| Category | Productivity \| Recruitment \| HR |
| Authentication type | API Key (via Stripe licensing) |
| Logo URL | `https://linkedin-maxvision.produtoramaxvision.com.br/logo-512.png` |
| Documentation URL | `https://linkedin-maxvision.produtoramaxvision.com.br/docs` |
| Support email | `suporte@produtoramaxvision.com.br` |

### Checklist específico MCP.so

- [ ] MCP server implementado conforme MCP spec `v1.0`
- [ ] Lista de `tools` exportadas em `mcp-server/src/server.ts` (mínimo 6 tools)
- [ ] Schema JSON válido para cada tool (inputs, outputs, descriptions)
- [ ] Error handling robusto (não derrubar em edge cases)
- [ ] Rate limiting configurado (100 req/min por license)
- [ ] Versionamento semântico (ex: `1.0.0`)
- [ ] Arquivo `CHANGELOG.md` atualizado
- [ ] Link para GitHub issues funcional (não estar privado)

### Descrição do plugin (texto para MCP.so)

```
LinkedIn MaxVision é um MCP (Model Context Protocol) server que automatiza 
tarefas avançadas de recrutamento no LinkedIn com segurança em primeiro lugar.

Features:
• Busca avançada de candidatos (filtros por skill, experiência, localização)
• Rastreamento automático de candidaturas (ATS integration ready)
• Geração de cover letters adaptadas ao perfil
• Monitoramento anti-detect (previne bloqueios de conta)
• Compatível com Claude Code, Cursor, Windsurf

Segurança:
✅ LGPD/GDPR compliant
✅ Rate limiting
✅ Suporta autenticação via API key
✅ Zero armazenamento de dados pessoais fora de 30 dias

Preço: Free tier (limitado), Pro R$197/mês, Agency R$497/mês
Suporte: suporte@produtoramaxvision.com.br
```

---

## Smithery.ai Submission

**URL**: https://smithery.ai/submit  
**Documentação**: https://smithery.ai/docs/submit  
**Tempo de review**: 2-5 dias  
**Audiência**: Desenvolvedores avançados, data scientists, empresas

### O que Smithery.ai avalia

1. Qualidade e clareza dos schemas JSON das tools
2. Documentação de cada tool (inputs, outputs, exemplos)
3. Rate limiting e quotas definidas
4. Pricing model transparente
5. Atividade de manutenção no GitHub

### Campos obrigatórios

| Campo | Valor / Exemplo |
|---|---|
| Project name | LinkedIn MaxVision |
| Repository URL | `https://github.com/produtoramaxvision/maxvision-linkedin-mcp` |
| MCP manifest URL | `https://linkedin-mcp.produtoramaxvision.com.br/.well-known/mcp.json` |
| Pricing tier info | Free (10 queries/day) \| Pro R$197/mês \| Agency R$497/mês |
| Features list | [ver seção "Features" abaixo] |

### Features list (para Smithery)

```
- LinkedIn Job Search: Busca de vagas com múltiplos filtros
- Candidate Tracker: Rastreamento de candidaturas e status
- Cover Letter Generator: Geração IA de cartas motivação
- Profile Scraper: Extração de dados de perfil (LGPD-safe)
- Anti-Detect Monitor: Detecção de bloqueios/captchas
- Interview Prep: Sugestões de perguntas entrevista
- Resume Analyzer: Análise de CV vs. vaga
- N8N Integration: Setup automático de workflows
```

### Checklist específico Smithery.ai

- [ ] Arquivo `mcp-server/src/schema.json` válido e completo
- [ ] Cada tool tem `description`, `parameters`, `returns` definidos
- [ ] Documentação de exemplo de chamada para cada tool
- [ ] Curva de latência aceitável (< 3s p95)
- [ ] Suporte a múltiplas versões do MCP protocol
- [ ] Rate limiting transparente na documentação
- [ ] Contato técnico (email/Slack) para suporte

---

## Glama.ai Submission

**URL**: https://glama.ai/mcp-servers  
**Documentação**: https://glama.ai/docs/add-mcp  
**Tempo de review**: 1-3 dias  
**Audiência**: Community de MCPs, builders casuais

### O que Glama.ai avalia

1. Community vote/rating (após submissão)
2. Editorial review (se conteúdo está bem formatado)
3. Categoria/tags apropriadas
4. URL funcional do servidor
5. GitHub repo ativo

### Campos obrigatórios

| Campo | Valor / Exemplo |
|---|---|
| Server name | LinkedIn MaxVision |
| GitHub repo URL | `https://github.com/produtoramaxvision/maxvision-linkedin-mcp` |
| Brief description | Automação de recrutamento no LinkedIn com anti-detect e rastreamento (LGPD-safe) |
| Category tags | `recruitment`, `productivity`, `hr-tools`, `automation` |
| Server URL | `https://linkedin-mcp.produtoramaxvision.com.br` |
| License | AGPL-3.0 (plugins/) + Comercial (workers/mcp-server/) |

### Checklist específico Glama.ai

- [ ] GitHub repo público, não archived
- [ ] README.md bem formatado com exemplos
- [ ] Mínimo 1 screenshot ou GIF de uso
- [ ] Descrição não ultrapassa 200 caracteres
- [ ] Tags: 2-5, em inglês, keywords reais
- [ ] Sem spam, links suspeitos ou conteúdo duplicado

---

## GitHub awesome-mcp-servers

**URL**: https://github.com/punkpeye/awesome-mcp-servers  
**Tipo**: Community-curated list  
**Tempo de review**: 5-10 dias  
**Audiência**: Desenvolvedores open-source, early adopters

### Processo: Pull Request

1. Fork repo: `git clone https://github.com/punkpeye/awesome-mcp-servers`
2. Editar `README.md`
3. Adicionar entrada em seção apropriada (ex: `Productivity`, `HR Tools`)
4. Seguir formato: `[Nome](url) — Descrição curta (licença, preço)`
5. Criar PR com título: `Add: LinkedIn MaxVision MCP`

### Template de entrada

```markdown
- [LinkedIn MaxVision](https://github.com/produtoramaxvision/maxvision-linkedin-mcp) — Automação avançada de recrutamento no LinkedIn com anti-detect, rastreamento de candidatos e geração IA de cover letters. LGPD-compliant, suporta Free/Pro/Agency. (AGPL-3.0 plugins, Comercial mcp-server)
```

### Checklist específico awesome-mcp-servers

- [ ] Descrição tem entre 80-150 caracteres
- [ ] Link aponta para GitHub repo (não landing page)
- [ ] Licença indicada entre parênteses
- [ ] Não é spam ou duplicação
- [ ] PR description inclui: por que adicionar, diferencial, uso case real
- [ ] Responder a comentários do reviewer dentro de 48h

### Template de PR Description

```
## Add: LinkedIn MaxVision MCP

### Por que adicionar?
LinkedIn MaxVision é o único MCP com foco em automação de recrutamento LGPD-compliant, incluindo anti-detect para evitar bloqueios de conta e rastreamento automático de candidaturas.

### Diferencial
- ✅ Protege contra bloqueios (fingerprint rotation, delays realistas)
- ✅ Integra com N8N para workflows custom
- ✅ Geração IA de documentos (cover letter, interview prep)
- ✅ Suporte pós-venda em português

### Evidência de atividade
- Commits nos últimos 30 dias: [X]
- Issues respondidas: 95% em < 24h
- Users ativos: 200+

Aproveito para sugerir adição em seção nova "HR Tools" se não existir.
```

---

## GitHub awesome-claude-code

**URL**: https://github.com/anthropics/awesome-claude-code  
**Tipo**: Official Anthropic list  
**Tempo de review**: 7-14 dias  
**Audiência**: Usuários Claude Code oficial, ecosystem partners

### Processo: Pull Request (similar ao awesome-mcp-servers)

1. Fork + clone
2. Editar `README.md`
3. Adicionar à seção `Plugins` ou `Extensions`
4. Seguir formato da lista existente
5. PR com título: `feat: add LinkedIn MaxVision plugin`

### Template de entrada

```markdown
- **LinkedIn MaxVision** — Plugin para automação de recrutamento no LinkedIn. Inclui busca avançada, rastreamento de candidaturas, geração de cover letters IA e monitoramento anti-detect. [GitHub](https://github.com/produtoramaxvision/maxvision-linkedin-mcp) | [Docs](https://linkedin-maxvision.produtoramaxvision.com.br/docs)
```

### Checklist específico awesome-claude-code

- [ ] Descrição clara e concisa (< 150 caracteres)
- [ ] Link direto para repo GitHub
- [ ] Plugin já funcional (não alpha/beta)
- [ ] Documentação pública e em inglês
- [ ] Sem conflito com plugins existentes
- [ ] Responder reviews com informações adicionais se solicitado

---

## Estratégia de Rollout

**Ordem recomendada de submissão:**

1. **MCP.so** (semana 1)
   - Maior audiência de desenvolvedores Claude Code
   - Review mais rigoroso → conseguir aprovação aqui valida qualidade
   
2. **Smithery.ai** (semana 2, após MCP.so aprovado)
   - Público mais técnico, valida enterprise readiness
   
3. **Glama.ai** (semana 2, paralelo com Smithery)
   - Review rápido, community-driven
   - Bom para SEO/backlinks
   
4. **awesome-claude-code (GitHub)** (semana 3, após aprovações anteriores)
   - Requer histórico de sucesso em outros marketplaces
   - Mais visibilidade a longo prazo
   
5. **awesome-mcp-servers (GitHub)** (semana 3, paralelo com Anthropic)
   - Community list, menos rigoroso
   - Bom complemento para SEO

**Total estimado**: 3-4 semanas até todas as submissões aprovadas

---

## Métricas a monitorar pós-submissão

### KPIs por marketplace

| Métrica | Target | Ferramenta |
|---|---|---|
| Instalações/semana | > 10 | npm/plugin registry logs |
| Conversão free→Pro | > 2% | Stripe analytics |
| Issues abertos/mês | < 5 | GitHub issues |
| Response time (suporte) | < 24h | Email/Zendesk |
| NPS via pesquisa email | > 8.0 | SurveyMonkey ou typeform |
| GitHub stars | > 50 | GitHub repo |
| Uptime MCP server | > 99.5% | Sentry/Cloudflare |

### Dashboard recomendado

Criar arquivo `monitoring/marketplace-dashboard.json` com webhooks para:
- Stripe transactions (via webhook)
- GitHub releases/stars (via GitHub API)
- Sentry error rates (via Sentry API)
- MCP.so/Smithery/Glama views (manual weekly check)

---

## Checklist final pré-submissão

Antes de enviar para qualquer marketplace:

- [ ] Código faz lint check: `pnpm lint`
- [ ] Testes passam: `pnpm test`
- [ ] MCP validate: `claude plugin validate plugins/linkedin-maxvision`
- [ ] README.md sem typos (usar tool `spell-check`)
- [ ] Links de documentação funcionam (usar tool `link-check`)
- [ ] Screenshots/GIFs com marcas de branding consistentes
- [ ] Email de suporte testado (enviar test message, responder em < 2h)
- [ ] Versão em `package.json` e `plugin.json` sincronizadas
- [ ] CHANGELOG.md atualizado com mudanças recentes
- [ ] Todos os secrets de test removidos (audit via `git secrets`)
- [ ] Uma pessoa diferente fez code review (não auto-approve)

---

## Contatos e Links Úteis

### Marketplaces

| Marketplace | Email suporte | Link direto |
|---|---|---|
| MCP.so | support@mcp.so | https://mcp.so/submit |
| Smithery.ai | contact@smithery.ai | https://smithery.ai/submit |
| Glama.ai | support@glama.ai | https://glama.ai/mcp-servers |
| Anthropic | partners@anthropic.com | https://github.com/anthropics/awesome-claude-code |
| awesome-mcp | @punkpeye (GitHub) | https://github.com/punkpeye/awesome-mcp-servers |

### Documentação

- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [Claude Code Plugin Docs](https://claude.ai/docs/plugins)
- [Stripe Marketplace Integration](https://stripe.com/docs/plugins)

---

## Histórico de submissões

| Data | Marketplace | Status | Link | Notas |
|---|---|---|---|---|
| - | MCP.so | Pendente | - | Aguardando produção estável |
| - | Smithery.ai | Pendente | - | Aguardando MCP.so aprovado |
| - | Glama.ai | Pendente | - | Paralelizar com Smithery |
| - | awesome-claude-code | Pendente | - | Pós-aprovação em MCP.so |
| - | awesome-mcp-servers | Pendente | - | Pós-aprovação em Anthropic |

---

**Responsável pela atualização**: technical-writer agent  
**Próxima revisão**: 2026-05-20 ou após milestone de produção estável
