// State for SDK6's between-rounds / end-of-run scoreboard
// (season-next-game-ui.ts). SDK6 composed one big UIText with `<color=...>` and
// `<b>` markup; SDK7 Labels don't render that markup, so the player's own row
// carries a `highlight` flag instead of an inline colour tag (same call we made
// for the NPC dialogs).

export type SeasonScoreRow = { text: string; highlight: boolean }

export type SeasonNextGameState = {
  visible: boolean
  title: string
  rows: SeasonScoreRow[]
  // Tier points / rewards / promotion-demotion copy, shown under the table.
  extra: string
}

export const seasonNextGameState: SeasonNextGameState = {
  visible: false,
  title: '',
  rows: [],
  extra: ''
}
