# Production deploy on CapRover

Target: the four backend services and the MySQL database run as CapRover apps,
`golfcraftgame.com` and `ws.golfcraftgame.com` point at CapRover, and the SDK7
scene (with ranked, parties and real season rewards) is published first to a
Decentraland **World** and later to the game's parcels.

Everything here is repeatable from this repo. Secrets are never stored in it:
they go into each app's *App Configs → Environmental Variables* in CapRover.

## Apps

| CapRover app | What it is | Source | Domain |
|---|---|---|---|
| `golfcraft-mysql` | MySQL 8 with a persistent volume | CapRover one-click app | internal only |
| `golfcraft-web` | REST API + admin panel + the golfcraftgame.com site | this repo, `deploy/captain-definition-web` | `golfcraftgame.com` |
| `golfcraft-ws` | Colyseus game server (missions, season, ranked parties) | this repo, `deploy/captain-definition-ws` | `ws.golfcraftgame.com` |
| `golfcraft-bridge` | onchain-queue: mints season wearables and the mission-6 emote | `~/dev/ohmyverse/onchain-queue` | served under `golfcraftgame.com/bridge` |
| `golfcraft-chain` | golfclub NFT minter + ERC721 metadata (optional, not needed for ranked) | this repo, `deploy/captain-definition-chain-playfab` | its own subdomain |

The images run the services with `ts-node`, exactly as they run locally and as
`npm run prod` does today, on **Node 16** (newer Node breaks the web3/dcl-crypto
chain). `PROD=true` and `PORT=80` are baked in, and each Dockerfile flips
`common/constants.ts` `USE_REMOTE_SERVER` to `true` at build time, failing the
build if that line ever changes shape.

## What you have to provide

- A CapRover instance with a wildcard domain and Let's Encrypt working.
- DNS access for `golfcraftgame.com` and `ws.golfcraftgame.com` (lower the TTL
  to 60s a day before the cutover).
- The current `.env` values, pasted into each app's env vars in CapRover (list
  below). Don't send them through this repo or a chat.
- A `.dcl.eth` name for the test World, and the wallet that owns it.
- A `mysqldump` of the production database.

## Environment variables per app

Names only; the values are the ones already in the live `.env` files.

- **golfcraft-ws**: `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY`, `PLAYFAB_API_KEY`,
  `GOLF_API_KEY`, `SERVER` (the server id the competition matcher uses).
- **golfcraft-web**: `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY`, `GOLF_API_KEY`,
  `DATABASE_URL`, `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DB`,
  `ADMIN_PASS`, `ADMIN_COOKIE_PASSWORD`.
- **golfcraft-bridge**: `PRIVATE_KEY`, `PUBLIC_KEY`, `PROVIDER_URL`,
  `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY`, `CONTRACT_MATERIALS`, `ESTIMATE_GAS`,
  `FIXED_GAS_LIMIT`, `DATABASE_URL`, `GOLF_API_KEY`, `ALCHEMY_KEY`.
  The `PRIVATE_KEY` is the authorised minter wallet (CLAUDE.md §10) and it needs
  MATIC for gas.
- **golfcraft-chain**: `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY`, `PRIVATE_KEY`,
  `PUBLIC_KEY`, `CONTRACT_ADDRESS`, `WEB3_HTTP_PROVIDER_URL`, `WEB3_WS_PROVIDER_URL`.

With MySQL as a CapRover app, the hosts become `srv-captain--golfcraft-mysql`,
e.g. `DATABASE_URL=mysql://<user>:<pass>@srv-captain--golfcraft-mysql:3306/golfcraft`.

Paste the values **unquoted**. The local `.env` files wrap some of them in
double quotes (dotenv strips those, CapRover does not), and a quoted
`DATABASE_URL` makes Prisma refuse to start with *"the URL must start with the
protocol `mysql://`"*.

## Steps

### 0. Commit first

`caprover deploy` from a folder uploads the **committed** content of the current
branch, so `deploy/`, `.dockerignore` and any code change must be committed
before deploying.

### 1. MySQL

1. One-click app → MySQL 8, with a persistent volume, and a root password you
   keep in your password manager.
