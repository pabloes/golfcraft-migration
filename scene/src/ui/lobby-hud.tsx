// SDK6 lobby HUD ported with the same atlas crops from
// images/ui-spritesheet.png (2048x2048). Layout taken from
// lobby-ui-elements-def.ts (materialsDef + mainBarDef):
//   - Materials panel:  atlas (1360, 1797, 564x183), shown at 1/1.5 scale
//   - Player XP panel:  atlas (1587, 1697, 342x82),  shown at 1/1.5 scale
//   - Right vertical strip container: atlas (1938, 0, 111x1071), 1/1.5 scale
// The materials sprite already has all the resource icons baked in; we only
// overlay the numeric counters on top at the matching grid positions.
//
// Every size and position below is the SDK6 one in design px, multiplied by
// the contain scale (ui-scale.ts) so the HUD keeps its proportion on any
// screen, and the whole thing is anchored to the top-right corner of the
// explorer's interactable area. The UV crops do not change.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { lobbyHudState, renderCount, DailyMissionsData } from './lobby-hud-state'
import { ATLAS, spriteUvs } from './sprites'
import { hudScale, scaler, type Px } from './ui-scale'
import { isMobile } from '../services/platform'
import { C, ExpandIcon, pointerState, pressable } from './ui-theme'
import { lobbyMenuState, openLobbyMenu } from './lobby-menu-state'
import { pingLabel } from './ping-label'
import {
  MATERIAL_PANEL_W,
  MATERIAL_PANEL_H,
  PLAYER_PANEL_W,
  PLAYER_PANEL_H,
  STRIP_W,
  STRIP_H,
  STRIP_TOP,
  PLAYER_PANEL_TOP,
  MATERIAL_PANEL_TOP,
  MATERIAL_PANEL_RIGHT,
  HUD_W,
  HUD_H,
  STRIP_TILE_W,
  STRIP_TILE_RIGHT,
  MENU_TILE_TOP,
  MENU_TILE_H
} from './lobby-hud-layout'

const SHEET = { texture: { src: 'images/ui-spritesheet.png' }, textureMode: 'stretch' as const }

// The DAILY MISSIONS box on the strip, measured on the sprite: source rows
// 533..611 of 1071, i.e. design px 355..407 below the strip's top.
const DAILY_BOX_TOP = STRIP_TOP + 355
const DAILY_BOX_H = 52

// SDK6 createDailyMissions: the panel background (atlas 1364,1293,559x388 at
// 1/1.5) sits at right 344 / top 160 from the canvas corner; the list over it
// has 10 px padding and one 40 px state icon per row, 50 px apart.
const DAILY_PANEL_W = 559 / 1.5
const DAILY_PANEL_H = 388 / 1.5
const DAILY_PANEL_RIGHT = 344
const DAILY_PANEL_TOP = 160
const DAILY_ROW_H = 50
const DAILY_ICON: Record<'COMPLETED' | 'ACTIVE' | 'BLOCKED', [number, number, number, number]> = {
  COMPLETED: [1288, 1299, 60, 60],
  ACTIVE: [1288, 1381, 60, 60],
  BLOCKED: [1288, 1459, 60, 60]
}
const DAILY_COLOR = {
  COMPLETED: Color4.create(0x7f / 255, 0xa1 / 255, 0x5b / 255, 1),
  ACTIVE: Color4.create(0x2c / 255, 0x64 / 255, 0xce / 255, 1),
  BLOCKED: Color4.create(0x99 / 255, 0x99 / 255, 0x99 / 255, 1)
}

// "WD:10 FT:10", like SDK6's serializeRecipe.
const rewardsText = (rewards: Record<string, number> | null) =>
  rewards
    ? Object.keys(rewards)
        .filter((k) => rewards[k])
        .map((k) => `${k}:${rewards[k]}`)
        .join(' ')
    : ''

const toggleDailyMissions = () => {
  lobbyHudState.dailyMissionsOpen = !lobbyHudState.dailyMissionsOpen
}

