// State of the lobby menu dialog (ui/lobby-menu.tsx): the centred panel that
// opens once the intro image is dismissed and gathers Season, tutorial,
// workshop and prizes in one place. Same pattern as the other HUD modules: a
// mutable object the ReactEcs component reads every frame.
//
// It only READS the data the scene already keeps (lobbyHudState, the user
// store, the rewards stock) and delegates its actions to the 3D season panel,
// which registers them here when it is built. The 3D lobby is untouched.
import { getSeasonRewardsStock } from '../components/lobby/seasons/season-rewards-bridge'
import { clearPointerState } from './ui-theme'
import { fetchDailyMissions } from '../meta/bootstrap'
import { lobbyHudState } from './lobby-hud-state'
import { canStartGame, isEnergyFree } from '../services/game-window'
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../common/constants'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

export type SeasonPrize = {
  name: string
  // Season points (tier-sub) at which this wearable is awarded.
  tierReward: number
  stock: number
  // Item number inside the COCOBAY collection (the URN's last segment).
  wearableId?: number
  // The collection's official thumbnail (https PNG on the content server).
  thumbnail?: string
  // What the bridge pays instead once the wearable is sold out (FT).
  fashionTickets?: number
}

// One row of the Season's tier-sub leaderboard (web API, page 1).
export type LeaderboardEntry = {
  rank: number
  name: string
  playFabId: string
  points: number
}

export type LobbyMenuView = 'lobby' | 'season' | 'tutorial' | 'workshop' | 'prizes' | 'daily' | 'games' | 'options' | 'watch'

export const lobbyMenuState: {
  visible: boolean
  // Which screen the dialog shows; the cards open the three sub-views.
  view: LobbyMenuView
  // WORKSHOP: the club being looked at (tokenId; null = the basic club) and
  // whether a PlayFab call is in flight.
  selectedClubTokenId: string | null | undefined
  // WORKSHOP: the MY CLUBS page being shown; null = the selected club's page.
  clubsPage: number | null
  busy: boolean
  // Set when a match is started from this dialog (PLAY, WITH FRIENDS, the
  // tutorial's LET'S GO): when that match ends the dialog comes back.
  reopenAfterGame: boolean
  prizes: SeasonPrize[]
  prizesFetchedAt: number
  // PRIZES: the tab of ten prizes shown; null = the one holding the next prize.
  prizesTab: number | null
  // PRIZES and SEASON: the Season's current top 10 (empty until fetched or on failure).
  leaderboard: LeaderboardEntry[]
  leaderboardFetchedAt: number
  //which page of the WATCH list is shown
  watchPage: number
  actions: {
    playSeason: (() => void) | null
    playWithFriends: (() => void) | null
    // The party button's caption, e.g. "JOIN PARTY (2/4) 41s", and what it
    // does right now ('create' | 'join' | 'leave' | 'busy').
    friendsLabel: (() => string) | null
    friendsAction: (() => string) | null
    // The waiting party's rank (it plays at the host's level), -1 when none.
    friendsRoomTier: (() => number) | null
    //Watch a game somebody else is playing (components/lobby/spectator-client.ts).
    //index.ts sets it, because only it holds the colyseus client.
    spectate: ((roomId: string, label: string) => void) | null
  }
} = {
  visible: false,
  view: 'lobby',
  selectedClubTokenId: undefined,
  clubsPage: null,
  busy: false,
  reopenAfterGame: false,
  prizes: [],
  prizesFetchedAt: 0,
  prizesTab: null,
  leaderboard: [],
  leaderboardFetchedAt: 0,
  watchPage: 0,
  actions: { playSeason: null, playWithFriends: null, friendsLabel: null, friendsAction: null, friendsRoomTier: null, spectate: null }
}

const PRIZES_TTL_MS = 60 * 1000

// The next wearable to win: the first one above the best score reached this
// season (prizes are awarded on tier-sub-max, so dropping back does not
// re-award one). Once a wearable is sold out the bridge pays its
// fashionTickets instead.
export const nextSeasonPrize = (tierSubMax: number): SeasonPrize | null =>
  [...lobbyMenuState.prizes].sort((a, b) => a.tierReward - b.tierReward).find((p) => p.tierReward > tierSubMax) || null
export const prizeSoldOut = (p: SeasonPrize) => p.stock <= 0

