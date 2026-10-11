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

export const lobbyMenuState: {
  visible: boolean
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
  prizes: [],
  prizesFetchedAt: 0,
  actions: { playSeason: null, playWithFriends: null, friendsLabel: null }
}

const PRIZES_TTL_MS = 60 * 1000

export const openLobbyMenu = () => {
  lobbyMenuState.visible = true
  refreshLobbyMenuPrizes()
}

export const closeLobbyMenu = () => {
  lobbyMenuState.visible = false
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
