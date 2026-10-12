// In-hole HUD pieces in the new visual language (design canvas HUD.dc.html):
// the HOLE / TIME / SHOTS block, the "Ending in" banner, the live ranking, the power column,
// the controls help and the map footer. Everything is anchored to the
// explorer's interactable area and scales with the contain ratio.
//
// They read the same state the old sprite-based components did; the data
// producers are unchanged except for the scoreboard, which is structured now.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { topbarState, formatTopBarTime } from './topbar-state'
import { powerBarState, controlHintState } from './shoot-hud-state'
import { seasonClockState, seasonResultsState, seasonCountdownState, seasonHoleState, SeasonResultRow } from './season-hud-state'
import { C, hex, fmt, mmss } from './ui-theme'
import { hudScale, type Px } from './ui-scale'
import { CAMERA_AIM_MODE } from '../config/controls'

// ---------------------------------------------------------------------------
// A labelled stat box: small caption on top, big value under it.
const statBox = (px: Px, fs: Px, w: number, caption: string, value: string, bg: Color4, border: boolean) => (
  <UiEntity
    uiTransform={{
      width: w,
      height: px(76),
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      margin: { right: px(10) },
      borderRadius: px(18),
      borderWidth: border ? Math.max(2, px(4)) : 0,
      borderColor: C.dark
    }}
    uiBackground={{ color: bg }}
  >
    <Label value={caption} fontSize={fs(14)} color={C.lilac} textAlign="middle-center" uiTransform={{ height: px(20) }} textWrap="nowrap" />
    <Label value={value} fontSize={fs(28)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(34) }} textWrap="nowrap" />
  </UiEntity>
)

// Storymode missions keep their own single timer (topbarState); a season hole
// shows HOLE, TIME and SHOTS together. Neither block exists outside a hole.
export const MissionTimer = () => {
  if (!topbarState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.area.top + px(22), left: canvas.area.left + px(24) }, flexDirection: 'row' }}>
      {statBox(px, fs, px(104), 'TIME', formatTopBarTime(topbarState.ms), C.panelDim, false)}
    </UiEntity>
  )
}

export const HoleStats = () => {
  if (!seasonClockState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const me = seasonResultsState.rows.find((row) => row.isMe)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.area.top + px(22), left: canvas.area.left + px(24) }, flexDirection: 'row' }}>
      {statBox(px, fs, px(112), 'HOLE', `${seasonHoleState.current} / ${seasonHoleState.total}`, C.purple, true)}
      {statBox(px, fs, px(104), 'TIME', mmss(seasonClockState.ms), C.panelDim, false)}
      {statBox(px, fs, px(96), 'SHOTS', String(me ? me.shots : 0), C.panelDim, false)}
    </UiEntity>
  )
}

