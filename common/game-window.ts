// When GolfCraft can be played: a window of days each month, in UTC, set from
// the admin (golfcraftgame.com/admin → config, key `gameWindow`). Shared by
// the web API (which answers /api/game-window), the game server (which refuses
// to START a match outside the window; a match already started is played to
// the end) and the scene (which shows the countdown).
//
// The row's value is JSON, e.g.
//   { "fromDay": 1, "toDay": 7, "force": null, "allowWallets": ["0xabc…"] }
// fromDay / toDay: days of the month, inclusive, UTC. 1..7 = from day 1 at
//   00:00 UTC until day 8 at 00:00 UTC.
// force: "open" or "closed" overrides the calendar (events, emergencies).
// allowWallets: wallets that can always play (testers), any letter case.
// No row at all means no restriction: the game is open.

export type GameWindowConfig = {
  fromDay?: number
  toDay?: number
  force?: 'open' | 'closed' | null
  allowWallets?: string[]
  // What players are told while it is closed. The monthly wording is wrong
  // for a five minute maintenance stop, which is what `force: "closed"` is
  // really used for: it stops anyone STARTING a game while the matches
  // already running play to the end, and then the server can be restarted
  // without cutting anybody off (user, 2026-11-04).
  message?: string
}

export type GameWindowStatus = {
  // Whether the calendar (or `force`) has the game open right now.
  windowOpen: boolean
  // Milliseconds since epoch; null when there is no such moment (forced).
  opensAt: number | null
  closesAt: number | null
  now: number
}

const toInt = (value: any, fallback: number) => {
  const n = Math.floor(Number(value))
  return isFinite(n) ? n : fallback
}

export function getGameWindowStatus(config: GameWindowConfig | null | undefined, now: number = Date.now()): GameWindowStatus {
  if (!config) return { windowOpen: true, opensAt: null, closesAt: null, now }
  if (config.force === 'open') return { windowOpen: true, opensAt: null, closesAt: null, now }
  if (config.force === 'closed') return { windowOpen: false, opensAt: null, closesAt: null, now }

  const fromDay = Math.min(28, Math.max(1, toInt(config.fromDay, 1)))
  const toDay = Math.min(31, Math.max(fromDay, toInt(config.toDay, 7)))
  const today = new Date(now)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  // Date.UTC rolls month 12 over into January of the next year.
  const startOf = (y: number, m: number) => Date.UTC(y, m, fromDay)
  const endOf = (y: number, m: number) => Math.min(Date.UTC(y, m, toDay + 1), Date.UTC(y, m + 1, 1))

  const start = startOf(year, month)
  const end = endOf(year, month)
  if (now >= start && now < end) return { windowOpen: true, opensAt: null, closesAt: end, now }
  return { windowOpen: false, opensAt: now < start ? start : startOf(year, month + 1), closesAt: null, now }
}

export function isWalletAllowed(config: GameWindowConfig | null | undefined, address?: string | null): boolean {
  if (!config || !address) return false
  const wallet = String(address).toLowerCase()
  return (config.allowWallets || []).some((w) => String(w).toLowerCase() === wallet)
}

// What /api/game-window answers for one wallet.
export function getGameAccess(config: GameWindowConfig | null | undefined, address?: string | null, now: number = Date.now()) {
  const status = getGameWindowStatus(config, now)
  const allowed = isWalletAllowed(config, address)
  const message = String(config?.message || '').trim().slice(0, 200)
  return { ...status, allowed, open: status.windowOpen || allowed, message }
}

export const GAME_CLOSED_MESSAGE = 'GolfCraft is closed right now. It opens the first week of every month.'
