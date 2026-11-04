// Building blocks of the "propuesta 2" look (GolfCraft UI canvas, page
// "Escritorio · propuesta 2"): a blurred-course panel, navy boxes and bright
// cards with white borders, purple ribbons, yellow and lavender buttons with
// a coloured hard shadow.
//
// The scene UI has no gradients, soft shadows, transforms or display fonts,
// so: gradients are their middle colour, soft shadows are a translucent block
// under the box, and everything drawn in a display font (ribbons, titles,
// button captions) or as a vector (icons) is a 2x PNG in images/ui2, sized
// from ui2-assets.ts. Every screen is laid out in design px and scaled by the
// contain ratio: 667x375 for the full-screen lobby dialog, Season screens and
// in-hole HUD (fullFrame, placeAt), 1280x720 for the intro, boot-error and
// closed dialogs. An image's manifest size (1280 px) times `scale` is what
// lands on screen.
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
  prizeText: hex('#FFE1F1'),
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

// The full-screen version of the dialog (lobby and workshop, page "Móvil ·
// propuesta 2"): a navy background over the whole canvas, cropped to cover
// it, and the 667x375 design box of fullLayout on top. The background is at 90 %
// opacity so the scene shows faintly behind it.
const BG_FULL_TINT = Color4.create(1, 1, 1, 0.9)
export const fullFrame = (L: Layout, children: Kids, after: any = null) => {
  const aspect = L.canvas.width / Math.max(1, L.canvas.height)
  const f = Math.min(1, aspect / (16 / 9))
  const g = Math.min(1, 16 / 9 / aspect)
  const uL = (1 - f) / 2
  const vB = (1 - g) / 2
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}
      uiBackground={{ texture: { src: src('bg_full') }, textureMode: 'stretch', uvs: [uL, vB, uL, 1 - vB, 1 - uL, 1 - vB, 1 - uL, vB], color: BG_FULL_TINT }}
    >
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: L.left, top: L.top }, width: L.panelW, height: L.panelH }}>{children}</UiEntity>
      {after}
    </UiEntity>
  )
}

// An absolute box on the full-screen grid for pieces that are not children of
// fullFrame (the in-hole HUD): design px offset by the layout's own origin.
export const placeAt = (L: Layout, px: Px, x: number, y: number, w?: number, h?: number) => ({
  positionType: 'absolute' as const,
  position: { left: L.left + px(x), top: L.top + px(y) },
  width: w === undefined ? undefined : px(w),
  height: h === undefined ? undefined : px(h)
})

