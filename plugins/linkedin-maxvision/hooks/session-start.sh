#!/usr/bin/env bash
# session-start.sh — ToS disclaimer once per session
set -euo pipefail
cat <<EOF
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"⚠ MaxVision LinkedIn Suite carregado. Respeite LinkedIn ToS: tools acessam apenas dados públicos disponíveis ao seu cookie autenticado. Rate-limit ativo por padrão. Use /linkedin-status para checar saúde da conta."}}
EOF
