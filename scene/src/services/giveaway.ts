// The wearables giveaway of a week (user, 2026-11-02): "1 game completed = 1
// ticket, Nov 1-7", 10 COCOBAY hoodies to win. While it runs the poster takes
// three places, all back to normal by themselves when it ends: the champion's
// column of the lobby dialog's Season card (ui/lobby-menu.tsx), a card in the
// bottom-right corner of the lobby HUD (ui/giveaway.tsx) and the "play Season
// to win COCOBAY wearables" sign by the Season wall (components/lobby/
// building.ts, model event_giveaway_banner.gltf). The dates can be moved
// without a redeploy from the admin's `config` table, row `giveaway`:
//   {"from":"2026-11-01T00:00:00Z","to":"2026-11-08T00:00:00Z"}  or  {"enabled":false}
import { globalStore } from './globalStore/globalStore'

export const GIVEAWAY = {
  // the poster as the user gave it (square); the sign's texture is the same
  // with the logo in its top-left corner (models/building/textures/event_giveaway_banner.jpg)
  poster: 'images/giveaway-nov-2026.jpg',
  from: Date.parse('2026-11-01T00:00:00Z'),
  // exclusive: the whole of Nov 7 UTC counts
  to: Date.parse('2026-11-08T00:00:00Z')
}

export const isGiveawayActive = () => {
  const config = globalStore.userData.getState()?.config?.giveaway
  if (config?.enabled === false) return false
  const from = config?.from ? Date.parse(config.from) : GIVEAWAY.from
  const to = config?.to ? Date.parse(config.to) : GIVEAWAY.to
  const now = Date.now()
  return now >= from && now < to
}
