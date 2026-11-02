import path from "path";
import fetch from "cross-fetch";
import {Prisma, PrismaClient} from "@prisma/client";
import {SERVER_HTTP_URL} from "../../../common/constants";
import {runChecks} from "../../../chain-playfab/security/securityChecks";
import {authenticateSessionTicket} from "../auth/session-ticket";
import {redactedMessage} from "../../../common/redact";

// Public dashboard at golfcraftgame.com/stats: /stats serves the page,
// /api/stats its numbers (aggregates only) and /api/stats/visitors the list of
// who visited in a range. That list is the only thing about single players
// that leaves this file: their public Decentraland name and the wallet cut to
// "0x27f...57". Full wallets and guests' identities never do.
//
// Visitors, one row per address and UTC day, with the time of the last visit
// that day (lastSeen, NULL in rows written before it existed) and the explorer
// the scene reported (explorer = the bucket desktop/web/mobile/vr/other,
// explorerAgent = the raw "<agent>/<platform>"; both NULL before 2026-11-02
// and for Studio logins):
//   - daily_visit: wallets, written by every scene login (/api/get-login-id).
//     It starts empty, so the wallet series also includes every wallet that
//     finished a game (player_game, kept since 2022): before tracking began
//     only players count.
//   - daily_guest_visit: guests (no wallet), which never call get-login-id;
//     the scene reports them through /api/record-visit.
// Unique visitors = every PlayFab account (one per wallet or guest that ever
// logged in, since 2021), counted from a daily "All Players" segment export.
// Holes started (the bracket after Games completed) = daily_hole_start, one
// counter per UTC day, game mode and explorer, bumped by the game server's
// /api/hole-start when a hole begins (server/hole-start.ts); the page sums a
// few hundred rows, never counts holes. Nothing before its first deploy.
// The explorer of a hole or a finished game is the one its player logged in
// with that UTC day (the visit tables), '' / unmatched when none is known.
const DAY = 1000 * 60 * 60 * 24;
const DAYS = 365;
const CACHE_MS = 60 * 1000;
const ONLINE_TIMEOUT_MS = 2500;
const PAGE = path.resolve(__dirname, "stats.html");
const PLAYFAB_ACCOUNTS_KEY = "statsPlayFabAccounts";
const VISITORS_MAX_DAYS = 31;
const VISITORS_MAX_ROWS = 300;
const PROFILES_URL = "https://peer-lb.decentraland.org/lambdas/profiles";
const PROFILES_TIMEOUT_MS = 5000;
const PROFILE_CACHE_MS = 60 * 60 * 1000;
//the scene's explorer tag ("<agent>/<platform>", scene/src/services/platform.ts)
const EXPLORER_RAW_MAX = 48;
type ExplorerBucket = "desktop" | "web" | "mobile" | "vr" | "other";
const EXPLORER_BUCKETS: ExplorerBucket[] = ["desktop", "web", "mobile", "vr", "other"];
type VisitTable = "daily_visit" | "daily_guest_visit";
//hole-start: the game mode as the rooms name it ("season", "mission", ...),
//and at most one party's worth of holes per call
const HOLE_MODE_MAX = 16;
const HOLE_COUNT_MAX = 16;
//columns added after the tables existed, in order; MySQL 8 has no ADD COLUMN IF NOT EXISTS
const LATER_COLUMNS: [string, string][] = [
    ["lastSeen", "DATETIME NULL"],
    ["explorer", "VARCHAR(16) NULL"],
    ["explorerAgent", `VARCHAR(${EXPLORER_RAW_MAX}) NULL`]
];

let cached: {at: number, data: Promise<any>} = null;
//per range (rounded to the minute), for CACHE_MS
const visitorsCache: {[range: string]: {at: number, data: Promise<any>}} = {};
//wallet -> public Decentraland name ("" when it has none), for PROFILE_CACHE_MS
const profileNames: {[address: string]: {at: number, name: string}} = {};
//{count, updatedAt}; also kept in the config table so a restart shows it at once
let playFabAccounts: {count: number, updatedAt: string} = null;
let countingAccounts = false;

