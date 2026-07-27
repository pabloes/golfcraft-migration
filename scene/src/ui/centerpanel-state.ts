// Center popup banners (SDK6 scene/src/components/ui/centerpanel.ts). The
// images live in images/ui-spritesheet.png at the SDK6 source rects. READY/GO
// are the mission-start cinematic (driven by gameState.starting); success/
// failed/timeout are the mission-end banners.
export type Banner = '' | 'ready' | 'go' | 'success' | 'failed' | 'timeout'

// [sourceLeft, sourceTop, sourceWidth, sourceHeight] in the 2048² atlas.
export const BANNER_SPRITES: Record<Exclude<Banner, ''>, [number, number, number, number]> = {
  ready: [295, 67, 727, 245],
  go: [354, 316, 534, 290],
  success: [1023, 80, 686, 139],
  failed: [1023, 219, 500, 146],
  timeout: [1023, 367, 610, 140]
}

export const centerPanelState: { banner: Banner } = { banner: '' }

let token = 0

// Show a banner. If autoHideMs is given, clear it after that delay (unless a
// newer banner replaced it in the meantime). READY is shown without auto-hide
// and is replaced by GO when the game actually starts.
export const showBanner = (banner: Banner, autoHideMs?: number) => {
  centerPanelState.banner = banner
  const mine = ++token
  if (autoHideMs && banner) {
    setTimeout(() => {
      if (token === mine) centerPanelState.banner = ''
    }, autoHideMs)
  }
}
