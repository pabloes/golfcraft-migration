// In-hole HUD on phones, after the "En el campo" board of the canvas page
// "Móvil · propuesta 2" (M2HUD.dc.html): the HOLE / TIME / SHOTS boxes and the
// map name along the top, the live ranking on the left, the power column top
// right and the "Ending in" banner top centre; the touch controls sit at the
// bottom (mobile-shoot-controls.tsx). The centre stays clear for the course.
// Desktop has its own HUD, game-hud-desktop.tsx.
//
// Everything sits on the full-screen 667x375 grid of ui-scale.ts fullLayout,
// which keeps the explorer's corners free. They read the same state the old
// components did; the data producers are unchanged.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { musicStatus } from '../services/map-music'
import { globalStore } from '../services/globalStore/globalStore'
import { topbarState, formatTopBarTime } from './topbar-state'
import { powerBarState } from './shoot-hud-state'
import { seasonClockState, seasonResultsState, seasonCountdownState, seasonHoleState, SeasonResultRow } from './season-hud-state'
import { C, hex, mmss } from './ui-theme'
import { P, border, initialAvatar, placeAt } from './ui2'
// @ts-ignore - common/utils has @ts-nocheck
import { getTierFromSub } from '../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'
import { fullLayout, scaler, type Layout, type Px } from './ui-scale'
import { mobileShootState } from './mobile-shoot-state'
import { pingLabel } from './ping-label'

const HUD_BG = Color4.create(18 / 255, 22 / 255, 70 / 255, 0.88)
const SHADOW_TEXT = hex('#1B2A6B')

// ---------------------------------------------------------------------------
// A labelled stat box of the top bar: small caption on top, big value under it.
const statBox = (L: Layout, px: Px, fs: Px, key: string, x: number, caption: string, value: string, bg: Color4) => (
  <UiEntity
    key={key}
    uiTransform={{ ...placeAt(L, px, x, 6, 60, 44), flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.white }}
    uiBackground={{ color: bg }}
  >
    <Label value={caption} fontSize={fs(9)} color={P.pale} textAlign="middle-center" uiTransform={{ height: px(12) }} textWrap="nowrap" />
    <Label value={value} fontSize={fs(17)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(22) }} textWrap="nowrap" />
  </UiEntity>
)

// Storymode missions keep their own single timer (topbarState); a season hole
// shows HOLE, TIME and SHOTS together. Neither block exists outside a hole.
export const MissionTimer = () => {
  if (!topbarState.visible) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  return statBox(L, px, fs, 'mission-time', 140, 'TIME', formatTopBarTime(topbarState.ms), P.navy)
}

export const HoleStats = () => {
  if (!seasonClockState.visible) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const me = seasonResultsState.rows.find((row) => row.isMe)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%' }}>
      {statBox(L, px, fs, 'stat-hole', 140, 'HOLE', `${seasonHoleState.current} / ${seasonHoleState.total}`, P.navy)}
      {statBox(L, px, fs, 'stat-time', 205, 'TIME', mmss(seasonClockState.ms), P.navy)}
      {statBox(L, px, fs, 'stat-shots', 270, 'SHOTS', String(me ? me.shots : 0), P.purple)}
    </UiEntity>
  )
}