// "Starting in... N" before a hole (purple) and "Ending in... N" once a rival
// holes out (red), top centre.
export const EndingBanner = () => {
  if (!seasonCountdownState.visible || !seasonCountdownState.text) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const [first, second] = seasonCountdownState.text.split('\n')
  const ending = /ending/i.test(first)
  const label = first.replace(/\.{2,}$/, '').trim()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(22), left: canvas.area.left },
        width: canvas.availW,
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          height: px(54),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(22), right: px(22) },
          borderRadius: px(22),
          borderWidth: Math.max(2, px(4)),
          borderColor: C.dark
        }}
        uiBackground={{ color: ending ? C.red : C.purple }}
      >
        <Label value={label} fontSize={fs(17)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(54) }} textWrap="nowrap" />
        {second ? (
          <Label value={second} fontSize={fs(28)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(54), margin: { left: px(12) } }} textWrap="nowrap" />
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

export const LiveRanking = () => {
  if (!seasonResultsState.visible || !seasonResultsState.rows.length) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const rows = rankRows(seasonResultsState.rows)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(128), left: canvas.area.left + px(24) },
        width: px(270),
        flexDirection: 'column',
        padding: px(10),
        borderRadius: px(22),
        borderWidth: Math.max(2, px(4)),
        borderColor: C.dark
      }}
      uiBackground={{ color: C.panelDim }}
    >
      {rows.map((row, i) => (
        <UiEntity
          key={i}
          uiTransform={{
            width: '100%',
            height: px(44),
            flexDirection: 'row',
            alignItems: 'center',
            margin: { bottom: i === rows.length - 1 ? 0 : px(6) },
            padding: { left: px(10), right: px(10) },
            borderRadius: px(14),
            borderWidth: row.isMe ? Math.max(1, px(3)) : 0,
            borderColor: C.dark
          }}
          uiBackground={{ color: row.isMe ? C.hotPink : C.bg }}
        >
          <Label
            value={String(i + 1)}
            fontSize={fs(20)}
            color={row.isMe ? C.dark : i === 0 ? C.yellow : C.muted}
            textAlign="middle-left"
            uiTransform={{ width: px(22), height: px(44) }} textWrap="nowrap"
          />
          <UiEntity
            uiTransform={{
              width: px(20),
              height: px(20),
              margin: { left: px(6) },
              borderRadius: row.isGhost ? px(6) : px(10),
              borderWidth: Math.max(1, px(2)),
              borderColor: C.dark
            }}
            uiBackground={{ color: row.isGhost ? C.lilac : C.white }}
          />
          <Label
            value={row.isMe ? `${row.name} · you` : row.name}
            fontSize={fs(16)}
            color={row.isMe ? C.dark : C.white}
            textAlign="middle-left"
            uiTransform={{ flexGrow: 1, height: px(44), margin: { left: px(8) } }} textWrap="nowrap"
          />
          {row.holed ? (
            <UiEntity uiTransform={{ height: px(24), padding: { left: px(8), right: px(8) }, borderRadius: px(8), justifyContent: 'center' }} uiBackground={{ color: C.green }}>
              <Label value={`IN · ${row.shots}`} fontSize={fs(13)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(24) }} textWrap="nowrap" />
            </UiEntity>
          ) : (
            <Label value={String(row.shots)} fontSize={fs(18)} color={row.isMe ? C.dark : C.white} textAlign="middle-right" uiTransform={{ width: px(30), height: px(44) }} textWrap="nowrap" />
          )}
        </UiEntity>
      ))}
    </UiEntity>
  )
}

