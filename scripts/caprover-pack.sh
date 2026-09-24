#!/usr/bin/env bash
# Build the slim tarball CapRover should receive for one app.
#
#   bash scripts/caprover-pack.sh ws|web|chain
#   caprover deploy -t deploy/<app>.tar -a golfcraft-<app>
#
# Why this exists: `caprover deploy` from the repo uploads EVERY committed file
# (371M here — .dockerignore only applies to the build, not to the upload), and
# CapRover's nginx answers 413. This packs only what the app's Dockerfile
# copies, with captain-definition at the root of the tar as CapRover expects.
#
# It also excludes the .env files: this packs the WORKING DIRECTORY, not the
# git index, so without that exclusion the secrets would ride into the image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-}"

case "$APP" in
  ws)
    DEF="captain-definition-ws"; DOCKERFILE="deploy/ws.Dockerfile"
    PATHS=(package.json package-lock.json common lib pet-store-service scene/golfplay server)
    ;;
  web)
    DEF="captain-definition-web"; DOCKERFILE="deploy/web.Dockerfile"
    PATHS=(package.json package-lock.json common lib chain-playfab/security web)
    ;;
  chain)
    DEF="captain-definition-chain-playfab"; DOCKERFILE="deploy/chain-playfab.Dockerfile"
    PATHS=(package.json package-lock.json common contracts/metadata-server/catalog.json chain-playfab)
    ;;
  *)
    echo "usage: bash scripts/caprover-pack.sh ws|web|chain" >&2
    exit 1
    ;;
esac

OUT="$ROOT/deploy/$APP.tar"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT"
rsync -a --relative \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' --exclude '*.env' --exclude '.secret' --exclude '*.pem' \
  --exclude '*.log' \
  --exclude 'scene/golfplay/models' \
  --exclude 'scene/golfplay/images' \
  --exclude 'scene/golfplay/sounds' \
  --exclude 'web/metadata' \
  "${PATHS[@]}" "$STAGE/"

mkdir -p "$STAGE/deploy"
cp "$ROOT/$DOCKERFILE" "$STAGE/deploy/"
cp "$ROOT/deploy/$DEF" "$STAGE/captain-definition"

tar -cf "$OUT" -C "$STAGE" .
echo "$OUT  ($(du -h "$OUT" | cut -f1))"
echo "deploy with: caprover deploy -t deploy/$APP.tar -a golfcraft-$APP"
