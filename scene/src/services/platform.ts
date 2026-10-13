// Which explorer the scene runs in, from ~system/Runtime.getExplorerInformation
// (platform is one of "desktop", "mobile", "vr", "web"; agent names the
// explorer build). Fetched once at import, so the first frames may still read
// null; everything that depends on it re-reads each render. The raw values are
// logged so we learn what each explorer reports.
import { getExplorerInformation } from '~system/Runtime'

export type Platform = 'desktop' | 'mobile' | 'vr' | 'web'

let platform: Platform | null = null
let agent = ''

void getExplorerInformation({})
  .then((info) => {
    agent = String(info.agent || '')
    const value = String(info.platform || '').toLowerCase()
    platform = (['desktop', 'mobile', 'vr', 'web'].includes(value) ? value : null) as Platform | null
    console.log('[platform]', JSON.stringify({ platform: info.platform, agent }))
  })
  .catch((err) => console.log('[platform] getExplorerInformation failed:', err))

export const getPlatform = () => platform
export const getAgent = () => agent
export const isMobile = () => platform === 'mobile'