// PLAY and WITH FRIENDS, shared by the lobby and the SEASON view: whether
// they can be pressed, their captions and what they do.
export const seasonPlayState = () => {
  const r = lobbyHudState.resources
  const energy = r.EN || 0
  // Outside the monthly game window nothing can start (services/game-window.ts).
  const gameOpen = canStartGame()
  // Right after login the Season panel is still joining its rooms and the
  // balances are still loading: say so instead of a bare disabled PLAY.
  const connecting = !r.loaded || !lobbyMenuState.actions.playSeason
  const friendsConnecting = connecting || !lobbyMenuState.actions.playWithFriends
  // A free-Energy week lets a player with nothing in the bank play: without
  // this the offer would be invisible to exactly the players it is for.
  const free = isEnergyFree()
  const canPlay = !connecting && gameOpen && (free || energy > 0)
  const friendsAction = lobbyMenuState.actions.friendsAction ? lobbyMenuState.actions.friendsAction() : ''
  // While in a party the button is the way out; the 3D board says the same.
  const friendsLabel = lobbyMenuState.actions.friendsLabel ? (friendsAction === 'leave' ? 'LEAVE PARTY' : lobbyMenuState.actions.friendsLabel()) : ''
  // A party costs ONE energy, paid by whoever opens it (2026-11-04), so only
  // CREATE needs a bank: joining the party a friend opened, or leaving it,
  // must work at zero.
  const partyIsFree = friendsAction === 'join' || friendsAction === 'leave'
  const canFriends =
    (canPlay || (partyIsFree && !connecting && gameOpen)) &&
    !!lobbyMenuState.actions.playWithFriends &&
    friendsLabel !== ''
  const roomTier = lobbyMenuState.actions.friendsRoomTier ? lobbyMenuState.actions.friendsRoomTier() : -1
  // A party member can't start a solo run as well (the 3D board hides its
  // PLAY too): LEAVE PARTY first.
  const inParty = friendsAction === 'leave'
  return {
    energy,
    gameOpen,
    canPlay: canPlay && !inParty,
    canFriends,
    freeEnergy: free,
    playCaption: connecting ? 'connecting...' : !gameOpen ? 'closed' : inParty ? 'in a party' : free ? 'free this week' : energy > 0 ? '1 energy' : 'no energy',
    friendsCaption: canFriends ? friendsLabel : friendsConnecting && gameOpen ? 'CONNECTING...' : 'PLAY\nWITH FRIENDS',
    // The FRIENDS button shows the waiting party's rank in place of its icon.
    friendsRoomTier: canFriends ? roomTier : -1,
    friendsRoomTierName: canFriends && roomTier >= 0 ? seasonTierDefinitions[roomTier]?.name || '' : '',
    startSeason: () => {
      closeLobbyMenu()
      markStartedFromMenu()
      lobbyMenuState.actions.playSeason && lobbyMenuState.actions.playSeason()
    },
    startFriends: () => {
      closeLobbyMenu()
      markStartedFromMenu()
      lobbyMenuState.actions.playWithFriends && lobbyMenuState.actions.playWithFriends()
    }
  }
}

export const openLobbyMenu = () => {
  // Back in the dialog, by hand or after a match: nothing left to reopen.
  lobbyMenuState.reopenAfterGame = false
  lobbyMenuState.visible = true
  lobbyMenuState.view = 'lobby'
  refreshLobbyMenuPrizes()
}

// The dialog's start buttons call this; the end of every match (and a start
// that never happened: closed game, failed join, cancelled party) calls
// returnToMenuIfRequested, which reopens the dialog only in that case.
export const markStartedFromMenu = () => {
  lobbyMenuState.reopenAfterGame = true
}

export const returnToMenuIfRequested = () => {
  if (!lobbyMenuState.reopenAfterGame) return
  openLobbyMenu()
}

export const showLobbyView = (view: LobbyMenuView) => {
  lobbyMenuState.view = view
  // WORKSHOP opens on the equipped club, on the page that holds it.
  lobbyMenuState.selectedClubTokenId = undefined
  lobbyMenuState.clubsPage = null
  lobbyMenuState.prizesTab = null
  if (view === 'prizes' || view === 'season') refreshLobbyLeaderboard()
  // Progress moves while playing, so DAILY MISSIONS always re-reads it.
  if (view === 'daily') fetchDailyMissions().catch((err) => console.log('[lobby] daily missions refresh failed', err))
  clearPointerState()
}

// E, F and the X: a sub-view goes back to the lobby, the lobby closes.
export const closeOrBack = () => {
  if (lobbyMenuState.view !== 'lobby') showLobbyView('lobby')
  else closeLobbyMenu()
}

