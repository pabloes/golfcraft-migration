// Which explorer the scene runs in, from ~system/Runtime.getExplorerInformation
// (platform is one of "desktop", "mobile", "vr", "web"; agent names the
// explorer build). Fetched once at import, so the first frames may still read
// null; everything that depends on it re-reads each render. The raw values are
// logged so we learn what each explorer reports.
import { getExplorerInformation } from '~system/Runtime'

export type Platform = 'desktop' | 'mobile' | 'vr' | 'web'
export type ExplorerInfo = { agent: string; platform: Platform | null }

// The explorer tag the stats keep (x-golfcraft-explorer / record-visit's
// explorer): "<agent>/<platform>", at most this long
const EXPLORER_TAG_MAX = 48
const EXPLORER_TAG_TIMEOUT_MS = 2000

let platform: Platform | null = null
let agent = ''

// Settles once the explorer has answered (or refused); never rejects
const explorerInfoPromise: Promise<ExplorerInfo> = getExplorerInformation({})
  .then((info) => {
    agent = String(info.agent || '')
    const value = String(info.platform || '').toLowerCase()
    platform = (['desktop', 'mobile', 'vr', 'web'].includes(value) ? value : null) as Platform | null
    console.log('[platform]', JSON.stringify({ platform: info.platform, agent }))
    return { agent, platform }
  })
  .catch((err) => {
    console.log('[platform] getExplorerInformation failed:', err)
    return { agent, platform }
  })

export const getPlatform = () => platform
export const getAgent = () => agent
export const isMobile = () => platform === 'mobile'
export const explorerInfo = () => explorerInfoPromise

// "<agent>/<platform>" for the visit stats (golfcraftgame.com/stats counts
// visitors per explorer), or "" when the explorer has not answered within
// timeoutMs: the login must never wait on a silent explorer.
export function explorerTag(timeoutMs: number = EXPLORER_TAG_TIMEOUT_MS): Promise<string> {
  const tag = ({ agent, platform }: ExplorerInfo) =>
    `${agent || 'unknown'}/${platform || 'unknown'}`.replace(/[^\x20-\x7e]/g, '').slice(0, EXPLORER_TAG_MAX)
  return Promise.race([
    explorerInfoPromise.then(tag),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutMs))
  ]).catch(() => '')
}
