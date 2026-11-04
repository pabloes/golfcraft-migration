import fetch from "cross-fetch";

// How many players a Ranked party may hold (user request, 2026-11-04: not just
// four). Read from the admin's `config` table, row `partyMaxPlayers`, whose
// value is a bare number, e.g. 20. No row means DEFAULT_MAX.
//
// season-party-room gives EVERY player their own server-side cannon world, so
// the room's cost grows linearly with the party. Measured rather than guessed
// (server/bench-party-physics.ts, 24 players on season-0-2, 2026-11-04):
//
//   memory          2.1 MB per player
//   set-up          11 ms per player, once per hole
//   tick            about 0 ms with 24 (the per-frame work is the moving
//                   parts; the physics runs inside the shot, not every frame)
//   shot            1.63 ms, so 24 players shooting in the same instant block
//                   the event loop for 39 ms
//
// So a big party is far cheaper than it looks: the ceiling below is about
// memory and the size of the synced state, not about the simulation. HARD_MAX
// is a guard against an absurd number in the admin, not a performance limit.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 4000;

export const DEFAULT_MAX = 32;
//100 players is about 210 MB of physics worlds, which is the real cost
export const HARD_MAX = 100;
export const MIN_MAX = 2;

let cached = {at: 0, max: DEFAULT_MAX};

export function partyMaxPlayers(): number {
    return cached.max;
}

// Refreshed on a timer by the lobby room; never in the path of a join.
export async function refreshPartyMaxPlayers(): Promise<number> {
    if (Date.now() - cached.at < CACHE_MS) return cached.max;
    try {
        const config: any = await Promise.race([
            fetch(`${API_URL}/api/config`).then(r => r.json()),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))
        ]);
        const asked = Math.floor(Number(config?.partyMaxPlayers));
        const max = isFinite(asked) ? Math.min(HARD_MAX, Math.max(MIN_MAX, asked)) : DEFAULT_MAX;
        if (max !== cached.max) console.log("party max players is now", max);
        cached = {at: Date.now(), max};
    } catch (error) {
        //keep whatever we had: a party size is not worth failing a lobby over
        cached = {at: Date.now() - CACHE_MS / 2, max: cached.max};
    }
    return cached.max;
}
