// Touch controls for a hole on the mobile explorer, on the full-screen grid of
// the canvas page "Móvil · propuesta 2" (M2HUD.dc.html), which keeps clear of
// the explorer's own buttons (avatar + chat top-left, emotes bottom-left, the
// F / E / + / hand / jump cluster bottom-right):
//   - bottom centre:  ^ v  < SHOOT >   (camera pitch, aim, shot)
//   - top right:      QUIT, with a confirm dialog
//   - right column:   zoom in / out, left of the power column's + (game-hud.tsx)
// Power + / - sit with the power column. Hold buttons act like a held key
// (release on up or when the finger leaves).
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import { isMobile } from '../services/platform'
import { mobileShootState } from './mobile-shoot-state'
import { fullLayout, scaler, type Layout, type Px } from './ui-scale'
import { C } from './ui-theme'
import { P, border, img, placeAt } from './ui2'

const holdButton = (L: Layout, px: Px, key: string, x: number, content: any, onDown: () => void, onUp: () => void, y = 306, h = 44) => (
  <UiEntity
    key={key}
    uiTransform={{ ...placeAt(L, px, x, y, 44, h), borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.navyEdge, justifyContent: 'center', alignItems: 'center' }}
    uiBackground={{ color: P.navy }}
    onMouseDown={onDown}
    onMouseUp={onUp}
    onMouseLeave={onUp}
  >
    {content}
  </UiEntity>
)

const glyph = (px: Px, fs: Px, value: string) => (
  <Label value={value} fontSize={fs(20)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
)

const tapButton = (px: Px, fs: Px, label: string, w: number, h: number, color: any, textColor: any, onTap: () => void, margin?: { left?: number }) => (
  <UiEntity
    uiTransform={{ width: px(w), height: px(h), margin, borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.white, justifyContent: 'center', alignItems: 'center' }}
    uiBackground={{ color }}
    onMouseDown={onTap}
  >
    <Label value={label} fontSize={fs(16)} color={textColor} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
  </UiEntity>
)

export const MobileShootControls = () => {
  if (!isMobile()) return null
  const st = mobileShootState
  if (!st.visible && !st.quit && !st.zoomable) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)

  // A press also records itself for the orbit camera's tap step and hold ramp;
  // a repeated down while the same arrow is already held is not a new press.
  const aim = (dir: -1 | 0 | 1) => () => {
    if (dir && st.aimHold !== dir) st.aimPress = { at: Date.now(), dir }
    st.aimHold = dir
  }
  const pitch = (dir: -1 | 0 | 1) => () => {
    if (dir && st.pitchHold !== dir) st.pitchPress = { at: Date.now(), dir }
    st.pitchHold = dir
  }
  const zoom = (dir: -1 | 0 | 1) => () => {
    st.zoomHold = dir
  }

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {st.zoomable
        ? [
            holdButton(L, px, 'zoom-in', 524, img(px, 'ic_zoom_in_w', undefined, undefined, 0.85), zoom(-1), zoom(0), 58, 40),
            holdButton(L, px, 'zoom-out', 572, img(px, 'ic_zoom_out_w', undefined, undefined, 0.85), zoom(1), zoom(0), 58, 40)
          ]
        : null}

      {st.visible
        ? [
            holdButton(L, px, 'pitch-up', 162, glyph(px, fs, '^'), pitch(1), pitch(0)),
            holdButton(L, px, 'pitch-down', 210, glyph(px, fs, 'v'), pitch(-1), pitch(0)),
            holdButton(L, px, 'aim-left', 266, img(px, 'ic_chev_left_w', undefined, undefined, 0.7), aim(-1), aim(0)),
            <UiEntity
              key="shoot"
              uiTransform={{ ...placeAt(L, px, 316, 302, 116, 52), flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: px(15) }}
              uiBackground={{ color: P.yellow }}
              onMouseDown={() => st.shoot && st.shoot()}
            >
              <Label value="SHOOT" fontSize={fs(20)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(24) }} />
              <Label value={`${Math.round(st.power)}%`} fontSize={fs(11)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(14) }} />
            </UiEntity>,
            holdButton(L, px, 'aim-right', 438, img(px, 'ic_chev_right_w', undefined, undefined, 0.7), aim(1), aim(0))
          ]
        : null}

      {st.quit ? (
        <UiEntity
          uiTransform={{ ...placeAt(L, px, 617, 6, 44, 44), flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.white }}
          uiBackground={{ color: P.crimson }}
          onMouseDown={() => {
            st.quitConfirm = true
          }}
        >
          {img(px, 'ic_close_w', undefined, undefined, 0.45)}
          <Label value="QUIT" fontSize={fs(9)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(12) }} />
        </UiEntity>
      ) : null}

      {st.quit && st.quitConfirm ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: C.backdrop }}
        >
          <UiEntity
            uiTransform={{ width: px(300), flexDirection: 'column', alignItems: 'center', padding: px(14), borderRadius: px(16), borderWidth: border(px, 2), borderColor: P.white }}
            uiBackground={{ color: P.navy }}
          >
            <Label value="Leave this hole?" fontSize={fs(18)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(26) }} />
            <Label
              value="You will lose the run and the shots played so far."
              fontSize={fs(12)}
              color={C.white}
              textAlign="middle-center"
              textWrap="wrap"
              uiTransform={{ width: '100%', height: px(36), margin: { top: px(4) } }}
            />
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: px(10) } }}>
              {tapButton(px, fs, 'STAY', 120, 44, P.lavender, P.ink, () => {
                st.quitConfirm = false
              })}
              {tapButton(px, fs, 'LEAVE', 120, 44, P.pink, C.white, () => {
                st.quitConfirm = false
                st.quit && st.quit()
              }, { left: px(10) })}
            </UiEntity>
          </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}
