// Responsive helpers shared by every panel of the new UI.
//
// The explorer reports the canvas size and its "interactable area": the part
// of the screen not covered by its own chat, minimap and HUD (and, on mobile,
// the notch and the touch controls). It is read on every render because it
// changes when the explorer shows or hides its HUD, on resize and on rotation.
// interactableArea is a BorderRect: MARGINS from each canvas edge, not a box.
import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { isMobile } from '../services/platform'

export type Area = { top: number; left: number; right: number; bottom: number }

export type Canvas = {
  width: number
  height: number
  area: Area
  // The usable box, in canvas px.
  availW: number
  availH: number
}

export const DESIGN_W = 1280
export const DESIGN_H = 720
export const MIN_FONT = 11

let lastTrace = ''
export const readCanvas = (): Canvas => {
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  const width = info?.width || DESIGN_W
  const height = info?.height || DESIGN_H
  const area = info?.interactableArea || { top: 0, left: 0, right: 0, bottom: 0 }
  // Logged on change only: what the explorer reports (size and the margins
  // its own HUD takes), for layout questions.
  const trace = `${width}x${height} dpr=${info?.devicePixelRatio ?? '?'} area t${area.top} l${area.left} r${area.right} b${area.bottom}`
  if (trace !== lastTrace) {
    lastTrace = trace
    console.log('[ui] canvas', trace)
  }
  return {
    width,
    height,
    area,
    availW: Math.max(1, width - area.left - area.right),
    availH: Math.max(1, height - area.top - area.bottom)
  }
}

export type Layout = {
  canvas: Canvas
  scale: number
  panelW: number
  panelH: number
  left: number
  top: number
}

// "Contain": the largest box with the design's proportion that fits inside the
// interactable area, minus `margin` on every side and `reserveBottom` px kept
// free under it (for a caption outside the panel), centred in what is left.
export const containLayout = (
  designW = DESIGN_W,
  designH = DESIGN_H,
  { margin = 16, reserveBottom = 0 }: { margin?: number; reserveBottom?: number } = {}
): Layout => {
  const canvas = readCanvas()
  const availW = Math.max(1, canvas.availW - margin * 2)
  const availH = Math.max(1, canvas.availH - margin * 2 - reserveBottom)
  const scale = Math.max(0.1, Math.min(availW / designW, availH / designH))
  if (isMobile() || isSmallCanvas(scale)) {
    // Phones and tablets: the interactable area the explorer reports keeps its
    // top bar but not its touch controls (bottom corners), so a panel centred
    // in it lands on them. Lay out against the whole canvas instead: hug the
    // top, stay within the top 62 % of the height (above the F / + / joystick
    // row) and right of the avatar + chat buttons (the left 20 % at the top).
    // Keyed on the platform first: on an iPhone the contain scale alone came
    // out above the small-canvas threshold, so the panel stayed centred.
    const reserveLeft = canvas.width * 0.2
    const w = Math.max(1, canvas.width - reserveLeft - margin)
    const h = Math.max(1, Math.min(canvas.height - margin * 2 - reserveBottom, canvas.height * 0.62))
    const s = Math.max(0.1, Math.min(w / designW, h / designH))
    return {
      canvas,
      scale: s,
      panelW: designW * s,
      panelH: designH * s,
      left: reserveLeft + (w - designW * s) / 2,
      top: margin
    }
  }
  const panelW = designW * scale
  const panelH = designH * scale
  return {
    canvas,
    scale,
    panelW,
    panelH,
    left: canvas.area.left + margin + (availW - panelW) / 2,
    top: canvas.area.top + margin + (availH - panelH) / 2
  }
}

// A canvas where the 1280x720 design has to shrink below 80 %: phones in
// landscape (and very small desktop windows). Layouts move up and the intro
// card grows there.
export const SMALL_CANVAS_SCALE = 0.8
export const isSmallCanvas = (containScale: number) => containScale < SMALL_CANVAS_SCALE

// Design px -> canvas px, and the same for font sizes (never under MIN_FONT).
export type Px = (n: number) => number
export type Scaler = { px: Px; fs: Px }
export const scaler = (scale: number): Scaler => ({
  px: (n) => n * scale,
  fs: (n) => Math.max(MIN_FONT, n * scale)
})

// Scale for HUD pieces anchored to the corners rather than centred: the same
// contain ratio as the panels, so a HUD block keeps the proportion the design
// gives it on every screen (on a Retina canvas that means growing past 1x).
export const hudScale = (): { canvas: Canvas; s: Scaler; scale: number } => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: 0 })
  return { canvas: L.canvas, s: scaler(L.scale), scale: L.scale }
}
