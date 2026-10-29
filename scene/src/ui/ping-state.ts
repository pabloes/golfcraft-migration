// Round trip to the game server (Colyseus PING -> PONG), shown small in the
// lobby HUD, the main menu and the in-hole HUD. The lobby room measures it
// while the player is in the lobby, the game rooms while playing; whichever
// answered last wins, and a reading older than STALE_MS is not shown.
const STALE_MS = 15000

export const pingState = { ms: null as number | null, at: 0 }

export const reportPing = (ms: number) => {
  pingState.ms = Math.max(0, Math.round(ms))
  pingState.at = Date.now()
}

export const currentPing = (): number | null =>
  pingState.ms !== null && Date.now() - pingState.at < STALE_MS ? pingState.ms : null
