#!/usr/bin/env bash
# Deploy the SDK7 scene to a Decentraland World (a NAME realm) for testing,
# e.g. pablo.dcl.eth, instead of the Genesis City parcels.
#
#   bash scripts/deploy-scene-world.sh pablo.dcl.eth [port]
#
# Builds the production bundle (scripts/build-scene-prod.sh: real backend and
# PlayFab title), adds `worldConfiguration.name` to scene.json just for the
# upload (the parcels stay as they are, so the World places the scene at the
# same 47,-45) and restores scene.json afterwards, even if the deploy fails.
# The deploy waits for the wallet signature at http://localhost:<port>/.
# Only the NAME's owner can sign. Players enter with the realm `<name>`.
# --multi-scene: the World keeps its other scenes (a plain deploy DELETES every
# other scene in the World first); only ours, at the same parcels, is replaced.
set -euo pipefail
NAME="${1:?usage: deploy-scene-world.sh <name.dcl.eth> [port]}"
PORT="${2:-8005}"
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
python3 - "$SCENE_JSON" "$NAME" <<'PYEOF'
import json, sys
path, name = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data['worldConfiguration'] = {'name': name}
json.dump(data, open(path, 'w'), indent=2)
print(f"scene.json: worldConfiguration.name = {name}")
PYEOF

cd "$SCENE"
yes | npx sdk-commands deploy --skip-build --multi-scene --port "$PORT" --target-content https://worlds-content-server.decentraland.org
