#!/usr/bin/env bash
# =====================================================================
# Sprint 0 — Step 3: secrets do CI + labels padrão
# Cada `gh secret set` abre prompt para colar o valor (não eco em log).
# =====================================================================
set -euo pipefail

OWNER=produtoramaxvision
PUB=maxvision-linkedin-mcp
PRIV=maxvision-linkedin-mcp-pro

echo "== Secrets repo público =="
echo "Cole cada valor quando solicitado. Pressione Ctrl+C para abortar."
gh secret set LI_COOKIE_SANDBOX --repo "$OWNER/$PUB"
gh secret set SLACK_WEBHOOK_URL --repo "$OWNER/$PUB" || echo "(slack opcional, skipped)"

echo ""
echo "== Secrets repo privado =="
gh secret set STRIPE_TEST_KEY --repo "$OWNER/$PRIV"
gh secret set STRIPE_WEBHOOK_SECRET --repo "$OWNER/$PRIV"
gh secret set CF_API_TOKEN --repo "$OWNER/$PRIV"
gh secret set CF_ACCOUNT_ID --repo "$OWNER/$PRIV"

echo ""
echo "== Labels padrão (público) =="
declare -A LABELS=(
  [bug]="d73a4a"
  [feature]="0e8a16"
  [compliance]="fbca04"
  [docs]="0075ca"
  [good-first-issue]="7057ff"
  [tier:free]="cccccc"
  [tier:pro]="1d76db"
  [tier:agency]="5319e7"
)
for label in "${!LABELS[@]}"; do
  gh label create "$label" --color "${LABELS[$label]}" --repo "$OWNER/$PUB" 2>/dev/null \
    || gh label edit "$label" --color "${LABELS[$label]}" --repo "$OWNER/$PUB"
done
echo "OK"
