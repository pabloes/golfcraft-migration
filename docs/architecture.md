# GolfCraft Studio client: architecture

A second client of GolfCraft built with The Sandbox Studio (engine: Genesys, `@gnsx/genesys.js`, three.js + Rapier, TypeScript, Vite, pnpm). It plays against the SAME backend as the Decentraland scene. Decided with the user on 2026-10-22.

## Decisions (do not re-litigate)

| Topic | Decision |
|---|---|
| Identity | Four logins in v1, all opening ONE PlayFab account per player (`docs/contracts/login.md`): wallet signature (EIP-191 `personal_sign`; MetaMask on desktop, WalletConnect on phones), guest (device CustomId), email + password (PlayFab native), Google (PlayFab OpenID Connect). A wallet login is the same account as Decentraland (`address` generic ID). Any account can add the other methods later; never a merge. No Sandbox-account login: the Studio hands the game no verifiable identity (checked 2026-10-22). Server rooms authenticate the PlayFab session ticket instead of trusting the client's `publicKey`/`PlayFabId`. |
| Scope v1 | Login, menu (energy, resources, Season PLAY, top 10), one full Season run (4 holes vs recorded players, HUD, hole result, run complete, real rewards), monthly game window, desktop + phone. |
| Out of v1 | Tutorial/NPC, workshop, prizes, party with friends, daily missions, tournaments, attached clubs, avatars, MORE GAMES, Xsolla payments. |
| Physics on the client | cannon.js (`scene/golfplay/physics`), identical to the server. Rapier stays disabled for course geometry. |
| Location | `studio/` in this repo. Shared code imported by relative path, no refactor, no package extraction. |
| Lobby | No 3D lobby and no avatars: HTML menu → course. |
| Platform risk | Accepted: The Sandbox has published no rule on external backends. |
| Backend | Web API: `POST /api/login-wallet` (+ nonce) and `POST /api/link-wallet`. Server rooms: `onAuth` validates `clientInfo.sessionTicket` (`AuthenticateSessionTicket`) and keys records by the verified wallet or, without one, the PlayFabId (see `docs/contracts/login.md`). The scene has the ticket and must pass it in every join (today only the mission join does). |

## System

```
Studio page (studio.sandbox.game/play/<id>, https)
  ├─ https://golfcraftgame.com/api   login-wallet, link-wallet, config, game-window, get-course, parts, player-game…
  ├─ PlayFab Client REST             LoginWithCustomID / LoginWithEmailAddress / LoginWithOpenIdConnect, GetPlayerCombinedInfo, ExecuteCloudScript (same as scene/src/meta/playfab-rest.ts)
  └─ wss://ws.golfcraftgame.com      Colyseus 0.14: season-room (v1), gameLobbyRoom (later); joins carry clientInfo.sessionTicket
```

The Colyseus server stays authoritative. The client runs cannon locally for the same reasons the Decentraland client does (local ball simulation driven by server frames and events, see `scene/src/components/lobby/golfplay-client*.ts` and `scene/golfplay/src/season-demo.ts`).

Local dev: the engine's Play-In-Editor serves the game from localhost over http, so it can talk to the local backend (`http://localhost:2569`, `ws://localhost:2567`) or to production. The published page is https, so it can only use https/wss endpoints (production).

## Modules (one owner each, see docs/tasks.md)

| Module | Path | Does | Depends on |
|---|---|---|---|
| auth | `studio/src/auth/`, `web/server/auth/`, `server/rooms/*` (ticket auth only) | login screen with the four methods, nonce + signature login, link-wallet, email/Google linking, remember-me, logout, "save your progress" prompt; server-side ticket authentication in the rooms | contract login |
| bridge | `studio/src/bridge/` | PlayFab REST client, Colyseus client, bootstrap state (resources, energy, tier, config, game window), refresh | auth |
| course | `studio/src/course/` | course definition → Genesys nodes (`ModelMeshNode` per part from GLB), ball, zones, checkpoints, cannon world | assets |
| play | `studio/src/play/` | shoot control, orbit camera, mouse + touch input, Season driver (port of `season-demo.ts`) | course, bridge |
| ui | `studio/src/ui/` | menu, HUD, hole result, run complete, closed notice; HTML/CSS in `world.gameContainer`, phone and desktop | contracts only |
| assets | `studio/assets/`, `studio/scripts/` | gltf+bin → glb conversion of `scene/golfplay/models`, compression config, sounds | none |

Shared code consumed by relative import (read-only for the Studio agents):
- `common/` (constants, utils, tiers, course definitions, game window)
- `scene/golfplay/physics/` (cannon world, ball, course element loader; 203 files, no DCL imports)
- `scene/golfplay/src/gameplay-handlers/` (no DCL imports)
- `server/rooms/mesages.ts` (MESSAGE enum; never renumber)
- `lib/expression-storage/_expression-storage.ts` (the `.ts` lite evaluator is the client one)

`common/constants.ts` has the compile-time switch `USE_REMOTE_SERVER` (false in the repo, flipped to true by the production Dockerfiles and `scripts/build-scene-prod.sh`). The Studio build must not depend on editing that file: `studio/src/config.ts` owns the endpoints (production by default, local override through `VITE_GOLFCRAFT_LOCAL=1`), and phase 0 lists which shared modules still read `USE_REMOTE_SERVER` so the build can set it the same way the scene build does.

## Engine rules that shape the code

- Entry `studio/src/game.ts` exports `main()`; a minimal `GameMode`; `NetRuntime` is standalone (single player), the Studio multiplayer is not used.
- No `CharacterPawn`: a plain `Pawn` owning the orbit camera (`THREE.Camera` in its subtree), input through a `PlayerController` subclass (keyboard/mouse) plus the engine's touch events for phones.
- Course parts are `ModelMeshNode`s loaded from `@project/assets/parts/<name>.glb`. Physics of the course lives in cannon, so those nodes carry no Rapier bodies.
- UI goes into `world.gameContainer`; dynamic strings through `textContent`, never `innerHTML` (engine Safe UI rule).
- Assets referenced with `@project/assets/...` paths only; UI images excluded from KTX2 baking.
- Build/verify: `pnpm build` and `pnpm lint` inside `studio/`; never `pnpm dev`/`pnpm test`. The editor registers new classes with the MCP `action_build` or by reopening the project.
- `src/auto-imports.ts` and `src/game-data.ts` are generated: never edit.

## Verification plan

Phase 0 proves the four hypotheses before anything is parallelised: (1) shared code and cannon build under Vite, (2) a converted GLB part renders, (3) a Play-In-Editor game reaches `https://golfcraftgame.com/api/config` and joins the harmless `ping` room on `wss://ws.golfcraftgame.com`, (4) the user publishes the spike from the Studio and it still works from `studio.sandbox.game`. Phase 1 ends with one real Season run against production with the user's test account.