export function statsApi(router, prisma: PrismaClient){
    (["daily_visit", "daily_guest_visit"] as VisitTable[]).forEach(table => prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${table} (
        day DATE NOT NULL,
        address VARCHAR(45) NOT NULL,
        lastSeen DATETIME NULL,
        explorer VARCHAR(16) NULL,
        explorerAgent VARCHAR(${EXPLORER_RAW_MAX}) NULL,
        PRIMARY KEY (day, address)
    )`).then(() => addLaterColumns(prisma, table))
        .catch(error => console.log(`${table} table error`, error?.message)));
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS daily_hole_start (
        day DATE NOT NULL,
        gameMode VARCHAR(${HOLE_MODE_MAX}) NOT NULL,
        explorer VARCHAR(16) NOT NULL DEFAULT '',
        n INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (day, gameMode, explorer)
    )`).then(() => addHoleExplorerColumn(prisma))
        .catch(error => console.log("daily_hole_start table error", error?.message));

    loadPlayFabAccounts(prisma).then(() => refreshPlayFabAccounts(prisma));
    setInterval(() => refreshPlayFabAccounts(prisma), 60 * 60 * 1000);

    router.get("/stats", (req, res) => res.sendFile(PAGE));

    router.get("/api/stats", async (req, res) => {
        try{
            if(!cached || Date.now() - cached.at > CACHE_MS){
                const data = computeStats(prisma);
                cached = {at: Date.now(), data};
                data.catch(() => { if(cached?.data === data) cached = null; });
            }
            res.set("Cache-Control", "public, max-age=60");
            return res.send(await cached.data);
        }catch(error){
            console.log("/api/stats error", error?.message || error);
            return res.status(500).send({error: "stats unavailable"});
        }
    });

    //?from=<ISO>&to=<ISO>, the last 24 hours by default
    router.get("/api/stats/visitors", async (req, res) => {
        const range = parseRange(req.query.from, req.query.to);
        if(!range) return res.status(400).send({error: "invalid range"});
        try{
            const key = `${range.from.getTime()}-${range.to.getTime()}`;
            Object.keys(visitorsCache).forEach(k => Date.now() - visitorsCache[k].at > CACHE_MS && delete visitorsCache[k]);
            if(!visitorsCache[key]){
                const data = computeVisitors(prisma, range.from, range.to);
                visitorsCache[key] = {at: Date.now(), data};
                data.catch(() => { if(visitorsCache[key]?.data === data) delete visitorsCache[key]; });
            }
            res.set("Cache-Control", "public, max-age=60");
            return res.send(await visitorsCache[key].data);
        }catch(error){
            console.log("/api/stats/visitors error", error?.message || error);
            return res.status(500).send({error: "visitors unavailable"});
        }
    });

    //the game server reports a hole that just began: {apiKey, gameMode,
    //addresses} (one hole per player it starts for; the explorer is the one
    //each logged in with today) or, from an older server, {count}; the key is
    //the one /api/player-game takes
    router.post("/api/hole-start", async (req, res) => {
        try{
            const {apiKey, gameMode, count, addresses} = req.body || {};
            if(apiKey !== process.env.GOLF_API_KEY) return res.status(400).send({error: "NON AUTH"});
            const mode = String(gameMode || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, HOLE_MODE_MAX);
            if(!mode) return res.status(400).send({error: "invalid gameMode"});
            const players = (Array.isArray(addresses) ? addresses : [])
                .map(a => String(a || "").trim().toLowerCase().slice(0, 45)).filter(Boolean).slice(0, HOLE_COUNT_MAX);
            const byExplorer: {[explorer: string]: number} = {};
            if(players.length){
                const known = await explorersToday(prisma, players);
                players.forEach(a => byExplorer[known[a] || ""] = (byExplorer[known[a] || ""] || 0) + 1);
            }else{
                byExplorer[""] = Math.min(HOLE_COUNT_MAX, Math.max(1, Math.floor(Number(count) || 1)));
            }
            for(const explorer of Object.keys(byExplorer)){
                const n = byExplorer[explorer];
                await prisma.$executeRaw`INSERT INTO daily_hole_start (day, gameMode, explorer, n) VALUES (UTC_DATE(), ${mode}, ${explorer}, ${n})
                        ON DUPLICATE KEY UPDATE n = n + ${n}`;
            }
            return res.send({ok: true});
        }catch(error){
            console.log("/api/hole-start error", error?.message);
            return res.status(500).send({error: "not recorded"});
        }
    });

    //a guest's scene login: signed like get-login-id, the address is the
    //guest's own (ephemeral) identity; the body may carry the explorer
    router.post("/api/record-visit", async (req, res) => {
        try{
            let address;
            if(req.body?.sessionTicket){
                //a Studio login without wallet (guest, email, Google): the
                //PlayFab session ticket is the proof and the PlayFabId the key
                address = await authenticateSessionTicket(req.body.sessionTicket);
                if(!address) return res.status(401).send({error: "Invalid session"});
            }else{
                if(process.env.PROD && !(await runChecks(req))){
                    return res.status(400).send({error: "Validation error"});
                }
                address = JSON.parse(req.header("x-identity-auth-chain-0")).payload.toLowerCase();
            }
            await recordVisit(prisma, address, req.body?.explorer, "daily_guest_visit");
            return res.send({ok: true});
        }catch(error){
            console.log("/api/record-visit error", error?.message);
            return res.status(500).send({error: "not recorded"});
        }
    });
}

