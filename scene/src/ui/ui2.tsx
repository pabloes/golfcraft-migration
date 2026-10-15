// Building blocks of the "propuesta 2" look (GolfCraft UI canvas, page
// "Escritorio · propuesta 2"): a blurred-course panel, navy boxes and bright
// cards with white borders, purple ribbons, yellow and lavender buttons with
// a coloured hard shadow.
//
// The scene UI has no gradients, soft shadows, transforms or display fonts,
// so: gradients are their middle colour, soft shadows are a translucent block
// under the box, and everything drawn in a display font (ribbons, titles,
// button captions) or as a vector (icons) is a 2x PNG in images/ui2, sized
// from ui2-assets.ts. Every screen is laid out in design px (1280x720) and
// scaled by the contain ratio, like the rest of the new UI.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, hex, lighten, pointerState, materialIcon, fmt, shortName } from './ui-theme'
import type { Layout, Px } from './ui-scale'
import { UI2 } from './ui2-assets'

export const P = {
  navy: hex('#1B2160'),
  navyDeep: hex('#121646'),
  navyEdge: hex('#3B47A8'),
  ink: hex('#1B2A6B'),
  teal: hex('#20B59E'),
  purple: hex('#7438D4'),
  pink: hex('#E84198'),
  pinkBar: hex('#DD378F'),
  pinkEdge: hex('#FF8BD0'),
  gold: hex('#F0A010'),
  yellow: hex('#FFD32F'),
  yellowShadow: hex('#B88600'),
  lavender: hex('#E6E1FF'),
  lavenderShadow: hex('#8E7FD6'),
  green: hex('#6CD83A'),
  greenShadow: hex('#2F8A12'),
  rankBox: hex('#2F155F'),
  rankEdge: hex('#6A3FC4'),
  rankShadow: hex('#180A38'),
  blueChip: hex('#2E6BFF'),
  pale: hex('#B9C2FF'),
  paler: hex('#DDE6FF'),
  crimson: hex('#B3154F'),
  red: hex('#FF2D55'),
  white: Color4.White(),
  glass: Color4.create(1, 1, 1, 0.08),
  glassEdge: Color4.create(1, 1, 1, 0.14),
  dim: Color4.create(8 / 255, 18 / 255, 40 / 255, 0.4),
  dimmer: Color4.create(8 / 255, 18 / 255, 40 / 255, 0.6),
  softShadow: Color4.create(0, 0, 0, 0.3),
  clear: Color4.create(1, 1, 1, 0)
}

export const border = (px: Px, n: number) => Math.max(1, px(n))

// Children lists mix elements, nulls and the [shadow, face] pairs of box and
// button2; React flattens them.
export type Kids = any[]

// Absolute box in design px.
export const at = (px: Px, x: number, y: number, w?: number, h?: number) => ({
  positionType: 'absolute' as const,
  position: { left: px(x), top: px(y) },
  width: w === undefined ? undefined : px(w),
  height: h === undefined ? undefined : px(h)
})

const src = (key: string) => `images/ui2/${key}.png`

// One of the images in images/ui2 at its design size times `scale`, either
// absolute at (x, y) or in the flow (x undefined).
export const img = (px: Px, key: string, x?: number, y?: number, scale = 1, tint?: Color4) => {
  const [w, h] = UI2[key] || [10, 10]
  return (
    <UiEntity
      key={`img-${key}-${x}-${y}`}
      uiTransform={x === undefined ? { width: px(w * scale), height: px(h * scale), flexShrink: 0 } : at(px, x, y || 0, w * scale, h * scale)}
      uiBackground={{ texture: { src: src(key) }, textureMode: 'stretch', color: tint }}
    />
  )
}
export const imgW = (key: string, scale = 1) => (UI2[key] || [10, 10])[0] * scale
export const imgH = (key: string, scale = 1) => (UI2[key] || [10, 10])[1] * scale

// A Label at an absolute design-px box.
export const text = (
  px: Px,
  fs: Px,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  color: Color4 = P.white,
  align: 'middle-left' | 'middle-center' | 'middle-right' = 'middle-left',
  wrap = false
) => (
  <Label
    key={`t-${x}-${y}-${value}`}
    value={value}
    fontSize={fs(size)}
    color={color}
    textAlign={align}
    textWrap={wrap ? 'wrap' : 'nowrap'}
    uiTransform={at(px, x, y, w, h)}
  />
)

// A Label in the flow.
export const flowText = (px: Px, fs: Px, value: string, size: number, color: Color4 = P.white, h = size * 1.4, extra: any = {}) => (
  <Label value={value} fontSize={fs(size)} color={color} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(h), flexShrink: 0, ...extra }} />
)

