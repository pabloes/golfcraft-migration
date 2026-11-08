// Partial SDK7 port of SDK6 scene/src/components/lobby/lobby-training.ts.
// SDK6's file drove several lobby panels; this port covers the golfclub board
// (the screen storymode mission 7 sends the player to), the season play panel,
// the season prizes board and the two ranking boards (season ranking and days
// connected, back since 2026-11-07, plus a rolling 24 hour one SDK6 never
// had). Still missing from the original: the creator-code button.
import { Entity } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { globalStore } from '../../services/globalStore/globalStore'
import { COCOBAY_PROMO, getPlayFabId, getSessionTicket, refreshUserData } from '../../meta/bootstrap'
import { createLeaderboardPanel } from './leaderboard-panel'
import { fetchLast24hLeaderboard, fetchStatisticLeaderboard } from '../../services/leaderboards'
import { executeCloudScript } from '../../meta/playfab-rest'
import { showMessage } from './server-notification'
import { BoardGolfclub, createGolfclubBoard } from './golfclub-screen/golfclub-screen-ui'
import { createSeasonMenu } from './seasons/season-menu'
import { createSeasonPrizesScreen } from './seasons/season-prizes-screen'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../../../common/utils'

// SDK6 building.ts PANELS.GOLFCLUBS. The odd asymmetry (3-24 for x but 38-23
// for z) is verbatim from SDK6 — z really is 15, not 14. Local to the scene
// root at (24,0,24), so world (3, 1.2, 39).
const PANEL_GOLFCLUBS = {
  position: Vector3.create(3 - 24, 1.2, 38 - 23),
  rotation: Quaternion.fromEulerDegrees(0, -70, 0)
}

// SDK6 building.ts PANELS.SEASON -> world (17, 1.2, 45.5), the north wall.
const PANEL_SEASON = {
  position: Vector3.create(-7, 1.2, 21.5),
  rotation: Quaternion.fromEulerDegrees(0, 0, 0)
}

// SDK6 building.ts PANELS.SEASON_LEADERBOARD -> world (8, 1.2, 44), angled
// into the room at the left end of the Season wall.
const PANEL_SEASON_RANKING = {
  position: Vector3.create(-16, 1.2, 20),
  rotation: Quaternion.fromEulerDegrees(0, -30, 0)
}

// SDK6 building.ts PANELS.DAYS_CONNECTED, verbatim (29-17, 24.5, 45.8-24) ->
// world (36, 24.5, 45.8), upstairs on floor 3.
const PANEL_DAYS_CONNECTED = {
  position: Vector3.create(29 - 17, 24.5, 45.8 - 24),
  rotation: Quaternion.fromEulerDegrees(0, 0, 0)
}

// The rolling 24 hour board has no SDK6 position because SDK6 had no such
// board. It mirrors the season ranking on the other side of the Season panel
// (that one is at local x -16, the panel at -7), so the two rankings flank it.
// First pass: easy to move, nothing else depends on it.
const PANEL_LAST_24H = {
  position: Vector3.create(-2.5, 1.2, 20),
  rotation: Quaternion.fromEulerDegrees(0, 30, 0)
}

let golfclubBoard: ReturnType<typeof createGolfclubBoard> | null = null
let seasonMenu: any = null
let seasonPrizes: any = null
let rankingBoards: { dispose: () => void }[] = []

// SDK6 lobby-training.ts:deserializeGolfclubs — maps PlayFab inventory items
// into the board's shape, then appends the hardcoded CocoBay promo club.
export function deserializeGolfclubs(golfclubs: any[]): BoardGolfclub[] {
  return (golfclubs || [])
    .map((golfclubData: any): BoardGolfclub => {
      const customData = golfclubData.CustomData || {}
      return {
        tokenId: customData.tokenId || null,
        golfclubId: String(golfclubData.ItemId || 'golfclub-1').replace('golfclub-', ''),
        xp: Number(customData.xp || 0),
        DisplayName: golfclubData.DisplayName,
        ItemInstanceId: golfclubData.ItemInstanceId,
        attributes: {
          power: Number(customData.attribute_power || 0),
          control: Number(customData.attribute_control || 0),
          aim: Number(customData.attribute_aim || 0)
        },
        minting: Number(customData.minting || 0)
      }
    })
    .concat([
      {
        tokenId: COCOBAY_PROMO.tokenId,
        golfclubId: COCOBAY_PROMO.golfclubId,
        xp: 0,
        attributes: { power: 5, control: 5, aim: 5 },
        DisplayName: 'CocoBay x Golfcraft',
        ItemInstanceId: undefined,
        minting: 0
      }
    ])
}