//One visit of `address` today, with the explorer it came from when known (the
//scene's x-golfcraft-explorer header or record-visit's `explorer`; a later
//visit the same day with a known explorer overwrites it). The inserts fall
//back column by column while the table is older than the code: without the
//explorer columns, then without lastSeen (the original INSERT IGNORE).
export function recordVisit(prisma: PrismaClient, address: string, explorer?: unknown, table: VisitTable = "daily_visit"): Promise<void> {
    const t = Prisma.raw(table);
    const parsed = parseExplorer(explorer);
    const bucket = parsed?.bucket || null;
    const agent = parsed?.raw || null;
    return prisma.$executeRaw`INSERT INTO ${t} (day, address, lastSeen, explorer, explorerAgent)
            VALUES (UTC_DATE(), ${address}, UTC_TIMESTAMP(), ${bucket}, ${agent})
            ON DUPLICATE KEY UPDATE lastSeen = UTC_TIMESTAMP(),
                explorer = COALESCE(${bucket}, explorer), explorerAgent = COALESCE(${agent}, explorerAgent)`
        .catch(() => prisma.$executeRaw`INSERT INTO ${t} (day, address, lastSeen)
                VALUES (UTC_DATE(), ${address}, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE lastSeen = UTC_TIMESTAMP()`)
        .catch(() => prisma.$executeRaw`INSERT IGNORE INTO ${t} (day, address) VALUES (UTC_DATE(), ${address})`)
        .then(() => undefined, error => console.log("recordVisit error", error?.message));
}

//The scene reports "<agent>/<platform>" (e.g. "unity-explorer/desktop",
//"bevy-web/web", "godot-explorer/mobile"): the agent decides the bucket when
//it is a known explorer, else the platform does. Anything that is not a
//printable string of at most EXPLORER_RAW_MAX chars is ignored (null).
export function parseExplorer(value: unknown): {bucket: ExplorerBucket, raw: string} {
    if(typeof value !== "string") return null;
    const raw = value.trim().replace(/[^\x20-\x7e]/g, "").slice(0, EXPLORER_RAW_MAX);
    if(!raw) return null;
    const [agent = "", platform = ""] = raw.toLowerCase().split("/");
    let bucket: ExplorerBucket = "other";
    if(/godot/.test(agent)) bucket = "mobile";
    else if(/unity/.test(agent)) bucket = "desktop";
    else if(/bevy/.test(agent) && (/web|wasm/.test(agent) || platform === "web")) bucket = "web";
    else if((EXPLORER_BUCKETS as string[]).includes(platform) && platform !== "other") bucket = platform as ExplorerBucket;
    return {bucket, raw};
}

