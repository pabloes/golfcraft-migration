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

export type SeasonPrize = {
  name: string
  // Season points (tier-sub) at which this wearable is awarded.
  tierReward: number
  stock: number
}

export type LobbyMenuView = 'lobby' | 'tutorial' | 'workshop' | 'prizes'

export const lobbyMenuState: {
  visible: boolean
  // Which screen the dialog shows; the cards open the three sub-views.
  view: LobbyMenuView
  // WORKSHOP: the club being looked at (tokenId; null = the basic club) and
  // whether a PlayFab call is in flight.
  selectedClubTokenId: string | null | undefined
  busy: boolean
  prizes: SeasonPrize[]
  prizesFetchedAt: number
  actions: {
    playSeason: (() => void) | null
    playWithFriends: (() => void) | null
    // The party button's caption, e.g. "JOIN PARTY (2/4) 41s".
    friendsLabel: (() => string) | null
  }
} = {
  visible: false,
  view: 'lobby',
  selectedClubTokenId: undefined,
  busy: false,
  prizes: [],
  prizesFetchedAt: 0,
  actions: { playSeason: null, playWithFriends: null, friendsLabel: null }
}

const PRIZES_TTL_MS = 60 * 1000

export const openLobbyMenu = () => {
  lobbyMenuState.visible = true
  lobbyMenuState.view = 'lobby'
  refreshLobbyMenuPrizes()
}

export const showLobbyView = (view: LobbyMenuView) => {
  lobbyMenuState.view = view
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
  getSeasonRewardsStock().then((response: any) => {
    const wearables = response?.result?.wearables
    if (!wearables?.length) return
    lobbyMenuState.prizes = wearables.map((w: any) => ({
      name: String(w.name || w.itemId || ''),
      tierReward: Number(w.tierReward || 0),
      stock: (w.maxStock || 0) - (w.claimed || 0)
    }))
  })
}