// Shot power as 10 vertical segments: green up to 40, yellow to 70, red above.
export const PowerColumn = () => {
  if (!powerBarState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const power = Math.max(0, Math.min(100, powerBarState.power))
  const lit = Math.ceil(power / 10)
  const segments: ReactEcs.JSX.Element[] = []
  for (let i = 10; i >= 1; i--) {
    const level = i * 10
    const color = i > lit ? C.purpleTrack : level <= 40 ? C.green : level <= 70 ? C.yellow : hex('#FF5A3C')
    segments.push(
      <UiEntity key={i} uiTransform={{ width: px(54), height: px(28), borderRadius: px(8), margin: { bottom: i === 1 ? 0 : px(5) } }} uiBackground={{ color }} />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(120), right: canvas.area.right + px(28) },
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <UiEntity uiTransform={{ height: px(28), padding: { left: px(12), right: px(12) }, borderRadius: px(10), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
        <Label value="POWER" fontSize={fs(16)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(28) }} textWrap="nowrap" />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column', padding: px(8), margin: { top: px(10) }, borderRadius: px(18) }} uiBackground={{ color: C.dark }}>
        {segments}
      </UiEntity>
      <UiEntity uiTransform={{ height: px(40), margin: { top: px(10) }, padding: { left: px(12), right: px(12) }, borderRadius: px(12), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
        <Label value={`${Math.round(power)}%`} fontSize={fs(26)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(40) }} textWrap="nowrap" />
      </UiEntity>
      <UiEntity uiTransform={{ width: px(120), height: px(40), margin: { top: px(10) }, padding: { left: px(8), right: px(8) }, borderRadius: px(8), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
        <Label value="Above 40% the shot can wobble" fontSize={fs(12)} color={C.white} textAlign="middle-center" uiTransform={{ width: '100%', height: px(40) }} textWrap="nowrap" />
      </UiEntity>
    </UiEntity>
  )
}

// Controls help, bottom centre: one key cap per input and what it does.
const keyCap = (px: Px, fs: Px, text: string, wide: boolean, accent = false) => (
  <UiEntity
    uiTransform={{
      width: wide ? undefined : px(34),
      height: px(34),
      padding: wide ? { left: px(10), right: px(10) } : undefined,
      margin: { right: px(4) },
      borderRadius: px(9),
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color: accent ? C.yellow : C.white }}
  >
    <Label value={text} fontSize={fs(wide ? 14 : 18)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(34) }} textWrap="nowrap" />
  </UiEntity>
)

const helpItem = (px: Px, fs: Px, keys: ReactEcs.JSX.Element[], what: string) => (
  <UiEntity uiTransform={{ height: px(34), flexDirection: 'row', alignItems: 'center', margin: { right: px(18) } }}>
    {keys}
    <Label value={what} fontSize={fs(17)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(34), margin: { left: px(4) } }} textWrap="nowrap" />
  </UiEntity>
)

export const ControlsHelp = () => {
  if (!controlHintState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const items: ReactEcs.JSX.Element[] = []
  if (CAMERA_AIM_MODE) {
    items.push(helpItem(px, fs, [keyCap(px, fs, 'MOUSE', true)], 'Orbit'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'A', false), keyCap(px, fs, 'D', false)], 'Turn'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'W', false), keyCap(px, fs, 'S', false)], 'Zoom'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'E', false), keyCap(px, fs, 'F', false)], 'Power'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'CLICK', true, true)], 'Shoot'))
  } else if (controlHintState.step === 0) {
    items.push(helpItem(px, fs, [keyCap(px, fs, 'E', false), keyCap(px, fs, 'F', false)], 'Rotate'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'CLICK', true, true)], 'Set direction'))
  } else {
    items.push(helpItem(px, fs, [keyCap(px, fs, 'E', false), keyCap(px, fs, 'F', false)], 'Power'))
    items.push(helpItem(px, fs, [keyCap(px, fs, 'CLICK', true, true)], 'Shoot'))
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: canvas.area.bottom + px(22), left: canvas.area.left },
        width: canvas.availW,
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          height: px(58),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(20), right: px(2) },
          borderRadius: px(22),
          borderWidth: Math.max(2, px(4)),
          borderColor: C.dark
        }}
        uiBackground={{ color: C.panelDim }}
      >
        {items}
      </UiEntity>
    </UiEntity>
  )
}

// Map name and author, bottom right, only while playing (SDK6 game-ui.ts).
export const MapFooter = () => {
  const gs = globalStore.game.getState()
  const name = gs.courseName || gs.courseId
  if (!gs.playing || !name) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: canvas.area.bottom + px(24), right: canvas.area.right + px(28) },
        flexDirection: 'column',
        alignItems: 'flex-end',
        padding: { top: px(8), bottom: px(8), left: px(18), right: px(18) },
        borderRadius: px(18),
        borderWidth: Math.max(2, px(4)),
        borderColor: C.dark
      }}
      uiBackground={{ color: C.panelDim }}
    >
      <Label value={String(name)} fontSize={fs(19)} color={C.white} textAlign="middle-right" uiTransform={{ height: px(26) }} textWrap="nowrap" />
      {gs.courseAuthor ? (
        <Label value={`by ${gs.courseAuthor}`} fontSize={fs(14)} color={C.muted} textAlign="middle-right" uiTransform={{ height: px(20) }} textWrap="nowrap" />
      ) : null}
    </UiEntity>
  )
}
