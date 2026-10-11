// SDK7 port of SDK6 scene/src/components/lobby/ingame-ui.ts
// The two in-game overlays of a season run: the elapsed-time clock and the live
// scoreboard. SDK6 drove UICanvas widgets directly; here they write into
// season-hud-state and ui/game-hud.tsx renders them.
import { seasonClockState, seasonResultsState, SeasonResultRow } from '../../ui/season-hud-state'

export const createInGameTime = () => {
  return {
    updateMs: (ms: number) => {
      seasonClockState.ms = ms
    },
    show: () => (seasonClockState.visible = true),
    hide: () => (seasonClockState.visible = false)
  }
}

// SDK6 composed one padded string per player. The rows are structured now so
// the HUD can rank them and mark who holed; the data is the same server state.
// `meIndex` is the local player's row and rows from `playerCount` on are
// ghosts (a solo run: me at 0, then 3 ghosts; a party: the members, then 3).
export const createInGameResultsUi = (results: any, meIndex = 0, playerCount = 1) => {
  const compose = (playerResult: any, index: number, currentGame: number, reset: boolean): SeasonResultRow => ({
    name: playerResult.name || playerResult.displayName || '_player_',
    isMe: index === meIndex,
    isGhost: index >= playerCount,
    holed: !reset && (playerResult.time?.[currentGame] || 0) > 0,
    shots: reset ? 0 : playerResult.shots?.[currentGame] || 0,
    timeMs: reset ? 0 : playerResult.time?.[currentGame] || 0
  })

  const updateView = (nextResults: any, currentGame = 0) => {
    const rows: SeasonResultRow[] = []
    nextResults.forEach((playerResult: any, index: number) => {
      rows.push(compose(playerResult, index, currentGame || 0, false))
    })
    seasonResultsState.rows = rows
  }

  updateView(results)
  seasonResultsState.visible = true

  return {
    updateView,
    hide: () => (seasonResultsState.visible = false),
    show: () => (seasonResultsState.visible = true),
    resetView: () => {
      const rows: SeasonResultRow[] = []
      results.forEach((playerResult: any, index: number) => {
        rows.push(compose(playerResult, index, 0, true))
      })
      seasonResultsState.rows = rows
    }
  }
}
