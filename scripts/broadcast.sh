#!/usr/bin/env bash
# Send a message to everyone in the game.
#
#   bash scripts/broadcast.sh "Free Energy week: Ranked runs cost nothing"
#   bash scripts/broadcast.sh "texto" 45000      # 45 s on screen (default 30 s)
#   bash scripts/broadcast.sh --dry-run "texto"  # show who would get it
#
# It posts to the game server's `*/admin-broadcast`, which sends to every
# client of the shared lobby room at once. Everybody in the scene is in that
# room, players mid-match included.
#
# The scene receives it in src/meta/game-lobby.ts as the message type `server`
# with {message, timeout} and shows it as the toast at the top. It strips
# <color=...> markup, so send plain text. The message only reaches whoever is
# connected right now: it is not stored for anyone who arrives later.
#
# The api key is GOLF_API_KEY, read from web/.env and never printed. The same
# thing with a text box is at golfcraftgame.com/admin-dashboard.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${BROADCAST_HOST:-https://ws.golfcraftgame.com}"

DRY=""
if [ "${1:-}" = "--dry-run" ]; then DRY="1"; shift; fi
MESSAGE="${1:-}"
TIMEOUT="${2:-30000}"

if [ -z "$MESSAGE" ]; then
  echo "usage: bash scripts/broadcast.sh [--dry-run] \"your message\" [timeout_ms]" >&2
  exit 1
fi

KEY="$(grep -E '^GOLF_API_KEY=' "$ROOT/web/.env" | head -1 | sed 's/^GOLF_API_KEY=//; s/^"//; s/"$//')"
if [ -z "$KEY" ]; then echo "GOLF_API_KEY not found in web/.env" >&2; exit 1; fi

STATUS="$(curl -s -X POST "$HOST/admin-status" -H "Content-Type: application/json" \
  --data "$(node -e "console.log(JSON.stringify({apiKey: process.argv[1]}))" "$KEY")")"
ONLINE="$(printf '%s' "$STATUS" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const j=JSON.parse(s); console.log(j.inScene ?? '?') } catch(e) { console.log('?') }
})")"
echo "$ONLINE players in the scene"

if [ -n "$DRY" ]; then
  echo "dry run: would send \"$MESSAGE\" for ${TIMEOUT}ms"
  exit 0
fi

BODY="$(node -e "console.log(JSON.stringify({apiKey: process.argv[1], message: process.argv[2], timeout: Number(process.argv[3])}))" "$KEY" "$MESSAGE" "$TIMEOUT")"
curl -s -X POST "$HOST/admin-broadcast" -H "Content-Type: application/json" --data "$BODY" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const j=JSON.parse(s); console.log(j.error ? ('refused: '+j.error) : ('sent to '+(j.sent ?? '?')+' players')) }
  catch(e) { console.log('unexpected answer:', s.slice(0,200)) }
})"
