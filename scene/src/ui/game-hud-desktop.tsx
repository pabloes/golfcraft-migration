// In-hole HUD on desktop, after the "En el campo" board of the canvas page
// "Escritorio · propuesta 2" (HUD2.dc.html): the HOLE / TIME / SHOTS block,
// the "Ending in" banner, the live ranking, the power column, the controls
// help, the map footer and the rank pill. Everything is anchored to the
// explorer's interactable area and scales with the contain ratio, so it
// follows the window instead of the phone grid. Phones use game-hud.tsx.
//
// They read the same state the old sprite-based components did; the data
// producers are unchanged except for the scoreboard, which is structured now.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { topbarState, formatTopBarTime } from './topbar-state'
import { powerBarState, controlHintState } from './shoot-hud-state'
import { seasonClockState, seasonResultsState, seasonCountdownState, seasonHoleState, SeasonResultRow } from './season-hud-state'
import { C, hex, mmss } from './ui-theme'
import { P, border, img, initialAvatar, rankBadge } from './ui2'
import { lobbyMenuState, openLobbyViewInGame } from './lobby-menu-state'
import { gameOptions, toggleMute, saveAudioOptions, VOLUME_STEP } from '../services/game-options'
import { pingLabel } from './ping-label'
import { mobileShootState } from './mobile-shoot-state'
// @ts-ignore - common/utils has @ts-nocheck
import { getTierFromSub } from '../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'
import { hudScale, type Canvas, type Px } from './ui-scale'
import { isCameraAimMode } from '../services/game-options'

// ---------------------------------------------------------------------------
// A labelled stat box: small caption on top, big value under it.
const statBox = (px: Px, fs: Px, w: number, caption: string, value: string, bg: Color4) => (
  <UiEntity
    uiTransform={{
      width: w,
      height: px(72),
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      margin: { right: px(10) },
      borderRadius: px(18),
      borderWidth: border(px, 4),
      borderColor: P.white
    }}
    uiBackground={{ color: bg }}
  >
    <Label value={caption} fontSize={fs(12)} color={P.pale} textAlign="middle-center" uiTransform={{ height: px(18) }} textWrap="nowrap" />
    <Label value={value} fontSize={fs(28)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(34) }} textWrap="nowrap" />
  </UiEntity>
)

// Storymode missions keep their own single timer (topbarState); a season hole
// shows HOLE, TIME and SHOTS together. Neither block exists outside a hole.
// Left edge of the HOLE / TIME / SHOTS row and the live ranking. The Unity
// explorer reports a left inset as wide as its chat column, which sits at the
// bottom; at the top only the minimap and its buttons are there, and they end
// about px(90) before that inset (measured on a screenshot). Explorers with a
// small or no inset keep the plain margin.
const hudLeft = (canvas: Canvas, px: Px) => {
  const left = canvas.area.left
  return left > px(200) ? left - px(90) : left + px(24)
}

// LEAVE, top left, in every mode (user, 2026-11-03): the same room.leave()
// the phone's QUIT does (mobileShootState.quit, set by both golfplay clients
// for the whole hole), behind the same confirm. The stat boxes start after it.
const LEAVE_W = 96
const leaveOffset = (px: Px) => (mobileShootState.quit ? px(LEAVE_W + 10) : 0)

// OPTIONS, under LEAVE, during a hole (user, 2026-11-05): a player who cannot
// get on with the control scheme should be able to change it there and then
// instead of finishing the run first. It opens the same view as the lobby's
// OPTIONS, and the change applies from the next hole, as it does anywhere
// else. Desktop only, like the scheme itself: this whole file is.
export const InGameOptionsButton = () => {
  const st = mobileShootState
  if (!st.quit || lobbyMenuState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(22 + 72 + 8), left: hudLeft(canvas, px) },
        width: px(LEAVE_W),
        height: px(40),
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: px(14),
        borderWidth: border(px, 3),
        borderColor: P.white
      }}
      uiBackground={{ color: P.navy }}
      onMouseDown={() => openLobbyViewInGame('options')}
    >
      <Label value="OPTIONS" fontSize={fs(12)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(18) }} />
    </UiEntity>
  )
}

// ---------------------------------------------------------------- AUDIO
// A music note, drawn with boxes rather than taken from the icon sheet, which
// has no audio icon: a head, a stem and a flag. No font glyph either, since
// nothing guarantees the explorer's face carries one.
const noteIcon = (px: Px, muted: boolean) => {
  const ink = muted ? P.pale : C.white
  return (
    <UiEntity uiTransform={{ width: px(20), height: px(22), positionType: 'relative' }}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: px(12), left: px(0) }, width: px(12), height: px(10), borderRadius: px(5) }}
        uiBackground={{ color: ink }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: px(0), left: px(10) }, width: px(3), height: px(17) }}
        uiBackground={{ color: ink }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: px(0), left: px(12) }, width: px(7), height: px(4) }}
        uiBackground={{ color: ink }}
      />
    </UiEntity>
  )
}

