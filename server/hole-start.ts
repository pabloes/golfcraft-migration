import fetch from "cross-fetch";

// The holes that just began, for the stats page's "Games completed (holes
// started)" and its per-explorer counts. A room calls it the moment a hole
// really starts for its player(s): the end of the countdown in the Season
// rooms (once per hole), READY in the mission and tournament rooms (once per
// room), START in competitions and training. `addresses` are the players it
// starts for (the wallet, or the PlayFabId of an account without one, as the
// room identifies them): one hole each, and the web API looks up the explorer
// each of them logged in with today. It keeps one counter per UTC day, game
// mode and explorer (daily_hole_start), so the stats page never counts holes.
// Fire-and-forget: a failure costs that count and nothing else.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;

export function recordHoleStart(gameMode: string, addresses: string[]): void {
    const players = (addresses || []).map(a => String(a || "").toLowerCase());
    if (!players.length) return;
    fetch(`${API_URL}/api/hole-start`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({apiKey: process.env.GOLF_API_KEY, gameMode, count: players.length, addresses: players})
    }).then(
        r => { if (!r.ok) console.log("hole-start refused", gameMode, r.status); },
        error => console.log("hole-start error", gameMode, error?.message)
    );
}
