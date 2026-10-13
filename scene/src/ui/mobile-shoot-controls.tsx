// Touch controls for a hole on the mobile explorer. Laid out against the whole
// canvas (the interactable area it reports keeps its top bar but not its touch
// controls) and kept clear of those controls: the F / E / + / jump / hand
// cluster in the bottom-right quarter, the emote button bottom-left and the
// avatar + chat top-left. Sizes come from the shorter side so landscape and
// portrait get the same finger-sized buttons.
//   - bottom, left of centre:  < - SHOOT + >   (aim, power, shot)
//   - left, middle:            ^ v             (camera pitch)
//   - top-left:                QUIT, with a confirm dialog
// Hold buttons act like a held key (release on up or when the finger leaves).
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
  extra: { width?: number; margin?: { left?: number; top?: number } } = {}
) => (
  <UiEntity
    uiTransform={{
      width: extra.width || size,
      height: size,
      margin: extra.margin,
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

const tapButton = (label: string, width: number, height: number, color: Color4, textColor: Color4, onTap: () => void, margin?: { left?: number }) => (
  <UiEntity
    uiTransform={{
      width,
      height,
      margin,
      borderRadius: height * 0.3,
      borderWidth: Math.max(2, height * 0.06),
      borderColor: C.dark,
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color }}
    onMouseDown={onTap}
  >
    <Label value={label} fontSize={height * 0.42} color={textColor} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height }} />
  </UiEntity>
)

export const MobileShootControls = () => {
  if (!isMobile()) return null
  const st = mobileShootState
  if (!st.visible && !st.quit) return null
  const { width: W, height: H } = readCanvas()
  const portrait = H > W
  const u = Math.max(44, Math.min(96, Math.min(W, H) * 0.11))
  const gap = u * 0.15
  const shootW = u * 2.2
  const panelW = u * 4 + shootW + gap * 4

  const aim = (dir: -1 | 0 | 1) => () => {
    st.aimHold = dir
  }
  const pitch = (dir: -1 | 0 | 1) => () => {
    st.pitchHold = dir
  }
  const pow = (dir: -1 | 0 | 1) => () => {
    st.powerHold = dir
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {st.visible ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: (portrait ? W * 0.5 : W * 0.45) - panelW / 2, bottom: portrait ? H * 0.2 : u * 0.2 },
            width: panelW,
            height: u,
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          {holdButton('<', u, C.white, aim(-1), aim(0))}
          {holdButton('-', u, C.lilac, pow(-1), pow(0), { margin: { left: gap } })}
          <UiEntity
            uiTransform={{
              width: shootW,
              height: u,
              margin: { left: gap },
              borderRadius: u * 0.28,
              borderWidth: Math.max(2, u * 0.05),
              borderColor: C.dark,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: C.yellow }}
            onMouseDown={() => st.shoot && st.shoot()}
          >
            <Label value="SHOOT" fontSize={u * 0.36} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: u * 0.5 }} />
            <Label value={`${Math.round(st.power)}%`} fontSize={u * 0.22} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: u * 0.3 }} />
          </UiEntity>
          {holdButton('+', u, C.lilac, pow(1), pow(0), { margin: { left: gap } })}
          {holdButton('>', u, C.white, aim(1), aim(0), { margin: { left: gap } })}
        </UiEntity>
      ) : null}

      {st.visible ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: 12, top: H / 2 - u - gap / 2 }, width: u, flexDirection: 'column' }}
        >
          {holdButton('^', u, C.white, pitch(1), pitch(0))}
          {holdButton('v', u, C.white, pitch(-1), pitch(0), { margin: { top: gap } })}
        </UiEntity>
      ) : null}

      {st.quit ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 12, top: H * 0.15 }, width: u * 1.6, height: u * 0.7 }}>
          {tapButton('QUIT', u * 1.6, u * 0.7, C.pink, C.white, () => {
            st.quitConfirm = true
          })}
        </UiEntity>
      ) : null}

      {st.quit && st.quitConfirm ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: C.backdrop }}
        >
          <UiEntity
            uiTransform={{
              width: Math.min(W * 0.8, u * 6.5),
              flexDirection: 'column',
              alignItems: 'center',
              padding: u * 0.3,
              borderRadius: u * 0.3,
              borderWidth: Math.max(2, u * 0.05),
              borderColor: C.dark
            }}
            uiBackground={{ color: C.bg }}
          >
            <Label value="Leave this hole?" fontSize={u * 0.4} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: u * 0.6 }} />
            <Label
              value="You will lose the run and the shots played so far."
              fontSize={u * 0.22}
              color={C.white}
              textAlign="middle-center"
              textWrap="wrap"
              uiTransform={{ width: '100%', height: u * 0.8, margin: { top: u * 0.1 } }}
            />
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: u * 0.25 } }}>
              {tapButton('STAY', u * 2, u * 0.8, C.white, C.dark, () => {
                st.quitConfirm = false
              })}
              {tapButton('LEAVE', u * 2, u * 0.8, C.pink, C.white, () => {
                st.quitConfirm = false
                st.quit && st.quit()
              }, { left: gap })}
            </UiEntity>
          </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}
