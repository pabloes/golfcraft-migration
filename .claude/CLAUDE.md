# GolfCraft SDK6 → SDK7 Migration Guide

This file lives at `.claude/CLAUDE.md` and is auto-loaded by Claude Code on every session in this repo. Keep it terse, factual, and current. If a fix produces a learning, add a rule here so the same mistake doesn't recur.

---

## 0. Golden rule

**Mirror SDK6 production behaviour 100%.** The user is migrating an in-production minigolf game; "looks similar" is not enough. When in doubt, read the SDK6 source and port the exact same flow — same call order, same magic numbers, same parent/child structure, same async waits.

The SDK6 source is committed at `~/dev/ohmyverse/golfcraft/`. The working tree there has uncommitted partial-migration changes mixed in, so **always read SDK6 via `git show HEAD:<path>`** to get the clean production code, never via `cat`.

**Ignore `~/dev/ohmyverse/golfcraft/scene-sdk7/`** entirely. It is a previous failed migration attempt with its own choices and bugs. Even if it appears to solve a problem, do not copy from it.

---

## 1. Repo layout

```
golfcraft-migration/                <- this repo
├── .claude/CLAUDE.md               <- this file
├── scene/                          <- SDK7 scene (the migration target)
│   ├── src/                        <- SDK7-specific code we write
│   │   ├── index.ts                <- main() entry; root entity + bootstrap + NPC
│   │   ├── meta/
│   │   │   ├── bootstrap.ts        <- async boot: getUserData, PlayFab login, Colyseus client, decorateRemotePhysicParts
│   │   │   └── playfab-rest.ts     <- direct PlayFab Client REST (no playfab-sdk in sandbox)
│   │   ├── services/
│   │   │   ├── globalStore/        <- stub of SDK6 globalStore (game + userData states)
│   │   │   └── hide-avatars.ts     <- showAvatars/hideAvatars no-op
│   │   ├── components/
│   │   │   ├── lobby/
│   │   │   │   ├── building.ts             <- createBuilding (loads entire_building.gltf + sub-models from building-positions)
│   │   │   │   ├── building-positions.ts   <- 900+ lines of data (copied verbatim from SDK6)
│   │   │   │   ├── npc-storymode/
│   │   │   │   │   └── npc-storymode.ts    <- NPC scientist + mission dialog + requestStartMission
│   │   │   │   ├── golfplay-client.ts      <- Colyseus client + visual/physics orchestration
│   │   │   │   ├── golfplay-client-season.ts  <- STUB: createFixBugButton
│   │   │   │   ├── visualChest.ts          <- STUB: chest entities (not used in mission-1)
│   │   │   │   └── server-notification.ts  <- STUB: showMessage -> console.log
│   │   │   └── ui/
│   │   │       └── overlay.ts              <- STUB: fadeIn/fadeOut overlay
│   │   ├── types/cannon.d.ts       <- shim for cannon module (declared all types as `any`)
│   │   └── ui/                     <- ReactEcs UI components
│   │       ├── index.tsx           <- root <UiEntity> + setupUI()
│   │       ├── topbar-state.ts     <- mutable state for mission timer HUD
│   │       └── shoot-hud-state.ts  <- mutable state for power bar + control hint
│   ├── golfplay/                   <- migrated from SDK6 scene/golfplay/ (physics + visual + control)
│   │   ├── physics/                <- CANNON.js wrappers (world, ball, course-element-loader, models/*)
│   │   ├── src/components/         <- VisualBall, course visual, shoot-control, etc.
│   │   ├── src/gameplay-handlers/  <- gameplay-handler orchestrator + per-event handlers
│   │   ├── src/services/EventManagerFactory.ts
│   │   ├── src/editor/hole-part-registry.ts
│   │   ├── src/emissive-image.ts
│   │   ├── services/resource-repo.ts        <- getGLTFShape/getTexture (SDK7-compat configs)
│   │   ├── mana-fever-utils/lib/sound/avatar-sound.ts
│   │   └── models/                 <- 200+ .gltf/.bin physics part assets
│   ├── models/
│   │   ├── NPC.glb, NPC_Container_01.glb, NPC_Container_02.glb
│   │   └── building/ (82 sub-models)
│   ├── images/                     <- intro-screen.png, spritesheet.png, NPC/*.png
│   ├── sound/                      <- mp3s (avatar/electricity/japanese_fountain/sphere_teleporter/maps)
│   ├── state/index.ts              <- naive Proxy-backed reactive store (copied from SDK6, @ts-nocheck)
│   ├── assets/                     <- main.composite (legacy template, kept)
│   ├── bin/index.js                <- built scene bundle
│   ├── scene.json                  <- 10 parcels, base 47,-45, spawn (39-42, 0.9, 30-38)
│   ├── package.json                <- @dcl/sdk, @dcl-sdk/utils, dcl-npc-toolkit, cannon, colyseus.js
│   └── tsconfig.json               <- skipLibCheck:true, includes ../common, ../lib
├── common/                         <- SDK-agnostic shared code (copied from SDK6 common/)
│   ├── constants.ts                <- USE_REMOTE_SERVER=false, WS_HOST, SERVER_HTTP_URL (@ts-nocheck)
│   ├── utils.ts                    <- shared helpers (@ts-nocheck — legacy untyped params)
│   ├── physics-config.ts           <- CANNON tuning constants
│   ├── course-animations-migration.ts  <- (@ts-nocheck)
│   ├── frame-reproductor.ts        <- (@ts-nocheck)
│   ├── season-tier-definitions.ts  <- (@ts-nocheck)
│   └── course-definitions/         <- 240+ local course defs + repository (server-side fetches missing ones)
├── lib/
│   └── expression-storage/_expression-storage.ts  <- STUB: jsep evaluator (mission-1 doesn't use it)
└── server/rooms/mesages.ts         <- MESSAGE enum (copied from SDK6 server/)
```

Required external services (these MUST be running for the scene to work):
- **MySQL** on port 3306 (`podman start golfcraft-mysql`), DB `golfcraft` with restored backup from `~/dev/ohmyverse/golfcraft_backup_*.sql.gz`
  - ⚠ **The container runtime is podman, NOT Docker Desktop.** This machine has the `docker` CLI (Homebrew) but no docker daemon, so `docker ps` / `docker start ...` fail with *"Cannot connect to the Docker daemon"*. Use `podman ps` / `podman start golfcraft-mysql`. The VM is `podman-machine-default` (applehv); port 3306 is forwarded by `gvproxy`.
- **Web API** on port 2569 (`cd <repo>/web && npm run api`) — serves `/api/get-course` and `/api/parts`
- **Colyseus server** on port 2567 (`cd <repo>/server && npm run dev`) — defines `mission-room`
- **chain-playfab** on port 2568 (`cd <repo>/chain-playfab && npm run dev`) — golfclub NFT minter (`POST /mint-golf-club`) + ERC721 metadata server (`GET */token/:tokenId`). NOT needed for mission-1. ⚠ It does NOT serve `/groups`. The `/groups` the Colyseus server fetches at boot (`server.ts`, harmless ECONNREFUSED if down) is served by **`group-match-service/`** (competition/season matchmaker) — also configured for PORT=2568 (they collide locally) and **NOT copied into this repo** (not needed for the storymode mission flow).

⚠ **As of 2026-06-12 the entire backend lives in THIS repo** (`<repo>` = `~/dev/ZeroxWork/golfcraft-migration`), not `~/dev/ohmyverse/golfcraft` anymore. See §9 for the layout, run commands, and the copy gotchas. Run all services from the migration repo. (The original golfcraft backend still exists but is now a stale duplicate.)

Critical: `<repo>/common/constants.ts` must have `USE_REMOTE_SERVER=false` so the Colyseus server fetches courses from the local web API instead of `golfcraftgame.com`.

---

## 2. Architecture — match SDK6 exactly

### 2.1 Root entity pattern (CRITICAL)

SDK6's `game.ts` defined a `landOwnerData` with `position: {x:24, y:0, z:24}`. `meta.ts` created a `root` entity at that position and **every gameplay element parented to it**. Subcomponents used positions like `(28-24, 1, 31-24)` = local `(4, 1, 7)` so that subtracting the root offset gives the local coord.

