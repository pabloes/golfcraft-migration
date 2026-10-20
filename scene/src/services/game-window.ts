// The monthly game window as the scene sees it (rule: common/game-window.ts;
// the game server enforces it, this only keeps players from hitting a closed
// door). Asked to the web API for this wallet at boot, every 10 minutes, and
// right after the window is due to open or close. Until the first answer, or
// if the API can't be reached, the scene lets the player try: the server has
// the last word.
import { engine } from '@dcl/sdk/ecs'
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../common/constants'

export const gameWindowState = {
  loaded: false,
  // open = windowOpen || allowed (an allow-listed wallet plays any day).
  open: true,
  allowed: false,
  windowOpen: true,
  opensAt: null as number | null,
  closesAt: null as number | null,
  // Server clock minus ours, so countdowns don't depend on the phone's clock.
  offsetMs: 0,
  // The "closed" dialog, shown when the player tries to start something.
  noticeVisible: false
}

import { globalStore } from './globalStore/globalStore'

const REFRESH_MS = 10 * 60 * 1000
// The closed dialog pops up by itself once per session: after the intro if
// the game is already known to be closed, or as soon as the first answer says
// so when the intro is already gone.
let closedNoticeShown = false
let wallet = ''
let lastFetch = 0
let fetching = false
let started = false
const listeners: Array<() => void> = []

// Called when the open / closed state changes (the 3D Season board repaints).
export const onGameWindowChange = (fn: () => void) => {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

export const serverNow = () => Date.now() + gameWindowState.offsetMs
export const canStartGame = () => !gameWindowState.loaded || gameWindowState.open

// Every place that starts a match calls this first: false (and the dialog)
// when the game is closed for this player.
export const guardGameStart = (): boolean => {
  if (canStartGame()) return true
  gameWindowState.noticeVisible = true
  return false
}

// True when it opened the dialog (the caller then skips the lobby dialog).
export const showClosedNoticeOnce = (): boolean => {
  if (closedNoticeShown || canStartGame()) return false
  closedNoticeShown = true
  gameWindowState.noticeVisible = true
  return true
}

export const dismissGameClosedNotice = () => {
  gameWindowState.noticeVisible = false
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => (n < 10 ? `0${n}` : String(n))

// "Sun 1 Nov, 00:00 UTC"
export const formatUtc = (t: number) => {
  const d = new Date(t)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "November 1, 00:00 UTC"
export const formatOpeningDay = (t: number) => {
  const d = new Date(t)
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

// "18d 4h", "3h 12m", "5m"
export const formatCountdown = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${Math.max(1, minutes)}m`
}

// One line for buttons and boards: "Opens in 18d 4h" / "Opens soon".
export const opensInText = () =>
  gameWindowState.opensAt ? `Opens in ${formatCountdown(gameWindowState.opensAt - serverNow())}` : 'Opens soon'

export const refreshGameWindow = async () => {
  if (fetching) return
  fetching = true
  lastFetch = Date.now()
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  try {
    const data: any = await fetch(`${base}/api/game-window${wallet ? `?address=${wallet}` : ''}`).then((r) => r.json())
    const before = gameWindowState.loaded ? gameWindowState.open : null
    gameWindowState.loaded = true
    gameWindowState.open = !!data.open
    gameWindowState.allowed = !!data.allowed
    gameWindowState.windowOpen = !!data.windowOpen
    gameWindowState.opensAt = data.opensAt ?? null
    gameWindowState.closesAt = data.closesAt ?? null
    if (typeof data.now === 'number') gameWindowState.offsetMs = data.now - Date.now()
    if (gameWindowState.open) gameWindowState.noticeVisible = false
    else {
      const gs = globalStore.game.getState()
      if (!gs.introScreen && !gs.bootError && !gs.playing) showClosedNoticeOnce()
    }
    console.log('[game-window]', JSON.stringify({ open: data.open, allowed: data.allowed, opensAt: data.opensAt, closesAt: data.closesAt }))
    if (before !== gameWindowState.open) listeners.forEach((fn) => fn())
  } catch (err) {
    console.log('[game-window] check failed, the server will decide:', err)
  } finally {
    fetching = false
  }
}

// Re-asks shortly after the window is due to open or close, and every 10 min.
function gameWindowSystem() {
  if (!started) return
  const now = serverNow()
  const edge = gameWindowState.open ? gameWindowState.closesAt : gameWindowState.opensAt
  const dueAtEdge = edge !== null && now >= edge + 2000 && Date.now() - lastFetch > 5000
  if (dueAtEdge || Date.now() - lastFetch > REFRESH_MS) void refreshGameWindow()
}

export const startGameWindow = (address?: string | null) => {
  wallet = address ? String(address).toLowerCase() : ''
  if (!started) {
    started = true
    engine.addSystem(gameWindowSystem)
  }
  void refreshGameWindow()
}
