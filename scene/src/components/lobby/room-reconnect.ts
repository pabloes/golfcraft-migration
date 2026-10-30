// Reconnecting to a game room after the connection drops without a proper
// end (a code below 4000 that isn't a normal close). SDK6 tried once and
// never handled a failure, so a failed attempt left the player stuck on the
// course for good. This retries inside the server's reconnection window
// (allowReconnection, 20 s in the Season, party and mission rooms) and, when
// every attempt fails, hands over to `onGiveUp` so the game ends cleanly.
const RETRY_DELAYS_MS = [0, 1500, 3000, 5000, 8000]

export function reconnectRoom(
  colyseus: any,
  roomId: string,
  sessionId: string,
  onReconnected: (room: any) => void,
  onGiveUp: (error: any) => void
) {
  let attempt = 0
  const tryOnce = () => {
    colyseus.reconnect(roomId, sessionId).then(
      (room: any) => {
        console.log('[reconnect] back in room', roomId, 'after', attempt + 1, 'attempt(s)')
        onReconnected(room)
      },
      (error: any) => {
        console.log('[reconnect] attempt', attempt + 1, 'failed:', error?.message || error)
        attempt++
        if (attempt >= RETRY_DELAYS_MS.length) return onGiveUp(error)
        setTimeout(tryOnce, RETRY_DELAYS_MS[attempt])
      }
    )
  }
  tryOnce()
}
