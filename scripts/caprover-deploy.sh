#!/usr/bin/env bash
# Pack AND deploy one CapRover app in a single command, always from committed code.
#
#   bash scripts/caprover-deploy.sh ws|web|chain [ref] [--pack-only] [--force]
#
# Why this exists: packing and deploying used to be two commands, and on
# 2026-11-07 production ran a web image from 2026-11-02 for five days because a
# `caprover deploy` was run against a deploy/web.tar that had not been rebuilt.
# The music, the free-energy window, the market report, the admin dashboard, the
# NFT club index and the 24h leaderboard were all missing from the live site
# while every one of them was committed and green locally. There is no way to
# look at a tar and tell how old it is, so the fix is to never hand-deploy one:
# this script builds the tar and uploads THAT file, in the same run.
#
# It also builds from a detached worktree of `ref` (default HEAD), because
# caprover-pack.sh packs the WORKING DIRECTORY and several Claude sessions edit
# this repo at once — deploying from the shared checkout ships their half-done
# work. See .claude/CLAUDE.md §13 and the "deploy from a clean worktree" rule.
#
# A worktree has no gitignored files (the root .gitignore ignores every *.js),
# and that has already broken production once: the ws image built from a
# worktree lacked lib/expression-storage/_expression-storage.js, so every switch
# and trigger area in the game stopped working. So the ignored files under the
# app's own paths are copied in from the main checkout, and the list is printed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAPROVER_MACHINE="${CAPROVER_MACHINE:-captain-01}"

APP=""; REF="HEAD"; PACK_ONLY=0; FORCE=0
for arg in "$@"; do
  case "$arg" in
    --pack-only) PACK_ONLY=1 ;;
    --force) FORCE=1 ;;
    -*) echo "unknown flag: $arg" >&2; exit 1 ;;
    ws|web|chain) [ -z "$APP" ] && APP="$arg" || REF="$arg" ;;
    *) REF="$arg" ;;
  esac
done

if [ -z "$APP" ]; then
  cat >&2 <<USAGE
usage: bash scripts/caprover-deploy.sh ws|web|chain [ref] [--pack-only] [--force]

  ref         commit/branch/tag to deploy (default HEAD). Always committed code.
  --pack-only build and check the tar, print its path, do not upload.
  --force     skip the ws drain check (see below).

  ws deploys drop every live room, so this refuses to deploy ws while players
  are in a match (GET /online "playing" > 0). Close the game window from the
  admin dashboard ("Stop new games"), wait for playing to reach 0, then deploy.
USAGE
  exit 1
fi

# The app's own files, mirroring the Dockerfile's COPY lines. Kept in sync with
# caprover-pack.sh, which is what actually packs them.
case "$APP" in
  ws)   PATHS=(package.json package-lock.json common lib pet-store-service scene/golfplay server) ;;
  web)  PATHS=(package.json package-lock.json common lib chain-playfab/security web) ;;
  chain) PATHS=(package.json package-lock.json common contracts/metadata-server/catalog.json chain-playfab) ;;
esac

command -v caprover >/dev/null || { echo "caprover CLI not found (npm i -g caprover)" >&2; exit 1; }
cd "$ROOT"
COMMIT="$(git rev-parse --short "$REF")" || { echo "no such ref: $REF" >&2; exit 1; }
SUBJECT="$(git log -1 --format=%s "$REF")"

echo "app      golfcraft-$APP  (machine $CAPROVER_MACHINE)"
echo "commit   $COMMIT  $SUBJECT"

# What will NOT ship: uncommitted work under this app's paths. Not an error —
# deploying committed code is the point — but it must not be a surprise.
DIRTY="$(git status --porcelain -- "${PATHS[@]}" | sed 's/^/           /')"
[ -n "$DIRTY" ] && { echo "uncommitted (NOT shipping):"; echo "$DIRTY"; }