**Rule:** every entity that SDK6 attached to `root` (`scene/src/...`) must be parented to our `sceneRoot` at `(24, 0, 24)` in SDK7. Look up the SDK6 SAME entity's hardcoded position (e.g. NPC was hardcoded `Vector3(2, 1.1, 8)`) and use that as the **local** position relative to `sceneRoot`. Don't add the +24 offset yourself.

### 2.2 dcl-npc-toolkit caveat

`npc.create(transform, data)` from `dcl-npc-toolkit` **silently ignores the `parent` field**. It only reads `position`/`rotation`/`scale`. Fix: after calling `npc.create(...)`, set the parent manually:
```typescript
const t = Transform.getMutableOrNull(NPC_scientist)
if (t) t.parent = parent
```
Apply this trick whenever you use the toolkit for new NPCs.

Also: `NpcUtilsUi` must be rendered inside the ReactEcs UI tree — otherwise no dialog appears even though `npc.talk()` runs.

**The toolkit also never gives a CUSTOM NPC a collider** (2026-07-25). For `NPCType.CUSTOM` it just does `GltfContainer.create(npc, {src})`; only `NPCType.BLANK` gets `MeshCollider.setBox`. SDK7 GltfContainers have NO collider on visible meshes by default and `models/NPC.glb` has no `*_collider` mesh, so the NPC is invisible to raycasts. The toolkit's click trigger is `pointerEventsSystem.onPointerDown(npc, …)` (`addClickReactions`, with `button = onlyClickTrigger ? 0 (IA_POINTER) : 1 (IA_PRIMARY)`), so **it can never fire** — the NPC looks completely mute. SDK6 didn't need anything because `GLTFShape` defaulted to `isPointerBlocker = true`. Fix, right after `npc.create(...)`:
```typescript
const npcGltf = GltfContainer.getMutableOrNull(NPC_scientist)
if (npcGltf) npcGltf.visibleMeshesCollisionMask = ColliderLayer.CL_POINTER
```
Symptom that pins it: `createNpcTest` logs at spawn but `onActivate` never fires on click. Only bites when `onlyClickTrigger` is on — SDK6 sets `onlyClickTrigger: current_mission >= 7`, so missions 1-6 (camera trigger area, no collider needed) worked while 7+ appeared dead.

### 2.3 Course models base URL

`engine.__COURSE_MODELS_BASE__` must be `"golfplay/"` (set in `bootstrap.ts`). The visual loaders prepend this when building GltfContainer src URLs. If empty, parts try to load `models/<subtype>.gltf` at scene root and fail silently.

### 2.4 `decorateRemotePhysicParts` at boot

Mission-1's course definition references parts (`egypt_floor`, `egypt_border`, …) that are NOT bundled in the local `cannonParts` map in `course-element-loader.ts`. The SDK6 client fetched these from the web API `/api/parts` (~307 parts, ~4 MB) and added them to the map at boot time.

**Rule:** `bootstrap()` calls `decorateRemotePhysicParts(fetch)` after PlayFab/Colyseus setup. Without this, `loadCoursePhysics` throws `Missing part egypt_floor` when a mission starts.

### 2.5 Lobby hide on mission start

SDK6 `lobby.ts` defined `hide()` as: `destroyBuilding()` + `npc.hide()` + remove lobby entity. This was wired as the NPC's `onStart` callback. Our SDK7 `index.ts:onStart` does the same: `destroyBuilding()` + `hideNpc()`. On `onFinish`, re-create the building so the player doesn't return to an empty world.

---

## 3. SDK6 → SDK7 API translation

| SDK6 | SDK7 |
|---|---|
| `new Entity()` | `engine.addEntity()` |
| `new Transform({position, rotation, scale, parent})` | `Transform.create(entity, {position, rotation, scale, parent})` |
| `entity.setParent(p)` | `Transform.getMutable(entity).parent = p` |
| `new GLTFShape(src)` | `GltfContainer.create(entity, {src})` |
| `new BoxShape() / SphereShape() / PlaneShape()` | `MeshRenderer.setBox/Sphere/Plane(entity)` |
| `new Material()` + props | `Material.setPbrMaterial(entity, {...})` |
| `new TextShape(value)` | `TextShape.create(entity, {text})` |
| `new Billboard(...)` | `Billboard.create(entity, {})` |
| `new AudioClip(src) + new AudioSource(clip)` | `AudioSource.create(entity, {audioClipUrl, playing, loop, volume})` |
| `new Animator() + new AnimationState(name) + addClip` | `Animator.create(entity, {states: [{clip, playing, loop}]})` |
| `class X implements ISystem { update() {...} }` | `engine.addSystem((dt) => {...})` |
| `Input.instance.subscribe('BUTTON_DOWN', ActionButton.PRIMARY, ...)` | poll `inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)` inside a system |
| `Camera.instance.position` | `Transform.get(engine.PlayerEntity).position` |
| `@dcl/ecs-scene-utils setTimeout(ms, fn)` | `@dcl-sdk/utils utils.timers.setTimeout(fn, ms)` |
| `new Vector3(x,y,z)` | `Vector3.create(x,y,z)` |
| `new Quaternion(x,y,z,w)` | `Quaternion.create(x,y,z,w)` |
| `Quaternion.Euler(x,y,z)` | `Quaternion.fromEulerDegrees(x,y,z)` |
| `Quaternion.Zero()` | `Quaternion.Identity()` |
| `entity.addComponent(c)`, `entity.getComponent(C)` | `Component.create/getMutableOrNull/getOrNull(entity, ...)` |
| `engine.getComponentGroup(C).entities` | `for (const [entity] of engine.getEntitiesWith(C))` |
| `@Component("name") class X {}` | `engine.defineComponent("name", schema)` |
| `import { movePlayerTo } from '@decentraland/RestrictedActions'` | `import { movePlayerTo } from '~system/RestrictedActions'` (signature changed: `{newRelativePosition, cameraTarget}`) |
| `getUserData()` from `@decentraland/Identity` | `getUserData({})` from `~system/UserIdentity` |
| `getCurrentRealm()` from `@decentraland/EnvironmentAPI` | `getRealm({})` from `~system/Runtime` |
| `signedFetch` from `@decentraland/SignedFetch` | `signedFetch` from `@dcl/sdk/signed-fetch` |
| UICanvas + UIImage / UIText / UIContainerRect | ReactEcs `<UiEntity>` + JSX (`@dcl/sdk/react-ecs`) |
| `new Entity(id)` (named entity for lookups) | track id → Entity in a `Map<Entity, string>` yourself |
| `entity.addComponentOrReplace(c)` | `Component.createOrReplace(entity, ...)` |

### Quaternion gotcha

Code that does `new Quaternion(...arr)` becomes `Quaternion.create(arr[0], arr[1], arr[2], arr[3])` — spread into a constructor that doesn't exist won't work; destructure explicitly.

Same for `new CANNON.Quaternion(...rotation)` → `new CANNON.Quaternion(rx, ry, rz, rw)`.

### let/TDZ gotcha (SDK7 sandbox is strict)

SDK6 sometimes called a function (`listenRoom()`) BEFORE the `let foo` declarations the function closed over. SDK6's runtime was permissive; SDK7 throws `Cannot access 'foo' before initialization`. **Rule:** hoist all `let` declarations above any synchronous function call that references them via closure.

---

## 4. UI migration (SDK6 UICanvas → ReactEcs)

SDK6 used `UICanvas` + `UIImage` + `UIText` + `UIContainerRect`. SDK7 uses ReactEcs JSX with `<UiEntity>`.

Pattern we follow: **module-level mutable state object** (`scene/src/ui/<thing>-state.ts`) + a **ReactEcs component** that reads it each render. Gameplay code mutates state; the UI re-renders automatically.

Existing state modules:
- `topbar-state.ts` — mission countdown / clock (showTopBar/hideTopBar/updateTopBarTime)
- `shoot-hud-state.ts` — `powerBarState` and `controlHintState` (the shoot HUD)

UV cropping a spritesheet: `uiBackground.uvs` is an 8-element array `[u0, v0, u1, v1, u2, v2, u3, v3]` for 4 corners in order **top-left, bottom-left, bottom-right, top-right**, with V=0 at the BOTTOM (V flipped from typical pixel-space top-down). Compute as:
```typescript
const uL = pixelLeft / atlasSize
const uR = (pixelLeft + spriteWidth) / atlasSize
const vT = 1 - pixelTop / atlasSize
const vB = 1 - (pixelTop + spriteHeight) / atlasSize
return [uL, vT, uL, vB, uR, vB, uR, vT]
```

