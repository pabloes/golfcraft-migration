// SDK7 port of SDK6 scene/src/components/lobby/season-next-game-ui.ts
// Shown between season rounds ("Round N/4") and at the end of a run
// ("End results"), where it also reports the season points earned, the reward
// breakdown and any tier promotion or demotion.
import { fadeOutOverlay } from '../ui/overlay'
// @ts-ignore - common/utils has @ts-nocheck
import { getTierFromSub, sleep } from '../../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIER_CATEGORIES, TIERS } from '../../../../common/constants'
// @ts-ignore - common/currency-codes is untyped
import { CURRENCY_NAMES } from '../../../../common/currency-codes'
import { seasonNextGameState } from '../../ui/season-results-state'

// CURRENCY_NAMES is a plain object literal upstream, so TS won't let us index it
// with the arbitrary reward keys the server sends.
const CURRENCY_LABELS: Record<string, string> = CURRENCY_NAMES

const sumAcc = (acc: number, current: number) => acc + current

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
  note?: string
) => {
  seasonNextGameState.visible = true
  seasonNextGameState.title = currentGame === 4 ? 'End results' : `Round ${currentGame + 1}/4`

  const sortedResult = [...resultData].sort(
    (a, b) => b.score.reduce(sumAcc, 0) - a.score.reduce(sumAcc, 0)
  )

  seasonNextGameState.rows = sortedResult
    .filter((playerResults: any) => !!playerResults?.name)
    .map((playerResults: any) => ({
      text: `${playerResults.name.padEnd(26, '_')}| ${playerResults.score[0]} | ${playerResults.score[1]} | ${
        playerResults.score[2]
      } | ${playerResults.score[3]} |     ${playerResults.score.reduce(sumAcc, 0).toString().padStart(2, '0')}`,
      highlight: playerResults.address === user.userId
    }))

  const extra: string[] = []

  if (currentGame === 4) {
    // End of the run: report points, rewards and tier movement.
    const tierPoints = newTierSub - tierSub
    const currentTier = Math.max(0, getTierFromSub(newTierSub) || 0)
    const previousTier = Math.max(0, getTierFromSub(tierSub) || 0)
    const currentTierWord = String(TIERS[currentTier] || '').split(' ')[0]
    const previousTierWord = String(TIERS[previousTier] || '').split(' ')[0]
    const currentTierWordIndex = TIER_CATEGORIES.indexOf(currentTierWord)
    const previousTierWordIndex = TIER_CATEGORIES.indexOf(previousTierWord)

    extra.push(`You get ${tierPoints} season points`)

    if (rewards && Object.values(rewards).some((i: any) => i)) {
      Object.keys(rewards).forEach((currencyKey) => {
        if (CURRENCY_LABELS[currencyKey] && rewards[currencyKey]) {
          extra.push(`+${rewards[currencyKey]} ${CURRENCY_LABELS[currencyKey]}`)
        }
      })
      if (rewardsBonus) {
        extra.push('')
        extra.push(`Tier bonus: x${Number(rewardsBonus.tier || 0).toFixed(2)}`)
        extra.push(`Wearables bonus: x${Number(rewardsBonus.wearables || 0).toFixed(2)}`)
        extra.push(`Golfclubs bonus: x${Number(rewardsBonus.golfclubs || 0).toFixed(2)}`)
      }
    }

    if (currentTier > previousTier) {
      extra.push(`CONGRATS! You have promoted from ${TIERS[previousTier]}(${previousTier}) to ${TIERS[currentTier]}(${currentTier})`)
    } else if (currentTier === previousTier && tierPoints > 0) {
      extra.push(`NICE! keep playing, you are closer to the next Tier ${TIERS[currentTier + 1]}.`)
    } else if (tierPoints < 0) {
      extra.push('Oops!')
    }

    if (currentTier < previousTier) {
      extra.push(`You have been demoted to lower Tier. ${currentTier} -> ${previousTier}`)
      extra.push("But Don't worry! I'm sure you will do better next time.")
    }

    if (currentTierWordIndex === previousTierWordIndex && currentTier > previousTier) {
      extra.push('Now you have won some resources !!')
    }
  } else if (rewards) {
    Object.keys(rewards).forEach((currencyKey) => {
      if (rewards[currencyKey] > 0) {
        extra.push(`+${rewards[currencyKey] === 2 ? '+' : ''} ${CURRENCY_LABELS[currencyKey]}`)
      }
    })
  }

  if (note) extra.push(note)

  seasonNextGameState.extra = extra.join('\n')

  await sleep(timeout)
  seasonNextGameState.visible = false
}

export const hideNextGameUi = async () => {
  seasonNextGameState.visible = false
  await fadeOutOverlay(1)
}