export const getGolfclubCollection = () => deserializeGolfclubs(globalStore.userData.getState().golfclubs)
const currentCollection = getGolfclubCollection

// The two PlayFab actions of the golf club board, shared with the lobby
// dialog's WORKSHOP view. Both end with refreshUserData, so every reader of
// the store sees the result; they return whether the cloudscript succeeded.
export async function selectGolfclub(tokenId: string | null): Promise<boolean> {
  try {
    const ticket = getSessionTicket()
    if (!ticket) throw new Error('no PlayFab session ticket')
    await executeCloudScript(ticket, 'selectGolfClubTokenId', { tokenId })
    await sleep(1000)
    await refreshUserData()
    return true
  } catch (err) {
    // SDK6 had no error handling here and left the board stuck on "loading"
    // forever when the cloudscript threw. Surface it and recover instead.
    console.log('[golfclub-board] select failed', err)
    showMessage({ timeout: 3000, message: 'Could not select that golf club' })
    return false
  }
}

export async function upgradeGolfclubAttribute(ItemInstanceId: string | undefined, attribute: string): Promise<boolean> {
  try {
    const ticket = getSessionTicket()
    if (!ticket) throw new Error('no PlayFab session ticket')
    if (!ItemInstanceId) throw new Error('golf club has no ItemInstanceId (not a PlayFab inventory item)')
    // The `upgradeGolfclub` cloudscript re-validates cost/availability, spends
    // the material (power->IR, control->ST, aim->WD) and bumps the item's
    // attribute_<name> CustomData.
    await executeCloudScript(ticket, 'upgradeGolfclub', { ItemInstanceId, attribute })
    await sleep(1000)
    await refreshUserData()
    console.log('[golfclub-board] upgraded', attribute)
    return true
  } catch (err) {
    console.log('[golfclub-board] upgrade failed', err)
    showMessage({ timeout: 3000, message: 'Golf club upgrade not available' })
    return false
  }
}

export type LobbyTrainingOptions = {
  // Gameplay is parented to the scene root, not to the panel.
  root: Entity
  colyseus: any
  wip?: boolean
  onStarting?: () => void
  onFinish?: () => void
}

// The three ranking boards. SDK6 built two of them here (SEASON_LEADERBOARD
// and DAYS_CONNECTED); the 24 hour one is new (user, 2026-11-07). They own no
// room and no state, so they are simply rebuilt with the lobby, like the
// prizes board.
const createRankingBoards = (parent: Entity) => {
  if (rankingBoards.length) return
  const own = (statistic: string) => () => {
    const playFabId = getPlayFabId()
    if (!playFabId) return null
    const state = globalStore.userData.getState()
    const value = Number(state[`statistic_${statistic}`] || 0)
    return { playFabId, name: state.displayName || 'you', value }
  }
  const boards: { dispose: () => void }[] = []
  const build = (title: string, panel: { position: Vector3; rotation: Quaternion }, load: () => Promise<any>, ownRow?: any) => {
    try {
      boards.push(createLeaderboardPanel(parent, { ...panel, title, load, own: ownRow }))
    } catch (err) {
      console.log('[leaderboard]', title, 'failed to spawn', err)
    }
  }
  // SDK6 lobby-training.ts: StatisticName "tier-sub-max", title "Season ranking".
  build('Season ranking', PANEL_SEASON_RANKING, () => fetchStatisticLeaderboard('tier-sub-max'), own('tier-sub-max'))
  // SDK6 lobby-training.ts: StatisticName "connected-days", title "Days connected".
  build('Days connected', PANEL_DAYS_CONNECTED, () => fetchStatisticLeaderboard('connected-days'), own('connected-days'))
  // New: the ranked points won in the last 24 hours (web/server/leaderboard).
  // No own-row rule here, because the scene does not know its own 24 h total.
  build('Last 24h ranking', PANEL_LAST_24H, fetchLast24hLeaderboard)
  rankingBoards = boards
}

const destroyRankingBoards = () => {
  rankingBoards.forEach((board) => board.dispose())
  rankingBoards = []
}

