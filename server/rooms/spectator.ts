import {Client} from "colyseus";

// Watching a game that is being played (user request, 2026-11-04).
//
// A spectator needs nothing new on the wire: the rooms already sync the ball
// with its position and rotation, the moving parts, the shot frames, the shot
// count, the clock and the recorded opponents. Watching is reading that state,
// so a spectator is simply a client that joins the room and is ignored by it.
//
// "Ignored" is the whole job, and it is the risky part, because these rooms
// spend energy, hand out rewards and take season points away from somebody who
// leaves early. Every lifecycle hook therefore gets an early exit:
//
//   onAuth   must not resolve a player, must not check the game window and
//            above all must not overwrite the room's own PlayFabId/address,
//            which in Season-Room identify THE player of the room
//   onJoin   must not create a player, physics, or a seat in the results
//   onLeave  must not wait for a reconnection, must not apply the abandon
//            penalty and must not dispose the game
//
// A spectator also must not keep a finished room alive: the rooms dispose on
// their own terms, and anyone still watching is dropped with them.
export const SPECTATE_OPTION = "spectate";

export type SpectatorAuth = {spectator: true};

export const wantsToSpectate = (options: any) => !!options?.[SPECTATE_OPTION];

// onAuth returns this, and colyseus hands it back as client.auth on every hook.
export const spectatorAuth = (): SpectatorAuth => ({spectator: true});

export const isSpectator = (client: Client) => !!(client as any)?.auth?.spectator;

// A room with nobody but spectators left has nothing to show and will never
// end on its own: colyseus only auto-disposes when the LAST client leaves, so
// a spectator keeps a finished game alive and never gets dropped from it
// (report, 2026-11-04: "cuando acaba el juego, no se acaba para mi"). The room
// calls this once its real player has gone.
export function disconnectIfOnlySpectators(room: {clients: any[], disconnect: () => any}): boolean {
    const players = room.clients.filter(client => !isSpectator(client));
    if (players.length) return false;
    console.log("only spectators left, closing the room");
    Promise.resolve(room.disconnect()).catch(() => {});
    return true;
}

// What a room publishes so /live-games can list it without opening it.
export type LiveGameMetadata = {
    mode: string;
    courseId?: string;
    players?: string[];
    startedAt?: number;
    hole?: number;
    holes?: number;
    spectators?: number;
};
