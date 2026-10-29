# Contract: game protocol and shared data (unchanged, read-only)

The Studio client reuses the production protocol as is. Nothing here changes for v1; this page says where the truth lives.

## Colyseus (server 0.14, client `colyseus.js ^0.14.13`)

- Endpoint: `wss://ws.golfcraftgame.com` (matchmaking derived by the client from the same host). Local: `ws://localhost:2567`.
- Message ids: `server/rooms/mesages.ts` (`MESSAGE` enum, appended only, never renumbered).
- Season run: room `season-room`. The reference client is `scene/golfplay/src/season-demo.ts` (4 rounds, READY/START/SHOOT/COMPLETED, countdown, results, rewards) with `scene/src/components/lobby/golfplay-client-season.ts` (visual + cannon orchestration) and `scene/src/components/lobby/golfplay-client.ts`. The Studio `play` module ports that flow one to one: same join options, same message order, same timings.
- Server room: `server/rooms/Season-Room.ts`. It is gated by the monthly game window (`server/game-window-gate.ts`, `common/game-window.ts`, `GET /api/game-window?address=`). Join options carry `clientInfo: { sessionTicket }`, which the room authenticates (`docs/contracts/login.md`, "Server rooms"); `user.publicKey` is only honoured when it belongs to that account.
- Later (not v1): `gameLobbyRoom` (presence, passive income), `season-party-lobby` / `season-party-room` (ranked with friends; already cross-client because both clients share the backend).

## PlayFab

- Client REST as in `scene/src/meta/playfab-rest.ts` (no SDK in the browser bundle needed either). Login methods and linking: `docs/contracts/login.md`.
- Resources, energy, xp and level: see `.claude/CLAUDE.md` §6 #14, #17 and §6.5 (VirtualCurrency, `UserReadOnlyData.xp`, `getLevelInfo`). `bootstrap.ts:applyCombinedInfoToHud` is the reference for what the menu shows.
- New-account initialisation: cloudscript `initializePlayer` (§6 #24).
- Season rewards are granted by the server (`completeSeasonMap`), the client only refreshes.

## Web API

`https://golfcraftgame.com/api` (local `http://localhost:2569/api`): `config`, `game-window`, `get-course`, `parts` (remote physic parts, ~4 MB, required before any course loads: `decorateRemotePhysicParts`), `seasons` endpoints used by the Season screens (ranking), `stats`. CORS is `*`.

## Course definitions and models

- Definitions: `common/course-definitions/*.ts` (240 local) and the DB through `/api/get-course`; loader `common/course-definitions/course-definition-repository.ts`.
- Physics parts: `scene/golfplay/physics/course-element-loader.ts` plus the remote `/api/parts`.
- Visual models: `scene/golfplay/models/<part>.gltf` + `.bin` (1018 files, 43 MB). The Decentraland client prepends `golfplay/`. The Studio converts each to `studio/assets/parts/<part>.glb` and maps the same name; the course module must not hardcode part names.
