#!/usr/bin/env bash
# =====================================================================
# Sprint 0 — Step 1: criar repos GitHub público + privado
#
# REQUER aprovação manual antes de executar (cria recursos públicos).
# Pré-requisito: gh CLI logada como produtoramaxvision.
#
# DRY-RUN primeiro:
#   bash 01-create-repos.sh --dry-run
# Executar:
#   bash 01-create-repos.sh
# =====================================================================
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

run() {
  echo ">> $*"
  $DRY_RUN || "$@"
}

OWNER=produtoramaxvision
PUB_REPO=maxvision-linkedin-mcp
PRIV_REPO=maxvision-linkedin-mcp-pro

# --- Repo público ---
run gh repo create "$OWNER/$PUB_REPO" \
  --public \
  --description "Automação LinkedIn nativa para Claude Code: busca de vagas, candidatura, outreach e otimização de perfil. Suite oficial MaxVision." \
  --homepage "https://linkedin.maxvision.com.br" \
  --license AGPL-3.0 \
  --add-readme

# --- Repo privado ---
run gh repo create "$OWNER/$PRIV_REPO" \
  --private \
  --description "Tier Pro/Agency do MaxVision LinkedIn Suite. Apenas para colaboradores autorizados."

echo ""
echo "=== Próximos passos ==="
echo "1. cd ../.. && git remote add origin https://github.com/$OWNER/$PUB_REPO.git"
echo "2. git checkout -b homolog && git push -u origin homolog"
echo "3. git checkout -b main && git push -u origin main"
echo "4. Rodar 02-branch-protection.sh"
