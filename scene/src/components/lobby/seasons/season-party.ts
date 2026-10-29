// Client half of "Play ranked with friends" (server: season-party-lobby.ts /
// season-party-room.ts, CLAUDE.md §12).
//
// It holds the one connection to the shared waiting room, turns its state into
// the season panel's second button and into the waiting screen (the same UI the
// solo run uses for "waiting players to join"), and hands the game room over to
// season-party-demo when the party starts.
//
// There is only ONE waiting party on the server, so the button doubles as
// "create" and "join": whichever the current state calls for.
import { getUserData } from '~system/UserIdentity'

import MESSAGE from '../../../../../server/rooms/mesages'
import { createSeasonPartyDemo } from '../../../../golfplay/src/season-party-demo'
import { hideWaitPlayers } from '../season-game-countdown'
import { seasonWaitState } from '../../../ui/season-wait-state'
import { showMessage } from '../server-notification'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getTierFromSub, getTierPercentiles } from '../../../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../../../common/season-tier-definitions'
import { guardGameStart } from '../../../services/game-window'
import { getSessionTicket } from '../../../meta/bootstrap'
import { returnToMenuIfRequested } from '../../../ui/lobby-menu-state'

const MAX_PARTY_PLAYERS = 4

export const createSeasonParty = async (
  root: any,
  { colyseus, wip, userDataState, onStarting, onFinish, onStarted, onChange }: any
) => {
  const userData: any = await getUserData({}).then((r: any) => r.data)
  // Same identity Season-Room and the party lobby resolve the PlayFab account
  // from. A guest has none, so they can only watch.
  const address = userData?.publicKey

  const partyDemo = await createSeasonPartyDemo(root, {
    colyseus,
    wip,
    userDataState,
    onStarting,
    onStarted,
    onFinish: async () => {
      playing = false
      if (onFinish) await onFinish()
      notifyChange()
    }
  })

  let playing = false
  let waitingShown = false

  const lobby = await colyseus.joinOrCreate('season-party-lobby', {
    user: { ...userData, avatar: undefined },
    clientInfo: { sessionTicket: getSessionTicket() }
  })

  lobby.onStateChange(() => syncUi())

  lobby.onMessage(MESSAGE.PARTY_ERROR, (message: any) => {
    console.log('[season-party] error', message)
    showMessage({ timeout: 4000, message: String(message) })
    syncUi()
    // The party never formed: back to the lobby dialog if it came from there.
    returnToMenuIfRequested()
  })

  lobby.onMessage(MESSAGE.PARTY_CANCELLED, ({ reason }: any = {}) => {
    console.log('[season-party] cancelled', reason)
    hideWait()
    if (reason === 'timeout') showMessage({ timeout: 4000, message: 'Party cancelled: nobody joined' })
    notifyChange()
    returnToMenuIfRequested()
  })

  lobby.onMessage(MESSAGE.PARTY_STARTED, ({ roomId, token }: any) => {
    console.log('[season-party] starting', roomId)
    playing = true
    hideWait()
    notifyChange()
    partyDemo.startGame({ roomId, token })
  })

  syncUi()

  return { click, cancel, getLabel, getCancelLabel, getAction, isBusy, isHost, dispose }

  // The first state patch can land after the join resolves, so nothing may read
  // lobby.state without this guard.
  function hasState() {
    return !!lobby.state?.members
  }

  // One button, three actions (getAction): LEAVE the party I am in, JOIN the
  // waiting one, or CREATE a new one.
  function click() {
    if (playing || !hasState()) return
    if (!address) {
      showMessage({ timeout: 4000, message: 'Connect a wallet to play ranked' })
      return
    }
    if (isMember()) {
      // Stepping out; if I was the host the next member takes the seat.
      lobby.send(MESSAGE.PARTY_LEAVE)
      hideWait()
      notifyChange()
      returnToMenuIfRequested()
      return
    }
    if (!guardGameStart()) return
    if (lobby.state.starting) {
      showMessage({ timeout: 4000, message: 'That party is already starting' })
      return
    }
    if (lobby.state.open) {
      if (lobby.state.members.length >= MAX_PARTY_PLAYERS) {
        showMessage({ timeout: 4000, message: 'The party is full' })
        return
      }
      lobby.send(MESSAGE.PARTY_JOIN)
    } else {
      lobby.send(MESSAGE.PARTY_CREATE)
    }
  }

  // Same action as the waiting screen's CANCEL: the host drops the whole party,
  // anyone else just steps out of it.
  function cancel() {
    if (playing || !isMember()) return
    lobby.send(isHost() ? MESSAGE.PARTY_CANCEL : MESSAGE.PARTY_LEAVE)
    hideWait()
    notifyChange()
    returnToMenuIfRequested()
  }

  function getCancelLabel() {
    return isHost() ? 'CANCEL PARTY' : 'LEAVE PARTY'
  }

  // What the party button does right now; drives its artwork
  // (images/button-{create,join,leave}.png). 'busy' = nothing to do (a party
  // is starting, or I am playing).
  function getAction(): 'create' | 'join' | 'leave' | 'busy' {
    if (playing) return 'busy'
    if (!hasState()) return 'create'
    if (isMember()) return 'leave'
    if (lobby.state.starting) return 'busy'
    return lobby.state.open ? 'join' : 'create'
  }

  // The caption carries the same countdown the waiting screen shows, so the
  // panel alone tells you how long is left to join (or before the party is
  // dropped for being alone).
  function getLabel() {
    if (playing) return 'PLAYING...'
    if (!hasState()) return 'PLAY WITH FRIENDS'
    const seconds = lobby.state.secondsLeft || 0
    const count = lobby.state.members.length
    if (isMember()) {
      return count > 1
        ? `STARTS IN ${seconds}s (${count}/${MAX_PARTY_PLAYERS})`
        : `WAITING FRIENDS... ${seconds}s`
    }
    if (lobby.state.starting) return 'PARTY STARTING...'
    if (lobby.state.open) return `JOIN PARTY (${count}/${MAX_PARTY_PLAYERS}) ${seconds}s`
    return 'CREATE PARTY'
  }

  // The season panel hides its solo Play button while the player is committed
  // to a party.
  function isBusy() {
    return playing || isMember()
  }

  function isMember() {
    return !!address && hasState() && lobby.state.members.some((m: any) => m.address === address)
  }

  function isHost() {
    return !!address && hasState() && lobby.state.members[0]?.address === address
  }

  function syncUi() {
    if (playing || !hasState()) return
    if (!isMember()) {
      // Also the path taken when the party is cancelled or started by someone
      // else: the panel has to repaint too, or it keeps showing the waiting
      // caption and the cancel button forever.
      hideWait()
      notifyChange()
      return
    }

    const members = lobby.state.members
    // The room plays at the lowest member's level (the server decides this the
    // same way); showing it up front is what makes the rule obvious.
    const roomTierSub = Math.min(...members.map((m: any) => Number(m.tierSub) || 0))
    const tierName = seasonTierDefinitions[getTierFromSub(roomTierSub) || 0]?.name || ''
    const secondsLeft = lobby.state.secondsLeft || 0

    seasonWaitState.visible = true
    seasonWaitState.mode = 'party'
    seasonWaitState.title = `Ranked with friends (${members.length}/${MAX_PARTY_PLAYERS})`
    seasonWaitState.secondsLeft = secondsLeft
    seasonWaitState.roomTierName = tierName
    seasonWaitState.info =
      members.length > 1
        ? `Starts in ${secondsLeft}s · playing at ${tierName} level`
        : `Cancels in ${secondsLeft}s if nobody joins`
    // The same rule the room applies (CLAUDE.md §12): a member is "at the
    // room's level" when their tier shares its category and percentile band.
    const roomTier = getTierFromSub(roomTierSub) || 0
    const sameLevel = (tier: number) =>
      getCatFromTier(tier) === getCatFromTier(roomTier) &&
      JSON.stringify(getTierPercentiles(tier)) === JSON.stringify(getTierPercentiles(roomTier))
    seasonWaitState.players = members.map((m: any, index: number) => {
      const tier = getTierFromSub(Number(m.tierSub) || 0) || 0
      return {
        userId: m.address,
        displayName: m.displayName,
        isHost: index === 0,
        tierName: seasonTierDefinitions[tier]?.name || '',
        eligible: sameLevel(tier)
      }
    })
    seasonWaitState.sub = ''
    // The host cancels the whole party; anyone else just steps out and the
    // party carries on (the host seat moves to the next member).
    seasonWaitState.onCancel = cancel
    seasonWaitState.onStart = isHost() && members.length > 1 ? () => lobby.send(MESSAGE.PARTY_START) : null
    waitingShown = true
    notifyChange()
  }

  function hideWait() {
    if (!waitingShown) return
    waitingShown = false
    hideWaitPlayers()
  }

  function notifyChange() {
    onChange && onChange()
  }

  function dispose() {
    hideWait()
    try {
      lobby.leave(true)
    } catch (_) {
      // already gone
    }
  }
}
