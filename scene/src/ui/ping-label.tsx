import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import { currentPing } from './ping-state'
import { P } from './ui2'
import { C } from './ui-theme'
import type { Px } from './ui-scale'

// A discreet "● 42 ms": a coloured dot (green / yellow / red) and pale text.
// Nothing until the first reading arrives.
const dotColor = (ms: number) => (ms < 120 ? P.green : ms < 250 ? C.yellow : P.red)

export const pingLabel = (px: Px, fs: Px, fontSize = 10, extra: any = {}) => {
  const ms = currentPing()
  if (ms === null) return null
  return (
    <UiEntity key="ping" uiTransform={{ flexDirection: 'row', alignItems: 'center', ...extra }}>
      <UiEntity uiTransform={{ width: px(6), height: px(6), borderRadius: px(3), margin: { right: px(4) } }} uiBackground={{ color: dotColor(ms) }} />
      <Label value={`${ms} ms`} fontSize={fs(fontSize)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(fontSize + 4) }} />
    </UiEntity>
  )
}
