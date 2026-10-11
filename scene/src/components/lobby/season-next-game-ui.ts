// SDK7 port of SDK6 scene/src/components/lobby/season-next-game-ui.ts
// Shown between season holes ("HOLE DONE!") and at the end of a run ("RUN
// COMPLETE!"), where it also reports the season points earned, the rewards
// and any tier promotion or demotion. Same inputs and timing as SDK6; the
// screen itself is ui/season-screens.tsx, fed through season-results-state.
import { fadeOutOverlay } from '../ui/overlay'
// @ts-ignore - common/utils has @ts-nocheck
import { getTierFromSub } from '../../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIERS } from '../../../../common/constants'
import { seasonNextGameState, SeasonScoreRow } from '../../ui/season-results-state'
import { globalStore } from '../../services/globalStore/globalStore'

const sumAcc = (acc: number, current: number) => acc + current

// Rank the rows of one hole: finished first (fewest shots, then time), the
// unfinished after them by shots.
const rankHole = (rows: SeasonScoreRow[]) =>
  [...rows]
    .sort((a, b) => {
      if (a.timeUp !== b.timeUp) return a.timeUp ? 1 : -1
      if (a.shots !== b.shots) return a.shots - b.shots
      return a.timeMs - b.timeMs
    })
    .map((row, i) => ({ ...row, rank: i + 1 }))

export const createOrShowNextGameUi = async (
  user: any,
  currentGame: number,
  resultData: any[],
  tierSub: number,
  newTierSub: number,
  _callback: () => void = () => {},
  timeout = 5000,
  rewards: any = null,
  rewardsBonus?: any,
  // Only used by a party run, to explain a 0-point result (season-party-demo).
  note?: string,
  // Wallets of the humans in the room (a party passes its members); every
  // other row is a ghost.
  humanAddresses: string[] = [user.userId]
) => {
  const state = seasonNextGameState
  const finished = currentGame === 4
  // currentGame already counts the hole just played (1..4).
  const hole = Math.max(1, Math.min(4, currentGame))
  const holeIndex = hole - 1
  const humans = humanAddresses.map((a) => String(a).toLowerCase())
  const isHuman = (address: string) => humans.indexOf(String(address || '').toLowerCase()) >= 0
  const isMe = (address: string) => String(address || '').toLowerCase() === String(user.userId || '').toLowerCase()

  const named = resultData.filter((playerResults: any) => !!playerResults?.name)

  let rows: SeasonScoreRow[]
  if (finished) {
    // Run total, best first.
    rows = [...named]
      .sort((a, b) => b.score.reduce(sumAcc, 0) - a.score.reduce(sumAcc, 0))
      .map((p: any, i: number) => ({
        rank: i + 1,
        name: p.name,
        isMe: isMe(p.address),
        isGhost: !isHuman(p.address),
        shots: (p.shots || []).reduce(sumAcc, 0),
        timeMs: (p.time || []).reduce(sumAcc, 0),
        timeUp: false,
        points: p.score.reduce(sumAcc, 0)
      }))
  } else {
    rows = rankHole(
      named.map((p: any) => ({
        rank: 0,
        name: p.name,
        isMe: isMe(p.address),
        isGhost: !isHuman(p.address),
        shots: p.shots?.[holeIndex] || 0,
        timeMs: p.time?.[holeIndex] || 0,
        timeUp: !(p.time?.[holeIndex] > 0),
        points: p.score?.[holeIndex] || 0
      }))
    )
  }

  const me = rows.find((row) => row.isMe)
  const mine = named.find((p: any) => isMe(p.address))

  // The server only reports tier-sub at the end of the run; between holes it
  // sends undefined. Rebuild it from the rank the player started with plus the
  // points of the holes played, so the screen can still show the bar.
  if (!Number.isFinite(tierSub) || !Number.isFinite(newTierSub)) {
    const base = Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)
    const scores: number[] = mine?.score || []
    const upTo = (count: number) => scores.slice(0, count).reduce(sumAcc, 0)
    tierSub = Math.max(0, base + upTo(holeIndex))
    newTierSub = Math.max(0, base + upTo(holeIndex + 1))
  }

  state.kind = finished ? 'run' : 'hole'
  state.hole = hole
  state.holes = 4
  state.rows = rows
  state.myRank = me ? me.rank : 0
  state.myPoints = me ? me.points : 0
  state.tierSub = tierSub
  state.newTierSub = newTierSub
  state.rewards = rewards
    ? Object.keys(rewards)
        .filter((code) => Number(rewards[code]) > 0)
        .map((code) => ({ code, amount: Number(rewards[code]) }))
    : []
  state.holeScores = finished
    ? [0, 1, 2, 3].map((i) => {
        const ranked = rankHole(
          named.map((p: any) => ({
            rank: 0,
            name: p.name,
            isMe: isMe(p.address),
            isGhost: !isHuman(p.address),
            shots: p.shots?.[i] || 0,
            timeMs: p.time?.[i] || 0,
            timeUp: !(p.time?.[i] > 0),
            points: p.score?.[i] || 0
          }))
        )
        const own = ranked.find((row) => row.isMe)
        return { hole: i + 1, rank: own ? own.rank : 0, points: mine?.score?.[i] || 0 }
      })
    : []

  const notes: string[] = []
  if (finished) {
    const tierPoints = newTierSub - tierSub
    const currentTier = Math.max(0, getTierFromSub(newTierSub) || 0)
    const previousTier = Math.max(0, getTierFromSub(tierSub) || 0)
    if (rewardsBonus) {
      notes.push(
        `Bonus: tier x${Number(rewardsBonus.tier || 0).toFixed(2)} · wearables x${Number(rewardsBonus.wearables || 0).toFixed(2)} · golfclubs x${Number(
          rewardsBonus.golfclubs || 0
        ).toFixed(2)}`
      )
    }
    if (currentTier > previousTier) {
      notes.push(`Promoted from ${TIERS[previousTier]} to ${TIERS[currentTier]}`)
    } else if (currentTier < previousTier) {
      notes.push(`Demoted to ${TIERS[currentTier]}. Better luck next run!`)
    } else if (tierPoints > 0) {
      notes.push(`Keep playing, ${TIERS[currentTier + 1] || 'the top'} is getting closer`)
    }
  }
  if (note) notes.push(note)
  state.note = notes.join('\n')

  state.until = Date.now() + timeout
  state.visible = true

  // Closes after `timeout`, or earlier through the LOBBY button. The sandbox's
  // clearTimeout is not reliable, so a flag guards against a late timer.
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      state.onSkip = null
      resolve()
    }
    state.onSkip = finish
    setTimeout(finish, timeout)
  })
  state.visible = false
}

export const hideNextGameUi = async () => {
  seasonNextGameState.visible = false
  await fadeOutOverlay(1)
}
