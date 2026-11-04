import fetch from "cross-fetch";

// How many players a Ranked party may hold (user request, 2026-11-04: not just
// four). Read from the admin's `config` table, row `partyMaxPlayers`, whose
// value is a bare number, e.g. 20. No row means DEFAULT_MAX.
//
// There is no "unlimited": season-party-room gives EVERY player their own
// server-side cannon world and ticks all of them in update(), so the room's
// cost grows linearly with the party and a big one can starve the others on
// the same process. HARD_MAX is the point past which we refuse to go without
// measuring first; raise it deliberately, not by typing a bigger number in the
// admin.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 4000;

export const DEFAULT_MAX = 16;
export const HARD_MAX = 32;
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
