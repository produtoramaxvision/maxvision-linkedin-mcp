#!/usr/bin/env bash
# =====================================================================
# Sprint 0 — Step 2: branch protection em main + homolog
# Pré-requisito: ambas branches existem e têm pelo menos 1 commit.
# =====================================================================
set -euo pipefail

OWNER=produtoramaxvision
PUB=maxvision-linkedin-mcp

# main — full protection
gh api -X PUT "repos/$OWNER/$PUB/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint + typecheck", "unit tests", "plugin validation"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# homolog — relaxed
gh api -X PUT "repos/$OWNER/$PUB/branches/homolog/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint + typecheck", "unit tests"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Branch protection aplicada em main + homolog."