const DailyMissionsPanel = ({ data, px, fs }: { data: DailyMissionsData | null; px: Px; fs: Px }) => {
  const missions = data?.state?.missions || []
  const index = data ? data.dailyMissionIndex : 0
  const step = data ? data.dailyMissionStep : 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: px(DAILY_PANEL_TOP), right: px(DAILY_PANEL_RIGHT) },
        width: px(DAILY_PANEL_W),
        height: px(DAILY_PANEL_H)
      }}
      uiBackground={{ ...SHEET, uvs: spriteUvs(1364, 1293, 559, 388, ATLAS) }}
    >
      {missions.length === 0 ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: px(10), left: px(10) }, width: px(300), height: px(30) }}>
          <Label value="No daily missions today" fontSize={fs(14)} color={Color4.Black()} textAlign="middle-left" textWrap="nowrap" />
        </UiEntity>
      ) : null}
      {missions.slice(0, 5).map((m, i) => {
        const status = i === index ? 'ACTIVE' : i > index ? 'BLOCKED' : 'COMPLETED'
        const [l, t, w, h] = DAILY_ICON[status]
        const progress = status === 'ACTIVE' && step ? ` (${step})` : ''
        return (
          <UiEntity
            key={m.alias + i}
            uiTransform={{
              positionType: 'absolute',
              position: { top: px(8 + i * DAILY_ROW_H), left: px(10) },
              width: px(DAILY_PANEL_W - 20),
              height: px(DAILY_ROW_H - 4),
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            <UiEntity uiTransform={{ flexGrow: 1, height: '100%', flexDirection: 'column', justifyContent: 'center' }}>
              <Label value={`${m.description}${progress}`} fontSize={fs(14)} color={DAILY_COLOR[status]} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20) }} />
              <Label value={`Rewards: ${rewardsText(m.rewards)}`} fontSize={fs(12)} color={DAILY_COLOR[status]} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(18) }} />
            </UiEntity>
            <UiEntity uiTransform={{ width: px(40), height: px(40), margin: { left: px(6) } }} uiBackground={{ ...SHEET, uvs: spriteUvs(l, t, w, h, ATLAS) }} />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

export const LobbyHud = () => {
  if (!lobbyHudState.visible) return null
  const r = lobbyHudState.resources
  const hud = hudScale()
  const canvas = hud.canvas
  // Phones: the contain scale (and the interactable area the explorer
  // reports) leave the sprite panels unreadable and short of the right edge.
  // There the strip takes the whole height and sits flush right; its column
  // is clear of the explorer's buttons, which end well before the edge.
  const mobile = isMobile()
  const s = mobile ? scaler(Math.min(1, (canvas.height - 16) / HUD_H)) : hud.s
  const { px, fs } = s

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
  const colXs = [95, 172, 252, 332] // PlayFab cols: GC/DM/WD/IR · FT/PT/ST/GD
  const rowYs = [8, 34] // PlayFab rows
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
        position: { top: px(top), left: px(rightX - CELL_W) },
        width: px(CELL_W),
        height: px(26),
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
    >
      <Label value={renderCount(value, r.loaded)} fontSize={fs(13)} color={Color4.Black()} textWrap="nowrap" />
    </UiEntity>
  )
  const cell = (col: number, row: number, value: number) => cellAt(colXs[col], rowYs[row], value)

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: mobile ? { top: 8, right: 8 } : { top: canvas.area.top, right: canvas.area.right },
        // Wide enough for the daily missions panel, which opens to the left
        // of the strip; the MENU button still aligns to HUD_W.
        width: px(Math.max(HUD_W, DAILY_PANEL_RIGHT + DAILY_PANEL_W)),
        height: px(HUD_H)
      }}
    >
      {/* MENU tile: the first box of the right column, above the strip, in
          the strip's tile footprint. Yellow with a dark border so it reads as
          an action; it reopens the lobby dialog. */}
      {!lobbyMenuState.visible &&
        pressable(
          {
            id: 'menu',
            width: px(STRIP_TILE_W),
            height: px(MENU_TILE_H - 6),
            color: C.yellow,
            radius: px(10),
            borderWidth: Math.max(2, px(3)),
            borderColor: C.dark,
            shadow: px(6),
            flexDirection: 'column',
            positionType: 'absolute',
            position: { top: px(MENU_TILE_TOP), right: px(STRIP_TILE_RIGHT) },
            onClick: openLobbyMenu
          },
          <ExpandIcon size={px(22)} color={C.dark} />,
          <Label value="MENU" fontSize={fs(11)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16), margin: { top: px(4) } }} />
        )}

      {/* Vertical right strip background. */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: px(STRIP_TOP), right: 0 },
          width: px(STRIP_W),
          height: px(STRIP_H)
        }}
        uiBackground={{ ...SHEET, uvs: spriteUvs(1938, 0, 111, 1071, ATLAS) }}
      />

      {/* Materials panel with icons (resources counters overlaid). SDK6 showed
          either this or the daily missions panel (state.open 1 / 2), never
          both: they overlap. */}
      {!lobbyHudState.dailyMissionsOpen && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: px(MATERIAL_PANEL_TOP), right: px(MATERIAL_PANEL_RIGHT) },
          width: px(MATERIAL_PANEL_W),
          height: px(MATERIAL_PANEL_H)
        }}
        uiBackground={{ ...SHEET, uvs: spriteUvs(1360, 1797, 564, 183, ATLAS) }}
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
      )}

      {/* Player XP panel. The background sprite (1587,1697,342x82) bakes in the
          "PLAYER" title and the empty progress-bar track. We overlay the orange
          fill bar (sprite 1886,1998,4x22 stretched to levelPct% of the track)
          plus "Lv. NN" / "NN%" text — mirroring SDK6 createPlayerPanel. Track
          measured at panel px ~x68..207, y25..41 (full bar width ≈ 139). */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: px(PLAYER_PANEL_TOP), right: px(MATERIAL_PANEL_RIGHT) },
          width: px(PLAYER_PANEL_W),
          height: px(PLAYER_PANEL_H)
        }}
        uiBackground={{ ...SHEET, uvs: spriteUvs(1587, 1697, 342, 82, ATLAS) }}
      >
        {/* orange/yellow gradient fill, width = levelPct% of the track */}
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: px(26), left: px(68) },
            width: Math.max(1, px((139 * (r.loaded ? r.levelPct : 0)) / 100)),
            height: px(14)
          }}
          uiBackground={{ ...SHEET, uvs: spriteUvs(1886, 1998, 4, 22, ATLAS) }}
        />
        {/* Lv. NN — left of the track */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: px(24), left: px(8) }, width: px(58), height: px(18) }}>
          <Label
            value={`Lv. ${r.loaded ? String(r.level).padStart(2, '0') : '-'}`}
            fontSize={fs(13)}
            color={Color4.Black()}
            textAlign="middle-left"
            textWrap="nowrap"
          />
        </UiEntity>
        {/* NN% — right end, over the track tail */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: px(24), right: px(8) }, width: px(44), height: px(18) }}>
          <Label
            value={`${r.loaded ? String(r.levelPct).padStart(2, '0') : '-'}%`}
            fontSize={fs(13)}
            color={Color4.Black()}
            textAlign="middle-right"
            textWrap="nowrap"
          />
        </UiEntity>
      </UiEntity>

      {/* Round trip to the game server, under the player panel. */}
      {pingLabel(px, fs, 10, {
        positionType: 'absolute',
        position: { top: px(PLAYER_PANEL_TOP + PLAYER_PANEL_H + 2), right: px(MATERIAL_PANEL_RIGHT + 4) }
      })}

      {/* Golf club card over the strip's golfclub box (SDK6 golfClubThumbnailDef
          /golfClubNameDef + mainBarDef GolfClubPower/Control/Aim at y≈-215).
          Active club from activeGolfClubTokenId; NFT clubs assumed 5/5/5. */}
      {r.golfclub && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: px(228), right: px(17) }, width: px(40), height: px(40) }}
          uiBackground={{ texture: { src: `images/${r.golfclub.id}.png` }, textureMode: 'stretch' }}
        />
      )}
      {r.golfclub && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: px(270), right: px(4) },
            width: px(STRIP_W - 8),
            height: px(14),
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Label value={r.golfclub.name} fontSize={fs(9)} color={Color4.Black()} textAlign="middle-center" textWrap="nowrap" />
        </UiEntity>
      )}
      {/* Power / Control / Aim numbers — each CENTERED on its baked-in icon
          (lightning/hand/target). The strip sprite (111px) is stretched to
          STRIP_W (74px) = ×0.667, so the icons (source-x 25/52/85) sit at
          74−x·0.667 = 57/39/17 px from the right. A 20px box centered on each
          → right = dist−10 = 47/29/7. (NOT SDK6's raw mainBarDef x — SDK7
          doesn't map 1:1.) */}
      {r.golfclub &&
        [
          { right: 43, value: r.golfclub.power },
          { right: 29, value: r.golfclub.control },
          { right: 13, value: r.golfclub.aim }
        ].map((attr) => (
          <UiEntity
            key={attr.right}
            uiTransform={{
              positionType: 'absolute',
              position: { top: px(303), right: px(attr.right) },
              width: px(20),
              height: px(16),
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <Label value={String(attr.value)} fontSize={fs(11)} color={Color4.Black()} textAlign="middle-center" textWrap="nowrap" />
          </UiEntity>
        ))}
      {/* DAILY MISSIONS box on the strip: SDK6 drew an invisible click area
          over it (and shipped with the handler commented out). It toggles the
          panel; a faint tint shows hover and press. */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: px(DAILY_BOX_TOP), right: 0 }, width: px(STRIP_W), height: px(DAILY_BOX_H) }}
        uiBackground={{
          color:
            pointerState.pressed === 'daily-missions'
              ? Color4.create(1, 0.82, 0.12, 0.45)
              : pointerState.hovered === 'daily-missions' || lobbyHudState.dailyMissionsOpen
              ? Color4.create(1, 0.82, 0.12, 0.25)
              : Color4.create(1, 1, 1, 0)
        }}
        onMouseEnter={() => {
          pointerState.hovered = 'daily-missions'
        }}
        onMouseLeave={() => {
          if (pointerState.hovered === 'daily-missions') pointerState.hovered = null
          if (pointerState.pressed === 'daily-missions') pointerState.pressed = null
        }}
        onMouseDown={() => {
          pointerState.pressed = 'daily-missions'
          toggleDailyMissions()
        }}
        onMouseUp={() => {
          if (pointerState.pressed === 'daily-missions') pointerState.pressed = null
        }}
      />
      {lobbyHudState.dailyMissionsOpen ? <DailyMissionsPanel data={lobbyHudState.dailyMissions} px={px} fs={fs} /> : null}
      {/* BONUS % box: TrainingBonus next to the dumbbell (SDK6 [-14,-270]),
          FarmingBonus next to the pickaxe (SDK6 [-14,-287], always 0). */}
      {r.loaded &&
        [
          { top: 365, value: r.bonus },
          { top: 381, value: r.farmingBonus }
        ].map((bonus) => (
          <UiEntity
            key={bonus.top}
            uiTransform={{
              positionType: 'absolute',
              position: { top: px(bonus.top), right: px(8) },
              width: px(44),
              height: px(16),
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexDirection: 'row'
            }}
          >
            <Label value={`${bonus.value}%`} fontSize={fs(11)} color={Color4.Black()} textWrap="nowrap" />
          </UiEntity>
        ))}
    </UiEntity>
  )
}