//the explorer each address logged in with today (lowercase address -> bucket),
//from both visit tables; addresses without a visit today are left out
async function explorersToday(prisma: PrismaClient, addresses: string[]): Promise<{[address: string]: string}> {
    const known: {[address: string]: string} = {};
    if(!addresses.length) return known;
    try{
        const rows: any[] = await prisma.$queryRaw`SELECT address, explorer FROM daily_visit
                    WHERE day = UTC_DATE() AND explorer IS NOT NULL AND LOWER(address) IN (${Prisma.join(addresses)})
                UNION ALL SELECT address, explorer FROM daily_guest_visit
                    WHERE day = UTC_DATE() AND explorer IS NOT NULL AND LOWER(address) IN (${Prisma.join(addresses)})`;
        rows.forEach(({address, explorer}) => known[String(address).toLowerCase()] = String(explorer));
    }catch(error){
        console.log("explorersToday error", error?.message);
    }
    return known;
}

//daily_hole_start was first created without the explorer (2026-11-02, hours
//before this): add it to the key, its rows become "explorer unknown"
async function addHoleExplorerColumn(prisma: PrismaClient){
    const found: any[] = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_hole_start' AND COLUMN_NAME = 'explorer'`;
    if(Number(found[0]?.n)) return;
    await prisma.$executeRawUnsafe(`ALTER TABLE daily_hole_start ADD COLUMN explorer VARCHAR(16) NOT NULL DEFAULT '',
            DROP PRIMARY KEY, ADD PRIMARY KEY (day, gameMode, explorer)`);
    console.log("daily_hole_start: explorer column added");
}

