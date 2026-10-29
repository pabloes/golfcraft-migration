#!/usr/bin/env bash
# Recent logs of a production backend, read from its /_logs route
# (common/log-buffer.ts: the last 5000 lines the process printed since it started).
#
#   bash scripts/backend-logs.sh web|ws|bridge|chain [lines] [text-to-grep]
#
# The token is LOGS_TOKEN in each CapRover app and lives locally in
# scripts/.logs-token (gitignored). It goes in a header, never in the URL, and
# reaches curl through a private header file, never on its command line (which
# any local user can read with ps). Only https URLs are accepted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/scripts/.logs-token"
SERVICE="${1:?usage: backend-logs.sh web|ws|bridge|chain [lines] [grep]}"
LINES="${2:-300}"
GREP="${3:-}"

case "$SERVICE" in
  web)    URL="https://golfcraftgame.com/api/_logs" ;;
  bridge) URL="https://golfcraftgame.com/bridge/_logs" ;;
  ws)     URL="https://ws.golfcraftgame.com/_logs" ;;
  chain)  URL="${CHAIN_URL:-https://golfcraft-chain.zeroxwork.com}/_logs" ;;
  *) echo "unknown service: $SERVICE (web|ws|bridge|chain)" >&2; exit 1 ;;
esac
case "$URL" in
  https://*) ;;
  *) echo "refusing a non-https URL: $URL" >&2; exit 1 ;;
esac
[ -s "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE" >&2; exit 1; }

HEADER_FILE="$(umask 077; mktemp)"
trap 'rm -f "$HEADER_FILE"' EXIT
chmod 600 "$HEADER_FILE"
printf 'Authorization: Bearer %s\n' "$(tr -d '[:space:]' < "$TOKEN_FILE")" > "$HEADER_FILE"

ARGS=(-sS -G --proto '=https' --max-time 20 --fail-with-body --data-urlencode "lines=$LINES")
[ -n "$GREP" ] && ARGS+=(--data-urlencode "grep=$GREP")
curl "${ARGS[@]}" -H "@$HEADER_FILE" "$URL"
