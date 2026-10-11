// In-game HUD state for a season run. SDK6 built these as UICanvas singletons:
//   - `ingame-ui.ts`      -> createInGameTime() clock + createInGameResultsUi() scoreboard
//   - `golfplay-client-season.ts` lines 29-37 -> module-level `cdText` countdown
// Here they follow the project's pattern: a mutable state object that gameplay
// code writes and a ReactEcs component reads each render (see topbar-state.ts).

export type SeasonClockState = { visible: boolean; ms: number }

// One scoreboard row. `holed` is "this player finished the hole" (the server
// writes the hole time when they do); SDK6 just printed the raw numbers.
export type SeasonResultRow = {
  name: string
  isMe: boolean
  isGhost: boolean
  holed: boolean
  shots: number
  timeMs: number
}
export type SeasonResultsState = { visible: boolean; rows: SeasonResultRow[] }

// Doubles as SDK6's `cdText`: "Starting in...\nN" before a hole and
// "Ending in...\nN" once someone holes out.
export type SeasonCountdownState = { visible: boolean; text: string }

// Which hole of the run is being played (1-based), for the HOLE n/4 block.
export type SeasonHoleState = { current: number; total: number }

export const seasonClockState: SeasonClockState = { visible: false, ms: 0 }
export const seasonResultsState: SeasonResultsState = { visible: false, rows: [] }
export const seasonCountdownState: SeasonCountdownState = { visible: false, text: '' }
export const seasonHoleState: SeasonHoleState = { current: 0, total: 4 }

export const hideSeasonHud = () => {
  seasonClockState.visible = false
  seasonResultsState.visible = false
  seasonCountdownState.visible = false
}