// A filled, bordered box at an absolute design-px rect, with an optional soft
// shadow under it.
export const box = (
  px: Px,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { color: Color4; radius: number; border?: number; borderColor?: Color4; shadow?: number; shadowColor?: Color4; column?: boolean; align?: 'center' | 'flex-start' | 'flex-end'; justify?: 'center' | 'flex-start' | 'space-between' | 'flex-end'; padding?: any },
  children: Kids = []
): any => [
  o.shadow ? (
    <UiEntity key={`${key}-sh`} uiTransform={{ ...at(px, x, y + o.shadow, w, h), borderRadius: px(o.radius) }} uiBackground={{ color: o.shadowColor || P.softShadow }} />
  ) : null,
  <UiEntity
    key={key}
    uiTransform={{
      ...at(px, x, y, w, h),
      borderRadius: px(o.radius),
      borderWidth: o.border ? border(px, o.border) : 0,
      borderColor: o.borderColor || P.white,
      flexDirection: o.column ? 'column' : 'row',
      alignItems: o.align,
      justifyContent: o.justify,
      padding: o.padding
    }}
    uiBackground={{ color: o.color }}
  >
    {children}
  </UiEntity>
]

// The dialog: a dark backdrop over the world and the 1280x720 panel with the
// blurred course behind everything.
export const frame = (L: Layout, bg: 'lobby' | 'view' | 'result', children: Kids, after: any = null) => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }} uiBackground={{ color: C.backdrop }}>
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: L.left, top: L.top }, width: L.panelW, height: L.panelH }}
      uiBackground={{ texture: { src: src(`bg_${bg}`) }, textureMode: 'stretch' }}
    >
      {children}
    </UiEntity>
    {after}
  </UiEntity>
)

export type Button2 = {
  id: string
  x: number
  y: number
  w: number
  h: number
  color: Color4
  radius: number
  // Hard shadow under the face (design px) and its colour.
  shadow?: number
  shadowColor?: Color4
  border?: number
  borderColor?: Color4
  disabled?: boolean
  onClick?: () => void
  row?: boolean
  justify?: 'center' | 'flex-start' | 'space-between'
  align?: 'center' | 'flex-start'
  padding?: any
}

// A button at an absolute rect: hover lifts it 2 px and lightens it, a press
// sinks it into its shadow. The action fires on mouse down, like every other
// pointer handler of the scene.
export const button2 = (px: Px, o: Button2, children: Kids): any => {
  const hovered = !o.disabled && pointerState.hovered === o.id
  const pressed = !o.disabled && pointerState.pressed === o.id
  const shadow = o.shadow || 0
  const dy = pressed ? shadow * 0.5 : hovered ? -2 : 0
  return [
    shadow ? (
      <UiEntity key={`${o.id}-sh`} uiTransform={{ ...at(px, o.x, o.y + shadow, o.w, o.h), borderRadius: px(o.radius) }} uiBackground={{ color: o.shadowColor || P.softShadow }} />
    ) : null,
    <UiEntity
      key={o.id}
      uiTransform={{
        ...at(px, o.x, o.y + dy, o.w, o.h),
        borderRadius: px(o.radius),
        borderWidth: o.border ? border(px, o.border) : 0,
        borderColor: o.borderColor || P.white,
        flexDirection: o.row === false ? 'column' : 'row',
        justifyContent: o.justify || 'center',
        alignItems: o.align || 'center',
        padding: o.padding
      }}
      uiBackground={{ color: hovered || pressed ? lighten(o.color, 0.12) : o.color }}
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
  ]
}

// An image (a ribbon) that acts as a button: it lifts 2 px on hover.
export const imageButton = (px: Px, id: string, key: string, x: number, y: number, onClick: () => void) => {
  const hovered = pointerState.hovered === id
  const [w, h] = UI2[key] || [10, 10]
  return (
    <UiEntity
      key={id}
      uiTransform={at(px, x, y - (hovered ? 2 : 0), w, h)}
      uiBackground={{ texture: { src: src(key) }, textureMode: 'stretch' }}
      onMouseEnter={() => {
        pointerState.hovered = id
      }}
      onMouseLeave={() => {
        if (pointerState.hovered === id) pointerState.hovered = null
      }}
      onMouseDown={onClick}
    />
  )
}

// Navy square button with a white glyph (back, close).
export const navyIconButton = (px: Px, id: string, icon: string, x: number, y: number, size: number, onClick: (() => void) | null, iconScale = 0.75) =>
  button2(
    px,
    { id, x, y, w: size, h: size, color: P.navy, radius: 16, border: 3, borderColor: P.navyEdge, shadow: 6, disabled: !onClick, onClick: onClick || undefined },
    [img(px, icon, undefined, undefined, iconScale)]
  )

// Header of a sub-view: back button, the screen's ribbon, then `rest` on the
// right side of the row (absolute, laid out by the caller).
export const viewHeader = (px: Px, ribbonKey: string, onBack: (() => void) | null) => [
  navyIconButton(px, 'view-back', 'ic_chev_left_w', 52, 34, 66, onBack, 1),
  img(px, ribbonKey, 52 + 66 + 22, 31)
]
export const headerRight = (px: Px, ribbonKey: string) => 52 + 66 + 22 + imgW(ribbonKey) + 14

