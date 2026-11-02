// The wearables giveaway of a week (user, 2026-11-02): "1 game completed = 1
// ticket, Nov 1-7", 10 COCOBAY hoodies to win. Shown as a card in the lobby
// HUD (ui/giveaway.tsx) and as a banner on the lobby wall (components/lobby/
// giveaway-banner.ts) while the campaign runs. The dates can be moved without
// a redeploy from the admin's `config` table, row `giveaway`:
//   {"from":"2026-11-01T00:00:00Z","to":"2026-11-08T00:00:00Z"}  or  {"enabled":false}
import { globalStore } from './globalStore/globalStore'

export const GIVEAWAY = {
  // the poster as the user gave it (square)
  poster: 'images/giveaway-nov-2026.jpg',
  // the poster with the GolfCraft logo on top, for the wall
  banner: 'images/giveaway-nov-2026-banner.jpg',
  bannerRatio: 1293 / 1024,
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
