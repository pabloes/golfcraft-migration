// SDK7 port of SDK6 scene/src/components/lobby/season-game-countdown.ts
//
// The "waiting for players" screen shown before each season round: your avatar,
// then the three ghost opponents revealed one per second, a confessions ticker,
// and a cancel button.
//
// Contract kept verbatim from SDK6 because season-demo.ts depends on it:
// the returned promise RESOLVES with the state once the wait finishes, and
// REJECTS when the player cancels (season-demo catches that).
// @ts-ignore - common/utils has @ts-nocheck
import { sleep, tryFn } from '../../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../../common/constants'
import { seasonWaitState } from '../../ui/season-wait-state'

// SDK6 substituted these wallets when a ghost row is a synthetic "fake" one, so
// the avatar image still resolves to a real DCL profile.
const FAKE_GHOST_ADDRESS = [
  '0x0e81a534096a7aaaa1ba647f95397e47dafe7054',
  '0x1a74ab8a1fda05a03c0e43fc06dd2c7a12668d04',
  '0xD677743FFa24B738c252d88E5d9A2910b7BCE69a'
]

const ghostUserId = (ghost: any, index: number) =>
  ghost.address === 'fake' ? FAKE_GHOST_ADDRESS[index] || FAKE_GHOST_ADDRESS[0] : ghost.address

export const showWaitForPlayers = (
  _timeToStart: number,
  ghosts: any[],
  userData: any,
  _currentGame: number,
  onCancel?: () => void
) => {
  const state = { cancelled: false, countdown: 10, joinedPlayers: 1 }
  const currentUserName = userData.displayName

  return new Promise((resolve, reject) => {
    let countdownInterval: any = null
    let confessionInterval: any = null

    const stopTimers = () => {
      tryFn(() => clearInterval(countdownInterval))
      tryFn(() => clearInterval(confessionInterval))
    }

    if (onCancel) {
      seasonWaitState.onCancel = () => {
        state.cancelled = true
        onCancel()
        stopTimers()
        reject(state)
      }
    }

    seasonWaitState.visible = true
    seasonWaitState.title = 'Waiting players to join ...'
    seasonWaitState.players = [{ userId: userData.userId, displayName: currentUserName }]
    seasonWaitState.sub = ''

    loadConfessions()

    if (ghosts?.length && !state.cancelled) {
      countdownInterval = setInterval(async () => {
        if (state.countdown <= 0) return
        state.countdown--

        if (state.cancelled) {
          stopTimers()
          resolve(state)
          return
        }

        // SDK6 reveals one opponent per tick at 8, 7 and 6.
        const revealAt: { [k: number]: number } = { 8: 0, 7: 1, 6: 2 }
        const ghostIndex = revealAt[state.countdown]
        if (ghostIndex !== undefined && ghosts[ghostIndex]) {
          seasonWaitState.players = [
            { userId: userData.userId, displayName: currentUserName },
            ...ghosts.slice(0, ghostIndex + 1).map((g: any, i: number) => ({
              userId: ghostUserId(g, i),
              displayName: g.displayName || '_player_'
            }))
          ]
        }

        if (state.countdown === 0 || state.countdown === 6) {
          await sleep(2000)
          hideWaitPlayers()
          stopTimers()
          resolve(state)
        }
      }, 1000)
    } else {
      // No ghosts for this round: SDK6 skips the countdown entirely.
      seasonWaitState.title = 'Joining game ...'
      resolve(state)
    }

    // Cosmetic ticker. SDK6 hardcoded the production host; that would make a
    // local build call prod, so it only runs on a remote build (same rule as
    // the season reward bridge).
    async function loadConfessions() {
      if (!USE_REMOTE_SERVER) return
      try {
        const confessions = await fetch('https://golfcraftgame.com/api/get-random-confessions').then((r) => r.json())
        if (!confessions?.length) return
        let i = 0
        seasonWaitState.sub = `Anonymous confession: ${confessions[i]}`
        confessionInterval = setInterval(() => {
          i = (i + 1) % confessions.length
          seasonWaitState.sub = `Anonymous confession: ${confessions[i]}`
        }, 10000)
      } catch (_) {
        // cosmetic only
      }
    }
  })
}

export async function hideWaitPlayers() {
  seasonWaitState.visible = false
  seasonWaitState.onCancel = null
  seasonWaitState.players = []
  seasonWaitState.sub = ''
}