---

## 5. Stubs in place (NOT migrated, but build green)

These no-op stubs let the rest of the code compile. Migrate them when needed:

- ~~`scene/src/components/ui/overlay.ts` — fadeIn/fadeOut overlay~~ ✓ IMPLEMENTED: real animated black overlay (`overlayState{alpha,visible}` lerped by an engine system; rendered by `<Overlay/>` in `ui/index.tsx`, last so it covers everything). Mission start cinematic restored: `npc-storymode.requestStartMission` plays egypt map music (`services/map-music.ts`, new) + `fadeInOverlay(1)` → course loads behind black → `golfplay-client` `fadeOutOverlay(1)` reveals it; `stopMapMusic()` on finish.
- ✓ Center popup banners ported (SDK6 `centerpanel.ts`): READY / GO! / SUCCESS / FAILED / TIMEOUT sprites from `images/ui-spritesheet.png` (rects READY 295,67,727×245 · GO 354,316,534×290 · SUCCESS 1023,80,686×139 · FAILED 1023,219,500×146 · TIMEOUT 1023,367,610×140, all ×0.5). `ui/centerpanel-state.ts` (`centerPanelState.banner` + `showBanner`) + `<CenterPopup/>` in `ui/index.tsx` (on top of the overlay). Driven by `gameState.starting`: true→READY, false→GO!(1s) (a `centerPanelSystem`). Mission end: onComplete→SUCCESS(3s), onFinish leaveCode 4001→TIMEOUT / 4002→FAILED (3s).
- `scene/src/components/lobby/visualChest.ts` — visual chest entities
- `scene/src/components/lobby/server-notification.ts` — toast notifications
- `scene/src/components/lobby/golfplay-client-season.ts` — fix-bug button
- `lib/expression-storage/_expression-storage.ts` — jsep evaluator (returns false defaults; only matters if course uses runtime expressions)
- Lobby HUD: SDK6 `scene/src/components/ui/lobby-ui/lobby-ui.ts` (508 lines) — top-right resources/materials/GC/XP/golfclub panel — **not yet migrated**

---

## 6. Bugs we hit and now MUST NOT repeat

