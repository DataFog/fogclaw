#!/usr/bin/env bash
# Sends E2E test results to a Discord webhook.
# Required env vars: DISCORD_WEBHOOK_URL, E2E_STATUS
# Optional env vars: GITHUB_RUN_URL, COMMIT_SHA, COMMIT_REF

set -euo pipefail

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
  echo "DISCORD_WEBHOOK_URL not set — skipping notification"
  exit 0
fi

STATUS="${E2E_STATUS:-unknown}"
RUN_URL="${GITHUB_RUN_URL:-local run}"
SHA="${COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
REF="${COMMIT_REF:-$(git branch --show-current 2>/dev/null || echo 'unknown')}"

if [ "$STATUS" = "success" ]; then
  COLOR=3066993   # green
  TITLE="E2E Tests Passed"
  EMOJI="white_check_mark"
else
  COLOR=15158332  # red
  TITLE="E2E Tests Failed"
  EMOJI="x"
fi

PAYLOAD=$(cat <<EOF
{
  "embeds": [{
    "title": ":${EMOJI}: ${TITLE}",
    "color": ${COLOR},
    "fields": [
      { "name": "Status", "value": "${STATUS}", "inline": true },
      { "name": "Branch", "value": "${REF}", "inline": true },
      { "name": "Commit", "value": "\`${SHA}\`", "inline": true },
      { "name": "Run", "value": "${RUN_URL}", "inline": false }
    ],
    "footer": { "text": "FogClaw E2E • $(date -u '+%Y-%m-%d %H:%M UTC')" }
  }]
}
EOF
)

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$DISCORD_WEBHOOK_URL")

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "Discord notification sent (HTTP ${HTTP_CODE})"
else
  echo "Discord notification failed (HTTP ${HTTP_CODE})"
  exit 1
fi