export const createLobbyTraining = (parent: Entity, opts?: LobbyTrainingOptions) => {
  createRankingBoards(parent)

  // The "PRIZES BY RANK" board, to the left of the season panel. Needs no
  // colyseus, but shares the same singleton lifetime so a lobby respawn does not
  // duplicate it.
  if (!seasonPrizes) {
    try {
      seasonPrizes = createSeasonPrizesScreen(parent)
    } catch (err) {
      console.log('[season] prizes screen failed to spawn', err)
    }
  }

  // SDK6 createLobbyTraining also built the Season wall. It needs the colyseus
  // client, so it only goes up once the lobby is given one. createSeasonMenu is
  // async (it builds the season demo up front); kick it off without blocking the
  // rest of the lobby, and never let a failure take the lobby down with it. The
  // panel owns a long-lived season demo (its own colyseus room and the 4-round
  // state machine), so it must NOT be duplicated when the lobby is respawned at
  // the end of a run — it hides and shows itself instead. Only
  // destroyLobbyTraining() (a storymode mission start) actually tears it down.
  if (opts?.colyseus && !seasonMenu) {
    createSeasonMenu(parent, {
      root: opts.root,
      position: PANEL_SEASON.position,
      rotation: PANEL_SEASON.rotation,
      colyseus: opts.colyseus,
      wip: opts.wip,
      onStarting: opts.onStarting,
      onFinish: opts.onFinish
    })
      .then((menu) => (seasonMenu = menu))
      .catch((err) => console.log('[season] menu failed to spawn', err))
  }

  golfclubBoard = createGolfclubBoard(parent, {
    position: PANEL_GOLFCLUBS.position,
    rotation: PANEL_GOLFCLUBS.rotation,
    golfclubCollection: currentCollection(),
    activeGolfClubTokenId: globalStore.userData.getState().activeGolfClubTokenId || null
  })

  // SDK6 refreshed the board through a globalStore.userData.onChange
  // subscription. Our globalStore stub has no pub/sub (onChange is a no-op), so
  // push the refreshed collection into the board explicitly instead.
  const syncBoardFromStore = () => {
    if (!golfclubBoard) return
    golfclubBoard.updateState({
      golfclubCollection: currentCollection(),
      activeGolfClubTokenId: globalStore.userData.getState().activeGolfClubTokenId || null,
      upgradingAttribute: null,
      loading: false
    })
  }

  golfclubBoard.onSelect(async ({ golfclub }) => {
    if (!golfclubBoard) return
    golfclubBoard.updateState({ loading: true })
    await selectGolfclub(golfclub.tokenId)
    syncBoardFromStore()
  })

  golfclubBoard.onUpgrade(async ({ attribute, ItemInstanceId }) => {
    if (!golfclubBoard) return
    golfclubBoard.updateState({ loading: true })
    await upgradeGolfclubAttribute(ItemInstanceId, attribute)
    syncBoardFromStore()
  })

  golfclubBoard.onMint(() => {
    // SDK6 POSTed to https://golfcraftgame.com/bridge/mint-golf-club and polled
    // /bridge/action/<id> for the result. Only reachable with a fully maxed
    // (16/16) basic club and 120 DM, so it's out of scope for the storymode arc.
    console.log('[golfclub-board] mint not migrated')
    showMessage({ timeout: 3000, message: 'Golf club minting is not available yet' })
    golfclubBoard && golfclubBoard.updateState({ loading: false })
  })

  return golfclubBoard
}

// Used when a SEASON run starts: the lobby goes away (the golfclub board and the
// prizes board with it, both rebuilt by the next createLobbyTraining) but the
// season panel must survive, since it is driving the run. It hides itself.
export const destroyLobbyBoards = () => {
  destroyRankingBoards()
  if (seasonPrizes) {
    seasonPrizes.dispose()
    seasonPrizes = null
  }
  if (!golfclubBoard) return
  golfclubBoard.dispose()
  golfclubBoard = null
}

export const destroyLobbyTraining = () => {
  destroyRankingBoards()
  if (seasonMenu) {
    seasonMenu.dispose()
    seasonMenu = null
  }
  if (seasonPrizes) {
    seasonPrizes.dispose()
    seasonPrizes = null
  }
  if (!golfclubBoard) return
  golfclubBoard.dispose()
  golfclubBoard = null
}
