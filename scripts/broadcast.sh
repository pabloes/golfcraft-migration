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
# If the deployed server does not have that route yet, it falls back to the
# colyseus monitor, which can call `broadcast` on a room through
# `*/monitor/api/room/call`. The monitor's credentials come from
# MONITOR_USER / MONITOR_PASSWORD, or from server/server.ts on an older
# deploy that still had them hardcoded.
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

ONLINE="$(curl -s "$HOST/online" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { console.log(JSON.parse(s).inScene ?? '?') } catch(e) { console.log('?') }
})")"
echo "$ONLINE players in the scene"

if [ -n "$DRY" ]; then
  echo "dry run: would send \"$MESSAGE\" for ${TIMEOUT}ms"
  exit 0
fi

BODY="$(node -e "console.log(JSON.stringify({apiKey: process.argv[1], message: process.argv[2], timeout: Number(process.argv[3])}))" "$KEY" "$MESSAGE" "$TIMEOUT")"
ANSWER="$(curl -s -X POST "$HOST/admin-broadcast" -H "Content-Type: application/json" --data "$BODY")"
if printf '%s' "$ANSWER" | grep -q "Cannot POST"; then
  echo "that server has no /admin-broadcast yet, going through the monitor"
  MON_USER="${MONITOR_USER:-golfcraft}"
  #`set -e` kills the script if this grep finds nothing, which is exactly what
  #happens now that the password is no longer in the source, so swallow it
  MON_PASS="${MONITOR_PASSWORD:-}"
  if [ -z "$MON_PASS" ]; then
    MON_PASS="$(grep -A3 'users: {' "$ROOT/server/server.ts" 2>/dev/null | grep -oE '"[^"]+": *"[^"]+"' | head -1 | sed 's/.*: *"//; s/"$//' || true)"
  fi
  if [ -z "$MON_PASS" ]; then
    echo "the deployed server has no /admin-broadcast and this one has no monitor password." >&2
    echo "Either deploy ws, or run it again with MONITOR_PASSWORD=... in front." >&2
    exit 1
  fi
  ROOM_ID="$(curl -s -u "$MON_USER:$MON_PASS" "$HOST/monitor/api/" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=(JSON.parse(s).rooms||[]).filter(x=>x.name==='gameLobbyRoom').sort((a,b)=>b.clients-a.clients)[0];
  if(!r) process.exit(3);
  console.log(r.roomId);
})")"
  ARGS="$(node -e "console.log(encodeURIComponent(JSON.stringify(['server', {message: process.argv[1], timeout: Number(process.argv[2])}])))" "$MESSAGE" "$TIMEOUT")"
  curl -s -u "$MON_USER:$MON_PASS" "$HOST/monitor/api/room/call?roomId=$ROOM_ID&method=broadcast&args=$ARGS" >/dev/null
  echo "sent through the monitor to room $ROOM_ID"
  exit 0
fi
printf '%s' "$ANSWER" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const j=JSON.parse(s); console.log(j.error ? ('refused: '+j.error) : ('sent to '+(j.sent ?? '?')+' players')) }
  catch(e) { console.log('unexpected answer:', s.slice(0,200)) }
})"