2. Create the `golfcraft` database and the app user.
3. Import the dump:
   `mysql -h <host> -u root -p golfcraft < golfcraft_backup.sql`
   (do it through a temporary container on the CapRover host, or by opening the
   MySQL app's port to your IP just for the import).
4. Check the counts against the old database (courses, recorded_game,
   wearables_catalog) before trusting it.

### 2. golfcraft-web

1. Create the app, *Has Persistent Data* off.
2. App Configs → env vars from the list above.
3. Deployment → **Captain Definition Relative File Path**:
   `./deploy/captain-definition-web`.
4. From the repo root: `caprover deploy -a golfcraft-web`.
5. HTTP Settings → Container HTTP Port **80**, then add `golfcraftgame.com`,
   enable HTTPS and *Force HTTPS* (after the DNS change in step 6).
6. Verify: `curl https://<app>.<caprover-domain>/api/config` returns JSON.

### 3. golfcraft-ws

Same as above with `./deploy/captain-definition-ws` and `-a golfcraft-ws`, plus
the one setting that matters: **HTTP Settings → Websocket Support = ON**.
Without it Colyseus connects, fails the upgrade and every join dies with a bare
`ServerError`.

Verify: `curl https://ws.golfcraftgame.com/ping` → `OK`, and the colyseus
monitor at `/monitor` (basic auth) lists the rooms, including
`season-party-lobby` and `season-party-room`.

### 4. golfcraft-bridge (season rewards)

The service lives in `~/dev/ohmyverse/onchain-queue`, which now has its own
`Dockerfile` + `captain-definition`. Create the app, set its env vars, and
deploy from that repo: `caprover deploy -a golfcraft-bridge`.

The client calls `https://golfcraftgame.com/bridge/...` (hardcoded in the scene,
same as SDK6), so the path has to keep working. In the **golfcraft-web** app,
App Configs → Custom Nginx Configuration, add inside the server block:

```nginx
location /bridge/ {
    proxy_pass http://srv-captain--golfcraft-bridge/bridge/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Verify: `curl https://golfcraftgame.com/bridge/season-rewards` returns the
wearable stock (the same JSON the prizes board reads).

### 5. golfcraft-chain (optional)

`./deploy/captain-definition-chain-playfab`, `-a golfcraft-chain`. Not needed for
ranked; it serves golfclub minting and the ERC721 metadata.

### 6. Cutover

1. Lower DNS TTL a day earlier.
2. Stop the old stack's writes (pm2 stop on the current box) and take the final
   dump; re-import it if it moved since step 1.
3. Point `golfcraftgame.com` and `ws.golfcraftgame.com` at the CapRover IP.
4. Enable HTTPS on both apps.
5. Smoke test with the live SDK6 scene: log in, play a mission, play a season
   run, check the admin panel.
6. **Leave the old box untouched for a few days** — rollback is putting the DNS
   back and starting pm2 again.

### 7. The scene

```bash
bash scripts/build-scene-prod.sh   # flips USE_REMOTE_SERVER, builds, flips back
```

- **World first**: add `"worldConfiguration": { "name": "<yourname>.dcl.eth" }`
  to `scene/scene.json`, then deploy with the wallet that owns the name
  (`npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org`).
  Test ranked, parties and rewards there against the production backend.
- **Parcels after that**: remove `worldConfiguration` and deploy to the catalyst
  with the LAND owner/operator wallet. This replaces the SDK6 scene players see
  today, so only do it once the World run is clean.

A production scene build claims **real** season rewards: `season-rewards-bridge`
enables the claim whenever `USE_REMOTE_SERVER` is true. That is the point of the
exercise, but it means every test run can mint a real wearable.

## Before the cutover, know this

- **The server in this repo is not byte-identical to what runs in production.**
  Compared with `~/dev/ohmyverse/golfcraft` at HEAD, it differs in:
  `Mission-Room.ts` (storymode missions lost the 12s countdown and gained the 1h
  cap / 10min idle kick — this changes behaviour for the SDK6 players who are
  live today), `Season-Room.ts` (only `export` keywords), `mesages.ts` (the
  `PARTY_*` values appended), `server.ts` (the two new rooms), `tsconfig.json`
  (`ts-node.transpileOnly`) and the three new `season-party-*` files. Confirm
  that HEAD of that repo is really what the live box runs before assuming this
  list is complete.
- **Competitions still depend on an external service.** In production the ws
  server talks to `http://52.12.188.146/golfcraft-competition` for groups; that
  service (`group-match-service`) is not in this repo. The CapRover host must be
  able to reach it, or competitions break.
- **Backups.** The one-click MySQL has no backups by default. Set up a dump to
  object storage before the cutover, not after.
- **Node 16 is end of life.** It is what the current code runs on; upgrading is
  a separate piece of work, not something to attempt during the migration.