// Open only while the player wants it: one click on the note, one more to put
// it away. Module state, because the UI re-renders every frame anyway.
let audioPanelOpen = false

const volButton = (px: Px, fs: Px, id: string, label: string, disabled: boolean, onClick: () => void) => (
  <UiEntity
    uiTransform={{
      width: px(30),
      height: px(26),
      justifyContent: 'center',
      alignItems: 'center',
      margin: { right: px(4) },
      borderRadius: px(8),
      borderWidth: border(px, 2),
      borderColor: P.white
    }}
    uiBackground={{ color: disabled ? P.navyDeep : P.navy }}
    onMouseDown={disabled ? undefined : onClick}
  >
    <Label value={label} fontSize={fs(13)} color={disabled ? P.pale : C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(18) }} />
  </UiEntity>
)

// The note, the level under it, and the controls that drop out of it. Used as
// one more chip of the in-hole stats row, so it can never land on top of
// anything, and on its own in the lobby.
const audioChip = (px: Px, fs: Px) => {
  const pct = Math.round(gameOptions.musicVolume * 100)
  const muted = gameOptions.muted
  const step = (delta: number) => {
    const next = Math.min(1, Math.max(0, Math.round((gameOptions.musicVolume + delta) * 100) / 100))
    void saveAudioOptions({ music: next, muted: false })
  }
  return (
    <UiEntity uiTransform={{ width: px(76), height: px(72), positionType: 'relative', margin: { right: px(10) } }}>
      <UiEntity
        uiTransform={{
          width: px(76),
          height: px(72),
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: px(18),
          borderWidth: border(px, 4),
          borderColor: P.white
        }}
        uiBackground={{ color: muted ? P.crimson : P.navy }}
        onMouseDown={() => {
          audioPanelOpen = !audioPanelOpen
        }}
      >
        {noteIcon(px, muted)}
        <Label
          value={muted ? 'OFF' : `${pct}%`}
          fontSize={fs(13)}
          color={muted ? P.pale : C.white}
          textAlign="middle-center"
          textWrap="nowrap"
          uiTransform={{ height: px(18), margin: { top: px(2) } }}
        />
      </UiEntity>
      {audioPanelOpen ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: px(78), left: px(0) },
            width: px(172),
            height: px(38),
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            padding: { left: px(6), right: px(6) },
            borderRadius: px(12),
            borderWidth: border(px, 3),
            borderColor: P.white
          }}
          uiBackground={{ color: P.navyDeep }}
        >
          {volButton(px, fs, 'audio-down', '-', muted || pct <= 0, () => step(-VOLUME_STEP))}
          {volButton(px, fs, 'audio-up', '+', muted || pct >= 100, () => step(VOLUME_STEP))}
          <UiEntity
            uiTransform={{
              width: px(92),
              height: px(26),
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: px(8),
              borderWidth: border(px, 2),
              borderColor: P.white
            }}
            uiBackground={{ color: muted ? P.crimson : P.navy }}
            onMouseDown={toggleMute}
          >
            <Label value={muted ? 'UNMUTE' : 'MUTE'} fontSize={fs(11)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
          </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

// In the lobby there is no stats row to sit in, so it stands at the top left,
// which desktop leaves free there.
export const LobbyAudioButton = () => {
  const gs = globalStore.game.getState()
  if (gs.introScreen || gs.bootError || gs.playing || gs.starting) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(22), left: hudLeft(canvas, px) },
        flexDirection: 'row'
      }}
    >
      {audioChip(px, fs)}
    </UiEntity>
  )
}

export const LeaveButton = () => {
  const st = mobileShootState
  if (!st.quit) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(22), left: hudLeft(canvas, px) },
        width: px(LEAVE_W),
        height: px(72),
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: px(18),
        borderWidth: border(px, 4),
        borderColor: P.white
      }}
      uiBackground={{ color: P.crimson }}
      onMouseDown={() => {
        st.quitConfirm = true
      }}
    >
      {img(px, 'ic_close_w', undefined, undefined, 0.7)}
      <Label value="LEAVE" fontSize={fs(14)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20), margin: { top: px(2) } }} />
    </UiEntity>
  )
}

// The confirm behind LEAVE, mounted after the rest of the HUD so it paints on
// top of it (same copy and buttons as the phone's).
const confirmButton = (px: Px, fs: Px, label: string, color: Color4, textColor: Color4, onTap: () => void, left = 0) => (
  <UiEntity
    uiTransform={{ width: px(150), height: px(52), margin: { left: px(left) }, borderRadius: px(14), borderWidth: border(px, 3), borderColor: P.white, justifyContent: 'center', alignItems: 'center' }}
    uiBackground={{ color }}
    onMouseDown={onTap}
  >
    <Label value={label} fontSize={fs(18)} color={textColor} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(30) }} />
  </UiEntity>
)

