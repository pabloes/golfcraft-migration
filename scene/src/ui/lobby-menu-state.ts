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
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../common/constants'

export type SeasonPrize = {
  name: string
  // Season points (tier-sub) at which this wearable is awarded.
  tierReward: number
  stock: number
  // Item number inside the COCOBAY collection (the URN's last segment).
  wearableId?: number
  // The collection's official thumbnail (https PNG on the content server).
  thumbnail?: string
}

// One row of the Season's tier-sub leaderboard (web API, page 1).
export type LeaderboardEntry = {
  rank: number
  name: string
  playFabId: string
  points: number
}

export type LobbyMenuView = 'lobby' | 'tutorial' | 'workshop' | 'prizes' | 'daily'

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
  prizes: SeasonPrize[]
  prizesFetchedAt: number
  // PRIZES: the Season's current top 10 (empty until fetched or on failure).
  leaderboard: LeaderboardEntry[]
  leaderboardFetchedAt: number
  actions: {
    playSeason: (() => void) | null
    playWithFriends: (() => void) | null
    // The party button's caption, e.g. "JOIN PARTY (2/4) 41s", and what it
    // does right now ('create' | 'join' | 'leave' | 'busy').
    friendsLabel: (() => string) | null
    friendsAction: (() => string) | null
  }
} = {
  visible: false,
  view: 'lobby',
  selectedClubTokenId: undefined,
  clubsPage: null,
  busy: false,
  prizes: [],
  prizesFetchedAt: 0,
  leaderboard: [],
  leaderboardFetchedAt: 0,
  actions: { playSeason: null, playWithFriends: null, friendsLabel: null, friendsAction: null }
}

const PRIZES_TTL_MS = 60 * 1000

export const openLobbyMenu = () => {
  lobbyMenuState.visible = true
  lobbyMenuState.view = 'lobby'
  refreshLobbyMenuPrizes()
}

export const showLobbyView = (view: LobbyMenuView) => {
  lobbyMenuState.view = view
  // WORKSHOP opens on the equipped club, on the page that holds it.
  lobbyMenuState.selectedClubTokenId = undefined
  lobbyMenuState.clubsPage = null
  if (view === 'prizes') refreshLobbyLeaderboard()
  // Progress moves while playing, so DAILY MISSIONS always re-reads it.
  if (view === 'daily') fetchDailyMissions().catch((err) => console.log('[lobby] daily missions refresh failed', err))
  clearPointerState()
}

// E, F and the X: a sub-view goes back to the lobby, the lobby closes.
export const closeOrBack = () => {
  if (lobbyMenuState.view !== 'lobby') showLobbyView('lobby')
  else closeLobbyMenu()
}

export const closeLobbyMenu = () => {
  lobbyMenuState.visible = false
  lobbyMenuState.view = 'lobby'
  // Closing with E while the pointer is over a button means no onMouseLeave.
  clearPointerState()
}

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
      wearableId: w.wearableId === undefined || w.wearableId === null ? undefined : Number(w.wearableId)
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
