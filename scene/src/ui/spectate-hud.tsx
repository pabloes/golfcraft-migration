// The strip shown while watching somebody else's game
// (components/lobby/spectator-client.ts): who is playing, which hole, and the
// way out. Top centre, where the server notices go, because a spectator has
// none of the player's HUD to collide with.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import { spectateState } from './spectate-state'
import { fullLayout, scaler } from './ui-scale'
import { P, box, button2, text } from './ui2'
import { C } from './ui-theme'

const W = 300
const H = 46

export const SpectateHud = () => {
  if (!spectateState.visible) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const c = L.canvas
  const left = (c.width - px(W)) / 2
  const top = px(10)
  const who = spectateState.label || 'a game'
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left, top }, width: px(W), height: px(H) }}>
      {box(px, 'spectate-bg', 0, 0, W, H, { color: P.navyDeep, radius: 12, border: 2, borderColor: C.yellow })}
      {box(px, 'spectate-tag', 8, 8, 56, 18, { color: C.yellow, radius: 6, justify: 'center', align: 'center' }, [
        <Label value="WATCHING" fontSize={fs(9)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ])}
      {text(px, fs, who.length > 24 ? `${who.slice(0, 23)}…` : who, 70, 7, 150, 18, 13)}
      {text(px, fs, `Hole ${spectateState.hole}`, 70, 25, 150, 14, 10, P.pale)}
      {button2(
        px,
        {
          id: 'spectate-leave',
          x: W - 72,
          y: 9,
          w: 64,
          h: 28,
          color: P.navy,
          radius: 8,
          border: 2,
          borderColor: P.white,
          onClick: () => spectateState.onLeave && spectateState.onLeave()
        },
        [<Label value="LEAVE" fontSize={fs(11)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />]
      )}
    </UiEntity>
  )
}