// Yellow tag (MOUNTAIN Season, Ancient Egypt...).
export const yellowTag = (px: Px, fs: Px, value: string, x: number, y: number, w: number, h = 32, size = 15) =>
  box(px, `ytag-${value}`, x, y, w, h, { color: C.yellow, radius: 12, justify: 'center', align: 'center' }, [
    <Label value={value} fontSize={fs(size)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(h) }} />
  ])

// Navy pill with an icon and a value, right-aligned at `right` (design px
// from the panel's left edge to the pill's right edge).
export const navyPill = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, children: Kids) =>
  box(px, key, x, y, w, h, { color: P.navyDeep, radius: 14, border: 3, borderColor: P.navyEdge, align: 'center', justify: 'center', padding: { left: px(10), right: px(12) } }, children)

// Resource icon of the game (energy has its own glyph here).
export const resIcon = (px: Px, code: string, size: number, margin?: { left?: number; right?: number }) =>
  code.toUpperCase() === 'EN' ? (
    <UiEntity uiTransform={{ width: px(size), height: px(size), margin, flexShrink: 0 }} uiBackground={{ texture: { src: src('gl_energy') }, textureMode: 'stretch' }} />
  ) : (
    materialIcon(px, code, size, margin)
  )

// Round avatar with the player's initial, for rows without a userId.
const INITIAL_COLORS = [hex('#3B7CF0'), hex('#E0358F'), hex('#7A3FE0'), hex('#20B59E'), hex('#F08A1C')]
export const initialAvatar = (px: Px, fs: Px, name: string, size: number, index: number) => (
  <UiEntity
    uiTransform={{ width: px(size), height: px(size), borderRadius: px(size / 2), borderWidth: border(px, 2), borderColor: P.white, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}
    uiBackground={{ color: INITIAL_COLORS[index % INITIAL_COLORS.length] }}
  >
    <Label value={(name || '?').trim().charAt(0).toUpperCase()} fontSize={fs(size * 0.55)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
  </UiEntity>
)

// Season rank badge (images/season-badges/<tier>.png).
export const rankBadge = (px: Px, tier: number, size: number, x?: number, y?: number) => (
  <UiEntity
    uiTransform={x === undefined ? { width: px(size), height: px(size), flexShrink: 0 } : at(px, x, y || 0, size, size)}
    uiBackground={{ texture: { src: `images/season-badges/${tier}.png` }, textureMode: 'stretch' }}
  />
)

// "Next prize" bar: the wearable's thumbnail, its name and the season points
// still needed. A sold-out wearable pays Fashion Tickets instead, so then the
// bar shows the FT icon and that amount. No stock counts.
export const nextPrizeBar = (
  px: Px,
  fs: Px,
  x: number,
  y: number,
  prize: { name: string; stock: number; thumbnail?: string; fashionTickets?: number } | null,
  tierName: string,
  toGo: number,
  loaded: boolean,
  w = 420
) => {
  const sold = !!prize && prize.stock <= 0
  const pic = sold ? 'images/icons/ft.png' : prize?.thumbnail
  const name = !prize ? (loaded ? 'Every prize reached!' : 'Loading prizes...') : sold ? `${prize.fashionTickets ? fmt(prize.fashionTickets) + ' ' : ''}Fashion Tickets` : shortName(prize.name)
  const pillW = 150
  return box(px, `next-prize-${x}-${y}`, x, y, w, 50, { color: P.pinkBar, radius: 12, border: 2, borderColor: P.pinkEdge }, [
    <UiEntity key="np-thumb" uiTransform={{ ...at(px, 5, 4, 38, 38), borderRadius: px(9) }} uiBackground={{ color: Color4.create(1, 1, 1, 0.25) }}>
      {pic ? <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: pic }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, prize ? `NEXT PRIZE · ${tierName}${sold ? ' · SOLD OUT' : ''}` : 'NEXT PRIZE', 52, 4, w - 52 - pillW - 12, 16, 11, hex('#FFD6EC')),
    text(px, fs, name, 52, 20, w - 52 - pillW - 12, 22, 15),
    prize
      ? box(px, 'np-pill', w - 4 - pillW - 8, 9, pillW, 28, { color: hex('#1C0A3F'), radius: 9, justify: 'center', align: 'center' }, [
          <Label value={`${toGo} season point${toGo === 1 ? '' : 's'} to go`} fontSize={fs(12)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(28) }} />
        ])
      : null
  ])
}

// Blue chip under the PLAY buttons: the energy bolt and the caption
// ("1 energy", "no energy", "closed", "connecting...").
export const energyChip = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, caption: string) =>
  box(px, key, x, y, w, h, { color: P.blueChip, radius: h / 2, border: 2, justify: 'center', align: 'center' }, [
    img(px, 'ic_bolt_w', undefined, undefined, (h - 8) / 42),
    <Label value={caption} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(h - 4), margin: { left: px(5) } }} />
  ])