// An image of images/ui2 at an explicit absolute box (for the full-screen
// screens, whose sizes are not the 1280x720 ones of ui2-assets.ts).
export const imgBox = (px: Px, key: string, x: number, y: number, w: number, h: number, tint?: Color4) => (
  <UiEntity key={`imgbox-${key}-${x}-${y}`} uiTransform={at(px, x, y, w, h)} uiBackground={{ texture: { src: src(key) }, textureMode: 'stretch', color: tint }} />
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
export const imageButton = (px: Px, id: string, key: string, x: number, y: number, onClick: () => void, scale = 1) => {
  const hovered = pointerState.hovered === id
  const [w, h] = UI2[key] || [10, 10]
  return (
    <UiEntity
      key={id}
      uiTransform={at(px, x, y - (hovered ? 2 : 0), w * scale, h * scale)}
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

// The 44x44 navy button of the full-screen screens (close, back).
export const squareButton = (px: Px, id: string, x: number, y: number, icon: string, iconScale: number, onClick: () => void) =>
  button2(px, { id, x, y, w: 44, h: 44, color: P.navy, radius: 12, border: 2, borderColor: P.navyEdge, onClick }, [img(px, icon, undefined, undefined, iconScale)])

// Yellow tag (MOUNTAIN Season, Ancient Egypt...).
export const yellowTag = (px: Px, fs: Px, value: string, x: number, y: number, w: number, h = 32, size = 15) =>
  box(px, `ytag-${value}`, x, y, w, h, { color: C.yellow, radius: 12, justify: 'center', align: 'center' }, [
    <Label value={value} fontSize={fs(size)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(h) }} />
  ])

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

// The rank badges are not all the same shape, and the scene cannot read a
// PNG's size, so the ratios live here. Measured from the files themselves
// (2026-11-04); re-measure if the art is ever re-cut from
// images/season-badges.png. Stretching every one into a square is what made
// GRAND MASTER look wrong next to STONE.
export const badgeAspect = (tier: number): number => {
  if (tier >= 45) return 114 / 112 // SUPREME
  if (tier >= 40) return 113 / 113 // GRAND MASTER
  if (tier >= 35) return 96 / 113 // MASTER
  return 103 / 106 // WOOD through DIAMOND
}

// Season rank badge (images/season-badges/<tier>.png). `size` is the HEIGHT:
// the width follows the badge's own ratio so every rank reads equally tall,
// and an absolutely positioned one keeps the centre of the square box its
// caller reserved, so no caller had to change.
export const rankBadge = (px: Px, tier: number, size: number, x?: number, y?: number) => {
  const w = size * badgeAspect(tier)
  return (
    <UiEntity
      uiTransform={
        x === undefined
          ? { width: px(w), height: px(size), flexShrink: 0 }
          : at(px, x + (size - w) / 2, y || 0, w, size)
      }
      uiBackground={{ texture: { src: `images/season-badges/${tier}.png` }, textureMode: 'stretch' }}
    />
  )
}

// The full-screen "next prize" strip: the wearable's thumbnail (the FT icon
// once sold out), "NEXT PRIZE · <tier> · N pts to go" and its name.
export const nextPrizeStrip = (
  px: Px,
  fs: Px,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  prize: { name: string; stock: number; thumbnail?: string; fashionTickets?: number } | null,
  tierName: string,
  toGo: number,
  loaded: boolean
) => {
  const sold = !!prize && prize.stock <= 0
  const pic = sold ? 'images/icons/ft.png' : prize?.thumbnail
  const name = !prize ? (loaded ? 'Every prize reached!' : 'Loading prizes...') : sold ? `${prize.fashionTickets ? fmt(prize.fashionTickets) + ' ' : ''}Fashion Tickets` : shortName(prize.name)
  const t = h - 10
  return [
    box(px, key, x, y, w, h, { color: P.pinkBar, radius: 10, border: 2, borderColor: P.pinkEdge }),
    <UiEntity key={`${key}-thumb`} uiTransform={{ ...at(px, x + 6, y + 5, t, t), borderRadius: px(7) }} uiBackground={{ color: Color4.create(1, 1, 1, 0.25) }}>
      {pic ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(7) }} uiBackground={{ texture: { src: pic }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    <UiEntity key={`${key}-line`} uiTransform={{ ...at(px, x + t + 13, y + 4, w - t - 20, 14), flexDirection: 'row', alignItems: 'center' }}>
      <Label value={prize && tierName ? `NEXT PRIZE · ${tierName}` : 'NEXT PRIZE'} fontSize={fs(10)} color={P.prizeText} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14) }} />
      {prize ? <Label value={`· ${toGo} pts to go`} fontSize={fs(10)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14), margin: { left: px(4) } }} /> : null}
    </UiEntity>,
    text(px, fs, name, x + t + 13, y + h - 23, w - t - 20, 18, 14)
  ]
}

// One of the 163x52 cards of the full-screen right column (TUTORIAL,
// WORKSHOP, PRIZES): square art, display title, one line and a chevron. The
// whole card is the button.
export const sideCard = (px: Px, id: string, y: number, color: Color4, art: string, titleKey: string, onClick: () => void, content: any[]) =>
  button2(px, { id, x: 498, y, w: 163, h: 52, color, radius: 14, border: 2, shadow: 4, onClick }, [
    imgBox(px, art, 3, 3, 42, 42),
    img(px, titleKey, 51, 4, 0.5),
    ...content,
    img(px, 'ic_chev_right_w', 147, 18, 0.42)
  ])

// Blue chip under the PLAY buttons: the energy bolt and the caption
// ("1 energy", "no energy", "closed", "connecting...").
export const energyChip = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, caption: string, size = 13) =>
  box(px, key, x, y, w, h, { color: P.blueChip, radius: h / 2, border: 2, justify: 'center', align: 'center' }, [
    img(px, 'ic_bolt_w', undefined, undefined, (h - 8) / 42),
    <Label value={caption} fontSize={fs(size)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(h - 4), margin: { left: px(h * 0.2) } }} />
  ])
