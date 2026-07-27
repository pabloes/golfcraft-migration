// Shared state for the shoot HUD (power bar on the right + bottom-right
// control hint sprite). Mirrors SDK6's UICanvas/UIImage objects that the
// shoot-control kept references to; the React UI reads these each render.

export const powerBarState = {
  visible: false,
  // 0..100
  power: 0
}

export const controlHintState = {
  visible: false,
  // 0 = rotation/aim hint, 1 = power hint
  step: 0
}

// Smooth gradient green -> yellow -> red, matching SDK6 getColorForPercentage.
const percentColors = [
  { pct: 0, color: { r: 0, g: 255, b: 0 } },
  { pct: 0.5, color: { r: 255, g: 255, b: 0 } },
  { pct: 1, color: { r: 255, g: 0, b: 0 } }
]

export const getColorForPower = (power: number): { r: number; g: number; b: number } => {
  if (power <= 0) {
    return { r: 0, g: 0, b: 1 }
  }
  const pct = power / 100
  let i = 1
  for (; i < percentColors.length - 1; i++) {
    if (pct < percentColors[i].pct) break
  }
  const lower = percentColors[i - 1]
  const upper = percentColors[i]
  const range = upper.pct - lower.pct
  const rangePct = (pct - lower.pct) / range
  const pctLower = 1 - rangePct
  const pctUpper = rangePct
  return {
    r: (lower.color.r * pctLower + upper.color.r * pctUpper) / 255,
    g: (lower.color.g * pctLower + upper.color.g * pctUpper) / 255,
    b: (lower.color.b * pctLower + upper.color.b * pctUpper) / 255
  }
}
