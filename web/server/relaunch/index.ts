import path from "path";
import {PrismaClient} from "@prisma/client";
import {redactedMessage} from "../../../common/redact";
import {isWallet, lookupNames, maskWallet, playerId} from "../lib/player-names";

// golfcraftgame.com/relaunch-data: the relaunch event's ticket list and the
// raffle draw (owner, 2026-11-07). One raffle ticket is one completed game, so
// this is `player_game` grouped by player over the event window, and the page
// draws the winners from it.
//
// Two things make it different from /stats and worth its own route:
//   - The list may NOT be capped. /api/stats/visitors stops at 300 rows
//     ordered by recency, which is fine for a dashboard and useless for a
//     raffle: a capped list silently drops entrants. This one returns every
//     player in the window.
//   - The order must be deterministic and independent of how MySQL happens to
//     return rows, because the draw walks it. Hence `games` DESC then `id` ASC,
//     where `id` is the first 12 hex of sha256(wallet): stable, unique, and not
//     reversible, so it can be published next to the cut wallet.
//
// The draw itself runs in the browser, in the page's own source, so anybody can
// read it and re-run it. The server only serves the entrants.
//
// Nothing here exposes a full wallet or a PlayFabId.
const DAY = 1000 * 60 * 60 * 24;
const CACHE_MS = 60 * 1000;
const PAGE = path.resolve(__dirname, "relaunch.html");

// The event window, UTC. The owner set the end to match the free-Energy window
// he announced (the `freeEnergy` config row ends 2026-11-08T23:59:00Z), so the
// list is final the moment the event is over. Both can be overridden with
// ?from= &to= for a different window.
const EVENT_FROM = "2026-10-31T00:00:00Z";
const EVENT_TO = "2026-11-08T23:59:00Z";

// A guard, not a feature: the page needs every entrant, and 20000 players in
// one window has never happened (the busiest 30 days of 2026 are in the low
// hundreds). If it ever trips, `capped` says so and the draw refuses to run.
const MAX_ENTRANTS = 20000;
const MAX_DAYS = 120;

const cache: {[key: string]: {at: number, data: Promise<any>}} = {};

export function relaunchApi(router, prisma: PrismaClient){
    router.get("/relaunch-data", (req, res) => res.sendFile(PAGE));

    router.get("/api/relaunch-data", async (req, res) => {
        try{
            const range = parseRange(req.query.from, req.query.to);
            if(!range) return res.status(400).send({error: "bad range"});
            const key = `${range.from.toISOString()}|${range.to.toISOString()}`;
            Object.keys(cache).forEach(k => Date.now() - cache[k].at > CACHE_MS && delete cache[k]);
            if(!cache[key]){
                const data = computeEntrants(prisma, range.from, range.to);
                cache[key] = {at: Date.now(), data};
                data.catch(() => { if(cache[key]?.data === data) delete cache[key]; });
            }
            res.set("Cache-Control", `public, max-age=${CACHE_MS / 1000}`);
            return res.send(await cache[key].data);
        }catch(error){
            console.log("/api/relaunch-data error", redactedMessage(error));
            return res.status(500).send({error: "relaunch data unavailable"});
        }
    });
}

//rounded to the minute so equal requests share the cache, and clamped so a
//hand-typed range cannot ask for the whole history
function parseRange(fromParam, toParam): {from: Date, to: Date} {
    const parse = (value, fallback: string) => {
        const raw = (value === undefined || value === "") ? fallback : value;
        if(typeof raw !== "string" || raw.length > 40) return NaN;
        return Date.parse(raw);
    };
    const minute = (ms: number) => Math.floor(ms / 60000) * 60000;
    const to = parse(toParam, EVENT_TO);
    const from = parse(fromParam, EVENT_FROM);
    if(isNaN(to) || isNaN(from) || from >= to) return null;
    //the end may be in the future: that is the normal state while the event runs
    return {from: new Date(minute(Math.max(from, to - MAX_DAYS * DAY))), to: new Date(minute(to))};
}

async function computeEntrants(prisma: PrismaClient, from: Date, to: Date){
    //player_game holds one row per FINISHED run, which is what a ticket is.
    //Tutorial missions are not in it at all, and `hole_start` (holes begun) is
    //deliberately not counted here.
    const [rows, modes]: any[] = await Promise.all([
        prisma.$queryRaw`SELECT LOWER(address) AS address, COUNT(*) AS games
            FROM player_game
            WHERE startTime >= ${from} AND startTime <= ${to}
                AND address IS NOT NULL AND address <> ''
            GROUP BY LOWER(address)
            ORDER BY games DESC
            LIMIT ${MAX_ENTRANTS + 1}`,
        //which modes those games were, as information: since 2024 only Season
        //is played, so "every completed game" and "every Season game" are the
        //same number in practice. If that ever stops being true, this line is
        //where it shows.
        prisma.$queryRaw`SELECT COALESCE(gameMode, '(none)') AS mode, COUNT(*) AS games
            FROM player_game
            WHERE startTime >= ${from} AND startTime <= ${to}
            GROUP BY gameMode ORDER BY games DESC`
    ]);

    const capped = rows.length > MAX_ENTRANTS;
    if(capped) console.log("/api/relaunch-data hit MAX_ENTRANTS", rows.length);
    const list = rows.slice(0, MAX_ENTRANTS).map(row => ({
        address: String(row.address).toLowerCase(),
        games: Number(row.games || 0)
    }));
    const names = await lookupNames(list.map(p => p.address), "relaunch profiles");

    const entrants = list
        .map(({address, games}) => ({
            //a stable unique key for the deterministic order and the draw,
            //publishable because it cannot be turned back into the wallet
            //(player-names.ts:playerId; /api/stats/visitors serves the same one)
            id: playerId(address),
            name: names[address] || "",
            wallet: maskWallet(address),
            isWallet: isWallet(address),
            games
        }))
        //the draw walks this order, so it must not depend on MySQL's
        .sort((a, b) => b.games - a.games || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const now = Date.now();
    return {
        from: from.toISOString(),
        to: to.toISOString(),
        now: new Date(now).toISOString(),
        //while the window is open the list still moves, so the page must not
        //present a draw made now as the final one
        closed: to.getTime() <= now,
        msLeft: Math.max(0, to.getTime() - now),
        totalGames: entrants.reduce((n, e) => n + e.games, 0),
        players: entrants.length,
        //a player whose address is not a wallet is a guest or a Studio account
        //(their player_game rows are keyed by PlayFabId): they have tickets but
        //no wallet to send a wearable to
        nonWallet: entrants.filter(e => !e.isWallet).length,
        modes: modes.map(m => ({mode: String(m.mode), games: Number(m.games || 0)})),
        capped,
        entrants
    };
}
