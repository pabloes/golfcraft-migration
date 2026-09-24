#!/usr/bin/env bash
# Build the SDK7 scene against PRODUCTION (ws.golfcraftgame.com + golfcraftgame.com).
#
# common/constants.ts is a compile-time switch shared by the scene and the
# server, and the repo keeps it on `false` so local dev never talks to prod.
# This flips it, builds, and flips it back even if the build fails — so a prod
# build can never be left behind in the working tree.
#
#   bash scripts/dev-up.sh          # local
#   bash scripts/build-scene-prod.sh   # production bundle in scene/bin
#
# ⚠ A scene built this way claims REAL season rewards (season-rewards-bridge
# enables the claim whenever USE_REMOTE_SERVER is true) and plays against the
# live PlayFab title. Only deploy it when that is what you want.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONSTANTS="$ROOT/common/constants.ts"

restore() {
  sed -i '' 's/export const USE_REMOTE_SERVER = true;/export const USE_REMOTE_SERVER = false;/' "$CONSTANTS"
  echo "USE_REMOTE_SERVER restored to false"
}
trap restore EXIT

grep -q 'export const USE_REMOTE_SERVER = false;' "$CONSTANTS" || {
  echo "constants.ts is not in the expected local state — check it by hand"; exit 1;
}
sed -i '' 's/export const USE_REMOTE_SERVER = false;/export const USE_REMOTE_SERVER = true;/' "$CONSTANTS"
echo "USE_REMOTE_SERVER = true; building scene…"

( cd "$ROOT/scene" && npx sdk-commands build )
echo "scene built against production hosts (scene/bin/index.js)"