//tables created before a column existed; MySQL 8 has no ADD COLUMN IF NOT EXISTS
async function addLaterColumns(prisma: PrismaClient, table: VisitTable){
    for(const [column, ddl] of LATER_COLUMNS){
        const found: any[] = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`;
        if(Number(found[0]?.n)) continue;
        await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
        console.log(`${table}: ${column} column added`);
    }
}

//a valid {from, to}: `to` no later than now (up to the end of this minute), at
//most VISITORS_MAX_DAYS before it (an older `from` is moved up), both on the
//minute so equal requests share the cache
function parseRange(fromParam, toParam): {from: Date, to: Date} {
    const parse = (value, fallback: number) => {
        if(value === undefined || value === "") return fallback;
        if(typeof value !== "string" || value.length > 40) return NaN;
        return Date.parse(value);
    };
    const minute = (ms: number) => Math.floor(ms / 60000) * 60000;
    const now = Date.now();
    const to = parse(toParam, now);
    if(isNaN(to)) return null;
    const end = to >= now ? minute(now) + 60000 : minute(to);
    const from = parse(fromParam, end - DAY);
    if(isNaN(from) || from > end) return null;
    return {from: new Date(minute(Math.max(from, end - VISITORS_MAX_DAYS * DAY))), to: new Date(end)};
}

async function computeVisitors(prisma: PrismaClient, from: Date, to: Date){
    //a row from before lastSeen existed only says which day: it counts for
    //every range that touches that day, and is shown as the date
    const [rows, guests]: any[] = await Promise.all([
        //grouped as bytes (collations differ), returned as text: Prisma 3 sends BINARY as base64
        //the device is the explorer of the latest visit in the range that
        //reported one (GROUP_CONCAT skips NULLs: games and old rows have none)
        prisma.$queryRaw`SELECT CONVERT(v.address USING utf8mb4) AS address,
                DATE_FORMAT(MAX(CASE WHEN v.exact = 1 THEN v.seen END), '%Y-%m-%dT%H:%i:%sZ') AS lastExact,
                DATE_FORMAT(MAX(CASE WHEN v.exact = 0 THEN v.seen END), '%Y-%m-%dT00:00:00Z') AS lastDay,
                SUM(v.game) AS games,
                SUBSTRING_INDEX(GROUP_CONCAT(v.explorer ORDER BY v.seen DESC SEPARATOR '|'), '|', 1) AS explorer,
                SUBSTRING_INDEX(GROUP_CONCAT(v.explorerAgent ORDER BY v.seen DESC SEPARATOR '|'), '|', 1) AS explorerAgent FROM (
                SELECT CAST(address AS BINARY) AS address, lastSeen AS seen, 1 AS exact, 0 AS game, explorer, explorerAgent FROM daily_visit
                    WHERE lastSeen >= ${from} AND lastSeen <= ${to}
                UNION ALL
                SELECT CAST(address AS BINARY), TIMESTAMP(day), 0, 0, explorer, explorerAgent FROM daily_visit
                    WHERE lastSeen IS NULL AND day >= DATE(${from}) AND day <= DATE(${to})
                UNION ALL
                SELECT CAST(LOWER(address) AS BINARY), startTime, 1, 1, NULL, NULL FROM player_game
                    WHERE startTime >= ${from} AND startTime <= ${to} AND address IS NOT NULL
            ) v GROUP BY v.address
            ORDER BY GREATEST(COALESCE(lastExact, ''), COALESCE(lastDay, '')) DESC
            LIMIT ${VISITORS_MAX_ROWS + 1}`,
        prisma.$queryRaw`SELECT COUNT(DISTINCT address) AS n FROM daily_guest_visit
                WHERE (lastSeen >= ${from} AND lastSeen <= ${to})
                    OR (lastSeen IS NULL AND day >= DATE(${from}) AND day <= DATE(${to}))`
    ]);
    const capped = rows.length > VISITORS_MAX_ROWS;
    const list = rows.slice(0, VISITORS_MAX_ROWS).map(row => {
        const address = String(row.address).toLowerCase();
        const exact = row.lastExact ? new Date(String(row.lastExact)) : null;
        const day = row.lastDay ? new Date(String(row.lastDay)) : null;
        //a day-level row only wins over an exact time of an earlier day
        const dayOnly = !!day && (!exact || day.getTime() > exact.getTime());
        const explorer = row.explorer ? String(row.explorer) : null;
        return {address, lastSeen: (dayOnly ? day : exact).toISOString(), dayOnly, games: Number(row.games || 0),
            explorer, explorerAgent: explorer && row.explorerAgent ? String(row.explorerAgent) : null};
    });
    const names = await lookupNames(list.map(v => v.address));
    return {
        from: from.toISOString(),
        to: to.toISOString(),
        guests: Number(guests[0]?.n || 0),
        capped,
        visitors: list.map(({address, ...visit}) => ({name: names[address] || "", wallet: maskWallet(address), ...visit}))
    };
}

//"0x27ffcc...eb57" -> "0x27f...57"
function maskWallet(address: string){
    return address.length > 9 ? `${address.slice(0, 5)}...${address.slice(-2)}` : "...";
}

//public names from Decentraland profiles; a lookup that fails leaves them empty
//and is tried again on the next request
async function lookupNames(addresses: string[]): Promise<{[address: string]: string}> {
    const now = Date.now();
    const missing = addresses.filter(a => /^0x[0-9a-f]{40}$/.test(a) && !(profileNames[a] && now - profileNames[a].at < PROFILE_CACHE_MS));
    for(let i = 0; i < missing.length; i += 100){
        const ids = missing.slice(i, i + 100);
        try{
            const profiles: any[] = await Promise.race([
                fetch(PROFILES_URL, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ids})})
                    .then(r => r.ok ? r.json() : Promise.reject(new Error(`profiles ${r.status}`))),
                new Promise((_, reject) => setTimeout(() => reject(new Error("profiles timeout")), PROFILES_TIMEOUT_MS))
            ]) as any[];
            const found: {[address: string]: string} = {};
            (Array.isArray(profiles) ? profiles : []).forEach(profile => {
                const avatar = profile?.avatars?.[0];
                const id = String(avatar?.ethAddress || avatar?.userId || "").toLowerCase();
                if(id) found[id] = String(avatar?.name || "").slice(0, 40);
            });
            ids.forEach(a => profileNames[a] = {at: now, name: found[a] || ""});
        }catch(error){
            console.log("stats profiles lookup error", redactedMessage(error));
        }
    }
    return addresses.reduce((acc, a) => (acc[a] = profileNames[a]?.name || "", acc), {});
}

async function computeStats(prisma: PrismaClient){
    const since = new Date(Date.now() - DAYS * DAY);
    const since30 = new Date(Date.now() - 30 * DAY);
    //player_game is an old table with another collation than daily_visit, and
    //UNION refuses to mix them ("Illegal mix of collations"): compare as bytes
    const [wallets, guests, unique, games, tracking, mapsCreated, seasonMaps, online, dailyGames, explorers, holes]: any[] = await Promise.all([
        prisma.$queryRaw`SELECT DATE_FORMAT(v.day, '%Y-%m-%d') AS day, COUNT(DISTINCT v.address) AS visitors FROM (
                SELECT DATE(startTime) AS day, CAST(LOWER(address) AS BINARY) AS address FROM player_game
                    WHERE startTime >= ${since} AND address IS NOT NULL
                UNION ALL
                SELECT day, CAST(address AS BINARY) FROM daily_visit WHERE day >= ${since}
            ) v GROUP BY v.day ORDER BY v.day`,
        prisma.$queryRaw`SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, COUNT(*) AS visitors FROM daily_guest_visit
                WHERE day >= ${since} GROUP BY day ORDER BY day`,
        prisma.$queryRaw`SELECT COUNT(*) AS n FROM (
                SELECT CAST(LOWER(address) AS BINARY) AS address FROM player_game WHERE address IS NOT NULL
                UNION
                SELECT CAST(address AS BINARY) FROM daily_visit
            ) u`,
        prisma.$queryRaw`SELECT COUNT(*) AS total, SUM(startTime >= ${since30}) AS last30 FROM player_game`,
        prisma.$queryRaw`SELECT
                (SELECT DATE_FORMAT(MIN(day), '%Y-%m-%d') FROM daily_visit) AS wallets,
                (SELECT DATE_FORMAT(MIN(day), '%Y-%m-%d') FROM daily_guest_visit) AS guests`,
        prisma.courses.count(),
        prisma.courses.count({where: {isSeason: 1}}),
        fetchOnline(),
        prisma.$queryRaw`SELECT DATE_FORMAT(startTime, '%Y-%m-%d') AS day, COUNT(*) AS games FROM player_game
                WHERE startTime >= ${since} GROUP BY day ORDER BY day`,
        computeExplorers(prisma, since30),
        //one row per day and mode: a sum, not a count of holes
        prisma.$queryRaw`SELECT SUM(n) AS total, SUM(IF(day >= ${since30}, n, 0)) AS last30,
                DATE_FORMAT(MIN(day), '%Y-%m-%d') AS since FROM daily_hole_start`
            .catch(error => (console.log("/api/stats holes error", error?.message), []))
    ]);
    const days: {[day: string]: {day: string, wallets: number, guests: number, games: number}} = {};
    const at = (day) => days[day] = days[day] || {day, wallets: 0, guests: 0, games: 0};
    wallets.forEach(({day, visitors}) => at(day).wallets = Number(visitors));
    guests.forEach(({day, visitors}) => at(day).guests = Number(visitors));
    dailyGames.forEach(({day, games}) => at(day).games = Number(games));
    const today = at(new Date().toISOString().slice(0, 10));
    return {
        updatedAt: new Date().toISOString(),
        online,
        visitorsToday: {wallets: today.wallets, guests: today.guests},
        //PlayFab accounts; until the first export lands, the wallets seen in our tables
        uniqueVisitors: playFabAccounts ? playFabAccounts.count : Number(unique[0]?.n || 0),
        uniqueVisitorsFrom: playFabAccounts ? "playfab" : "wallets",
        gamesPlayed: Number(games[0]?.total || 0),
        gamesLast30Days: Number(games[0]?.last30 || 0),
        //holes begun in any mode (tutorial included), counted since holesTrackedSince
        holesStarted: Number(holes[0]?.total || 0),
        holesStartedLast30Days: Number(holes[0]?.last30 || 0),
        holesTrackedSince: holes[0]?.since || null,
        mapsCreated,
        seasonMaps,
        visitorsTrackedSince: {wallets: tracking[0]?.wallets || null, guests: tracking[0]?.guests || null},
        //unique visitors per explorer in the last 30 days, biggest first, with
        //the games completed and holes started by its players, and the first
        //day with an explorer: the scene only reports it since the 2026-11-02
        //deploy, so there is no history before that
        explorers: explorers.buckets,
        explorersSince: explorers.since,
        //games and holes of the last 30 days whose player's explorer is not known
        explorersUnmatched: {
            games: Math.max(0, Number(games[0]?.last30 || 0) - explorers.buckets.reduce((sum, b) => sum + b.games, 0)),
            holes: explorers.holesUnknown
        },
        daily: Object.values(days).sort((a, b) => (a.day < b.day ? -1 : 1))
    };
}

//{buckets: [{bucket, wallets, guests, total, games, holes}] (only buckets with
//visitors; games = finished games of the last 30 days whose player logged in
//with that explorer that day, holes = holes started, same rule),
//holesUnknown: holes of the window with no explorer known,
//since: "YYYY-MM-DD" | null}; empty while the explorer columns are missing
type ExplorerRow = {bucket: string, wallets: number, guests: number, total: number, games: number, holes: number};
async function computeExplorers(prisma: PrismaClient, since30: Date): Promise<{buckets: ExplorerRow[], holesUnknown: number, since: string}> {
    try{
        const [wallets, guests, first, games, holes]: any[] = await Promise.all([
            prisma.$queryRaw`SELECT explorer, COUNT(DISTINCT address) AS n FROM daily_visit
                    WHERE day >= ${since30} AND explorer IS NOT NULL GROUP BY explorer`,
            prisma.$queryRaw`SELECT explorer, COUNT(DISTINCT address) AS n FROM daily_guest_visit
                    WHERE day >= ${since30} AND explorer IS NOT NULL GROUP BY explorer`,
            prisma.$queryRaw`SELECT DATE_FORMAT(MIN(day), '%Y-%m-%d') AS since FROM (
                    SELECT MIN(day) AS day FROM daily_visit WHERE explorer IS NOT NULL
                    UNION ALL
                    SELECT MIN(day) FROM daily_guest_visit WHERE explorer IS NOT NULL
                ) d`,
            //a game joins the visit of its player on its day (the visits of the
            //window are a few hundred rows; player_game is scanned once, as the
            //other run queries do); the collations differ, so compare as bytes
            prisma.$queryRaw`SELECT v.explorer, COUNT(*) AS n FROM player_game g JOIN (
                        SELECT day, address, explorer FROM daily_visit WHERE day >= ${since30} AND explorer IS NOT NULL
                        UNION ALL
                        SELECT day, address, explorer FROM daily_guest_visit WHERE day >= ${since30} AND explorer IS NOT NULL
                    ) v ON v.day = DATE(g.startTime) AND CAST(LOWER(v.address) AS BINARY) = CAST(LOWER(g.address) AS BINARY)
                    WHERE g.startTime >= ${since30} AND g.address IS NOT NULL GROUP BY v.explorer`
                .catch(error => (console.log("/api/stats explorer games error", error?.message), [])),
            prisma.$queryRaw`SELECT explorer, SUM(n) AS n FROM daily_hole_start WHERE day >= ${since30} GROUP BY explorer`
                .catch(error => (console.log("/api/stats explorer holes error", error?.message), []))
        ]);
        const counts: {[bucket: string]: ExplorerRow} = {};
        const at = (bucket: string) => counts[bucket] = counts[bucket] || {bucket, wallets: 0, guests: 0, total: 0, games: 0, holes: 0};
        wallets.forEach(({explorer, n}) => at(String(explorer)).wallets = Number(n));
        guests.forEach(({explorer, n}) => at(String(explorer)).guests = Number(n));
        games.forEach(({explorer, n}) => at(String(explorer)).games = Number(n));
        let holesUnknown = 0;
        holes.forEach(({explorer, n}) => explorer ? (at(String(explorer)).holes = Number(n)) : (holesUnknown = Number(n)));
        const buckets = Object.values(counts)
            .map(c => ({...c, total: c.wallets + c.guests}))
            .filter(c => c.total > 0)
            .sort((a, b) => b.total - a.total || EXPLORER_BUCKETS.indexOf(a.bucket as ExplorerBucket) - EXPLORER_BUCKETS.indexOf(b.bucket as ExplorerBucket));
        return {buckets, holesUnknown, since: first[0]?.since || null};
    }catch(error){
        console.log("/api/stats explorers error", error?.message);
        return {buckets: [], holesUnknown: 0, since: null};
    }
}

//the ws server's /online; null (shown as "-") when it doesn't answer in time
async function fetchOnline(){
    try{
        const result: any = await Promise.race([
            fetch(`${SERVER_HTTP_URL}/online`).then(r => r.ok ? r.json() : null),
            new Promise(resolve => setTimeout(() => resolve(null), ONLINE_TIMEOUT_MS))
        ]);
        return result && {inScene: Number(result.inScene) || 0, playing: Number(result.playing) || 0};
    }catch(error){
        console.log("/api/stats online error", error?.message);
        return null;
    }
}

async function loadPlayFabAccounts(prisma: PrismaClient){
    try{
        const row = await prisma.config.findFirst({where: {key: PLAYFAB_ACCOUNTS_KEY}});
        if(row?.value) playFabAccounts = JSON.parse(row.value);
    }catch(error){
        console.log("stats load PlayFab accounts error", error?.message);
    }
}

//once a day (checked hourly): the export takes a minute or two, so it never
//runs inside a request
async function refreshPlayFabAccounts(prisma: PrismaClient){
    if(countingAccounts) return;
    if(playFabAccounts && Date.now() - Date.parse(playFabAccounts.updatedAt) < DAY) return;
    countingAccounts = true;
    try{
        playFabAccounts = {count: await countPlayFabAccounts(), updatedAt: new Date().toISOString()};
        const value = JSON.stringify(playFabAccounts);
        const row = await prisma.config.findFirst({where: {key: PLAYFAB_ACCOUNTS_KEY}});
        if(row) await prisma.config.update({where: {ID: row.ID}, data: {value}});
        else await prisma.config.create({data: {key: PLAYFAB_ACCOUNTS_KEY, value}});
        console.log("stats PlayFab accounts", playFabAccounts);
    }catch(error){
        //redacted: a fetch error carries the pre-signed URL of the full player export
        console.log("stats PlayFab accounts error", redactedMessage(error));
    }finally{
        countingAccounts = false;
    }
}

//Admin/GetPlayersInSegment is retired, so: export "All Players" and count the
//rows of its TSV parts (the same export scripts/playfab-delete-orphan-accounts.js uses)
async function countPlayFabAccounts(){
    const admin = (method: string, body: any) => fetch(`https://${process.env.PLAYFAB_TITLE_ID}.playfabapi.com/Admin/${method}`, {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-SecretKey": process.env.PLAYFAB_SECRET_KEY},
        body: JSON.stringify(body)
    }).then(r => r.json()).then(r => {
        if(r.code !== 200) throw new Error(`${method}: ${r.errorMessage || r.status}`);
        return r.data;
    });
    const {Segments} = await admin("GetAllSegments", {});
    const all = Segments.find(s => /^all players$/i.test(s.Name));
    if(!all) throw new Error('no "All Players" segment');
    const {ExportId} = await admin("ExportPlayersInSegment", {SegmentId: all.Id});
    let indexUrl: string = null;
    for(let attempt = 0; attempt < 90 && !indexUrl; attempt++){
        await new Promise(resolve => setTimeout(resolve, 10000));
        const {State, IndexUrl} = await admin("GetSegmentExport", {ExportId});
        if(State === "Complete") indexUrl = IndexUrl;
        else if(/fail|error|expired/i.test(State || "")) throw new Error(`export ${State}`);
    }
    if(!indexUrl) throw new Error("export did not complete");
    const parts = (await fetch(indexUrl).then(r => r.text())).split(/\r?\n/).filter(Boolean);
    let count = 0;
    for(const part of parts) count += await countTsvRows(part);
    return count;
}

//rows in one export part, streamed: the parts hold every player's profile and
//only the line count is kept (one header row per part)
async function countTsvRows(url: string){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`export part ${res.status}`);
    let newlines = 0;
    let lastByte = 10;
    await new Promise((resolve, reject) => {
        const body: any = res.body;
        body.on("data", (chunk: Buffer) => {
            for(let i = chunk.indexOf(10); i !== -1; i = chunk.indexOf(10, i + 1)) newlines++;
            if(chunk.length) lastByte = chunk[chunk.length - 1];
        });
        body.on("end", resolve);
        body.on("error", reject);
    });
    const lines = newlines + (lastByte === 10 ? 0 : 1);
    return Math.max(0, lines - 1);
}
