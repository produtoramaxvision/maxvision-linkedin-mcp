#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
# Sprint 1: minimal — extract latency, log if > 5000ms
LATENCY=$(echo "$INPUT" | python -c "import sys,json; r=json.load(sys.stdin).get('tool_response',{}); print(r.get('latency_ms',0))" 2>/dev/null || echo 0)
if [ "$LATENCY" -gt 5000 ] 2>/dev/null; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"⏱ Tool levou ${LATENCY}ms — possivelmente rate-limit estourado ou rede lenta.\"}}"
else
  echo "{}"
fi
