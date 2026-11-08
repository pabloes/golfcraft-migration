// The rows behind the lobby's in-world ranking boards
// (components/lobby/leaderboard-panel.ts), kept out of the panel so the same
// board draws a PlayFab statistic or our own 24 h window without knowing the
// difference.
//
// SDK6 read its boards through `refreshLeaderboard(StatisticName)` in
// services/userData.ts, which called PlayFab's Client/GetLeaderboard straight
// from the scene and parked the result in `globalStore.leaderboards`. We go
// through the web API instead (`/api/leaderboard/<stat>/<page>`, the route the
// lobby dialog's top 10 already uses), because it answers with the display
// names resolved and needs no session ticket.
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../common/constants'

export type LeaderboardRow = {
  rank: number
  name: string
  playFabId: string
  value: number
}

// Same host rule as get-login-id and the dialog's leaderboard: the local web
// API over plain http in dev, production over https.
const apiBase = () => (USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569')

const TOP = 10

// `/api/leaderboard/:StatisticName/:page` answers TEXT, not JSON: rows joined
// with "<br>", each one "StatValue PlayFabId DisplayName" where the name may
// carry spaces. A row whose two first fields do not parse is skipped rather
// than shown as a blank line.
export const fetchStatisticLeaderboard = async (statistic: string): Promise<LeaderboardRow[]> => {
  const res = await fetch(`${apiBase()}/api/leaderboard/${statistic}/1`)
  const text = await res.text()
  const rows: LeaderboardRow[] = []
  for (const line of text.split('<br>')) {
    const [value, playFabId, ...rest] = line.trim().split(' ')
    if (!/^-?\d+$/.test(value || '') || !/^[0-9A-F]{15,16}$/i.test(playFabId || '')) continue
    rows.push({ rank: rows.length + 1, value: Number(value), playFabId, name: rest.join(' ') || playFabId })
    if (rows.length === TOP) break
  }
  return rows
}

// The rolling 24 hour board (user, 2026-11-07: "el diario lo que quiero
// realmente, es las ultimas 24H"). There is no PlayFab statistic for it and
// none could be added without resetting something, so it is computed from our
// own `player_game` rows by the web API (web/server/leaderboard/index.ts).
export const fetchLast24hLeaderboard = async (): Promise<LeaderboardRow[]> => {
  const res = await fetch(`${apiBase()}/api/leaderboard-24h`)
  const body: any = await res.json()
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : []
  return rows.slice(0, TOP).map((row, index) => ({
    rank: index + 1,
    value: Number(row.points) || 0,
    playFabId: String(row.playFabId || ''),
    name: String(row.name || row.playFabId || '')
  }))
}
