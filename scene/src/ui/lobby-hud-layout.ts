// Geometry of the lobby HUD (ui/lobby-hud.tsx), the SDK6 sprite panels at
// 1/1.5 scale (lobby-ui-elements-def.ts), in design px before the contain
// scale. Shared with the lobby menu's MENU button, which hangs just left of
// the materials panel, so both move together when the HUD scales.
export const HUD_SCALE = 1 / 1.5

export const MATERIAL_PANEL_W = 564 * HUD_SCALE
export const MATERIAL_PANEL_H = 183 * HUD_SCALE
export const PLAYER_PANEL_W = 342 * HUD_SCALE
export const PLAYER_PANEL_H = 82 * HUD_SCALE
export const STRIP_W = 111 * HUD_SCALE
export const STRIP_H = 1071 * HUD_SCALE

// Where the panels sit, from the top-right corner of the interactable area.
export const STRIP_TOP = 72
export const PLAYER_PANEL_TOP = 6
export const MATERIAL_PANEL_TOP = 80
export const MATERIAL_PANEL_RIGHT = STRIP_W + 4

// The whole HUD's box, so one container can hold the absolute children.
export const HUD_W = MATERIAL_PANEL_RIGHT + MATERIAL_PANEL_W
export const HUD_H = STRIP_TOP + STRIP_H

// The strip's boxes (chest, GOLF CLUB, BONUS %, DAILY MISSIONS) are 60 px
// wide with a 7 px margin to the strip's edges. The MENU tile uses the same
// footprint and sits above the strip, level with the PLAYER panel, so it
// stays in the same place in any window proportion.
export const STRIP_TILE_W = 60
export const STRIP_TILE_RIGHT = 7
export const MENU_TILE_TOP = PLAYER_PANEL_TOP
export const MENU_TILE_H = STRIP_TOP - PLAYER_PANEL_TOP - 6
