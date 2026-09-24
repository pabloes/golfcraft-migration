import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { NpcUtilsUi } from 'dcl-npc-toolkit'
import { engine, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { topbarState, formatTopBarTime } from './topbar-state'
import { powerBarState, controlHintState, getColorForPower } from './shoot-hud-state'
import { lobbyHudState, renderCount } from './lobby-hud-state'
import { overlayState } from '../components/ui/overlay'
import { centerPanelState, BANNER_SPRITES, showBanner } from './centerpanel-state'
import { seasonClockState, seasonResultsState, seasonCountdownState } from './season-hud-state'
import { seasonWaitState } from './season-wait-state'
import { seasonNextGameState } from './season-results-state'
// @ts-ignore - common/utils has @ts-nocheck
import { formatTime } from '../../../common/utils'

// SDK6 game.ts called initializeIntroScreen() on startup. It used UICanvas +
// UIImage from the legacy DCL UI; here we port the same flow to ReactEcs.

const ui = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <LobbyHud />
    <TopBar />
    <PowerBar />
    <ControlHint />
    <GameFooter />
    <SeasonClock />
    <SeasonResults />
    <IntroScreen />
    <NpcUtilsUi />
    <Overlay />
    {/* These three sit AFTER <Overlay /> on purpose: later siblings paint on
        top, and all of them are meant to be read WHILE the screen is faded to
        black. season-demo fades in before joining the room and only fades out
        once the course is ready, so a wait screen rendered before the overlay
        is invisible — the player just sees ~10s of black while the server picks
        the 4 courses and queries the ghosts. Same for the between-round
        scoreboard, which is shown before the fade-out. */}
    <SeasonWait />
    <SeasonNextGame />
    <CenterPopup />
    <SeasonCountdown />
  </UiEntity>
)

// Season in-game HUD (SDK6 ingame-ui.ts + the module-level `cdText`).
// The countdown sits after the overlay so it stays readable over the fade,
// mirroring SDK6 where cdText was its own top-level UIText.
const SeasonClock = () => {
  if (!seasonClockState.visible) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 70, left: '50%' }, width: 200, height: 50 }}
    >
      <Label value={formatTime(seasonClockState.ms)} fontSize={40} textAlign="middle-center" color={Color4.White()} />
    </UiEntity>
  )
}

// A party run shows up to 4 players + 3 ghosts, so the panel grows with the rows.
const SeasonResults = () => {
  if (!seasonResultsState.visible || !seasonResultsState.rows.length) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, right: 0 },
        width: 260,
        height: 10 + seasonResultsState.rows.length * 15
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.2) }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%', height: '100%' }}>
        {seasonResultsState.rows.map((row, i) => (
          <Label
            key={i}
            value={row}
            fontSize={11}
            font="monospace"
            textAlign="middle-right"
            color={Color4.White()}
            uiTransform={{ width: '100%', height: 15 }}
          />
        ))}
      </UiEntity>
    </UiEntity>
  )
}

// SDK6 season-game-countdown.ts: the pre-round lobby screen. Its 4 UIImages
// were fed by AvatarTexture; SDK7 exposes the same thing through uiBackground's
// avatarTexture, so each row is an avatar head plus the display name.
const SeasonWait = () => {
  if (!seasonWaitState.visible) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 40, left: '50%' },
          width: 320,
          height: 420,
          flexDirection: 'column'
        }}
      >
        <Label value={seasonWaitState.title} fontSize={16} textAlign="middle-center" color={Color4.White()} />
        {seasonWaitState.info ? (
          <Label
            value={seasonWaitState.info}
            fontSize={13}
            textAlign="middle-center"
            color={Color4.White()}
            uiTransform={{ width: '100%', height: 20 }}
          />
        ) : null}
        {seasonWaitState.onStart ? (
          <UiEntity
            uiTransform={{ width: 100, height: 26, alignSelf: 'center', margin: { bottom: 4 } }}
            uiBackground={{ color: Color4.create(0.1, 0.5, 0.1, 0.8) }}
            onMouseDown={() => seasonWaitState.onStart && seasonWaitState.onStart()}
          >
            <Label value="START" fontSize={12} textAlign="middle-center" color={Color4.White()} />
          </UiEntity>
        ) : null}
        <UiEntity
          uiTransform={{ width: 100, height: 26, alignSelf: 'center', margin: { bottom: 8 } }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
          onMouseDown={() => seasonWaitState.onCancel && seasonWaitState.onCancel()}
        >
          <Label value="CANCEL" fontSize={12} textAlign="middle-center" color={Color4.White()} />
        </UiEntity>
        {seasonWaitState.players.map((p, i) => (
          <UiEntity key={i} uiTransform={{ width: '100%', height: 72, flexDirection: 'row' }}>
            <UiEntity
              uiTransform={{ width: 64, height: 64 }}
              uiBackground={{ avatarTexture: { userId: p.userId } }}
            />
            <Label
              value={p.displayName}
              fontSize={14}
              textAlign="middle-left"
              color={Color4.White()}
              uiTransform={{ width: 220, height: 64 }}
            />
          </UiEntity>
        ))}
      </UiEntity>
      {seasonWaitState.sub ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 20, left: 20 }, width: 600, height: 30 }}>
          <Label value={seasonWaitState.sub} fontSize={14} textAlign="bottom-left" color={Color4.create(1, 0, 1, 1)} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

