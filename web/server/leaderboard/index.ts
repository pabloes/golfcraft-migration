import {PrismaClient} from "@prisma/client";
import {PlayFabServer} from "playfab-sdk";
import {promisify} from "util";

// The rolling 24 hour ranking behind the lobby's in-world board (the scene's
// components/lobby/leaderboard-panel.ts, user 2026-11-07: "el diario lo que
// quiero realmente, es las ultimas 24H").
//
// There is no PlayFab statistic for a window: `tier-sub` is the season total
// and `tier-sub-max` its all-time high, and neither can be sliced by time. So
// this adds up the ranked points of the finished Season runs of the last 24
// hours from our own `player_game` rows, which carry `rankedPoints` since
// 2026-11-03 and are indexed by `startTime` (the stats page added both).
//
// Only Season modes write `rankedPoints`, so a tutorial mission, a tournament
// or a training run is not in here, which is right: this is the Ranked ladder
// moving. An abandoned run costs -1 on the statistic but writes no game row,
// so it is not counted either.
//
// Names come from PlayFab, the same source as the statistic boards next to it,
// so the three boards in the lobby spell a player the same way. Only the top
// ten are looked up, once a minute at most.
const WINDOW_HOURS = 24;
const TOP = 10;
const CACHE_MS = 60 * 1000;
const NAME_TIMEOUT_MS = 4000;

type Row = {playFabId: string, name: string, points: number, games: number};
type Payload = {rows: Row[], windowHours: number, from: string, to: string, trackedSince: string | null};

let cached: {at: number, data: Promise<Payload>} | null = null;

export function leaderboardApi(router, prisma: PrismaClient){
    router.get("/api/leaderboard-24h", async (req, res) => {
        try{
            if(!cached || Date.now() - cached.at > CACHE_MS){
                const data = compute(prisma);
                cached = {at: Date.now(), data};
                //a failed computation must not be cached for a minute
                data.catch(() => { if(cached?.data === data) cached = null; });
            }
            res.set("Cache-Control", "public, max-age=60");
            return res.send(await cached.data);
        }catch(error){
            console.log("/api/leaderboard-24h error", error?.message || error);
            return res.status(500).send({error: "leaderboard unavailable"});
        }
    });
}

async function compute(prisma: PrismaClient): Promise<Payload> {
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
    const [rows, tracking]: any[] = await Promise.all([
        //PlayFabId, not address: a guest's room address is its PlayFabId while
        //a web3 player's is the wallet, and the name lookup needs the id
        prisma.$queryRaw`SELECT PlayFabId, SUM(rankedPoints) AS points, COUNT(*) AS games
                FROM player_game
                WHERE startTime >= ${from} AND rankedPoints IS NOT NULL
                    AND PlayFabId IS NOT NULL AND PlayFabId <> ''
                GROUP BY PlayFabId
                ORDER BY points DESC, games ASC
                LIMIT ${TOP}`,
        prisma.$queryRaw`SELECT DATE_FORMAT(MIN(CASE WHEN rankedPoints IS NOT NULL THEN startTime END), '%Y-%m-%d') AS since
                FROM player_game`
    ]);
    const list: Row[] = (rows || []).map(row => ({
        playFabId: String(row.PlayFabId),
        name: "",
        points: Number(row.points || 0),
        games: Number(row.games || 0)
    }));
    const names = await displayNames(list.map(row => row.playFabId));
    list.forEach(row => { row.name = names[row.playFabId] || row.playFabId; });
    return {
        rows: list,
        windowHours: WINDOW_HOURS,
        from: from.toISOString(),
        to: to.toISOString(),
        trackedSince: tracking?.[0]?.since || null
    };
}

// PlayFab has no bulk name lookup in the Server API, so the ten profiles are
// asked for in parallel. A lookup that fails leaves that row with its id,
// which is better than an empty board.
async function displayNames(ids: string[]): Promise<{[id: string]: string}> {
    const out: {[id: string]: string} = {};
    if(!ids.length) return out;
    const getProfile: any = promisify(PlayFabServer.GetPlayerProfile);
    await Promise.all(ids.map(async PlayFabId => {
        try{
            const result: any = await withTimeout(getProfile({
                PlayFabId,
                ProfileConstraints: {ShowDisplayName: true}
            }), NAME_TIMEOUT_MS);
            const name = result?.data?.PlayerProfile?.DisplayName;
            if(name) out[PlayFabId] = String(name);
        }catch(error){
            console.log("leaderboard-24h name lookup failed", PlayFabId, error?.errorMessage || error?.message || error);
        }
    }));
    return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then(value => { clearTimeout(timer); resolve(value); },
            error => { clearTimeout(timer); reject(error); });
    });
}