export const LeaveConfirm = () => {
  const st = mobileShootState
  if (!st.quit || !st.quitConfirm) return null
  const { s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: C.backdrop }}
    >
      <UiEntity
        uiTransform={{ width: px(380), flexDirection: 'column', alignItems: 'center', padding: px(20), borderRadius: px(18), borderWidth: border(px, 4), borderColor: P.white }}
        uiBackground={{ color: P.navy }}
      >
        <Label value="Leave this hole?" fontSize={fs(24)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(34) }} />
        <Label
          value="You will lose the run and the shots played so far."
          fontSize={fs(15)}
          color={C.white}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(44), margin: { top: px(6) } }}
        />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: px(14) } }}>
          {confirmButton(px, fs, 'STAY', P.lavender, P.ink, () => {
            st.quitConfirm = false
          })}
          {confirmButton(px, fs, 'LEAVE', P.pink, C.white, () => {
            st.quitConfirm = false
            st.quit && st.quit()
          }, 12)}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

export const MissionTimer = () => {
  if (!topbarState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.area.top + px(22), left: hudLeft(canvas, px) + leaveOffset(px) }, flexDirection: 'row' }}>
      {statBox(px, fs, px(104), 'TIME', formatTopBarTime(topbarState.ms), P.navy)}
    </UiEntity>
  )
}

export const HoleStats = () => {
  if (!seasonClockState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const me = seasonResultsState.rows.find((row) => row.isMe)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.area.top + px(22), left: hudLeft(canvas, px) + leaveOffset(px) }, flexDirection: 'row' }}>
      {statBox(px, fs, px(104), 'HOLE', `${seasonHoleState.current} / ${seasonHoleState.total}`, P.purple)}
      {statBox(px, fs, px(104), 'TIME', mmss(seasonClockState.ms), P.navy)}
      {statBox(px, fs, px(104), 'SHOTS', String(me ? me.shots : 0), P.navy)}
      {audioChip(px, fs)}
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
          height: px(72),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(22), right: px(22) },
          borderRadius: px(18),
          borderWidth: border(px, 4),
          borderColor: P.white
        }}
        uiBackground={{ color: ending ? P.pink : P.purple }}
      >
        <Label value={label} fontSize={fs(16)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(64) }} textWrap="nowrap" />
        {second ? (
          <Label value={second} fontSize={fs(28)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(64), margin: { left: px(14) } }} textWrap="nowrap" />
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
        position: { top: canvas.area.top + px(128), left: hudLeft(canvas, px) },
        width: px(272),
        flexDirection: 'column',
        padding: px(10),
        borderRadius: px(18),
        borderWidth: border(px, 4),
        borderColor: P.white
      }}
      uiBackground={{ color: P.navy }}
    >
      {rows.map((row, i) => (
        <UiEntity
          key={i}
          uiTransform={{
            width: '100%',
            height: px(40),
            flexDirection: 'row',
            alignItems: 'center',
            margin: { bottom: i === rows.length - 1 ? 0 : px(6) },
            padding: { left: px(10), right: px(10) },
            borderRadius: px(12)
          }}
          uiBackground={{ color: row.isMe ? P.yellow : P.glass }}
        >
          <Label
            value={String(i + 1)}
            fontSize={fs(20)}
            color={row.isMe ? P.ink : i === 0 ? C.yellow : P.pale}
            textAlign="middle-left"
            uiTransform={{ width: px(22), height: px(40) }} textWrap="nowrap"
          />
          <UiEntity uiTransform={{ margin: { left: px(4) } }}>{initialAvatar(px, fs, row.name, 24, i)}</UiEntity>
          <Label
            value={row.isMe ? `${row.name} · you` : row.name}
            fontSize={fs(16)}
            color={row.isMe ? P.ink : C.white}
            textAlign="middle-left"
            uiTransform={{ flexGrow: 1, height: px(40), margin: { left: px(8) } }} textWrap="nowrap"
          />
          {row.holed ? (
            <UiEntity uiTransform={{ height: px(22), padding: { left: px(8), right: px(8) }, borderRadius: px(8), justifyContent: 'center' }} uiBackground={{ color: P.green }}>
              <Label value={`IN · ${row.shots}`} fontSize={fs(12)} color={P.ink} textAlign="middle-center" uiTransform={{ height: px(22) }} textWrap="nowrap" />
            </UiEntity>
          ) : (
            <Label value={String(row.shots)} fontSize={fs(18)} color={row.isMe ? P.ink : C.white} textAlign="middle-right" uiTransform={{ width: px(30), height: px(40) }} textWrap="nowrap" />
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
    const color = i > lit ? Color4.create(1, 1, 1, 0.12) : level <= 40 ? C.green : level <= 70 ? C.yellow : hex('#FF5A3C')
    segments.push(
      <UiEntity key={i} uiTransform={{ width: px(60), height: px(24), borderRadius: px(6), margin: { bottom: i === 1 ? 0 : px(4) } }} uiBackground={{ color }} />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(120), right: canvas.area.right + px(28) },
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: px(10), bottom: px(12), left: px(10), right: px(10) },
        borderRadius: px(18),
        borderWidth: border(px, 4),
        borderColor: P.white
      }}
      uiBackground={{ color: P.navy }}
    >
      <Label value="POWER" fontSize={fs(12)} color={P.pale} textAlign="middle-center" uiTransform={{ height: px(18) }} textWrap="nowrap" />
      <UiEntity uiTransform={{ flexDirection: 'column', padding: px(6), margin: { top: px(6) }, borderRadius: px(12) }} uiBackground={{ color: P.dim }}>
        {segments}
      </UiEntity>
      <Label value={`${Math.round(power)}%`} fontSize={fs(26)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(36), margin: { top: px(8) } }} textWrap="nowrap" />
      <Label value={'Above 40% the\nshot can wobble'} fontSize={fs(11)} color={P.pale} textAlign="middle-center" uiTransform={{ width: px(90), height: px(30) }} textWrap="nowrap" />
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
      borderRadius: px(8),
      borderWidth: border(px, 2),
      borderColor: accent ? P.yellowShadow : P.lavenderShadow,
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color: accent ? C.yellow : C.white }}
  >
    <Label value={text} fontSize={fs(wide ? 14 : 17)} color={P.ink} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
  </UiEntity>
)