let menuClosedAt = 0

export const closeLobbyMenu = () => {
  lobbyMenuState.visible = false
  lobbyMenuState.view = 'lobby'
  menuClosedAt = Date.now()
  // Closing with E while the pointer is over a button means no onMouseLeave.
  clearPointerState()
}

// On a phone a tap on the dialog also reaches the world behind it as a pointer
// press (CLAUDE.md §6 #25), so WITH FRIENDS could also press the 3D Season
// board's PLAY: the ws log shows a solo run started and cancelled with each
// CREATE PARTY tap from an iPad. World buttons ignore presses while the dialog
// is open and right after it closed.
export const isDialogPress = () => lobbyMenuState.visible || Date.now() - menuClosedAt < 700

// The same read-only stock query the prizes board uses; cached for a minute so
// reopening the menu is free.
export const refreshLobbyMenuPrizes = () => {
  if (Date.now() - lobbyMenuState.prizesFetchedAt < PRIZES_TTL_MS) return
  lobbyMenuState.prizesFetchedAt = Date.now()
  fetchPrizeThumbnails()
  getSeasonRewardsStock().then((response: any) => {
    const wearables = response?.result?.wearables
    if (!wearables?.length) return
    lobbyMenuState.prizes = wearables.map((w: any) => ({
      name: String(w.name || w.itemId || ''),
      tierReward: Number(w.tierReward || 0),
      stock: (w.maxStock || 0) - (w.claimed || 0),
      wearableId: w.wearableId === undefined || w.wearableId === null ? undefined : Number(w.wearableId),
      fashionTickets: Number(w.fashionTickets || 0)
    }))
    applyPrizeThumbnails()
  })
}

// The prize wearables' official thumbnails, from the Decentraland catalyst:
// one request for the whole COCOBAY collection, fetched once per session.
// Each wearable's `id` is a URN ending in `:N`, and N is the stock entry's
// `wearableId`. On failure the cells just have no picture.
const PRIZES_COLLECTION = 'urn:decentraland:matic:collections-v2:0x9941d02def105cfeca86739ec2da0be59d90c013'
let prizeThumbnails: Record<number, string> | null = null
let prizeThumbnailsRequested = false

const fetchPrizeThumbnails = () => {
  if (prizeThumbnailsRequested) return
  prizeThumbnailsRequested = true
  fetch(`https://peer.decentraland.org/lambdas/collections/wearables?collectionId=${PRIZES_COLLECTION}`)
    .then((r) => r.json())
    .then((data: any) => {
      const map: Record<number, string> = {}
      for (const w of data?.wearables || []) {
        const n = Number(String(w?.id || '').split(':').pop())
        if (!isNaN(n) && w?.thumbnail) map[n] = String(w.thumbnail)
      }
      prizeThumbnails = map
      applyPrizeThumbnails()
    })
    .catch((err) => {
      prizeThumbnailsRequested = false
      console.log('[lobby] prize thumbnails unavailable', err)
    })
}

const applyPrizeThumbnails = () => {
  if (!prizeThumbnails) return
  for (const p of lobbyMenuState.prizes) {
    if (p.wearableId !== undefined && prizeThumbnails[p.wearableId]) p.thumbnail = prizeThumbnails[p.wearableId]
  }
}

// The Season's tier-sub leaderboard, page 1 (100 rows), kept to the top 10.
// Same host rule as get-login-id. The route answers TEXT, not JSON: rows
// separated by "<br>", each "StatValue PlayFabId DisplayName" (the name may
// contain spaces). On failure the list keeps whatever it had.
export const refreshLobbyLeaderboard = () => {
  if (Date.now() - lobbyMenuState.leaderboardFetchedAt < PRIZES_TTL_MS) return
  lobbyMenuState.leaderboardFetchedAt = Date.now()
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  fetch(`${base}/api/leaderboard/tier-sub/1`)
    .then((r) => r.text())
    .then((text) => {
      const rows: LeaderboardEntry[] = []
      for (const line of text.split('<br>')) {
        const [points, playFabId, ...rest] = line.trim().split(' ')
        if (!/^-?\d+$/.test(points || '') || !/^[0-9A-F]{15,16}$/i.test(playFabId || '')) continue
        rows.push({ rank: rows.length + 1, points: Number(points), playFabId, name: rest.join(' ') || playFabId })
        if (rows.length === 10) break
      }
      if (rows.length) lobbyMenuState.leaderboard = rows
    })
    .catch((err) => console.log('[lobby] leaderboard unavailable', err))
}
