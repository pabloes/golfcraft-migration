// A stretch of days when a Ranked run costs no Energy (user request,
// 2026-11-04). Shared by the web API (which answers it inside
// /api/game-window), the game server (which decides whether to charge) and
// the scene (which must let a player with 0 Energy press PLAY, or the offer
// would be invisible to exactly the players it is for).
//
// The rule lives in the admin's `config` table, row `freeEnergy`, same shape
// as the giveaway's:
//   {"from":"2026-11-04T00:00:00Z","to":"2026-11-11T00:00:00Z"}
// With both dates it ENDS BY ITSELF, with no second intervention: the moment
// `to` passes, every reader goes back to charging. The dates are UTC and `to`
// is exclusive.
//
// Two escape hatches:
//   {"enabled":true}   on until somebody turns it off (no end date)
//   {"enabled":false}  off now, whatever the dates say
// No row at all means energy is charged, which is the normal behaviour, so
// deploying this code changes nothing until the row exists.

export type FreeEnergyConfig = {
  from?: string
  to?: string
  enabled?: boolean
}

export type FreeEnergyStatus = {
  free: boolean
  // Milliseconds since epoch, for the countdown the scene shows; null when
  // the window has no end (enabled with no dates) or is not running.
  since: number | null
  until: number | null
}

const OFF: FreeEnergyStatus = { free: false, since: null, until: null }

export function getFreeEnergyStatus(
  config: FreeEnergyConfig | null | undefined,
  now: number = Date.now()
): FreeEnergyStatus {
  if (!config || config.enabled === false) return OFF
  const from = config.from ? Date.parse(config.from) : NaN
  const to = config.to ? Date.parse(config.to) : NaN
  const hasDates = isFinite(from) && isFinite(to) && to > from
  // enabled:true with no usable dates means on until it is turned off
  if (!hasDates) return config.enabled === true ? { free: true, since: null, until: null } : OFF
  return { free: now >= from && now < to, since: from, until: to }
}

export const FREE_ENERGY_MESSAGE = 'Free Energy week: Ranked runs cost nothing'