const helpItem = (px: Px, fs: Px, keys: ReactEcs.JSX.Element[], what: string) => (
  <UiEntity uiTransform={{ height: px(34), flexDirection: 'row', alignItems: 'center', margin: { right: px(18) } }}>
    {keys}
    <Label value={what} fontSize={fs(17)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(34), margin: { left: px(4) } }} textWrap="nowrap" />
  </UiEntity>
)

export const ControlsHelp = () => {
  // Keyboard and mouse hints, shown while the shot control is up, and also
  // while a hole is starting (the Season's "Starting in..." countdown, or a
  // tutorial mission loading in), so the player can read the keys before the
  // first shot.
  const starting = (seasonCountdownState.visible && /^starting/i.test(seasonCountdownState.text)) || !!globalStore.game.getState().starting
  if (!controlHintState.visible && !starting) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const items: ReactEcs.JSX.Element[] = []
  if (isCameraAimMode()) {
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
          height: px(60),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(20), right: px(2) },
          borderRadius: px(18),
          borderWidth: border(px, 4),
          borderColor: P.white
        }}
        uiBackground={{ color: P.navy }}
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
        borderWidth: border(px, 4),
        borderColor: P.white
      }}
      uiBackground={{ color: P.navy }}
    >
      <Label value={String(name)} fontSize={fs(19)} color={C.white} textAlign="middle-right" uiTransform={{ height: px(26) }} textWrap="nowrap" />
      {gs.courseAuthor ? (
        <Label value={`by ${gs.courseAuthor}`} fontSize={fs(13)} color={P.pale} textAlign="middle-right" uiTransform={{ height: px(20) }} textWrap="nowrap" />
      ) : null}
      {pingLabel(px, fs, 12)}
    </UiEntity>
  )
}

// Your Season rank, top right, during a Season run (HUD2).
export const RankPill = () => {
  if (!seasonClockState.visible) return null
  const { canvas, s } = hudScale()
  const { px, fs } = s
  const tierSub = Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)
  const tier = Number(getTierFromSub(tierSub) || 0)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.area.top + px(22), right: canvas.area.right + px(28) },
        height: px(46),
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: px(8), right: px(14) },
        borderRadius: px(14),
        borderWidth: border(px, 3),
        borderColor: P.navyEdge
      }}
      uiBackground={{ color: P.navyDeep }}
    >
      {rankBadge(px, tier, 26)}
      <Label value={`${seasonTierDefinitions[tier]?.name || 'WOOD 5'} ·`} fontSize={fs(15)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(40), margin: { left: px(8) } }} textWrap="nowrap" />
      <Label value={`${tierSub} pts`} fontSize={fs(15)} color={C.yellow} textAlign="middle-left" uiTransform={{ height: px(40), margin: { left: px(6) } }} textWrap="nowrap" />
    </UiEntity>
  )
}
