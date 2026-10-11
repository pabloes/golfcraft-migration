// State for the between-holes and end-of-run screens (ui/season-screens.tsx),
// filled by components/lobby/season-next-game-ui.ts from the same server data
// SDK6 printed as one big UIText.

export type SeasonScoreRow = {
  rank: number
  name: string
  isMe: boolean
  isGhost: boolean
  shots: number
  timeMs: number
  // No time recorded for the hole: the player did not finish it.
  timeUp: boolean
  // Season points this hole (or the run total on the final screen).
  points: number
}

export type SeasonReward = { code: string; amount: number }

export type SeasonNextGameState = {
  visible: boolean
  // 'hole' between holes, 'run' after the fourth.
  kind: 'hole' | 'run'
  // 1-based hole just played.
  hole: number
  holes: number
  rows: SeasonScoreRow[]
  myRank: number
  myPoints: number
  tierSub: number
  newTierSub: number
  rewards: SeasonReward[]
  // Run screen: your position and points on each hole.
  holeScores: { hole: number; rank: number; points: number }[]
  // Extra copy (promotion, demotion, the party "no season points" note).
  note: string
  // When the screen closes on its own, as a timestamp.
  until: number
  // Closes it early (the LOBBY button).
  onSkip: (() => void) | null
}

export const seasonNextGameState: SeasonNextGameState = {
  visible: false,
  kind: 'hole',
  hole: 1,
  holes: 4,
  rows: [],
  myRank: 0,
  myPoints: 0,
  tierSub: 0,
  newTierSub: 0,
  rewards: [],
  holeScores: [],
  note: '',
  until: 0,
  onSkip: null
}