# A ws deploy restarts the process and every room with it.
if [ "$APP" = ws ] && [ "$PACK_ONLY" = 0 ] && [ "$FORCE" = 0 ]; then
  ONLINE="$(curl -fsS --max-time 10 https://ws.golfcraftgame.com/online || true)"
  PLAYING="$(printf '%s' "$ONLINE" | sed -n 's/.*"playing":\([0-9]*\).*/\1/p')"
  echo "online   ${ONLINE:-unreachable}"
  if [ -n "$PLAYING" ] && [ "$PLAYING" -gt 0 ]; then
    echo "REFUSING: $PLAYING client(s) in a match — a ws deploy would drop them." >&2
    echo "Stop new games in the admin dashboard, wait for playing:0, or pass --force." >&2
    exit 1
  fi
fi

WT="$(mktemp -d "${TMPDIR:-/tmp}/golfcraft-deploy-$APP.XXXXXX")"
cleanup() { cd "$ROOT"; git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"; }
trap cleanup EXIT

git worktree add --detach --quiet "$WT" "$COMMIT"

# Gitignored files the image needs: copy them in, and say which. Skipped on
# purpose: node_modules (npm ci rebuilds it), anything .env (secrets must never
# enter the tar), .DS_Store, web/metadata (the pack excludes it) and
# web/client/src (webpack sources; the server serves web/client/dist).
COPIED=0
while IFS= read -r f; do
  case "$f" in
    */node_modules/*|node_modules/*) continue ;;
    *.env|*/.env|.env) continue ;;
    *.pem|*.secret|*/.DS_Store|.DS_Store) continue ;;
    web/metadata/*|web/client/src/*) continue ;;
  esac
  [ -f "$ROOT/$f" ] || continue
  mkdir -p "$WT/$(dirname "$f")"
  cp -p "$ROOT/$f" "$WT/$f"
  printf '           %s\n' "$f"
  COPIED=$((COPIED + 1))
done < <(git ls-files --others --ignored --exclude-standard -- "${PATHS[@]}")
echo "ignored  $COPIED file(s) copied from the checkout"

bash "$WT/scripts/caprover-pack.sh" "$APP" >/dev/null
TAR="$WT/deploy/$APP.tar"
[ -f "$TAR" ] || { echo "pack produced no tar" >&2; exit 1; }

# Two things no deploy may ever get wrong.
if tar -tf "$TAR" | grep -qE '(^|/)[^/]*\.env$'; then
  echo "REFUSING: the tar contains a .env file." >&2
  tar -tf "$TAR" | grep -E '(^|/)[^/]*\.env$' >&2
  exit 1
fi
tar -tf "$TAR" | grep -qx './captain-definition' || {
  echo "REFUSING: no captain-definition at the root of the tar." >&2; exit 1; }

echo "tar      $TAR  ($(du -h "$TAR" | cut -f1), $(tar -tf "$TAR" | wc -l | tr -d ' ') entries)"

# The stale tar that caused the 2026-11-07 incident. Nothing reads it, and
# leaving it invites the same hand-deploy again.
if [ -f "$ROOT/deploy/$APP.tar" ]; then
  rm -f "$ROOT/deploy/$APP.tar"
  echo "removed  deploy/$APP.tar from the checkout (stale by construction)"
fi

if [ "$PACK_ONLY" = 1 ]; then
  cp "$TAR" "${TMPDIR:-/tmp}/golfcraft-$APP-$COMMIT.tar"
  trap - EXIT; cleanup
  echo "pack-only: ${TMPDIR:-/tmp}/golfcraft-$APP-$COMMIT.tar"
  exit 0
fi

# Long flags only: `-t` is both --tarFile and --appToken, and `--default`
# ignores -t/-a entirely and redeploys whatever that directory last deployed
# (on 2026-11-02 that restarted golfcraft-ws instead of deploying web).
# Run from the worktree so the stored per-directory defaults die with it.
cd "$WT"
caprover deploy \
  --caproverName "$CAPROVER_MACHINE" \
  --caproverApp "golfcraft-$APP" \
  --tarFile "$TAR"

echo
echo "deployed golfcraft-$APP @ $COMMIT"
case "$APP" in
  web) echo "verify   curl -sI https://golfcraftgame.com/music/jungle_wonders.mp3 | head -3" ;;
  ws)  echo "verify   curl -s https://ws.golfcraftgame.com/online" ;;
  chain) echo "verify   curl -s https://chain.golfcraftgame.com/ping" ;;
esac
