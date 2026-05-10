# Historical docs

Design-phase artifacts kept for audit. **Not authoritative for current code.**
Plugin shipped v0.13.13 LIVE; everything below was pre-implementation scaffolding.

| Archived doc | Original purpose | Replaced by |
|---|---|---|
| `MARKETPLACE-DECISION.md` | Pre-launch comparison of marketplace hosting options. Decision: dedicated marketplace `maxvision-linkedin-suite`. | Decision is enacted: live at github.com/produtoramaxvision/maxvision-linkedin-mcp |
| `MARKETPLACE-CREATION-RUNBOOK.md` | Sprint 0 setup runbook (repos, DNS, CI, license server). | Sprint 0 done. Live infra references in `sprint0-deliverables/`. |
| `INFOPRODUCT-PACKAGING.md` | Packaging blueprint (repo structure, licensing dual, CI/CD, distribution). | Implemented. License live in `LICENSE` (AGPL-3.0); Pro/Agency EULA via license server. |
| `blueprints/PLAN-A-claude-code-only.md` | Standalone variant design (10 tools, Patchright, single MCP). | Shipped + exceeded: **16 tools** in `mcp-server/src/tools/`. Apify+BD backbone added in Sprint 7. |
| `blueprints/PLAN-B-hybrid-n8n.md` | Hybrid variant with n8n orchestration (4+2 workflows). | Shipped: workflows in `plugins/linkedin-maxvision/n8n-workflows/`, `/linkedin-setup-n8n` command. |
| `sprint1-PLAN.md` | Per-file Sprint 1 implementation plan (37 files). | Shipped — all 37 files exist plus Sprint 2-7 expansion. |

## Why we kept them

Git log preserves all moves. These docs occupy < 200 KB and trace the design
path. Future contributors auditing **why** decisions were made (e.g. AGPL-3.0,
marketplace separation, Patchright over Playwright) get the original context
without grepping through closed PRs.

## When to delete

Once the project hits v1.0.0 stable + 6 months of public usage with no
reference to these docs, drop the entire `docs/historical/` tree.
