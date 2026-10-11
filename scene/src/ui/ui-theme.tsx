// Visual language shared by the new UI (the "GolfCraft UI" design canvas):
// palette, number formatting and the pressable button with its hover and
// pressed states. Every panel imports from here so they all look alike.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import type { Px } from './ui-scale'

export const hex = (value: string, alpha = 1): Color4 => {
  const n = parseInt(value.slice(1), 16)
  return Color4.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha)
}

export const C = {
  bg: hex('#2A0E63'),
  dark: hex('#1C0A3F'),
  darker: hex('#12062A'),
  purple: hex('#5B1BC9'),
  purpleCard: hex('#43129A'),
  purpleTrack: hex('#3B1A80'),
  violet: hex('#8E6BE0'),
  yellow: hex('#FFD21F'),
  green: hex('#8BE03A'),
  greenDark: hex('#2F8A12'),
  teal: hex('#15857A'),
  tealDark: hex('#0E5E56'),
  blue: hex('#2457C9'),
  blueDark: hex('#163C93'),
  pink: hex('#C21F82'),
  pinkDark: hex('#8E145F'),
  hotPink: hex('#FF4FD8'),
  magenta: hex('#D6248F'),
  red: hex('#B3261E'),
  salmon: hex('#FFB4A6'),
  orange: hex('#F08A1C'),
  cyan: hex('#2BD9C6'),
  diamond: hex('#3CC8FF'),
  ticket: hex('#FF5FC8'),
  wood: hex('#E89A48'),
  stone: hex('#A99A8C'),
  iron: hex('#8FA3B3'),
  gold: hex('#FFC21A'),
  lilac: hex('#E9DDFF'),
  muted: hex('#C9B6F2'),
  white: Color4.White(),
  disabled: hex('#6B5B8F'),
  panelDim: hex('#1C0A3F', 0.88),
  backdrop: Color4.create(0, 0, 0, 0.6),
  transparent: Color4.create(1, 1, 1, 0)
}

// 14% towards white: the hover tint for any face colour.
export const lighten = (c: Color4, amount = 0.14): Color4 =>
  Color4.create(c.r + (1 - c.r) * amount, c.g + (1 - c.g) * amount, c.b + (1 - c.b) * amount, c.a)

// 161801 -> "161,801"
export const fmt = (n: number) => {
  const s = String(Math.floor(Math.abs(n)))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return (n < 0 ? '-' : '') + out
}

// 38000 -> "0:38"
export const mmss = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

// "Golfcraft x COCOBAY Glasses" -> "COCOBAY Glasses"
export const shortName = (name: string) => name.replace(/^golfcraft\s*x\s*/i, '')

export const ordinal = (n: number) => {
  const rem10 = n % 10
  const rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}

// Pointer feedback shared by every button on screen. Ids are free-form, just
// unique per visible button.
export const pointerState: { hovered: string | null; pressed: string | null } = { hovered: null, pressed: null }
export const clearPointerState = () => {
  pointerState.hovered = null
  pointerState.pressed = null
}

export type PressableOpts = {
  id: string
  width: number | `${number}%`
  height: number
  color: Color4
  radius: number
  borderWidth: number
  borderColor: Color4
  // Hard shadow under the face, in canvas px; 0 for a flat (outlined) button.
  shadow: number
  disabled?: boolean
  onClick?: () => void
  margin?: { top?: number; bottom?: number; left?: number; right?: number }
  padding?: { top?: number; bottom?: number; left?: number; right?: number }
  flexDirection?: 'row' | 'column'
  justifyContent?: 'center' | 'flex-start' | 'space-between'
  alignItems?: 'center' | 'flex-start'
  positionType?: 'absolute' | 'relative'
  position?: { top?: number; left?: number; right?: number; bottom?: number }
}

