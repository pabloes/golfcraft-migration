// Full-screen black overlay used for the mission start/end cinematic
// (SDK6 scene/src/components/ui/overlay.ts). fadeIn -> screen goes to black,
// fadeOut -> back to transparent. The <Overlay/> ReactEcs component in
// scene/src/ui/index.tsx reads `overlayState` each frame.
import { engine } from '@dcl/sdk/ecs'

export const overlayState = { alpha: 0, visible: false }

let current: ((dt: number) => void) | null = null

function animate(from: number, to: number, seconds: number, onFinish?: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (current) {
      engine.removeSystem(current)
      current = null
    }
    overlayState.visible = true
    overlayState.alpha = from
    let elapsed = 0
    const sys = (dt: number) => {
      elapsed += dt
      const k = seconds > 0 ? Math.min(elapsed / seconds, 1) : 1
      overlayState.alpha = from + (to - from) * k
      if (k >= 1) {
        overlayState.alpha = to
        if (to <= 0) overlayState.visible = false
        engine.removeSystem(sys)
        if (current === sys) current = null
        onFinish && onFinish()
        resolve()
      }
    }
    current = sys
    engine.addSystem(sys)
  })
}

export const fadeInOverlay = (seconds: number, onFinish?: () => void) => animate(0, 1, seconds, onFinish)
export const fadeOutOverlay = (seconds: number, onFinish?: () => void) => animate(1, 0, seconds, onFinish)