// SDK6 season-next-game-ui.ts: between-rounds and end-of-run scoreboard.
const SeasonNextGame = () => {
  if (!seasonNextGameState.visible) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 20, left: '50%' },
        width: 520,
        height: 520,
        flexDirection: 'column'
      }}
    >
      <Label
        value={seasonNextGameState.title}
        fontSize={40}
        textAlign="top-center"
        color={Color4.White()}
        uiTransform={{ width: '100%', height: 60 }}
      />
      {seasonNextGameState.rows.map((row, i) => (
        <Label
          key={i}
          value={row.text}
          fontSize={16}
          font="monospace"
          textAlign="middle-left"
          color={row.highlight ? Color4.create(1, 1, 0, 1) : Color4.White()}
          uiTransform={{ width: '100%', height: 26 }}
        />
      ))}
      {seasonNextGameState.extra ? (
        <Label
          value={seasonNextGameState.extra}
          fontSize={14}
          textAlign="top-left"
          color={Color4.White()}
          uiTransform={{ width: '100%', height: 260, margin: { top: 12 } }}
        />
      ) : null}
    </UiEntity>
  )
}

const SeasonCountdown = () => {
  if (!seasonCountdownState.visible || !seasonCountdownState.text) return null
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 60, left: 0 }, width: '100%', height: 120 }}>
      <Label
        value={seasonCountdownState.text}
        fontSize={60}
        textAlign="top-center"
        color={Color4.White()}
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  )
}

// SDK6 game-ui.ts: a discreet bottom-right footer naming the course being
// played (courseName || courseId, + "by author" if set), visible only while
// playing. golfplay-client sets globalStore.game.courseName when the course
// loads. ReactEcs re-renders each frame, so we just poll the game store here
// (our globalStore.onChange is a no-op stub).
const GameFooter = () => {
  const gs = globalStore.game.getState()
  const name = gs.courseName || gs.courseId
  if (!gs.playing || !name) return null
  const text = gs.courseAuthor ? `${name}\nby ${gs.courseAuthor}` : String(name)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 20, right: 20 },
        width: 200,
        height: 32,
        padding: { left: 10, right: 6 },
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
    >
      <Label value={text} fontSize={14} color={Color4.White()} textAlign="middle-left" />
    </UiEntity>
  )
}

// Full-screen black fade overlay for the mission start/end cinematic. Driven by
// overlayState (alpha 0..1) animated in components/ui/overlay.ts. Rendered last
// so it covers the whole UI while fading.
const Overlay = () => {
  if (!overlayState.visible) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
      uiBackground={{ color: Color4.create(0, 0, 0, overlayState.alpha) }}
    />
  )
}

// Center popup banner (READY / GO! / SUCCESS / FAILED / TIMEOUT). SDK6
// centerpanel sprites, shown at 1/2 scale, centered. Rendered on top of the
// overlay so READY shows over the black fade at mission start.
const CenterPopup = () => {
  const banner = centerPanelState.banner
  if (!banner) return null
  const [l, t, w, h] = BANNER_SPRITES[banner]
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: w / 2, height: h / 2, margin: { bottom: 140 } }}
        uiBackground={{
          texture: { src: 'images/ui-spritesheet.png' },
          textureMode: 'stretch',
          uvs: spriteUvs(l, t, w, h, ATLAS)
        }}
      />
    </UiEntity>
  )
}

// SDK6 lobby HUD ported with the same atlas crops from
// images/ui-spritesheet.png (2048x2048). Layout taken from
// lobby-ui-elements-def.ts (materialsDef + mainBarDef):
//   - Materials panel:  atlas (1360, 1797, 564x183), shown at 1/1.5 scale
//   - Player XP panel:  atlas (1587, 1697, 342x82),  shown at 1/1.5 scale
//   - Right vertical strip container: atlas (1938, 0, 111x1071), 1/1.5 scale
// The materials sprite already has all the resource icons baked in; we only
// overlay the numeric counters on top at the matching grid positions.

