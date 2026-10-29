# GolfCraft Studio client: tasks

Coordinator: the "GOLFCRAFT DEV" session. Status values: todo, doing, review, done, blocked. Every agent updates its own rows and nothing else. No commits, pushes or deploys without the user.

## Phase 0: scaffold and hypothesis checks (sequential)

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| 0.1 | Scaffold `studio/` with `genesys-sdk new` (empty template), pnpm install, `pnpm build` + `pnpm lint` green | GOLFCRAFT SANDBOX (fork) | done | engine 18.0.0; `pnpm build` re-verified by the coordinator 2026-10-24 (exit 0). ⚠ A `pnpm install` was also run at the REPO ROOT on 2026-10-23 (root `pnpm-lock.yaml`, `pnpm-workspace.yaml` placeholder, `node_modules/.pnpm`): accidental, the root is an npm project; do not commit those two files |
| 0.2 | Import `../common`, `../scene/golfplay/physics`, `../scene/golfplay/src/gameplay-handlers`, `../server/rooms/mesages.ts` and cannon from Vite; list which shared modules read `USE_REMOTE_SERVER` | GOLFCRAFT SANDBOX (fork) | done | `studio/src/config.ts` owns endpoints; `src/spike/shared-check.ts` imports utils, game-window, mesages, physics world/ball/course-element-loader, gameplay-handler, democourse. Readers of `USE_REMOTE_SERVER`/`SERVER_URL`: `common/constants.ts`, `common/course-definitions/course-definition-repository.ts`, `scene/golfplay/physics/course-element-loader.ts` |
| 0.3 | Convert one course part (gltf+bin → glb) with a repeatable script and render it from code in the default scene | GOLFCRAFT SANDBOX (fork) | review | `studio/scripts/convert-parts.mjs`, `assets/parts/smart-door.glb`, `ModelMeshNode` in `game.ts`; not yet seen in the editor |
| 0.4 | From Play-In-Editor: `GET https://golfcraftgame.com/api/config`, then colyseus.js `joinOrCreate('ping')` on `wss://ws.golfcraftgame.com` | GOLFCRAFT SANDBOX (fork) | review | `src/spike/backend-check.ts` + overlay (enabled with `localStorage golfcraft:spike = 1`); blocked on the user opening `studio/studio.genesys-project` in the Studio and pressing Play |
| 0.5 | User publishes the spike from the Studio; verify 0.4 from `studio.sandbox.game` | user + coordinator | todo | |

## Phase 1: modules in parallel (worktrees, one owner per path)

| # | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| 1.1 | Web API: `POST /api/login-wallet` + nonce, `POST /api/link-wallet` (+ `hasProgress`), `POST /api/record-visit` with a session ticket (stats for non-wallet players), rate limit, `LOGIN_WALLET_SECRET` | GOLFCRAFT DEV (fork) | review | `web/server/auth/`; 14-check functional test passed 2026-10-23 against the live title (throwaway accounts deleted); not deployed |
| 1.2 | Client login screen: wallet (injected provider + WalletConnect), guest, email (register, login, recovery), Google (GIS ID token → `LoginWithOpenIdConnect`); remember-me, logout | GOLFCRAFT DEV (fork) | review | `studio/src/auth/` + `assets/ui/*/login-screen.*`; Google and WalletConnect buttons appear once 1.11 fills `config.ts`; guest flow run in Node against the live title 2026-10-23; not tried in the editor yet |
| 1.3 | Bridge: PlayFab REST, bootstrap state, config, game window, refresh; `initializePlayer` + display name on new accounts | GOLFCRAFT DEV (fork) | review | `studio/src/bridge/` (`playfab.ts`, `player-state.ts`, `colyseus.ts:getJoinOptions` with the session ticket) |
| 1.10 | Server rooms authenticate `clientInfo.sessionTicket` (`AuthenticateSessionTicket`) and key records by verified wallet or PlayFabId: Season-Room, season-party-lobby/room, Mission-Room, GameLobbyRoom; scene sends the ticket in every join | GOLFCRAFT DEV (fork) | review | `server/rooms/session-auth.ts`; no-ticket fallback kept until the scene deploy; scene build green; not deployed |
| 1.11 | Google Cloud OAuth web client + PlayFab OpenID Connect connection `google` (nonce check off); `LOGIN_WALLET_SECRET` in CapRover `golfcraft-web` | user | todo | |
| 1.12 | Account linking UI: "Save your progress" prompt for accounts without wallet/email/Google, link flows (wallet via 1.1, email `AddUsernamePassword`, Google `LinkOpenIdConnect`), the both-have-progress dialog | GOLFCRAFT DEV (fork) | review | `studio/src/auth/account-panel.ts` (top-right for now; the menu module places it); link-wallet needs the web deploy of 1.1 |
| 1.4 | Asset pipeline: all parts to GLB, compression config, sounds | studio-assets | todo | 0.3 |
| 1.5 | Course module: definition → nodes, ball, zones, checkpoints, cannon world | studio-core | todo | 0.2, 0.3 |
| 1.6 | Shoot control, orbit camera, mouse + touch input | studio-play | todo | 1.5 |
| 1.7 | Season driver (port of `season-demo.ts`), results, rewards refresh | studio-play | todo | 1.3, 1.5 |
| 1.8 | Menu, HUD, hole result, run complete, closed notice; desktop + phone | studio-ui | todo | contracts |
| 1.9 | Integration: one real Season run against production with the test account, once as wallet and once as guest | coordinator + user | todo | all |

## Decisions log

- 2026-10-22: scope, identity, physics, location, no avatars, platform risk (see `docs/architecture.md`).
- 2026-10-22 (later): identity widened from wallet-only to four logins in v1 (wallet, guest, email, Google) on one PlayFab account, with linking and ticket-based room auth (`docs/contracts/login.md`, replaces `login-wallet.md`).
