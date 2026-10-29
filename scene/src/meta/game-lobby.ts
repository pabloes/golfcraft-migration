// The shared `gameLobbyRoom` SDK6 joined at login (connectPlayfab.connectPlayer,
// with {realm, user, PlayFabId, gameId:1, tier}). Besides the attached golf
// clubs (components/attached-golfclub.ts), joining it brings back what the
// room does for a connected player in production: the daily connected-days
// statistics, the passive income in coins while connected, the daily energy
// bonus for NFT golf club holders, and the "<name> is at Golfcraft" Discord
// notice. SDK6 reconnected for ever when the connection dropped (code < 4000);
// this rejoins after a pause instead, which also restores the attachments.
// @ts-ignore - common/utils has @ts-nocheck
import { getTierFromSub, sleep } from '../../../common/utils'
import MESSAGE from '../../../server/rooms/mesages'
import { globalStore } from '../services/globalStore/globalStore'
import { clearAttachedGolfclubs, handleAttachedGolfclubs } from '../components/attached-golfclub'
import { getSessionTicket, refreshUserData } from './bootstrap'
import { showMessage } from '../components/lobby/server-notification'
import { reportPing } from '../ui/ping-state'

type JoinOptions = { colyseus: any; user: any; PlayFabId: string; realm: string }

export async function joinGameLobby(opts: JoinOptions): Promise<void> {
  const { colyseus, user, PlayFabId, realm } = opts
  for (let attempt = 1; ; attempt++) {
    try {
      const tier = getTierFromSub(Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)) || 0
      const lobbyRoom = await colyseus.joinOrCreate('gameLobbyRoom', {
        realm,
        user: { ...user, avatar: undefined },
        PlayFabId,
        clientInfo: { sessionTicket: getSessionTicket() },
        gameId: 1,
        tier
      })
      console.log('[game-lobby] joined', lobbyRoom.sessionId)

      lobbyRoom.onMessage('server', ({ message, timeout }: any) => showMessage({ message, timeout }))
      lobbyRoom.onMessage(MESSAGE.PASSIVE_INCOME, async () => {
        if (globalStore.game.getState().playing) return
        await sleep(10000)
        refreshUserData().catch((err: any) => console.log('[game-lobby] refresh after passive income failed', err))
      })
      lobbyRoom.onMessage('*', () => {})

      // Round trip for the HUD's ping (GameLobbyRoom answers PING with PONG).
      // Self-stopping like golfplay-client's: the sandbox's clearInterval is
      // not reliable, so a flag ends the sends once the room is gone.
      let pingSentAt = 0
      let pingStopped = false
      lobbyRoom.onMessage(MESSAGE.PONG, () => {
        if (pingSentAt) reportPing(Date.now() - pingSentAt)
      })
      const sendPing = () => {
        if (pingStopped) return
        pingSentAt = Date.now()
        try {
          lobbyRoom.send(MESSAGE.PING)
        } catch (_) {
          pingStopped = true
        }
      }
      sendPing()
      const pingTimer = setInterval(sendPing, 5000)

      // The players map arrives with the first state patch.
      lobbyRoom.onStateChange.once(() => handleAttachedGolfclubs(lobbyRoom, { realm, address: user.publicKey || user.userId }))

      lobbyRoom.onLeave((code: number) => {
        console.log('[game-lobby] left', code)
        pingStopped = true
        clearInterval(pingTimer)
        clearAttachedGolfclubs()
        // 4000+ are the server's own closes (consented / kicked): stay out.
        if (code < 4000) {
          sleep(5000).then(() => joinGameLobby(opts))
        }
      })
      return
    } catch (err) {
      console.log('[game-lobby] join failed, attempt', attempt, err)
      if (attempt >= 5) return
      await sleep(5000 * attempt)
    }
  }
}