const ATLAS = 2048
const SCALE = 1 / 1.5

// Numeric counters are positioned over the icon slots in the materials panel.
// Order matches the SDK6 materialsDef grid (4 columns × 2 rows).
const MATERIAL_PANEL_W = 564 * SCALE
const MATERIAL_PANEL_H = 183 * SCALE
const PLAYER_PANEL_W = 342 * SCALE
const PLAYER_PANEL_H = 82 * SCALE
const STRIP_W = 111 * SCALE
const STRIP_H = 1071 * SCALE

const LobbyHud = () => {
  if (!lobbyHudState.visible) return null
  const r = lobbyHudState.resources

  // The materials panel sprite (1360,1797,564x183) has all icons baked in:
  // 2 rows of PlayFab materials on top, then a "BLOCKCHAIN MATERIALS" sub-panel
  // with 5 more icons. SDK6 (materialsDef) overlaid every material's number next
  // to its icon in this ONE panel — NOT a separate panel. We mirror that: each
  // number is absolute-positioned (panel-relative px) over its icon.
  // Each number is RIGHT-aligned: the value's right edge sits at the given x
  // (just left of its icon), so 1- and 4-digit values share the same right edge
  // and hug the icon consistently. The x arrays below are those right edges.
  // Measured from the sprite: each x = icon's left edge − 5px gap (panel px),
  // each y = row's icon vertical centroid − 13 (half the 26px cell).
  const colXs = [95, 172, 252, 332]  // PlayFab cols: GC/DM/WD/IR · FT/PT/ST/GD
  const rowYs = [8, 34]              // PlayFab rows
  // Blockchain row (DMChain, Planks, StoneBlocks, IronBars, GoldBars) — 5 icons
  // in the lower sub-panel (SDK6 materialsDef y=-156).
  const bcColXs = [49, 109, 170, 243, 299]
  const bcRowY = 85
  const CELL_W = 64
  // Right-align by pushing the (shrink-wrapped) Label to the right edge of the
  // cell with flexbox — textAlign alone doesn't position a content-sized label.
  // So the number's right edge lands exactly at rightX (just left of its icon).
  const cellAt = (rightX: number, top: number, value: number) => (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top, left: rightX - CELL_W },
        width: CELL_W,
        height: 26,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
    >
      <Label
        value={renderCount(value, r.loaded)}
        fontSize={13}
        color={Color4.Black()}
      />
    </UiEntity>
  )
  const cell = (col: number, row: number, value: number) => cellAt(colXs[col], rowYs[row], value)

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Vertical right strip background. */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 72, right: 0 },
          width: STRIP_W,
          height: STRIP_H
        }}
        uiBackground={{
          texture: { src: 'images/ui-spritesheet.png' },
          textureMode: 'stretch',
          uvs: spriteUvs(1938, 0, 111, 1071, ATLAS)
        }}
      />

      {/* Materials panel with icons (resources counters overlaid). */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 80, right: STRIP_W + 4 },
          width: MATERIAL_PANEL_W,
          height: MATERIAL_PANEL_H
        }}
        uiBackground={{
          texture: { src: 'images/ui-spritesheet.png' },
          textureMode: 'stretch',
          uvs: spriteUvs(1360, 1797, 564, 183, ATLAS)
        }}
      >
        {/* Row 1: GC, DM, WD, IR (SDK6 materialsDef y=-78) */}
        {cell(0, 0, r.GC)}
        {cell(1, 0, r.DM)}
        {cell(2, 0, r.WD)}
        {cell(3, 0, r.IR)}
        {/* Row 2: FT, PT, ST, GD (SDK6 materialsDef y=-104) */}
        {cell(0, 1, r.FT)}
        {cell(1, 1, r.PT)}
        {cell(2, 1, r.ST)}
        {cell(3, 1, r.GD)}
        {/* Row 3: blockchain materials over the "BLOCKCHAIN MATERIALS" sub-panel
            baked into the same sprite (SDK6 materialsDef y=-156). */}
        {cellAt(bcColXs[0], bcRowY, r.DMChain)}
        {cellAt(bcColXs[1], bcRowY, r.Planks)}
        {cellAt(bcColXs[2], bcRowY, r.StoneBlocks)}
        {cellAt(bcColXs[3], bcRowY, r.IronBars)}
        {cellAt(bcColXs[4], bcRowY, r.GoldBars)}
      </UiEntity>

      {/* Player XP panel. The background sprite (1587,1697,342x82) bakes in the
          "PLAYER" title and the empty progress-bar track. We overlay the orange
          fill bar (sprite 1886,1998,4x22 stretched to levelPct% of the track)
          plus "Lv. NN" / "NN%" text — mirroring SDK6 createPlayerPanel. Track
          measured at panel px ~x68..207, y25..41 (full bar width ≈ 139). */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 6, right: STRIP_W + 4 },
          width: PLAYER_PANEL_W,
          height: PLAYER_PANEL_H
        }}
        uiBackground={{
          texture: { src: 'images/ui-spritesheet.png' },
          textureMode: 'stretch',
          uvs: spriteUvs(1587, 1697, 342, 82, ATLAS)
        }}
      >
        {/* orange/yellow gradient fill, width = levelPct% of the track */}
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 26, left: 68 },
            width: Math.max(1, (139 * (r.loaded ? r.levelPct : 0)) / 100),
            height: 14
          }}
          uiBackground={{
            texture: { src: 'images/ui-spritesheet.png' },
            textureMode: 'stretch',
            uvs: spriteUvs(1886, 1998, 4, 22, ATLAS)
          }}
        />
        {/* Lv. NN — left of the track */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 24, left: 8 }, width: 58, height: 18 }}>
          <Label value={`Lv. ${r.loaded ? String(r.level).padStart(2, '0') : '-'}`} fontSize={13} color={Color4.Black()} textAlign="middle-left" />
        </UiEntity>
        {/* NN% — right end, over the track tail */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 24, right: 8 }, width: 44, height: 18 }}>
          <Label value={`${r.loaded ? String(r.levelPct).padStart(2, '0') : '-'}%`} fontSize={13} color={Color4.Black()} textAlign="middle-right" />
        </UiEntity>
      </UiEntity>

      {/* Golf club card over the strip's golfclub box (SDK6 golfClubThumbnailDef
          /golfClubNameDef + mainBarDef GolfClubPower/Control/Aim at y≈-215).
          Active club from activeGolfClubTokenId; NFT clubs assumed 5/5/5. */}
      {r.golfclub && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 228, right: 17 }, width: 40, height: 40 }}
          uiBackground={{ texture: { src: `images/${r.golfclub.id}.png` }, textureMode: 'stretch' }}
        />
      )}
      {r.golfclub && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 270, right: 4 }, width: STRIP_W - 8, height: 14, justifyContent: 'center', alignItems: 'center' }}
        >
          <Label value={r.golfclub.name} fontSize={9} color={Color4.Black()} textAlign="middle-center" />
        </UiEntity>
      )}
      {/* Power / Control / Aim numbers — each CENTERED on its baked-in icon
          (lightning/hand/target). The strip sprite (111px) is stretched to
          STRIP_W (74px) = ×0.667, so the icons (source-x 25/52/85) sit at
          74−x·0.667 = 57/39/17 px from the right. A 20px box centered on each
          → right = dist−10 = 47/29/7. (NOT SDK6's raw mainBarDef x — SDK7
          doesn't map 1:1.) */}
      {r.golfclub && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 303, right: 43 }, width: 20, height: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Label value={String(r.golfclub.power)} fontSize={11} color={Color4.Black()} textAlign="middle-center" />
        </UiEntity>
      )}
      {r.golfclub && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 303, right: 29 }, width: 20, height: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Label value={String(r.golfclub.control)} fontSize={11} color={Color4.Black()} textAlign="middle-center" />
        </UiEntity>
      )}
      {r.golfclub && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 303, right: 13 }, width: 20, height: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Label value={String(r.golfclub.aim)} fontSize={11} color={Color4.Black()} textAlign="middle-center" />
        </UiEntity>
      )}
      {/* BONUS % box: TrainingBonus next to the dumbbell (SDK6 [-14,-270]),
          FarmingBonus next to the pickaxe (SDK6 [-14,-287], always 0). */}
      {r.loaded && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 365, right: 8 }, width: 44, height: 16, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row' }}
        >
          <Label value={`${r.bonus}%`} fontSize={11} color={Color4.Black()} />
        </UiEntity>
      )}
      {r.loaded && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 381, right: 8 }, width: 44, height: 16, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row' }}
        >
          <Label value={`${r.farmingBonus}%`} fontSize={11} color={Color4.Black()} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

