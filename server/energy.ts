import fetch from "cross-fetch";

// Whether a Ranked run costs Energy right now (common/free-energy.ts). The
// rule is a dated window in the admin's `config` table, read through the web
// API, so it starts and ENDS on its own with nobody touching the server.
//
// Cached for a minute: this is asked once per run, at the end of its first
// hole, and a minute of staleness at the edges of a week-long window is not
// worth a round trip per room.
//
// It fails by CHARGING, the normal behaviour: if the web API cannot answer we
// must not hand out free runs to everyone for as long as it is down.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;
const CACHE_MS = 60 * 1000;
const TIMEOUT_MS = 4000;

let cached = {at: 0, free: false};

export async function isEnergyFree(): Promise<boolean> {
    if (Date.now() - cached.at < CACHE_MS) return cached.free;
    try {
        const answer: any = await Promise.race([
            fetch(`${API_URL}/api/game-window`).then(r => r.json()),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))
        ]);
        cached = {at: Date.now(), free: !!answer?.freeEnergy};
        return cached.free;
    } catch (error) {
        console.log("free-energy check failed, charging as usual", (error as any)?.message || error);
        //a short negative cache, so a dead web API is not asked once per run
        cached = {at: Date.now() - CACHE_MS / 2, free: false};
        return false;
    }
}
