#!/usr/bin/env bash
# Stop the GolfCraft local backend (web, colyseus, preview, chain-playfab, tunnel).
# MySQL/podman is left running (it persists on its own).
for p in 2569 2567 8001 2568; do
  pid=$(lsof -ti :"$p" -sTCP:LISTEN 2>/dev/null)
  [ -n "$pid" ] && { echo "stop :$p ($pid)"; kill $pid 2>/dev/null; }
done
pkill -f "cloudflared tunnel --url http://localhost:2567" 2>/dev/null && echo "stop game tunnel"
pkill -f "cloudflared tunnel --url http://localhost:8001" 2>/dev/null && echo "stop preview tunnel"
echo "done (mysql/podman left running)"