// Vertical HUD bar on the right showing aim power. SDK6 placed it at
// (-20, -80) from top-right with size 20x200; the inner value rect shrinks
// from full height to 2px as power drops and tints green->yellow->red.
const BAR_SIZE = 200

const PowerBar = () => {
  if (!powerBarState.visible) return null
  const fillHeight = Math.max(2, (BAR_SIZE * powerBarState.power) / 100)
  const { r, g, b } = getColorForPower(powerBarState.power)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 80, right: 20 },
        width: 20,
        height: BAR_SIZE,
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.3) }}
    >
      <UiEntity
        uiTransform={{
          width: 16,
          height: fillHeight,
          margin: { bottom: 2 }
        }}
        uiBackground={{ color: Color4.create(r, g, b, 1) }}
      />
    </UiEntity>
  )
}

// Crop a sub-rectangle out of a spritesheet via uvs. ReactEcs renders the
// quad with the empirically-working corner order BL, TL, TR, BR (V=1 at the
// top of the atlas image, U increases left-to-right). The previous BR/TR/TL/BL
// order fixed the vertical flip but produced a horizontal mirror; swapping to
// BL/TL/TR/BR (same V semantics, opposite U traversal) renders correctly.
const spriteUvs = (
  pixelLeft: number,
  pixelTop: number,
  pixelWidth: number,
  pixelHeight: number,
  atlasSize: number
): number[] => {
  const uL = pixelLeft / atlasSize
  const uR = (pixelLeft + pixelWidth) / atlasSize
  const vT = 1 - pixelTop / atlasSize
  const vB = 1 - (pixelTop + pixelHeight) / atlasSize
  return [uL, vB, uL, vT, uR, vT, uR, vB]
}

