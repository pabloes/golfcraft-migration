// SDK6 bottom-right UIImage hint cropped from images/spritesheet.png.
// Ported to ReactEcs by writing into a shared module-level state object that
// the <ControlHint /> component reads each render. Step 0 = aim/rotation hint
// (E rotates left, F rotates right, click sets power), step 1 = power hint.

import { controlHintState } from '../../../../src/ui/shoot-hud-state'

export const createControlHint = () => {
  return {
    show: () => {
      controlHintState.visible = true
    },
    hide: () => {
      controlHintState.visible = false
    },
    setStep: (value: number) => {
      controlHintState.step = value
    }
  }
}
