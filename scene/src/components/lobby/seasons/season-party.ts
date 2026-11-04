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
import { getCatFromTier, getTierFromSub, getTierPercentiles, sleep } from '../../../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../../../common/season-tier-definitions'
import { guardGameStart } from '../../../services/game-window'
import { getSessionTicket } from '../../../meta/bootstrap'
import { returnToMenuIfRequested } from '../../../ui/lobby-menu-state'

// How many fit in a party. The server owns the number (admin row
// `partyMaxPlayers`) and publishes it in the lobby state, so the captions and
// the full-party check here can never disagree with what the server enforces.
// The fallback only matters before the first state patch arrives.
const MAX_PARTY_FALLBACK = 16
// A CREATE / JOIN the lobby never answers (no state with me in it, no
// PARTY_ERROR) means the socket died without closing: rejoin.
const ANSWER_TIMEOUT_MS = 10000

export const createSeasonParty = async (
  root: any,
  { colyseus, wip, userDataState, onStarting, onFinish, onStarted, onChange }: any
) => {
  const userData: any = await getUserData({}).then((r: any) => r.data)
  // Same identity Season-Room and the party lobby resolve the PlayFab account
  // from (the server lowercases it). A guest has none, so they can only watch.
  const address = userData?.publicKey ? String(userData.publicKey).toLowerCase() : ''

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
  let disposed = false
  // null while (re)connecting.
  let lobby: any = null
  let connecting: Promise<void> | null = null
  // Bumped by every answer, so a pending answer timeout knows it was answered.
  let requestId = 0

  // A failed first join no longer hides the party button for the whole
  // session: connect() keeps retrying in the background.
  connect()

  return { click, cancel, getLabel, getCancelLabel, getAction, getRoomTier, isBusy, isHost, dispose }

  // The lobby is joined again whenever its connection closes, like
  // game-lobby.ts. A phone drops it each time the explorer goes to the
  // background; before the rejoin the panel kept the last state it had seen
  // (CREATE with a party already waiting) and every send went to a dead socket,
  // so the dialog closed and nothing happened.
  function connect(): Promise<void> {
    // Joined and only waiting for the first state patch: nothing to do.
    if (lobby || disposed) return Promise.resolve()
    if (!connecting) connecting = joinUntilConnected()
    return connecting
  }

  async function joinUntilConnected() {
    try {
      for (let attempt = 1; !disposed; attempt++) {
        try {
          const room = await colyseus.joinOrCreate('season-party-lobby', {
            user: { ...userData, avatar: undefined },
            clientInfo: { sessionTicket: getSessionTicket() }
          })
          if (disposed) {
            room.leave(true)
            return
          }
          console.log('[season-party] lobby joined', room.sessionId, 'attempt', attempt)
          bind(room)
          return
        } catch (error) {
          console.log('[season-party] lobby join failed, attempt', attempt, error)
          await sleep(Math.min(30000, 3000 * attempt))
        }
      }
    } finally {
      connecting = null
    }
  }

  function bind(room: any) {
    lobby = room

    room.onStateChange(() => syncUi())

    room.onMessage(MESSAGE.PARTY_ERROR, (message: any) => {
      console.log('[season-party] error', message)
      requestId++
      syncUi()
      // The party never formed: back to the lobby dialog if it came from there.
      refuse(String(message))
    })

    room.onMessage(MESSAGE.PARTY_CANCELLED, ({ reason }: any = {}) => {
      console.log('[season-party] cancelled', reason)
      hideWait()
      if (reason === 'timeout') showMessage({ timeout: 4000, message: 'Party cancelled: nobody joined' })
      notifyChange()
      returnToMenuIfRequested()
    })

    room.onMessage(MESSAGE.PARTY_STARTED, ({ roomId, token }: any) => {
      console.log('[season-party] starting', roomId)
      requestId++
      playing = true
      hideWait()
      notifyChange()
      partyDemo.startGame({ roomId, token })
    })

    room.onLeave((code: number) => {
      // A connection we dropped on purpose (reconnect / dispose).
      if (lobby !== room) return
      // The server takes a closed connection out of the party.
      const wasMember = isMember()
      lobby = null
      console.log('[season-party] lobby connection closed', code)
      if (disposed) return
      if (wasMember && !playing) {
        hideWait()
        refuse('Connection lost, you left the party')
      }
      notifyChange()
      sleep(2000).then(() => {
        if (!disposed) connect()
      })
    })

    syncUi()
    notifyChange()
  }

  // Closes a connection that stopped answering and joins again.
  function reconnect() {
    const room = lobby
    lobby = null
    try {
      room?.leave(false)
    } catch (_) {
      // already gone
    }
    hideWait()
    notifyChange()
    connect()
  }

  // The first state patch can land after the join resolves, so nothing may read
  // lobby.state without this guard.
  function hasState() {
    return !!lobby?.state?.members
  }

  // The server's number, never ours (see MAX_PARTY_FALLBACK).
  function maxPlayers() {
    const max = Number(lobby?.state?.maxPlayers)
    return max > 0 ? max : MAX_PARTY_FALLBACK
  }

  // Every refusal is shown, and the lobby dialog comes back if the press came
  // from there (startFriends closes it before calling click).
  function refuse(message: string) {
    showMessage({ timeout: 4000, message })
    returnToMenuIfRequested()
  }

  // A send on a socket that died without telling us throws on some explorers
  // and is dropped silently on others: the first rejoins now, the second when
  // the answer timeout runs out.
  function send(type: MESSAGE, expectAnswer = false) {
    try {
      lobby.send(type)
    } catch (error) {
      console.log('[season-party] send failed', type, error)
      reconnect()
      refuse('Lost the party room, reconnecting. Try again in a moment')
      return false
    }
    if (expectAnswer) {
      const id = ++requestId
      setTimeout(() => {
        if (id !== requestId || disposed) return
        console.log('[season-party] no answer to', type)
        requestId++
        reconnect()
        refuse('The party room did not answer. Try again in a moment')
      }, ANSWER_TIMEOUT_MS)
    }
    return true
  }

  // One button, three actions (getAction): LEAVE the party I am in, JOIN the
  // waiting one, or CREATE a new one.
  function click() {
    if (playing) return
    if (!address) return refuse('Connect a wallet to play ranked')
    if (!hasState()) {
      connect()
      return refuse('Connecting to the party room. Try again in a moment')
    }
    if (isMember()) {
      // Stepping out; if I was the host the next member takes the seat.
      send(MESSAGE.PARTY_LEAVE)
      hideWait()
      notifyChange()
      returnToMenuIfRequested()
      return
    }
    if (!guardGameStart()) return
    if (lobby.state.starting) return refuse('That party is already starting')
    if (lobby.state.open) {
      if (lobby.state.members.length >= maxPlayers()) return refuse('The party is full')
      send(MESSAGE.PARTY_JOIN, true)
    } else {
      send(MESSAGE.PARTY_CREATE, true)
    }
  }

  // Same action as the waiting screen's CANCEL: the host drops the whole party,
  // anyone else just steps out of it.
  function cancel() {
    if (playing || !isMember()) return
    send(isHost() ? MESSAGE.PARTY_CANCEL : MESSAGE.PARTY_LEAVE)
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
    if (!hasState()) return 'CONNECTING...'
    const seconds = lobby.state.secondsLeft || 0
    const count = lobby.state.members.length
    if (isMember()) {
      return count > 1
        ? `STARTS IN ${seconds}s (${count}/${maxPlayers()})`
        : `WAITING FRIENDS... ${seconds}s`
    }
    if (lobby.state.starting) return 'PARTY STARTING...'
    if (lobby.state.open) return `JOIN PARTY (${count}/${maxPlayers()}) ${seconds}s`
    return 'CREATE PARTY'
  }

  // The room plays at the host's level (members[0]; the server decides this
  // the same way), so the party button and the waiting screen show it to
  // members and to whoever is about to join. -1 while no party is waiting.
  function getRoomTier(): number {
    if (!hasState() || !lobby.state.members.length) return -1
    return getTierFromSub(Number(lobby.state.members[0].tierSub) || 0) || 0
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
    // In the party: whatever CREATE / JOIN was pending got its answer.
    requestId++

    const members = lobby.state.members
    const roomTier = getRoomTier()
    const tierName = seasonTierDefinitions[roomTier]?.name || ''
    const secondsLeft = lobby.state.secondsLeft || 0

    seasonWaitState.visible = true
    seasonWaitState.mode = 'party'
    seasonWaitState.title = `Ranked with friends (${members.length}/${maxPlayers()})`
    seasonWaitState.maxPlayers = maxPlayers()
    seasonWaitState.secondsLeft = secondsLeft
    seasonWaitState.roomTierName = tierName
    seasonWaitState.info =
      members.length > 1
        ? `Starts in ${secondsLeft}s · playing at ${tierName} level`
        : `Cancels in ${secondsLeft}s if nobody joins`
    // The same rule the room applies (CLAUDE.md §12): a member earns season
    // points at the room's level (same category and percentile band) or below.
    const sameLevel = (tier: number) =>
      tier < roomTier ||
      (getCatFromTier(tier) === getCatFromTier(roomTier) &&
        JSON.stringify(getTierPercentiles(tier)) === JSON.stringify(getTierPercentiles(roomTier)))
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
    seasonWaitState.onStart = isHost() && members.length > 1 ? () => send(MESSAGE.PARTY_START) : null
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
    disposed = true
    hideWait()
    const room = lobby
    lobby = null
    try {
      room?.leave(true)
    } catch (_) {
      // already gone
    }
  }
}
