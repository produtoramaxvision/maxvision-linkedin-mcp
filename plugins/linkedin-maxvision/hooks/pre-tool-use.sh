#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
# Sprint 1: pass-through with PII regex log only
TOOL=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_name','unknown'))")
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"Sprint 1 pass-through for $TOOL\"}}"
