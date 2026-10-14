//Refuses to START a match outside the monthly game window (common/game-window.ts),
//unless the wallet is allow-listed. Asked to the web API, which reads the rule
//from the admin's config table. A match already started is never touched: the
//rooms only call this when a player joins or creates something.
//If the web API cannot answer, the game stays open (logged): a hiccup there
//must not lock every player out.
import fetch from "cross-fetch";
import {GAME_CLOSED_MESSAGE} from "../common/game-window";

const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;

export type GameAccess = {open: boolean, allowed: boolean, windowOpen: boolean, opensAt: number | null, closesAt: number | null};

export async function getGameAccessFor(address?: string | null): Promise<GameAccess> {
    try {
        const url = `${API_URL}/api/game-window${address ? `?address=${encodeURIComponent(String(address).toLowerCase())}` : ""}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`game-window answered ${response.status}`);
        return await response.json();
    } catch (error) {
        console.log("game-window check failed, letting the player in", (error as any)?.message || error);
        return {open: true, allowed: false, windowOpen: true, opensAt: null, closesAt: null};
    }
}

export function gameClosedMessage(access: GameAccess) {
    if (!access.opensAt) return GAME_CLOSED_MESSAGE;
    return `${GAME_CLOSED_MESSAGE} Next opening: ${new Date(access.opensAt).toUTCString().replace(":00 GMT", " UTC")}`;
}