// A button with the three pointer states, like a physical key: hover lifts
// it 2 px and grows the shadow, pressing sinks it 4 px and shrinks the shadow.
// No animation (ReactEcs has none); the change is instant. Hover does nothing
// functional, so touch (no hover) still works. The action fires on mouse down,
// like every other pointer handler in this scene.
export const pressable = (o: PressableOpts, ...children: ReactEcs.JSX.Element[]) => {
  const hovered = !o.disabled && pointerState.hovered === o.id
  const pressed = !o.disabled && pointerState.pressed === o.id
  const lift = o.shadow * 0.25
  const sink = o.shadow * 0.5
  const faceTop = pressed ? lift + sink : hovered ? 0 : lift
  const shadowH = pressed ? o.shadow - sink : hovered ? o.shadow + lift : o.shadow
  const face = hovered || pressed ? lighten(o.color) : o.color
  const wrapperH = o.height + o.shadow + lift

  return (
    <UiEntity
      uiTransform={{
        width: o.width,
        height: wrapperH,
        margin: o.margin,
        positionType: o.positionType,
        position: o.position
      }}
    >
      {o.shadow > 0 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: 0, top: faceTop + shadowH },
            width: '100%',
            height: o.height,
            borderRadius: o.radius
          }}
          uiBackground={{ color: C.dark }}
        />
      ) : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: faceTop },
          width: '100%',
          height: o.height,
          borderRadius: o.radius,
          borderWidth: o.borderWidth,
          borderColor: hovered || pressed ? lighten(o.borderColor, 0.25) : o.borderColor,
          padding: o.padding,
          flexDirection: o.flexDirection || 'row',
          justifyContent: o.justifyContent || 'center',
          alignItems: o.alignItems || 'center'
        }}
        uiBackground={{ color: face }}
        onMouseEnter={() => {
          if (!o.disabled) pointerState.hovered = o.id
        }}
        onMouseLeave={() => {
          if (pointerState.hovered === o.id) pointerState.hovered = null
          if (pointerState.pressed === o.id) pointerState.pressed = null
        }}
        onMouseDown={() => {
          if (o.disabled) return
          pointerState.pressed = o.id
          o.onClick && o.onClick()
        }}
        onMouseUp={() => {
          if (pointerState.pressed === o.id) pointerState.pressed = null
        }}
      >
        {children}
      </UiEntity>
    </UiEntity>
  )
}

// A dark pill with a coloured dot and a number: resources in headers and HUDs.
export const counter = (px: Px, fs: Px, iconColor: Color4, value: string, label?: string) => (
  <UiEntity
    uiTransform={{
      height: px(50),
      flexDirection: 'row',
      alignItems: 'center',
      margin: { left: px(10) },
      padding: { left: px(7), right: px(16) },
      borderRadius: px(16)
    }}
    uiBackground={{ color: C.dark }}
  >
    <UiEntity
      uiTransform={{ width: px(30), height: px(30), borderRadius: px(15), borderWidth: Math.max(1, px(3)), borderColor: C.darker }}
      uiBackground={{ color: iconColor }}
    />
    {label ? (
      <Label value={label} fontSize={fs(12)} color={C.muted} textAlign="middle-left" uiTransform={{ height: px(50), margin: { left: px(6) } }} textWrap="nowrap" />
    ) : null}
    <Label value={value} fontSize={fs(21)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(50), margin: { left: px(8) } }} textWrap="nowrap" />
  </UiEntity>
)

// Small dark tag with coloured text.
export const chip = (px: Px, fs: Px, text: string, color: Color4, bg: Color4 = C.dark) => (
  <UiEntity
    uiTransform={{
      height: px(26),
      padding: { left: px(10), right: px(10) },
      margin: { top: px(6) },
      borderRadius: px(10),
      justifyContent: 'center',
      alignSelf: 'flex-start'
    }}
    uiBackground={{ color: bg }}
  >
    <Label value={text} fontSize={fs(14)} color={color} textAlign="middle-center" uiTransform={{ height: px(26) }} textWrap="nowrap" />
  </UiEntity>
)

// Big outlined title stand-in: the canvas uses an outlined display font, which
// the UI cannot render, so titles are large yellow sans-serif for now.
export const title = (fs: Px, text: string, size: number, height: number, color: Color4 = C.yellow) => (
  <Label value={text} fontSize={fs(size)} color={color} textAlign="middle-center" uiTransform={{ height }} textWrap="nowrap" />
)
