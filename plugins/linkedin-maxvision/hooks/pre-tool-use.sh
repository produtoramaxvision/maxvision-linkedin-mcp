#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")

PRO_TOOLS="apply_easy send_message post_update search_people"

if echo "$PRO_TOOLS" | grep -qw "$TOOL"; then
  LICENSE="${MAXVISION_LICENSE:-}"
  if [ -z "$LICENSE" ]; then
    echo "{\"hookSpecificOutput\":{\"permissionDecision\":\"block\",\"permissionDecisionReason\":\"$TOOL requer licença Pro. Adquira em https://linkedin.produtoramaxvision.com.br/pricing e defina a variável de ambiente MAXVISION_LICENSE antes de usar este tool.\"}}"
    exit 0
  fi
fi

echo '{"hookSpecificOutput":{"permissionDecision":"allow","permissionDecisionReason":"ok"}}'
