#!/usr/bin/env bash
# Send a message to everyone in the game, right now, with no deploy.
#
#   bash scripts/broadcast.sh "Free Energy week: Ranked runs cost nothing"
#   bash scripts/broadcast.sh "texto" 45000      # 45 s on screen (default 30 s)
#   bash scripts/broadcast.sh --dry-run "texto"  # show who would get it
#
# How it works. The colyseus monitor exposes `*/monitor/api/room/call`, which
# runs any method of a room through matchMaker.remoteRoomCall. `broadcast` is
# a real Room method, so this reaches EVERY client of the shared lobby room at
# once, unlike the monitor's own UI, which only sends to one client at a time.
#
# The scene receives it in src/meta/game-lobby.ts as the message type `server`
# with {message, timeout} and shows it as the toast at the top. It strips
# <color=...> markup, so send plain text.
#
# The monitor's password lives in server/server.ts (and should move to an
# environment variable before this repo is public); it is read from there and
# never printed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${BROADCAST_HOST:-https://ws.golfcraftgame.com}"
LOBBY_ROOM="gameLobbyRoom"

DRY=""
if [ "${1:-}" = "--dry-run" ]; then DRY="1"; shift; fi
MESSAGE="${1:-}"
TIMEOUT="${2:-30000}"

if [ -z "$MESSAGE" ]; then
  echo "usage: bash scripts/broadcast.sh [--dry-run] \"your message\" [timeout_ms]" >&2
  exit 1
fi

USER_NAME="$(grep -A3 'users: {' "$ROOT/server/server.ts" | grep -oE '"[^"]+": *"[^"]+"' | head -1 | sed 's/": *".*//; s/^"//')"
PASSWORD="$(grep -A3 'users: {' "$ROOT/server/server.ts" | grep -oE '"[^"]+": *"[^"]+"' | head -1 | sed 's/.*: *"//; s/"$//')"
if [ -z "$PASSWORD" ]; then echo "could not read the monitor password from server/server.ts" >&2; exit 1; fi

ROOM_JSON="$(curl -s -u "$USER_NAME:$PASSWORD" "$HOST/monitor/api/")"
ROOM_ID="$(printf '%s' "$ROOM_JSON" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const rooms=(JSON.parse(s).rooms||[]).filter(r=>r.name==='$LOBBY_ROOM');
  if(!rooms.length) process.exit(3);
  console.log(rooms.sort((a,b)=>b.clients-a.clients)[0].roomId);
})")"
CLIENTS="$(printf '%s' "$ROOM_JSON" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=(JSON.parse(s).rooms||[]).find(r=>r.roomId==='$ROOM_ID');
  console.log(r?r.clients:0);
})")"

echo "lobby room $ROOM_ID, $CLIENTS players connected"
if [ -n "$DRY" ]; then
  echo "dry run: would send \"$MESSAGE\" for ${TIMEOUT}ms"
  exit 0
fi

ARGS="$(node -e "console.log(encodeURIComponent(JSON.stringify(['server', {message: process.argv[1], timeout: Number(process.argv[2])}])))" "$MESSAGE" "$TIMEOUT")"
curl -s -u "$USER_NAME:$PASSWORD" "$HOST/monitor/api/room/call?roomId=$ROOM_ID&method=broadcast&args=$ARGS" >/dev/null
echo "sent to $CLIENTS players"
