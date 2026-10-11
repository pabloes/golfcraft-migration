// Geometry of the lobby HUD (ui/game-hud.tsx LobbyHud): two rows of resource
// pills anchored to the top-right corner of the interactable area. Shared with
// the lobby menu's MENU button, which hangs just left of it.
export const HUD_TOP = 16
export const HUD_RIGHT = 16
export const HUD_PILL_W = 118
export const HUD_PILL_H = 40
export const HUD_GAP = 8
export const HUD_W = HUD_PILL_W * 4 + HUD_GAP * 3

export const hudGeometry = (scale: number) => ({
  top: HUD_TOP,
  right: HUD_RIGHT,
  pillW: HUD_PILL_W * scale,
  pillH: HUD_PILL_H * scale,
  gap: HUD_GAP * scale,
  width: HUD_W * scale,
  // Offset from the area's right edge to the HUD's left side.
  leftEdgeRight: HUD_RIGHT + HUD_W * scale
})
