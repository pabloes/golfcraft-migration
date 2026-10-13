// Touch controls for the shot, mobile explorer only: aim arrows, power - / +
// and SHOOT, in the free band between the explorer's joystick and its E / F /
// jump buttons at the bottom of the screen. Hold buttons act like a held key
// (release on up or when the finger leaves the button); SHOOT fires once.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { isMobile } from '../services/platform'
import { mobileShootState } from './mobile-shoot-state'
import { readCanvas } from './ui-scale'
import { C } from './ui-theme'

const holdButton = (
  label: string,
  size: number,
  color: Color4,
  onDown: () => void,
  onUp: () => void,
  width = size
) => (
  <UiEntity
    uiTransform={{
      width,
      height: size,
      margin: { left: size * 0.15 },
      borderRadius: size * 0.28,
      borderWidth: Math.max(2, size * 0.05),
      borderColor: C.dark,
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color }}
    onMouseDown={onDown}
    onMouseUp={onUp}
    onMouseLeave={onUp}
  >
    <Label value={label} fontSize={size * 0.4} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: size }} />
  </UiEntity>
)

export const MobileShootControls = () => {
  if (!isMobile() || !mobileShootState.visible) return null
  const canvas = readCanvas()
  const size = Math.max(44, Math.min(96, canvas.height * 0.11))
  const shootW = size * 2.2
  const totalW = size * 4 + shootW + size * 0.15 * 4
  const power = Math.round(mobileShootState.power)

  const aim = (dir: -1 | 0 | 1) => () => {
    mobileShootState.aimHold = dir
  }
  const pow = (dir: -1 | 0 | 1) => () => {
    mobileShootState.powerHold = dir
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: canvas.area.left + (canvas.availW - totalW) / 2, bottom: canvas.area.bottom + size * 0.2 },
        width: totalW,
        height: size,
        flexDirection: 'row',
        alignItems: 'center'
      }}
    >
      {holdButton('<', size, C.white, aim(-1), aim(0))}
      {holdButton('-', size, C.lilac, pow(-1), pow(0))}
      <UiEntity
        uiTransform={{
          width: shootW,
          height: size,
          margin: { left: size * 0.15 },
          borderRadius: size * 0.28,
          borderWidth: Math.max(2, size * 0.05),
          borderColor: C.dark,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
        uiBackground={{ color: C.yellow }}
        onMouseDown={() => mobileShootState.shoot && mobileShootState.shoot()}
      >
        <Label value="SHOOT" fontSize={size * 0.36} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: size * 0.5 }} />
        <Label value={`${power}%`} fontSize={size * 0.22} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: size * 0.3 }} />
      </UiEntity>
      {holdButton('+', size, C.lilac, pow(1), pow(0))}
      {holdButton('>', size, C.white, aim(1), aim(0))}
    </UiEntity>
  )
}
