import fetch from "cross-fetch";

// One hole begun, for the stats page's "Games completed (holes started)".
// A room calls it the moment a hole really starts for its player(s): the end
// of the countdown in the Season rooms (once per hole), READY in the mission
// and tournament rooms (once per room), START in competitions and training.
// The web API keeps one counter per UTC day and game mode (daily_hole_start),
// so the stats page never counts rows. Fire-and-forget: a failure costs that
// count and nothing else.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;

export function recordHoleStart(gameMode: string, count = 1): void {
    if (!(count > 0)) return;
    fetch(`${API_URL}/api/hole-start`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({apiKey: process.env.GOLF_API_KEY, gameMode, count})
    }).then(
        r => { if (!r.ok) console.log("hole-start refused", gameMode, r.status); },
        error => console.log("hole-start error", gameMode, error?.message)
    );
}