1. **`__COURSE_MODELS_BASE__` was empty → GLBs didn't load.** Always `'golfplay/'`. Set in `bootstrap.ts`.
2. **`new Quaternion(...rotation)` spread does not work in SDK7.** Destructure: `const [rx,ry,rz,rw] = rotation; new CANNON.Quaternion(rx,ry,rz,rw)`.
3. **`npc.create` ignores `parent`.** Set Transform parent manually after.
4. **`NpcUtilsUi` must be in the ReactEcs tree** — otherwise no dialog UI.
5. **Server fetches courses remotely if `USE_REMOTE_SERVER=true`** in SDK6 source. Set it to false in `~/dev/ohmyverse/golfcraft/common/constants.ts` for local dev.
6. **`decorateRemotePhysicParts(fetch)` is mandatory** for any course using DB-backed parts.
7. **TDZ on `let`** — hoist above synchronous closures.
8. **`Camera.instance` does not exist in SDK7.** Use `Transform.get(engine.PlayerEntity).position`.
9. **`@ts-nocheck`** on copied SDK6 untyped utility files (`common/utils.ts`, `common/constants.ts`, `common/season-tier-definitions.ts`, `common/frame-reproductor.ts`, `common/course-animations-migration.ts`, `common/course-definitions/course-definition-repository.ts`, `scene/state/index.ts`) — they have implicit-any params everywhere.
10. **`tsconfig.json` `include`** must list every external file explicitly (we don't glob `golfplay/` because most files there are not yet migrated and have SDK6 globals).
11. **SDK7 `engine.removeEntity` does NOT cascade to children.** SDK6 relied on `setParent(null)+removeEntity` to clean up child entities; SDK7 leaves orphan children rendering. **Rule:** any factory that creates sub-entities (visual-part, visual-hole, course-visual-loader, ball, shoot-control-visual…) must track every entity it spawned in an array and remove them all in `dispose()`. Don't rely on the parent removal alone.
12. **`golfPlayWrapper` is dead code in SDK6.** `meta.ts` creates an entity called "wrapper" at (-24, 0, -24) parented to root and never references it again. Do not try to recreate this wrapper in SDK7 thinking the course needs to be offset — the course is parented to `root` directly and renders correctly at world (24, 0, 24).
13. **There is NO "Ready... Go" pre-mission screen for mission-1.** SDK6's mission-room flow just uses `topBar.updateTime(localStartTime - Date.now())` for the countdown. The "Ready... Go" overlay exists only for `season-demo.ts` (`showWaitForPlayers`), which is multiplayer season mode, not the storymode NPC mission.
14. **All PlayFab resources (GC, FT, PT, DM, WD, ST, IR, GD) live in `UserVirtualCurrency`, NOT in Inventory.** SDK6's `mapInventoryMaterials` was commented out in `services/userData.ts`; the production line was `...InfoResultPayload.UserVirtualCurrency`. Inventory only carries Golfclubs (ItemClass="Golfclub"), TrainingBoost, and Chests. Blockchain-side materials (Planks, StoneBlocks, IronBars, GoldBars, DMChain) come from the Arbitrum subgraph via `getMaterialBalance(walletAddress)` — separate from PlayFab.
15. **Resolve the PlayFab CustomId via `signedFetch /api/get-login-id` for web3 users.** Logging in with `user.userId` directly creates a fresh anonymous PlayFab account. SDK6's `xLoginWithCustomID` first hits `${SERVER_HTTP_URL}/api/get-login-id` with the signed identity header; the web API reads the wallet from `x-identity-auth-chain-0`, looks up the existing PlayFab account via `GetPlayFabIDsFromGenericIDs({ServiceName:"address", UserId:walletLowercase})`, and returns the matching CustomId. Guests fall back to using userId.
16. **`engine.PlayerEntity` Transform is read-only in SDK7.** Use `Transform.getOrNull(engine.PlayerEntity)` to read; `~system/RestrictedActions.movePlayerTo({newRelativePosition, cameraTarget})` to write.
17. **HUD uses a "loaded" flag** to distinguish "not loaded yet" from "actually zero". `lobbyHudState.resources.loaded` starts `false`; `applyCombinedInfoToHud()` flips it to `true` after PlayFab data arrives. UI components render via `renderCount(value, loaded)` → "-" when not loaded, real number otherwise.
18. **`signedFetch` rejects `http://` in SDK7, and get-login-id lives on the web API (2569), not `SERVER_HTTP_URL` (2567).** Two traps that combined to log the player into the WRONG (empty) PlayFab account: (a) `~system/SignedFetch.signedFetch` throws "URL scheme must be `https`" for any http URL — so it cannot call the local web API directly; (b) SDK6 hardcodes the get-login-id host as `http://localhost:2569` (web API), NOT the Colyseus host in `SERVER_HTTP_URL` (`localhost:2567`). When `/api/get-login-id` fails, `resolvePlayFabCustomId` falls back to the raw wallet as CustomId → a different account than the user's real one (which is keyed by an opaque CustomId resolved server-side via `GetPlayFabIDsFromGenericIDs(ServiceName:"address")` → `GetUserAccountInfo`). Fix in `bootstrap.ts`: local → plain `fetch` to `http://localhost:2569/api/get-login-id` with a hand-built `x-identity-auth-chain-0` header (`{type:"SIGNER",payload:<wallet>,signature:""}`); remote → `signedFetch` to `https://golfcraftgame.com`. The local web API's signature check (`runChecks`) is gated behind `process.env.PROD` (unset locally), so the unsigned header is accepted in dev.
19. **colyseus.js 0.14 matchmaking needs `XMLHttpRequest`, which the SDK7 sandbox lacks.** `Client.joinOrCreate` → `createMatchMakeRequest` goes through `httpie/xhr` (`new XMLHttpRequest`). bevy-web has `fetch` but no `XMLHttpRequest`, so joining the mission room throws `[npc] PROBLEM JOINING ROOM ... ReferenceError: XMLHttpRequest is not defined` and the course never loads. Fix: `scene/src/meta/xhr-polyfill.ts` installs a `fetch`-backed `XMLHttpRequest` shim on `globalThis` (covers open/setRequestHeader/send/withCredentials/timeout/onload/onerror/ontimeout/status/statusText/response/getAllResponseHeaders — the surface `httpie/xhr` touches). It is imported **first** in `index.ts` so it runs before colyseus is used.
20. **The SDK7 bevy-web runtime requires `wss://` (and `https://`) — plain `ws://localhost:2567` is rejected** (`Error: URL scheme must be 'wss'` from `ext:deno_websocket`). So a local **caddy TLS proxy** terminates wss/https on **2570** → forwards to Colyseus on 2567: `caddy trust` (once, installs caddy's local CA into the system keychain) + `caddy reverse-proxy --from https://localhost:2570 --to localhost:2567` (leave running). `common/constants.ts` points `WS_HOST=wss://localhost:2570` (and colyseus derives matchmaking `https://localhost:2570` from it). ⚠ Gamble: the embedded Deno may use Mozilla roots, not the system keychain — if so, a TLS/cert error appears and we'd need a publicly-trusted cert (cloudflared quick tunnel `cloudflared tunnel --url http://localhost:2567`, then set WS_HOST to that wss URL). This 2570 caddy proxy is a 4th local service required for missions (not for the lobby HUD). ⚠ SUPERSEDED — caddy is NOT enough for the game WebSocket, see #22: the runtime's fetch trusts caddy's CA but its WebSocket does NOT (Mozilla roots).
21. **caddy must force HTTP/1.1 — the Deno WebSocket fails its upgrade over HTTP/2.** With caddy's default (h2 enabled), matchmaking (plain HTTPS fetch, h2) succeeds and the WS reservation is returned, but the bevy/Deno `new WebSocket(wss://localhost:2570/...)` upgrade fails over h2 → colyseus never runs `onAuth` → client gets a bare `ServerError` at `WebSocket.connection.events.onerror`. (Node's `ws` uses h1.1 and works, which is why server-side joins reproduced fine.) Fix: run caddy from `Caddyfile` (repo root) with global `servers { protocols h1 }`, i.e. `caddy run --config Caddyfile --adapter caddyfile` (NOT the `caddy reverse-proxy` one-liner, which leaves h2 on). Symptom of the bug: server log shows `onCreate`'s `courseDefinition true` but NO `Test-Room onAuth` line for the attempt. Also fixed the recurring "caddy won't start" — its data dir `~/Library/Application Support/Caddy` was root-owned from an earlier `sudo caddy` run; `sudo chown -R $(whoami) ~/Library/Application\ Support/Caddy` once, then run caddy non-sudo.
22. **CONFIRMED (caddy debug log): the runtime's fetch and WebSocket use DIFFERENT TLS root stores.** The bevy fetch (`DCLExplorer/0.1`, TLS1.2 no-ALPN stack) trusts caddy's local CA via the system keychain → matchmaking POST through caddy returns 200. The game WebSocket (`ext:deno_websocket`, TLS1.3+ALPN rustls stack) uses **Mozilla/webpki roots only** → rejects caddy's cert: caddy logs `TLS handshake error ... remote error: tls: unknown certificate authority`, the client gets an instant bare `ServerError`, and colyseus never logs `Test-Room onAuth`. No public CA issues certs for `localhost`, so caddy alone can never satisfy the WS. Fixes: (a) maybe `DENO_CERT=<caddy root.crt>` env when launching the preview, IF the embedded runtime honors it (untested); (b) cloudflared quick tunnel `cloudflared tunnel --url http://localhost:2567` → set `WS_HOST=wss://<random>.trycloudflare.com` in `common/constants.ts` + rebuild (URL changes per tunnel run); (c) stable: real cert for a dev subdomain (DNS-01) pointed at 127.0.0.1, served by caddy. Diagnostic Caddyfile (repo root) logs to `/tmp/caddy-debug.log` + `/tmp/caddy-access.log`. ✓ RESOLVED via (b): cloudflared quick tunnel + `WS_HOST=wss://<tunnel>.trycloudflare.com` in `common/constants.ts` → **mission-1 played end-to-end on 2026-06-10** (join OK, course+physics+shoot, hole in 2, lobby restored). caddy no longer needed for missions. Future stable fix: patch `~/dev/protocol-squad/bevy-explorer` (the preview runs a LOCAL build: `target/release/decentra-bevy`) so deno_websocket trusts system CAs or allows ws://localhost in preview — user deferred this.
23. **Post-mission bugs found on the first full run (all fixed):** (a) `registerSound` throws "already registered" when the lobby NPC is re-created after a mission (our spawnLobby re-runs `GolfplayClientFactory`; SDK6 hid/showed the NPC so its factory ran once — its `//TODO MEMOIZE` acknowledged this) → guarded with module-level `soundsRegistered` flag; without it the NPC respawn ABORTS and no new mission can start. (b) The 5s PING interval kept firing after mission end (`InvalidStateError: readyState not OPEN` spam every 5s) even though `dispose()` calls `clearInterval` — the sandbox's setInterval/clearInterval don't reliably pair (timer fires from `ext:deno_web/02_timers.js`) → made the ping self-terminating via a `pingDisposed` flag + try/catch around `room.send`. (c) `room.onLeave` fires twice per mission end (registered directly AND via `listenRoom`, same as SDK6) → finish handler now no-ops on second invocation (`if (!clientGolfPlay) return`). (d) **NPC didn't respawn after a mission**: `createNpcTest` starts with `if (gameState.playing || gameState.starting) return`, but `gameState.playing` was left `true` from `requestStartMission` and never cleared on finish → `spawnLobby()` recreated the building but the NPC's factory bailed out. Fix: clear `gameState.playing = false; gameState.starting = false` in the `onFinish` handler before `opts.onFinish()` (which runs spawnLobby). SDK6 didn't hit this because it hid/showed the NPC instead of recreating it. Reusable knob: golfclub attribute numbers are positioned in `ui/index.tsx` from the MEASURED sprite icon centroids (source-x 31/53/76 → ×0.667 stretch → right:43/29/13), NOT SDK6's raw mainBarDef coords (SDK7 ReactEcs doesn't map 1:1; account for the strip's 111→74 stretch + label textAlign). Cosmetic, NOT ours: bevy logs `.light-atlas-v3.png` (explorer UI atlas) and `sound/.japanese_fountain.mp3` "out of bounds" (bevy_kira mp3 decode quirk — dot-prefixed path is bevy's; at worst the fountain ambient doesn't play).
21. **`mission-room` `onAuth` gates by `current_mission`; ALL storymode dialogs 1-9 are migrated (holes 1-5 playable; 6-9 dialog-only).** The server (`server/rooms/Mission-Room.ts:onAuth`) reads the player's PlayFab `current_mission` statistic and rejects the join (→ client `ServerError`) unless the requested `courseId` (`mission-N`) equals it. **`current_mission` is now populated for real** (no longer hardcoded to 1): `bootstrap.ts:applyCombinedInfoToHud` reads `stats.current_mission` and does `globalStore.userData.setState({ statistic_current_mission })` at boot, and `bootstrap.refreshUserData()` re-fetches it after each mission. The storymode NPC reads it to pick the dialog + request the matching `mission-N`. **Mission progression flow:** complete mission N → server awaits `completeMissionOnPlayFab` (bumps `current_mission` to N+1) BEFORE `client.send(COMPLETED)` → client `onFinish` does `sleep(1000)` + `refreshUserData()` (store now N+1) → respawns the lobby → recreated NPC shows mission N+1. Missions 1-5 dialogs are migrated in `npc-storymode.ts` (mission-2 = the "Wow you caught it / 4 spheres escaped" cinematic w/ container1 escape anim + `sound/sphere_teleporter.mp3` teleport + `sound/electricity.mp3` hum; missions 3-5 = the sphere-catching progression w/ `set_spheres(N)` on container2; each has completed/returning/try-again variants; `getTryAgainDialogue` is an INNER fn so it can call `requestStartMission`). Playable courses `mission-1`..`mission-5` exist in the DB. Missions 6-9 dialogs are ALSO migrated now (2026-07-25, dialog-only — no holes): mission 6 = victory ("You are amazing! You did it!") + set_spheres(4) + claims the greeting emote NFT via `signedFetch({url:'https://golfcraftgame.com/bridge/claim-emote',...})` to PROD + sets `current_mission=7` (local); 7 = "improve your golfclub aim (needs 10 wood)" + `await refreshUserData()`; 8 = "play Season, reach STONE rank"; 9 = "Congrats STONE rank". `onActivateExecuteDialog` is now async: for `current_mission >= 7` it POSTs `/api/check-npc-mission` and resyncs current_mission (that endpoint advances 7→8 when the golfclub aim is improved, and 8→9 when `tier-sub-max >= 25`; it does NOT handle 6→7 — that relies on the prod claim-emote bumping current_mission). `<color=..>` markup was stripped (SDK7 Labels don't render it). The 6→7 advance is real (onchain-queue bridge, §10) and 7→8 is real (golfclub board, §11); ⚠ only **8→9 still needs a system NOT yet migrated** (Season/ranked mode — it wants `tier-sub-max >= 25`), so set `current_mission` manually to see the mission-9 dialog. **Join-failure recovery:** if a join is rejected (e.g. mission mismatch), `requestStartMission` no longer leaves a black screen — it `fadeOutOverlay` + `stopMapMusic` + respawns the lobby. **Finish teleport:** on mission end the player MUST be teleported back to the lobby spawn or they're stranded where the ball holed — SDK6 does this in `lobby.ts:handleLeavePlay` (`fadeInOverlay` → `show()` → `refreshUserData` → `sleep(500)` → `movePlayerTo(...GAME_SPAWN.MISSION)` → `fadeOutOverlay`). Ported into `npc-storymode.ts:onFinish` using `scene/src/components/spawns.ts` (copied verbatim; `GAME_SPAWN.MISSION = [{x:34±rand,y:3,z:36±rand},{x:28,y:2,z:31}]`). The player teleport on mission START (to the course tee, `initialPlayerPosition+24`, cameraTarget `(8+24,1,8+24)`) is in `golfplay-client.ts` and already matches SDK6. To test a specific mission, set `current_mission` via `node scripts/reset-mission.js N` (or PlayFab Game Manager → Statistics Legacy).

---

## 6.5 Current state (last touched 2026-06-01)

Mission-1 flow works end-to-end:
- ✓ Boot: PlayFab login via signedFetch /api/get-login-id (resolves wallet→CustomId), Colyseus client created, remote physic parts loaded.
- ✓ Lobby: building + NPC scientist spawn at world (24,0,24)+local, intro screen with `images/intro-screen.png` dismissible by click/E.
- ✓ NPC dialog tree (mission 1 intro: "Welcome new intern…") → click last "Next" → requestStartMission.
- ✓ Mission room joinOrCreate, MESSAGE.START arrival, course visual + physics + shoot-control all render.
- ✓ Player can aim/shoot with E/F/click, ball physics works.
- ✓ Hole completion disposes the course cascade-recursively (visual-part, visual-hole, visual-magnet all have .dispose).
- ✓ Lobby restored on onFinish (re-spawns building + NPC).

**Tutorial-mission flow rules (2026-06-12):** Storymode missions must have NO pre-start countdown and NO on-screen timer. The room is capped at 1h and is closed if the player goes 10min without a shoot; either cap → `LEAVE_CODE.TIMEOUT (4001)` → client TIMEOUT banner. Implemented in:
- Server `server/rooms/Mission-Room.ts` (in `~/dev/ohmyverse/golfcraft`): `READY` sets `startTime = Date.now()` (no `+12000` countdown) and `duration = MAX_ROOM_DURATION_S (3600)`; `lastShootTime` is init at READY and reset in the `SHOOT` handler; `clockCheck` kicks on `isOverdue() || (now - lastShootTime > MAX_IDLE_MS 10min)`. **Server is plain `ts-node` (no auto-reload) — restart `npm run dev` after editing.**
- Client `npc-storymode.ts` `MESSAGE.START` handler: stripped the topbar/countdown loop — just `await waitFor(clientGolfPlay.start)` then `start()` immediately (course is already loaded behind the fade). `showTopBar`/`updateTopBarTime` no longer imported; `hideTopBar` kept (harmless). TIMEOUT banner already wired via `onFinish` leaveCode 4001.

UI:
- ✓ TopBar state still exists but is NOT shown for tutorial missions (no timer) (`scene/src/ui/topbar-state.ts`)
- ✓ PowerBar HUD right + ControlHint sprite bottom-right during play (`scene/src/ui/shoot-hud-state.ts`)
- ✓ Lobby HUD top-right with sprites from `images/ui-spritesheet.png`: vertical strip (1938,0,111x1071) + materials panel (1360,1797,564x183) + player XP panel (1587,1697,342x82) + blockchain materials secondary row.
- ✓ UV crop helper `spriteUvs(left, top, w, h, atlasSize)` in `ui/index.tsx` uses corner order [BL, TL, TR, BR] with V=1 at top of the atlas.

Pending / unknowns at last checkpoint:
- ✓ RESOLVED — lobby HUD VirtualCurrency counters (GC/FT/PT/DM/WD/ST/IR/GD). Root cause was NOT the VC-vs-Inventory mapping (that part was already correct); it was logging into the WRONG PlayFab account. `resolvePlayFabCustomId` hit `${SERVER_HTTP_URL}/api/get-login-id` = `localhost:2567` (Colyseus) and used `signedFetch`, which in SDK7 rejects `http://` ("URL scheme must be `https`"). It silently fell back to logging in with the raw wallet as CustomId → a different (empty-ish) account. Fix (in `bootstrap.ts`): mirror SDK6's hardcoded host (`http://localhost:2569` local / `https://golfcraftgame.com` remote) and, for the local http web API, use a plain `fetch` with a hand-built `x-identity-auth-chain-0: {"type":"SIGNER","payload":<wallet>,"signature":""}` header (the route only reads `.payload`; its `runChecks` signature verification is gated behind `process.env.PROD`, unset locally). Confirmed: real PlayFab numbers now show. See §6 #18. **OPERATIONAL GOTCHA:** if the web API (2569) is DOWN, `/api/get-login-id` fails and login silently falls back to the raw wallet as CustomId → logs into the junk account `C5380547958A5717` (GC=1000, empty stats/inventory/readOnlyData, Lv.01). Symptom: `[bootstrap] PlayFab data: VC={"GC":1000,...} xp=0 stats={} inventoryLen=0 readOnlyKeys=0` and `login OK: C5380547958A5717`. Real account is PlayFabId `59DB5EA948C1AE85` (CustomId `2b9d0250...`, resolved by get-login-id), VC GC≈161801, ReadOnlyData.xp=354873 → Lv.33/85%. FIX = make sure the web API is running (`npm run api` in golfcraft/web). The Node services (2569 web, 2567 Colyseus) die whenever a background task is killed — relaunch both if login regresses.
- ✓ RESOLVED — XP/Level. Bug was `bootstrap.ts:applyCombinedInfoToHud` reading `stats.level` (no such statistic, → always 1) and showing raw `xp`. The real source (traced via the `increaseXp` cloudscript): **xp lives in PlayFab `UserReadOnlyData.xp.Value`** (a string), NOT in PlayerStatistics. SDK6 spreads it into the store via `destructureDataValues(UserReadOnlyData)` (plain `xp` key), and the lobby panel computes level via `getLevelInfo(xp)` → `{currentLevel = min(floor(cbrt(xp/10))+1, 80), progressPercentage}` (`common/utils.ts`). There is NO `level` statistic. Fix: read `xp = Number(info.UserReadOnlyData?.xp?.Value || 0)`, compute `getLevelInfo(xp)`, store `{xp, level: currentLevel, levelPct: progressPercentage}`, and render the panel as `Lv. NN` + `NN%` (zero-padded to 2), mirroring SDK6's `createPlayerPanel`. (Earlier note claimed plain `xp` is "never set in production" — that was wrong; it comes from ReadOnlyData.)
- ⚠ Onchain materials (Planks/StoneBlocks/IronBars/GoldBars/DMChain): the SDK6 subgraph is DEAD — querying it returns `{"errors":[{"message":"subgraph not found: no allocations"}]}`, so `fetchBlockchainMaterials` returns `{}`. The data is alive though: GolfcraftMaterials ERC1155 `0xb50E29A3ccF7c0AB133ea7de46B09D0D8fEAfdF0` on **Polygon (matic)**, read via `balanceOfBatch(wallet×8, ids 0..7)` over a public RPC (`https://1rpc.io/matic` works; polygon-rpc.com / ankr need keys). Confirmed pablo's wallet has real balances (DMChain=131, StoneBlocks=24, Planks=15, FTChain=16, FT500Chain=16, DM100Chain=5, IronBars=2, GoldBars=0). Token-id→name map (subgraph + our code): 0 FTChain, 1 FT500Chain, 2 DMChain, 3 DM100Chain, 4 Planks, 5 StoneBlocks, 6 IronBars, 7 GoldBars. ✓ RESOLVED (synced 2026-06-01): deployed a fresh **materials-only** subgraph to The Graph Studio (slug `golfcraft`, owner = pablo). Source modernized + committed at `subgraph/golfcraft/` in THIS repo (graph-cli 0.98, graph-ts latest, specVersion 0.0.5, apiVersion 0.0.9, `@entity(immutable:false)`, schema trimmed to Account/Material/MaterialBalance, only the GolfcraftMaterials dataSource). Studio dev query URL (no API key): `https://api.studio.thegraph.com/query/9782/golfcraft/v0.0.1` — now in `common/constants.ts` as `MATERIALS_SUBGRAPH_URL`, consumed by `bootstrap.ts:fetchBlockchainMaterials` (query/id-map/parsing already match SDK6: `MaterialBalance.id` = `<addr>-<tokenId>`). Fully synced to head (~88M), no indexing errors; values verified against the contract via balanceOfBatch (DMChain=131, Planks=15, StoneBlocks=24, IronBars=2, GoldBars=0). The HUD renders these 5 as a **3rd row overlaid on the materials panel sprite** (the "BLOCKCHAIN MATERIALS" sub-panel baked into crop 1360,1797,564x183) — NOT a separate panel; positions in `scene/src/ui/index.tsx` (`bcColXs`/`bcRowY`), mirroring SDK6 `materialsDef` y=-156. FTChain/FT500Chain/DM100Chain are fetched but not painted in that row (same as SDK6). Deploy/auth via `graph auth <key>` + `graph deploy golfcraft --version-label vX` from `subgraph/golfcraft/`. Golfclubs/parts/lands NOT included yet — add those dataSources back (originals in `~/dev/ohmyverse/golfcraft/subgraph/golfcraf/`) as a new version when needed. SDK6 golfclubs + wearables-bonus fetches still broken (same dead subgraph).
- ✓ ControlHint sprite: crop matches SDK6 `bottom-panel.ts` exactly (`images/spritesheet.png` 1024², left 0/309, top 235, 308×200, scale 1/1.5) and uses the SAME `spriteUvs` (order `[BL,TL,TR,BR]`, V=1−pixelTop/size) as the materials panel, which renders upright. So it renders correctly; the old flip note predates settling that convention. Frame 0 = "STEP 1 SET ROTATION" (E/F/click), frame 1 = step 2. Only shows during a shoot — confirm visually when playing.
- ✓ Lobby player panel progress bar: the bg sprite (1587,1697,342×82) bakes in the "PLAYER" title + empty track only. SDK6 `createPlayerPanel` draws the FILL separately: sprite `1886,1998,4×22` (orange→yellow vertical gradient) stretched to `width = 140·(pct/100)` over the track. Ported in `scene/src/ui/index.tsx`: panel rewritten to absolute children; fill at panel px `top:26 left:68 width:139·levelPct/100 height:14`, `Lv. NN` left / `NN%` right. Track measured at panel px x68..207 y25..41.
- ◑ Golf club panel + bonus (data done, HUD positions = first pass, pending visual tune). SDK6 `createGolfClub`/controller: active club resolved from `activeGolfClubTokenId` via the golfclubs list (inventory `golfclub-1` + NFT clubs from the dead subgraph). We resolve the equipped NFT club's MODEL by reading the **Golfclub ERC721** `getGolfclubId(tokenId)` (selector `0x1f56940f`, returns uint16) over a Polygon RPC (`POLYGON_RPC`/`GOLFCLUB_CONTRACT` in constants) — no subgraph. NFT clubs (model != 1) are assumed maxed **5/5/5** (SDK6 controller: `id!=1 ? 5 : real`); the basic club (id 1) uses real inventory `CustomData.attribute_power/control/aim`. Name from `GOLF_CLUB_NAMES` (`golfclubCatalog`). Bonus (`TrainingBonus`) = `+100` per trainingBoost + Σ `GOLF_CLUB_BONUSES` over unique club models (inventory ∪ active) + `min(wearablesBonus,50)` — SDK6 sourced NFT clubs from the subgraph; we use inventory ∪ active instead. Thumbnails `images/0..8.png` copied from SDK6 `scene/images/`. Pablo: token 145 → model 5 "Pink Star", 5/5/5, bonus 73. All in `bootstrap.ts:applyCombinedInfoToHud` (now async for the RPC) + `lobby-hud-state.ts` (`golfclub`, `bonus`) + `ui/index.tsx` strip overlay.

Pending (not needed for mission-1, flagged for later):
- **"groups"/competitions service on port 2568.** The Colyseus server fetches `http://localhost:2568/groups` at boot and logs a harmless `ECONNREFUSED` when it's down. ⚠ This is served by **`group-match-service/`** (the competition/season matchmaker), NOT chain-playfab — an earlier note conflated them. `group-match-service` was NOT copied into this repo (`cd ~/dev/ohmyverse/golfcraft/group-match-service && npm run dev`, PORT=2568 in the original). NOT required for the storymode mission-1 flow (NPC → mission → hole). Needed only when we migrate competition groups / season multiplayer. (Separately, `chain-playfab/` — the golfclub NFT minter + metadata server — is also configured for 2568; the two collide locally. See §9.)

Services that MUST be running (background):
- `podman start golfcraft-mysql` (port 3306, DB has 837 courses + 307 parts + admin tables from backup) — runtime is podman, not Docker; `docker` CLI exists but has no daemon (see §1)
- `cd <repo>/web && npm run api` (port 2569, REST: get-course, parts, get-login-id, ...)
- `cd <repo>/server && npm run dev` (port 2567, Colyseus mission-room defined)
- `cd <repo>/chain-playfab && npm run dev` (port 2568, golfclub NFT minter — optional, NOT needed for mission-1; does NOT serve /groups, see §1)

`<repo>` = `~/dev/ZeroxWork/golfcraft-migration` — the backend now lives here (§9). Verify status: `lsof -i :2567 :2569 :2568 :3306`. The Colyseus server uses `<repo>/common/constants.ts` with `USE_REMOTE_SERVER=false` — don't flip that back to true or the server will try to fetch courses from golfcraftgame.com.

## 7. Build & test loop

```bash
cd /Users/pabloestornut/dev/ZeroxWork/golfcraft-migration/scene
npx sdk-commands build   # must be green before every checkpoint
```

The dev server is `npx sdk-commands start -- --bevy-web` (the user's choice). When testing, the user reads browser console output and pastes it back. Console.log lines from our scene appear as `[GolfCraft minigolf <time>] <message>` in the browser console.

**Repeat-testing mission-1:** completing the mission makes the server bump PlayFab `current_mission` to 2 → the next join is rejected by `onAuth` with `ServerError: onAuth failed` (client always requests mission-1, see §6 #21). Reset between runs with `node scripts/reset-mission.js 1` (uses the web server's PlayFab Server credentials from `<repo>/web/.env` — now reads the in-repo web service via `__dirname/../web`; hardcodes pablo's PlayFabId `59DB5EA948C1AE85`).

If a runtime error refers to a line you don't recognise, the sandbox `eval at runWithScope` lines have stripped line numbers from the bundle. Look up the symbol name in our source code, not the line number.

---

## 8. Workflow rules

1. **Look up SDK6 first — trace the data, not just the layout.** Don't migrate from memory or guess — `git show HEAD:scene/<file>` (in `~/dev/ohmyverse/golfcraft`) and copy the structure. For anything that *displays or consumes data* (HUD counters, stats, resources, dialog state…), follow the original data flow end-to-end before writing SDK7 code: **where does each value originate** (PlayFab `UserVirtualCurrency` vs `UserInventory` vs `PlayerStatistics` vs a blockchain subgraph vs a server message), **how is it keyed/transformed** (e.g. statistics are stored prefixed as `statistic_<name>`; `level` is NOT stored — it's computed from `xp` via `getLevelInfo()`), and **which store field the UI actually reads**. Mirror that exact path. Replicating the SDK6 behaviour faithfully includes replicating its quirks — do not "fix" or "improve" a value the original leaves empty/defaulted.
2. **Build after every change.** Type errors are cheaper to fix one at a time. Run `npx sdk-commands build` from `scene/`.
3. **Stub aggressively, mark clearly.** When a SDK6 dependency is heavy (UICanvas-based UI, decentraland-transactions, etc.) and not critical for the current milestone, add a no-op stub with a comment pointing to the SDK6 source for the future migration.
4. **Mirror file paths.** If SDK6 had `scene/src/components/lobby/foo.ts`, put the SDK7 version at the same path under our `scene/src/components/lobby/foo.ts`. Don't reorganise.
5. **One bug → one rule.** After fixing a runtime error, add a line to section §6 so the same trap doesn't catch us again next file.
6. **Never modify `~/dev/ohmyverse/golfcraft/scene/`** (the SDK6 source). Only `common/constants.ts` there was edited (USE_REMOTE_SERVER flag) — anything else is read-only.
7. **Never reference `~/dev/ohmyverse/golfcraft/scene-sdk7/`.** It's the previous failed migration; ignore completely.

---

## 9. Backend now lives in THIS repo (copied 2026-06-12/13)

The whole backend was copied from `~/dev/ohmyverse/golfcraft` into the migration repo so everything is self-contained and **server changes happen here**. The original golfcraft backend is now a stale duplicate — don't edit it; edit the in-repo copies.

**Copied top-level dirs:** `server/` (Colyseus 2567), `web/` (REST API 2569), `chain-playfab/` (golfclub NFT minter + ERC721 metadata, 2568 — does NOT serve /groups), `admin/` (adminjs panel — source only, NOT installed), `subgraph/` (merged: keeps our `golfcraft/` materials subgraph + adds original `golfcraf/`), `scripts/`, `pet-store-service/`, `contracts/` (45M, ABIs/catalog — chain-playfab needs `contracts/metadata-server/catalog.json` + `EnsResolver`). `common/`, `lib/`, `scene/golfplay/` were already present and are SDK-agnostic, so the server's `../../common`/`../../scene/golfplay` relative imports resolve unchanged (the repo mirrors golfcraft's layout).

**Run — ONE command: `bash scripts/dev-up.sh`** (idempotent; only starts what's down). It brings up mysql(podman)+web(2569)+colyseus(2567)+cloudflared tunnel+preview(8001), and crucially **automates the tunnel churn**: captures the new `*.trycloudflare.com` URL, writes it into `common/constants.ts` `SERVER_URL`, and rebuilds the scene. `bash scripts/dev-up.sh --status` prints status; `bash scripts/dev-down.sh` stops everything (mysql left running). Manifest of all services + ports + notes: `scripts/dev-services.json`. **Key win:** dev-up.sh launches each service DETACHED (`nohup` + subshell), so they survive Claude-session interruptions — unlike `run_in_background` Bash tasks, which the harness kills (the recurring "services died again" pain). Realm = `http://127.0.0.1:8001`. chain-playfab (2568) is NOT started (not needed for missions).
- Manual fallback (all from `<repo>`): `cd server && npm run dev` (2567), `cd web && npm run api` (2569), `cd chain-playfab && npm run dev` (2568). MySQL/podman + cloudflared tunnel stay external. **Plain `ts-node`, no auto-reload — restart after editing.**

**Copy gotchas (all resolved — don't re-hit):**
1. **Root hoisting for `common/`+`lib/` deps.** `common/discord.ts` etc. `import 'cross-fetch'`, resolved from an ancestor `node_modules`. Created `<repo>/package.json` (copied golfcraft's `golfcraft-game` root) + `npm install` at repo root → `<repo>/node_modules/cross-fetch`. `scene/golfplay`'s only bare dep is `cannon`, satisfied by `scene/node_modules`. Each service keeps its own `node_modules`; root just fills gaps. **Don't delete the root `package.json`/`node_modules`.**
2. **expression-storage dual resolution (server=full jsep build, scene=lite jsep).** Both `_expression-storage.js` (SDK6 build, jsep inlined, `require('util')`) and `_expression-storage.ts` sit in `lib/expression-storage/`. esbuild (scene build) resolves `.ts` first; ts-node (server) with `preferTsExts` default false resolves `.js` first → SDK6 build. The SHARED `scene/golfplay/src/gameplay-handlers/gameplay-handler.ts` uses server/scene versions automatically — no forks. ⚠ **The `.ts` is NO LONGER a no-op stub** (2026-07-25): `getVariablesFromExpression` + `evaluateExpression` are REAL (jsep-based, ported from SDK6 `jsep-eval.js` but dropping lodash/assert which don't load in the sandbox; `jsep` is a repo-root dep — install it there, NOT scene/, because esbuild resolves the lib/ file's bare imports from repo-root node_modules). Without this, REACTIVE course parts (switches/trigger-zones that hide walls/text) never hid — `visual-part.ts:reactive()` calls `evaluateExpression(runtime.ignored||runtime.hidden, state)` and `getVariablesFromExpression` feeds `listeningVariables`; the old stub returned `undefined`/`[]`. `createExpressionStorage` is still a stub (the server owns authoritative variable storage and streams changes; the client only evaluates hide-conditions). First exercised by mission-4.
3. **server `tsconfig.json` needs `"ts-node": { "transpileOnly": true }`.** The original had a top-level `"transpileOnly":true` which ts-node IGNORES (must be under the `ts-node` key). Without real transpileOnly, the `.ts`+`.js` basename collision in `lib/expression-storage/` makes ts-node's type-checker return `emitSkipped` → `TypeError: _expression-storage.js: Emit skipped`. transpileOnly bypasses the LanguageService emit. (The original never hit this because it had no `.ts` stub.)
4. **web `npm install` needs `--legacy-peer-deps`** (adminjs/react ERESOLVE peer conflict). After install run `npx prisma generate` if `node_modules/.prisma/client` is missing (it usually generates on install). web boots: `listening ... <port>`.
5. **ts-node lives at the ROOT** (`golfcraft-game` root package.json), not per-service — `npx ts-node` walks up and finds it. Node v16.15.0 (the npm-v10 "unsupported node" warning is harmless).
6. **reset-mission.js** now reads `<repo>/web/.env` + `<repo>/web/node_modules/playfab-sdk` via `__dirname/../web` (self-contained).
7. **web API crashed on ANY `unhandledRejection` (2026-07-25 fix).** `web/server/index.ts:handleProcessExit()` registered `process.on('unhandledRejection'|'uncaughtException', () => process.exit(1))` — intended for PROD (pm2 restarts), but in dev there's no supervisor, so ONE bad request (e.g. `POST /api/get-course` with a missing `alias` → Prisma `findUnique({where:{}})` throws in `isCourseInSeason`, `web/server/courses/api/index.ts`) killed the whole web API permanently. This caused many of the recurring "web died" incidents + cascaded into mission joins failing (the Colyseus `mission-room` `onCreate` fetches the course from the web API via `getCourseDefinition`; a dead web → join fails). Fix: guarded both `process.exit(1)` with `if (process.env.PROD)` — in dev it logs and keeps running. Also `dev-up.sh` now `podman machine start`s + waits for 3306 before launching web (web's startup queries the DB).

---

## 10. onchain-queue bridge (mission-6 emote claim) — the 6→7 advance (2026-07-25)

Mission-6 completion claims a real "greeting" emote NFT and, as a side effect, advances `current_mission` 6→7. In prod the client hits `https://golfcraftgame.com/bridge/*`; that bridge is the **onchain-queue** service (name `action-tx-queuer`, `BASE_URL=/bridge`, port **8111**), a Prisma-3.14 + MySQL tx queue that mints on **Polygon mainnet**. It lives at `~/dev/ohmyverse/onchain-queue` and is **NOT copied into the migration repo** (its `.env` holds a real minter private key — keep it out of git). Run it: `cd ~/dev/ohmyverse/onchain-queue && npm run dev` (needs `npx -y prisma@3.14.0 generate` once + `npm install --legacy-peer-deps`). Added to `dev-up.sh --status` (port 8111) but NOT auto-started by dev-up (external + secret-bearing).

**Client wiring** (`npc-storymode.ts` mission-6 `triggeredByNext`): `USE_REMOTE_SERVER` → prod via `signedFetch` to `https://golfcraftgame.com/bridge/claim-emote`; local → **plain `fetch` to `http://localhost:8111/bridge/claim-emote`** with a hand-built `x-identity-auth-chain-0: {"type":"SIGNER","payload":<wallet>,"signature":""}` header + body `{address, PlayFabId, itemId:0, displayName}`. Then `current_mission = 7` (local optimistic store bump). ⚠ `signedFetch` can't be used locally (rejects `http://`), hence the plain fetch — same trick as get-login-id (§6 #18).

**onchain-queue dev bypass** (`~/dev/ohmyverse/onchain-queue/src/server.ts`): `DEFAULT_MIDDLEWARES = process.env.PROD ? [SIGNED_FETCH_MIDDLEWARE, controlMiddleware] : [controlMiddleware]` — the signature check is skipped in dev; `controlMiddleware` still enforces `header.payload === body.address` AND `checkAddressIsPlayFabId(address, PlayFabId)`.

**The queue flow** (async, NOT in the request — the request returns `{ok:true}` immediately after enqueue): the queuer runs `preClaimEmote` (writes `current_mission=7` optimistically) → estimates gas → sends `issueTokens([beneficiary],[0])` on the emotes collection → waits ~9 confirmations → `COMPLETED`. If **estimation or the tx fails**, it runs `preClaimEmoteRevert` (`current_mission` back to 6). `preClaimEmote`/`preClaimEmoteRevert` are in `~/dev/ohmyverse/onchain-queue/src/before/pre-claim-emote.ts`.

**The blocker we hit + fix:** the emotes collection is `0x3bcd1140fb5a90a5d2264bc8657894d240d91771` (Polygon), `issueTokens` reverts `_issueToken: CALLER_CAN_NOT_MINT` unless `msg.sender` is an authorized minter (`globalMinters[sender]==true` or `itemMinters[itemId][sender]>0`; the *creator* `0xCF10…4dE4d` is NOT enough on DCL v2). The onchain-queue `.env`'s original wallet `0x235e…` was NOT authorized → mint reverted → `preClaimEmoteRevert` undid the 6→7 advance (net: stuck at 6). **The authorized minter is `0xa40da50d888fc691cd2e1189eeefbcee253b0edc`** (`globalMinters==true`; signed all 1271 prod emote mints, found via Alchemy `alchemy_getAssetTransfers` fromAddress=0x0 → tx.from). Fix: put that wallet's `PRIVATE_KEY` (+ matching `PUBLIC_KEY`) in the onchain-queue `.env`; it needs MATIC for gas. ✓ **Verified end-to-end 2026-07-25:** tx `0xf71d47f7…aae967` status 1, emote **tokenId #1272** minted to pablo's wallet, `current_mission` 6→7 persisted, queue logged `COMPLETED` (`preReverted:false`). (Transient `FAILED GETTING TRANSACTION` in the queue log = Infura receipt-poll hiccup; it retried, got 9 confirms, completed — not a mint failure.)

**Testing note:** each claim = a REAL mainnet mint (gas + a new emote NFT). To re-test the in-game mission-6 flow, `node scripts/reset-mission.js 6` first, but expect another real mint. 8→9 still needs Season/ranked (not migrated) — set `current_mission` manually to see the 9 dialog.

---

## 11. Golfclub board (the mission-7 → 8 advance) — migrated 2026-07-25

The in-world screen mission 7 sends the player to ("Back there is a screen where you can improve your golfclub"). Browsing is E/F (or the side arrows), and spending materials on an attribute is what advances `current_mission` 7→8: `/api/check-npc-mission` bumps it once `golfclub-1`'s `attribute_aim > 0`. ✓ **Verified end-to-end 2026-07-25** (aim 0→1, WD 155110→155100, NPC then advanced 7→8).

**Files** (mirroring SDK6 paths): `scene/src/components/lobby/golfclub-screen/{golfclub-screen-ui,screen-bar,button-handler,attribute-update-button,screen-icon-with-value}.ts` + `sprite-material.ts` (SDK7-only helper — SDK6 hand-built the same material 13×). Wiring is `scene/src/components/lobby/lobby-training.ts` (a PARTIAL port: SDK6's file drove several lobby panels, we ported only the board slice). `index.ts:spawnLobby` calls `createLobbyTraining(sceneRoot)` in a **try/catch** — it runs BEFORE `createNpcTest`, so an exception there would otherwise leave the player with no NPC.

**Data flow** (SDK6 `lobby-training.ts`): `deserializeGolfclubs(globalStore.userData.getState().golfclubs)` → board; `onUpgrade` → cloudscript **`upgradeGolfclub`** `{ItemInstanceId, attribute}` → `refreshUserData()`; `onSelect` → cloudscript **`selectGolfClubTokenId`** `{tokenId}` (writes `activeGolfClubTokenId` to UserReadOnlyData). Both handlers are already deployed on the live title; the client just needed a `Client/ExecuteCloudScript` wrapper (`meta/playfab-rest.ts:executeCloudScript` — note cloudscript errors come back inside a **200** body as `data.Error`, not as an HTTP error). `bootstrap.ts` now publishes `globalStore.userData.setState({golfclubs: invGolfclubs, activeGolfClubTokenId})` (SDK6 `userData.ts:95`) and exports `getSessionTicket()`. Deviation: SDK6 kept only `golfclub-1` from the inventory and re-added NFT clubs from the (now dead) subgraph as synthetic 5/5/5; we pass every inventory Golfclub through, since ours already carry real tokenId/attributes.

**Upgrade rules** (`cloudscript/csGolfclub.ts`, re-validated server-side): cost `[10,20,30,60,120]` indexed by the CURRENT attribute value, spent from **power→IR, control→ST, aim→WD**; available while `xp > 0 && xpLevel > attributesLevel && attributesLevel < 16`, where `attributesLevel = 1+power+control+aim` and `xpLevel = getLevelInfo(xp).currentLevel`. So the `[+]` buttons legitimately disappear once attributes catch up with club xp. SDK6 read the balances from `globalStore.userData`; we read `lobbyHudState.resources` (where our PlayFab VC actually lands). `onMint` is stubbed (needs a maxed 16/16 basic club + 120 DM).

**Three SDK7 rendering/input traps this board exposed** (all bit us in sequence — expect them on any ported SDK6 in-world panel):
1. **Negative scales don't flip planes, they mirror them.** SDK6 flipped `PlaneShape`s with `scale: (-1,-0.4,-1)`. In SDK7 that's a 180° in-plane rotation seen from the back face → everything renders mirrored AND upside down. **Use positive scales.** Keep the SDK6 *positions* verbatim.
2. **`alphaTexture` semantics changed.** SDK6 passed the same PNG as `alphaTexture` and legacy DCL used its **luminance** as the mask — which is how these black-background RGB sprites cut out with no alpha channel at all. SDK7/bevy reads the real alpha channel (255 everywhere in an RGB file) → opaque black boxes. Fix applied: baked luminance into the 16 board PNGs as a real alpha channel, then just use the texture's own alpha + `transparencyMode`. The **yellow tint came from `emissiveColor: Yellow`**, not the artwork (which is white) — bevy's emissive is far stronger than SDK6's and blew the sprites out, so the tint moved to `albedoColor` and emissive is gone. Same for the club thumbnails (`images/0..9.png`): they are **fully opaque cards with a purple background baked in**, and `emissiveIntensity: 2` washed that purple to bright pink.
3. **Click boxes must sit on the camera side, and `onPointerDown` is keyed BY ENTITY.** The board's front face is **-Z** (hence SDK6's `z:-0.01` sprite offsets). SDK6 wrote `z:+0.1` for its click boxes but their parent planes had a negative Z scale, so they really landed at `-0.1`, in front. After normalizing scales you must write the `-0.1` yourself or every button ends up behind the screen where the full-screen E/F box eats the raycast. And registering `pointerEventsSystem.onPointerDown` twice on one entity (once per InputAction) silently **replaces** the first — that's why only F worked. Multiple buttons on one entity ⇒ declare them in a `PointerEvents` component and poll `inputSystem.isTriggered(action, PET_DOWN, entity)` in a system. The E/F box was also nudged to `z:+0.06` so buttons always win the raycast (`board.glb` has no `_collider` meshes, so nothing occludes it).

**Async-dialog robustness** (same session, `npc-storymode.ts`): `onActivateExecuteDialog` sets `loading = true` and used to clear it only on the last line — any throw in between left the NPC **permanently mute** (every later click hit the `if (loading) return` guard). Now `try/finally`. Its awaited network calls (`/api/check-npc-mission`, `refreshUserData()` — the latter hits PlayFab + a Polygon RPC + the subgraph) are bounded with a `withTimeout()` `Promise.race` helper; the sandbox has no `AbortController`.