const SHEET_LEFTS = [0, 309]

const uvsForStep = (step: number): number[] =>
  spriteUvs(SHEET_LEFTS[step] || 0, 235, 308, 200, 1024)

const ControlHint = () => {
  if (!controlHintState.visible) return null
  const w = 308 / 1.5
  const h = 200 / 1.5
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 70, right: 20 },
        width: w,
        height: h
      }}
      uiBackground={{
        texture: { src: 'images/spritesheet.png' },
        textureMode: 'stretch',
        uvs: uvsForStep(controlHintState.step)
      }}
    />
  )
}

// HUD timer that the mission countdown / play clock writes to via
// `topbarState`. Mirrors the SDK6 getTopBar()/createTopBar() singleton: the
// container is hidden unless the gameplay flow explicitly shows it, and
// updates happen in-place each render frame.
const TopBar = () => {
  if (!topbarState.visible) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 12, left: 0, right: 0 },
        height: 48,
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 160,
          height: 48,
          padding: 8,
          justifyContent: 'center',
          alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
      >
        <Label value={formatTopBarTime(topbarState.ms)} fontSize={28} color={Color4.White()} />
      </UiEntity>
    </UiEntity>
  )
}

const IntroScreen = () => {
  if (!globalStore.game.getState().introScreen) return null

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      onMouseDown={skipIntro}
    >
      <UiEntity
        uiTransform={{
          width: 708,
          height: 543
        }}
        uiBackground={{
          texture: { src: 'images/intro-screen.png' },
          textureMode: 'stretch'
        }}
      />
    </UiEntity>
  )
}

let systemsRegistered = false

const skipIntro = () => {
  console.log('[ui] skip intro')
  globalStore.game.setState({ introScreen: false })
}

const introInputSystem = () => {
  if (!globalStore.game.getState().introScreen) return
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    skipIntro()
  }
}

// SDK6 lobby-ui-controller: hide HUD while intro screen is showing and while
// the player is in a mission (gameState.playing). Reflect both into the HUD
// state once per frame so the React tree re-renders.
const lobbyHudVisibilitySystem = () => {
  const gs = globalStore.game.getState()
  const visible = !gs.introScreen && !gs.playing && !gs.starting
  if (lobbyHudState.visible !== visible) {
    lobbyHudState.visible = visible
  }
}

// SDK6 centerpanel: READY while gameState.starting is true, GO! (1s) when it
// flips to false (the countdown finished and play begins). Mirror those
// transitions here off the gameState.starting flag.
let prevStarting = false
const centerPanelSystem = () => {
  const starting = !!globalStore.game.getState().starting
  if (starting && !prevStarting) {
    showBanner('ready')
  } else if (!starting && prevStarting) {
    showBanner('go', 1000)
  }
  prevStarting = starting
}

export const setupUI = () => {
  ReactEcsRenderer.setUiRenderer(ui)
  if (!systemsRegistered) {
    engine.addSystem(introInputSystem)
    engine.addSystem(lobbyHudVisibilitySystem)
    engine.addSystem(centerPanelSystem)
    systemsRegistered = true
  }
}
