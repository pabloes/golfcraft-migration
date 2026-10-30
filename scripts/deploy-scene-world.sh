#!/usr/bin/env bash
# Deploy the SDK7 scene to a Decentraland World (a NAME realm) for testing,
# e.g. pablo.dcl.eth, instead of the Genesis City parcels.
#
#   bash scripts/deploy-scene-world.sh pablo.dcl.eth [port] [base]
#
# Builds the production bundle (scripts/build-scene-prod.sh: real backend and
# PlayFab title), adds `worldConfiguration.name` to scene.json just for the
# upload and restores scene.json afterwards, even if the deploy fails. Without
# `base` the World places the scene at the Genesis parcels (47,-45); with it
# (e.g. -4,0) the whole footprint moves so its base parcel lands there. The
# scene's code only uses positions relative to its base, so nothing else moves.
# List what the World already has with
#   curl -s https://worlds-content-server.decentraland.org/world/<name>/scenes
# The deploy waits for the wallet signature at http://localhost:<port>/.
# Only the NAME's owner can sign. Players enter with the realm `<name>`.
# --multi-scene: the World keeps its other scenes (a plain deploy DELETES every
# other scene in the World first); only ours, at the same parcels, is replaced.
set -euo pipefail
NAME="${1:?usage: deploy-scene-world.sh <name.dcl.eth> [port] [base x,y]}"
PORT="${2:-8005}"
BASE="${3:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENE="$ROOT/scene"
SCENE_JSON="$SCENE/scene.json"
BACKUP="$SCENE/scene.json.local-backup"

restore() {
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" "$SCENE_JSON"
    echo "scene.json restored (no worldConfiguration)"
  fi
}
trap restore EXIT

bash "$ROOT/scripts/build-scene-prod.sh"

cp "$SCENE_JSON" "$BACKUP"
python3 - "$SCENE_JSON" "$NAME" "$BASE" <<'PYEOF'
import json, sys
path, name, base = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(path))
data['worldConfiguration'] = {'name': name}
if base:
    scene = data['scene']
    bx, by = map(int, scene['base'].split(','))
    nx, ny = map(int, base.split(','))
    shift = lambda p: '%d,%d' % (int(p.split(',')[0]) - bx + nx, int(p.split(',')[1]) - by + ny)
    scene['parcels'] = [shift(p) for p in scene['parcels']]
    scene['base'] = shift(scene['base'])
    print(f"scene.json: base {bx},{by} -> {scene['base']}, parcels {' '.join(scene['parcels'])}")
json.dump(data, open(path, 'w'), indent=2)
print(f"scene.json: worldConfiguration.name = {name}")
PYEOF

cd "$SCENE"
yes | npx sdk-commands deploy --skip-build --multi-scene --port "$PORT" --target-content https://worlds-content-server.decentraland.org
