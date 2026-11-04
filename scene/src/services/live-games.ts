// The games being played right now, for the spectator view.
//
// Served by the game server itself (server/server.ts `*/live-games`), because
// it is the only thing that knows what rooms exist. Names only: no wallet and
// no PlayFabId comes back from it.
//
// Asked when the view opens and every REFRESH_MS while it is open, never in
// the background: nobody needs this list unless they are looking at it.
// @ts-ignore - common/constants has @ts-nocheck
import { SERVER_HTTP_URL } from '../../../common/constants'

export type LiveGame = {
  roomId: string
  name: string
  mode: string
  courseId: string
  players: string[]
  startedAt: number
  hole: number
  holes: number
  spectators: number
}

export const liveGamesState = {
  games: [] as LiveGame[],
  loading: false,
  loadedAt: 0,
  error: ''
}

const REFRESH_MS = 8000
const TIMEOUT_MS = 6000

export const liveGamesAreStale = () => Date.now() - liveGamesState.loadedAt > REFRESH_MS

export async function refreshLiveGames(): Promise<void> {
  if (liveGamesState.loading) return
  liveGamesState.loading = true
  try {
    const answer: any = await Promise.race([
      fetch(`${SERVER_HTTP_URL}/live-games`).then((r) => r.json()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
    ])
    liveGamesState.games = Array.isArray(answer?.games) ? answer.games : []
    liveGamesState.error = ''
  } catch (err) {
    console.log('[live-games] could not be read:', err)
    liveGamesState.error = 'Could not read the games being played'
  } finally {
    liveGamesState.loadedAt = Date.now()
    liveGamesState.loading = false
  }
}
