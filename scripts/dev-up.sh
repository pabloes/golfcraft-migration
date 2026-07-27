#!/usr/bin/env bash
# One-command bring-up of the GolfCraft local backend (manifest: scripts/dev-services.json).
# Idempotent: only starts what's down. Services are launched DETACHED (nohup +
# subshell) so they outlive the shell that started them. The cloudflared tunnel
# URL changes every run, so we write it into common/constants.ts (SERVER_URL)
# and rebuild the scene automatically.
#
#   bash scripts/dev-up.sh            # bring everything up
#   bash scripts/dev-up.sh --status   # just print status, start nothing
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/scripts/.dev-logs"; mkdir -p "$LOGS"
STATUS_ONLY="${1:-}"

up() { lsof -ti :"$1" -sTCP:LISTEN >/dev/null 2>&1; }
tunnel_running() { pgrep -f "cloudflared tunnel --url http://localhost:2567" >/dev/null 2>&1; }
spawn() { # name cwd cmd
  local name="$1" cwd="$2"; shift 2
  ( cd "$cwd" && nohup bash -lc "$*" >"$LOGS/$name.log" 2>&1 & )
  echo "  ↑ $name  (log: scripts/.dev-logs/$name.log)"
}

if [ "$STATUS_ONLY" = "--status" ]; then
  echo "== golfcraft backend status =="
  for pair in "mysql:3306" "web:2569" "colyseus:2567" "preview:8001" "chain-playfab:2568" "onchain-queue:8111"; do
    n="${pair%%:*}"; p="${pair##*:}"
    up "$p" && echo "  ✓ $n ($p)" || echo "  ✗ $n ($p)"
  done
  tunnel_running && echo "  ✓ tunnel" || echo "  ✗ tunnel"
  echo "  WS_HOST: $(grep -oE '[a-z0-9-]+\.trycloudflare\.com' "$ROOT/common/constants.ts" | head -1)"
  exit 0
fi

echo "== golfcraft dev-up =="

# MySQL (podman — survives on its own). The podman MACHINE may be stopped (e.g.
# after a reboot), so ensure it's up first, then the container, then WAIT for
# 3306 to accept connections BEFORE starting web (web's startup queries the DB
# and used to die if MySQL wasn't ready yet).
if up 3306; then echo "✓ mysql 3306"; else
  echo "starting mysql (podman)…"
  podman machine start >/dev/null 2>&1 || true
  podman start golfcraft-mysql >/dev/null 2>&1 || echo "  ✗ podman start golfcraft-mysql failed"
  for _ in $(seq 1 20); do up 3306 && break; sleep 1; done
  up 3306 && echo "  ✓ mysql" || echo "  ✗ mysql (3306 not listening)"
fi

# web 2569 (needs MySQL up)
if up 2569; then echo "✓ web 2569"; else echo "starting web…"; spawn web "$ROOT/web" "npm run api"; fi

# colyseus 2567
if up 2567; then echo "✓ colyseus 2567"; else echo "starting colyseus…"; spawn colyseus "$ROOT/server" "npm run dev"; fi

# tunnel (+ WS_HOST + rebuild)
if tunnel_running; then
  echo "✓ tunnel (running; WS_HOST left as-is)"
else
  echo "starting cloudflared tunnel…"
  : > "$LOGS/tunnel.log"
  spawn tunnel "$ROOT" "cloudflared tunnel --url http://localhost:2567"
  url=""
  for _ in $(seq 1 40); do
    url=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGS/tunnel.log" 2>/dev/null | head -1)
    [ -n "$url" ] && break
    sleep 1
  done
  if [ -n "$url" ]; then
    host="${url#https://}"
    echo "  tunnel: $url"
    ROOT="$ROOT" HOST="$host" node -e 'const fs=require("fs");const f=process.env.ROOT+"/common/constants.ts";let s=fs.readFileSync(f,"utf8");s=s.replace(/: `[a-z0-9-]+\.trycloudflare\.com`;/, ": `"+process.env.HOST+"`;");fs.writeFileSync(f,s)'
    echo "  WS_HOST → $host ; rebuilding scene…"
    if ( cd "$ROOT/scene" && npx sdk-commands build ) >"$LOGS/build.log" 2>&1; then echo "  ✓ scene rebuilt"; else echo "  ✗ build failed:"; tail -4 "$LOGS/build.log"; fi
  else
    echo "  ✗ tunnel URL not captured — see scripts/.dev-logs/tunnel.log"
  fi
fi

# preview 8001
if up 8001; then echo "✓ preview 8001"; else echo "starting preview…"; spawn preview "$ROOT/scene" "npm run start -- --no-client --port 8001"; fi

# preview realm tunnel (https). The hosted bevy-web explorer can't reach a bare
# http://localhost:8001 realm reliably ("World not found"), so front the preview
# with its own cloudflared tunnel and hand out that https realm URL.
PREVIEW_REALM="http://127.0.0.1:8001"
if pgrep -f "cloudflared tunnel --url http://localhost:8001" >/dev/null; then
  echo "✓ preview tunnel (running)"
  PREVIEW_REALM=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGS/tunnel-preview.log" 2>/dev/null | head -1 || echo "$PREVIEW_REALM")
else
  echo "starting preview tunnel…"
  : > "$LOGS/tunnel-preview.log"
  ( nohup bash -lc "cloudflared tunnel --url http://localhost:8001" >"$LOGS/tunnel-preview.log" 2>&1 & )
  for _ in $(seq 1 30); do PREVIEW_REALM=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGS/tunnel-preview.log" 2>/dev/null | head -1); [ -n "$PREVIEW_REALM" ] && break; sleep 1; done
  [ -n "$PREVIEW_REALM" ] && echo "  preview realm: $PREVIEW_REALM" || { echo "  ✗ preview tunnel URL not captured"; PREVIEW_REALM="http://127.0.0.1:8001"; }
fi

# chain-playfab 2568 (golfclub NFT minter; optional, harmless if it fails)
if up 2568; then echo "✓ chain-playfab 2568"; else echo "starting chain-playfab…"; spawn chain-playfab "$ROOT/chain-playfab" "npm run dev"; fi

enc_realm=$(printf '%s' "$PREVIEW_REALM" | sed 's#:#%3A#g; s#/#%2F#g')
echo
echo "realm: $PREVIEW_REALM"
echo "open : https://decentraland.zone/bevy-web/?preview=true&realm=${enc_realm}&position=47%2C-45"
echo "(tip: 'bash scripts/dev-up.sh --status' to check, 'bash scripts/dev-down.sh' to stop)"
