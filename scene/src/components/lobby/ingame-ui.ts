// SDK7 port of SDK6 scene/src/components/lobby/ingame-ui.ts
// The two in-game overlays of a season run: the elapsed-time clock (top centre)
// and the live 4-player scoreboard (top right). SDK6 drove UICanvas widgets
// directly; here they write into season-hud-state and <SeasonHud/> renders them.
// @ts-ignore - common/utils has @ts-nocheck
import { formatTime } from '../../../../common/utils'
import { seasonClockState, seasonResultsState } from '../../ui/season-hud-state'

export const createInGameTime = () => {
  return {
    updateMs: (ms: number) => {
      seasonClockState.ms = ms
    },
    show: () => (seasonClockState.visible = true),
    hide: () => (seasonClockState.visible = false)
  }
}

// SDK6 laid the row out as one padded string per player (name padded to 20,
// then time, then shots) and relied on the UI font. We keep the exact same
// composition and render it in a monospace font so the columns still line up.
const composeRow = (playerResult: any, currentGame: number) =>
  (playerResult.name || playerResult.displayName || '_player_').padEnd(20, ' ').slice(0, 20) +
  formatTime(playerResult.time?.[currentGame || 0] || 0, true) +
  '   ' +
  (playerResult.shots?.[currentGame || 0] || 0)

export const createInGameResultsUi = (results: any) => {
  const updateView = (nextResults: any, currentGame = 0) => {
    const rows: string[] = []
    nextResults.forEach((playerResult: any) => {
      rows.push(composeRow(playerResult, currentGame))
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
      const rows: string[] = []
      results.forEach((playerResult: any) => {
        rows.push(
          (playerResult.name || playerResult.displayName || '_player_').padEnd(20, ' ').slice(0, 20) +
            formatTime(0, true) +
            '   0'
        )
      })
      seasonResultsState.rows = rows
    }
  }
}