// "Starting in... N" before a hole (purple) and "Ending in... N" once a rival
// holes out (pink), top centre under the top bar.
export const EndingBanner = () => {
  if (!seasonCountdownState.visible || !seasonCountdownState.text) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const [first, second] = seasonCountdownState.text.split('\n')
  const ending = /ending/i.test(first)
  const label = first.replace(/\.{2,}$/, '').trim()
  return (
    <UiEntity uiTransform={{ ...placeAt(L, px, 152, 58, 340, 40), justifyContent: 'center' }}>
      <UiEntity
        uiTransform={{ height: px(40), flexDirection: 'row', alignItems: 'center', padding: { left: px(14), right: px(14) }, borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.white }}
        uiBackground={{ color: ending ? P.pink : P.purple }}
      >
        <Label value={label} fontSize={fs(12)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(36) }} textWrap="nowrap" />
        {second ? (
          <Label value={second} fontSize={fs(17)} color={C.yellow} textAlign="middle-center" uiTransform={{ height: px(36), margin: { left: px(8) } }} textWrap="nowrap" />
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

// Live ranking: who has holed (fewest shots first), then the rest by shots.
const rankRows = (rows: SeasonResultRow[]) =>
  [...rows].sort((a, b) => {
    if (a.holed !== b.holed) return a.holed ? -1 : 1
    if (a.shots !== b.shots) return a.shots - b.shots
    return a.timeMs - b.timeMs
  })

// Left column, with your Season rank as its header. In a hole the explorer
// has no joystick, so up to seven rows (a full party) may run lower.
export const LiveRanking = () => {
  if (!seasonResultsState.visible || !seasonResultsState.rows.length) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const rows = rankRows(seasonResultsState.rows)
  const rowH = rows.length > 5 ? 24 : 28
  const tierSub = Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)
  const tier = Number(getTierFromSub(tierSub) || 0)
  return (
    <UiEntity
      uiTransform={{ ...placeAt(L, px, 6, 58, 140), flexDirection: 'column', padding: px(4), borderRadius: px(14), borderWidth: border(px, 2), borderColor: P.navyEdge }}
      uiBackground={{ color: HUD_BG }}
    >
      <Label value={`${seasonTierDefinitions[tier]?.name || 'WOOD 5'} · ${tierSub} pts`} fontSize={fs(10)} color={P.pale} textAlign="middle-left" uiTransform={{ height: px(16), margin: { left: px(4) } }} textWrap="nowrap" />
      {rows.map((row, i) => (
        <UiEntity
          key={i}
          uiTransform={{ width: px(128), height: px(rowH), flexDirection: 'row', alignItems: 'center', margin: { top: px(2) }, padding: { left: px(6), right: px(6) }, borderRadius: px(9) }}
          uiBackground={{ color: row.isMe ? P.yellow : P.clear }}
        >
          <Label value={String(i + 1)} fontSize={fs(11)} color={row.isMe ? P.ink : C.white} textAlign="middle-left" uiTransform={{ width: px(10), height: px(rowH) }} textWrap="nowrap" />
          <UiEntity uiTransform={{ margin: { left: px(3) } }}>{initialAvatar(px, fs, row.name, 20, i)}</UiEntity>
          <UiEntity uiTransform={{ width: px(row.holed ? 50 : 66), height: px(rowH), margin: { left: px(5) }, overflow: 'hidden' }}>
            <Label value={row.isMe ? `${row.name} · you` : row.name} fontSize={fs(11)} color={row.isMe ? P.ink : C.white} textAlign="middle-left" uiTransform={{ width: '100%', height: px(rowH) }} textWrap="nowrap" />
          </UiEntity>
          {row.holed ? (
            <Label value={`IN · ${row.shots}`} fontSize={fs(10)} color={row.isMe ? P.ink : P.green} textAlign="middle-right" uiTransform={{ width: px(30), height: px(rowH) }} textWrap="nowrap" />
          ) : (
            <Label value={String(row.shots)} fontSize={fs(11)} color={row.isMe ? P.ink : C.white} textAlign="middle-right" uiTransform={{ width: px(14), height: px(rowH) }} textWrap="nowrap" />
          )}
        </UiEntity>
      ))}
    </UiEntity>
  )
}

// Shot power, top right: 10 segments (green up to 40, yellow to 70, red
// above) with the value and the wobble note on their left, + above and - below
// the bar; held, they act as a held E / F (mobile-shoot-state).
const powerHoldButton = (L: Layout, px: Px, fs: Px, key: string, y: number, label: string, dir: -1 | 1) => (
  <UiEntity
    key={key}
    uiTransform={{ ...placeAt(L, px, 617, y, 44, 40), borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.navyEdge, justifyContent: 'center', alignItems: 'center' }}
    uiBackground={{ color: P.navy }}
    onMouseDown={() => {
      mobileShootState.powerHold = dir
    }}
    onMouseUp={() => {
      mobileShootState.powerHold = 0
    }}
    onMouseLeave={() => {
      mobileShootState.powerHold = 0
    }}
  >
    <Label value={label} fontSize={fs(22)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
  </UiEntity>
)

export const PowerColumn = () => {
  if (!powerBarState.visible) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const power = Math.max(0, Math.min(100, powerBarState.power))
  const lit = Math.ceil(power / 10)
  // The bar sits between the + and - buttons.
  const barTop = 102
  const barH = 80
  const segH = (barH - 6 - 9) / 10
  const segments: ReactEcs.JSX.Element[] = []
  for (let i = 10; i >= 1; i--) {
    const level = i * 10
    const color = i > lit ? Color4.create(1, 1, 1, 0.15) : level <= 40 ? C.green : level <= 70 ? C.yellow : hex('#FF5A3C')
    segments.push(<UiEntity key={i} uiTransform={{ width: px(20), height: px(segH), borderRadius: px(2), margin: { bottom: i === 1 ? 0 : px(1) } }} uiBackground={{ color }} />)
  }
  const labelTop = barTop + barH / 2 - 44
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%' }}>
      {powerHoldButton(L, px, fs, 'power-up', 58, '+', 1)}
      <UiEntity
        uiTransform={{ ...placeAt(L, px, 625, barTop, 28, barH), flexDirection: 'column', alignItems: 'center', padding: px(3), borderRadius: px(8), borderWidth: border(px, 2), borderColor: P.navyEdge }}
        uiBackground={{ color: HUD_BG }}
      >
        {segments}
      </UiEntity>
      {powerHoldButton(L, px, fs, 'power-down', 186, '−', -1)}
      <UiEntity uiTransform={{ ...placeAt(L, px, 532, labelTop, 86, 88), flexDirection: 'column', alignItems: 'flex-end' }}>
        <Label value="POWER" fontSize={fs(10)} color={C.white} textAlign="middle-right" uiTransform={{ height: px(14) }} textWrap="nowrap" />
        <Label value={`${Math.round(power)}%`} fontSize={fs(24)} color={C.yellow} textAlign="middle-right" uiTransform={{ height: px(30) }} textWrap="nowrap" />
        <Label value="Above 40% the shot can wobble" fontSize={fs(10)} color={C.white} textAlign="top-right" uiTransform={{ width: px(86), height: px(40) }} textWrap="wrap" />
      </UiEntity>
    </UiEntity>
  )
}

// Map name and author, top bar right of the stat boxes, only while playing
// (SDK6 game-ui.ts).
// What the music is doing, in the footer next to the map's name. Here because
// nothing is heard on phones and the console is out of reach there: this says
// whether the scene started a track, which is the difference between a bug of
// ours and one in the explorer's player (user, 2026-11-06).
const musicLabel = (px: Px, fs: Px) => {
  const started = musicStatus.starts > 0
  const name = musicStatus.track.replace(/\.mp3$/, '')
  return (
    <Label
      value={started ? `\u266A ${name}` : '\u266A none'}
      fontSize={fs(10)}
      color={started ? P.pale : C.yellow}
      textAlign="middle-left"
      uiTransform={{ height: px(26), margin: { left: px(8) } }}
      textWrap="nowrap"
    />
  )
}

export const MapFooter = () => {
  const gs = globalStore.game.getState()
  const name = gs.courseName || gs.courseId
  if (!gs.playing || !name) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  return (
    <UiEntity
      uiTransform={{ ...placeAt(L, px, 336, 13, undefined, 30), flexDirection: 'row', alignItems: 'center', padding: { left: px(10), right: px(10) }, borderRadius: px(10), borderWidth: border(px, 2), borderColor: P.navyEdge }}
      uiBackground={{ color: HUD_BG }}
    >
      <Label value={String(name)} fontSize={fs(11)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(26) }} textWrap="nowrap" />
      {gs.courseAuthor ? (
        <Label value={`by ${gs.courseAuthor}`} fontSize={fs(11)} color={P.pale} textAlign="middle-left" uiTransform={{ height: px(26), margin: { left: px(6) } }} textWrap="nowrap" />
      ) : null}
      {musicLabel(px, fs)}
      {pingLabel(px, fs, 10, { margin: { left: px(8) } })}
    </UiEntity>
  )
}
