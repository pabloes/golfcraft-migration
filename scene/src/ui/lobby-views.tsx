// The lobby dialog's sub-views, after the design canvas: TUTORIAL
// (Story.dc.html), WORKSHOP (Workshop.dc.html) and PRIZES (Prizes.dc.html).
// Same 1280x720 contained panel as the lobby view; each one is tinted with
// its card's colour and has the back button top-left. They only read the
// scene's state and call the handlers the 3D lobby already uses.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState, showLobbyView, closeLobbyMenu, SeasonPrize } from './lobby-menu-state'
import { C, hex, fmt, shortName, pressable, counter, materialIcon, title } from './ui-theme'
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px, type Layout } from './ui-scale'
import { talkToNpc } from '../components/lobby/npc-storymode/npc-storymode'
import { getGolfclubCollection, selectGolfclub, upgradeGolfclubAttribute } from '../components/lobby/lobby-training'
import { BoardGolfclub } from '../components/lobby/golfclub-screen/golfclub-screen-ui'
import { GOLF_CLUB_NAMES, getPlayFabId } from '../meta/bootstrap'
import {
  aimLengths,
  devianceFactorLevels,
  maxPowerByGolfclubLevel,
  MAX_DEGREES_DEVIANCE
} from '../../golfplay/src/components/shoot-control'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getLevelInfo, getPointsToTier, getTierFromSub } from '../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIER_COLORS } from '../../../common/constants'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const MARGIN = 16

// ---------------------------------------------------------------------------
// Shared pieces

const screen = (L: Layout, px: Px, bg: Color4, children: ReactEcs.JSX.Element[]) => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }} uiBackground={{ color: C.backdrop }}>
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: L.left, top: L.top },
        width: L.panelW,
        height: L.panelH,
        flexDirection: 'column',
        padding: { top: px(22), bottom: px(24), left: px(28), right: px(28) },
        borderRadius: px(24),
        borderWidth: Math.max(2, px(4)),
        borderColor: C.dark
      }}
      uiBackground={{ color: bg }}
    >
      {children}
    </UiEntity>
  </UiEntity>
)

const backButton = (px: Px, fs: Px) =>
  pressable(
    {
      id: 'view-back',
      width: px(60),
      height: px(60),
      color: C.white,
      radius: px(18),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.dark,
      shadow: px(6),
      onClick: () => showLobbyView('lobby')
    },
    <Label value="<" fontSize={fs(30)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: px(60), height: px(60) }} />
  )

const header = (px: Px, fs: Px, text: string, color: Color4, rest: ReactEcs.JSX.Element[], iconSrc?: string) => (
  <UiEntity uiTransform={{ width: '100%', height: px(66), flexDirection: 'row', alignItems: 'center' }}>
    {backButton(px, fs)}
    <UiEntity uiTransform={{ width: px(18) }} />
    {iconSrc ? (
      <UiEntity
        uiTransform={{ width: px(56), height: px(56), margin: { right: px(14) }, borderRadius: px(16), borderWidth: Math.max(1, px(3)), borderColor: C.dark, padding: px(3) }}
        uiBackground={{ color: C.dark }}
      >
        <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: iconSrc }, textureMode: 'stretch' }} />
      </UiEntity>
    ) : null}
    {title(fs, text, 48, px(64), color)}
    <UiEntity uiTransform={{ width: px(18) }} />
    {rest}
  </UiEntity>
)

const tag = (px: Px, fs: Px, text: string, bg: Color4, color: Color4, bordered = false) => (
  <UiEntity
    uiTransform={{
      height: px(38),
      padding: { left: px(14), right: px(14) },
      borderRadius: px(12),
      borderWidth: bordered ? Math.max(1, px(3)) : 0,
      borderColor: C.dark,
      justifyContent: 'center'
    }}
    uiBackground={{ color: bg }}
  >
    <Label value={text} fontSize={fs(18)} color={color} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(38) }} />
  </UiEntity>
)

const panelFrame = (px: Px, extra: { width?: number | `${number}%`; height?: number | `${number}%`; grow?: boolean; margin?: any; padding?: any; column?: boolean; align?: 'center' }, bg: Color4, children: ReactEcs.JSX.Element[]) => (
  <UiEntity
    uiTransform={{
      width: extra.width,
      height: extra.height,
      flexGrow: extra.grow ? 1 : undefined,
      flexDirection: extra.column === false ? 'row' : 'column',
      alignItems: extra.align,
      margin: extra.margin,
      padding: extra.padding,
      borderRadius: px(26),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.dark
    }}
    uiBackground={{ color: bg }}
  >
    {children}
  </UiEntity>
)

// ---------------------------------------------------------------------------
// TUTORIAL

const TUTORIAL_STEPS = 9
const NODE_LABELS = ['Welcome, intern', 'Sphere 1 of 4', 'Sphere 2 of 4', 'Sphere 3 of 4', 'Sphere 4 of 4', 'Secret emote', 'Sharpen your aim', 'Play ranked', 'Reach STONE']
// One line per mission for Dr. Par's panel: a summary, not the dialog.
const MISSION_LINES: Record<number, string> = {
  1: 'Welcome, intern! Grab a club and play your first hole.',
  2: 'Four energy spheres escaped to ancient Egypt. Let us catch the first one.',
  3: 'One sphere down. Ready to retrieve the second?',
  4: 'Two spheres! You are getting good at this! Going to retrieve one more?',
  5: 'Three caught. One last sphere and the lab is safe.',
  6: 'You did it! Come and get your secret Golfcraft greeting emote.',
  7: 'Sharpen your aim: the workshop screen upgrades your golf club.',
  8: 'You are ready to compete. Play Season and reach STONE rank.',
  9: 'Congrats on STONE rank! Your NFT wearable is on its way.'
}
// Node centres on the map (Story.dc.html's 868x364 drawing).
const NODE_X = [62, 155, 248, 341, 434, 527, 620, 713, 806]
const NODE_Y = (i: number) => (i % 2 === 0 ? 250 : 130)
const SAND = hex('#F2C46B')
const SAND_DARK = hex('#D9A54C')
const SAND_PATH = hex('#D49B3C')
const SAND_TEXT = hex('#5B3A08')

const mapNode = (px: Px, fs: Px, i: number, mission: number, done: boolean) => {
  const n = i + 1
  const status = done || n < mission ? 'done' : n === mission ? 'current' : 'pending'
  const size = status === 'current' ? 96 : 64
  const cx = NODE_X[i]
  const cy = NODE_Y(i)
  const upper = i % 2 === 1
  return [
    <UiEntity
      key={`node-${i}`}
      uiTransform={{
        positionType: 'absolute',
        position: { left: px(cx - size / 2), top: px(cy - size / 2) },
        width: px(size),
        height: px(size),
        borderRadius: px(size / 2),
        borderWidth: Math.max(2, px(status === 'current' ? 5 : 4)),
        borderColor: status === 'current' ? C.white : C.dark,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: status === 'done' ? C.yellow : status === 'current' ? C.hotPink : SAND_DARK }}
    >
      {status === 'current' ? (
        <Label value={String(n)} fontSize={fs(44)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(size) }} />
      ) : status === 'done' ? (
        <UiEntity uiTransform={{ width: px(22), height: px(22), borderRadius: px(11) }} uiBackground={{ color: C.dark }} />
      ) : (
        <UiEntity uiTransform={{ width: px(20), height: px(16), borderRadius: px(4), margin: { top: px(6) } }} uiBackground={{ color: C.dark }} />
      )}
    </UiEntity>,
    <UiEntity
      key={`label-${i}`}
      uiTransform={{ positionType: 'absolute', position: { left: px(cx - 70), top: px(upper ? 56 : 292) }, width: px(140), height: px(22), justifyContent: 'center' }}
    >
      <Label
        value={`${n} · ${NODE_LABELS[i]}`}
        fontSize={fs(15)}
        color={status === 'pending' ? SAND_TEXT : C.dark}
        textAlign="middle-center"
        textWrap="nowrap"
        uiTransform={{ height: px(22) }}
      />
    </UiEntity>,
    status === 'current' ? (
      <UiEntity
        key={`here-${i}`}
        uiTransform={{ positionType: 'absolute', position: { left: px(cx - 70), top: px(upper ? 14 : 172) }, width: px(140), height: px(30), justifyContent: 'center' }}
      >
        <UiEntity uiTransform={{ height: px(30), padding: { left: px(12), right: px(12) }, borderRadius: px(10), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
          <Label value="YOU ARE HERE" fontSize={fs(16)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(30) }} />
        </UiEntity>
      </UiEntity>
    ) : null
  ]
}

// The zigzag path as dots between the nodes (no lines in the UI).
const mapPath = (px: Px) => {
  const dots: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < NODE_X.length - 1; i++) {
    for (let k = 1; k < 6; k++) {
      const t = k / 6
      const x = NODE_X[i] + (NODE_X[i + 1] - NODE_X[i]) * t
      const y = NODE_Y(i) + (NODE_Y(i + 1) - NODE_Y(i)) * t
      dots.push(
        <UiEntity key={`dot-${i}-${k}`} uiTransform={{ positionType: 'absolute', position: { left: px(x - 7), top: px(y - 7) }, width: px(14), height: px(14), borderRadius: px(7) }} uiBackground={{ color: SAND_PATH }} />
      )
    }
  }
  return dots
}

export const TutorialView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const mission = Number(globalStore.userData.getState()['statistic_current_mission'] || 1)
  const done = mission > TUTORIAL_STEPS
  const spheres = Math.max(0, Math.min(4, mission - 2))
  const portrait = done || mission === 9 ? 'images/NPC/expresion3.png' : 'images/NPC/expresion1.png'
  const line = done ? 'Tutorial complete. Thank you, intern: the lab is safe again.' : MISSION_LINES[mission] || ''

  return screen(L, px, hex('#5BBE2C'), [
    header(px, fs, 'TUTORIAL', C.white, [
      tag(px, fs, 'Ancient Egypt', SAND, C.dark, true),
      <UiEntity uiTransform={{ flexGrow: 1 }} />,
      tag(px, fs, done ? 'Tutorial complete' : `Mission ${mission} / ${TUTORIAL_STEPS}`, C.dark, C.white)
    ]),
    <UiEntity uiTransform={{ width: '100%', height: px(372), flexDirection: 'row', margin: { top: px(16) } }}>
      {/* Mission map */}
      <UiEntity
        uiTransform={{ flexGrow: 1, height: '100%', borderRadius: px(26), borderWidth: Math.max(2, px(4)), borderColor: C.dark }}
        uiBackground={{ color: SAND }}
      >
        {mapPath(px)}
        {NODE_X.map((_, i) => mapNode(px, fs, i, mission, done))}
      </UiEntity>
      <UiEntity uiTransform={{ width: px(20) }} />
      {/* Energy spheres */}
      {panelFrame(px, { width: px(300), height: '100%', padding: { top: px(20), bottom: px(18), left: px(22), right: px(22) } }, C.teal, [
        <Label value="ENERGY SPHERES" fontSize={fs(28)} color={C.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(34) }} />,
        <Label
          value="Four spheres escaped back to ancient Egypt. Push each one into the hole."
          fontSize={fs(15)}
          color={C.white}
          textAlign="middle-left"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(60), margin: { top: px(8) } }}
        />,
        <UiEntity
          uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: px(12), margin: { top: px(10) }, borderRadius: px(20), borderWidth: Math.max(1, px(3)), borderColor: C.dark }}
          uiBackground={{ color: C.tealDark }}
        >
          {[0, 1, 2, 3].map((i) => (
            <UiEntity
              key={i}
              uiTransform={{ width: '47%', height: px(74), margin: { bottom: px(10) }, borderRadius: px(16), justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: hex('#0A4741') }}
            >
              <UiEntity
                uiTransform={{ width: px(52), height: px(52), borderRadius: px(26), borderWidth: Math.max(2, px(i < spheres ? 4 : 3)), borderColor: i < spheres ? C.dark : hex('#7CF5E6') }}
                uiBackground={{ color: i < spheres ? C.hotPink : C.transparent }}
              />
            </UiEntity>
          ))}
        </UiEntity>,
        <UiEntity uiTransform={{ flexGrow: 1 }} />,
        <Label value={`${spheres} of 4 caught`} fontSize={fs(20)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(28) }} />
      ])}
    </UiEntity>,
    /* Dr. Par */
    panelFrame(px, { width: '100%', grow: true, column: false, margin: { top: px(16) }, padding: { left: px(18), right: px(26) }, align: 'center' }, C.white, [
      <UiEntity
        uiTransform={{ width: px(130), height: px(130), borderRadius: px(65), borderWidth: Math.max(2, px(5)), borderColor: C.dark, padding: px(6) }}
        uiBackground={{ color: C.teal }}
      >
        <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: portrait }, textureMode: 'stretch' }} />
      </UiEntity>,
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(22), right: px(22) } }}>
        <UiEntity uiTransform={{ height: px(28), padding: { left: px(12), right: px(12) }, borderRadius: px(10), justifyContent: 'center', alignSelf: 'flex-start' }} uiBackground={{ color: C.teal }}>
          <Label value="DR. PAR" fontSize={fs(16)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(28) }} />
        </UiEntity>
        <Label value={line} fontSize={fs(22)} color={C.dark} textAlign="middle-left" textWrap="wrap" uiTransform={{ width: '100%', height: px(66), margin: { top: px(8) } }} />
      </UiEntity>,
      done ? (
        <UiEntity uiTransform={{ width: px(220) }} />
      ) : (
        <UiEntity uiTransform={{ width: px(220), flexDirection: 'column' }}>
          {pressable(
            {
              id: 'tutorial-go',
              width: '100%',
              height: px(64),
              color: C.yellow,
              radius: px(18),
              borderWidth: Math.max(2, px(4)),
              borderColor: C.dark,
              shadow: px(7),
              onClick: () => {
                closeLobbyMenu()
                talkToNpc().catch((err) => console.log('[lobby] talkToNpc failed', err))
              }
            },
            <Label value="LET'S GO!" fontSize={fs(30)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(64) }} />
          )}
          {pressable(
            {
              id: 'tutorial-not-now',
              width: '100%',
              height: px(50),
              color: C.white,
              radius: px(16),
              borderWidth: Math.max(2, px(3)),
              borderColor: C.dark,
              shadow: 0,
              margin: { top: px(10) },
              onClick: () => showLobbyView('lobby')
            },
            <Label value="NOT NOW" fontSize={fs(20)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(50) }} />
          )}
        </UiEntity>
      )
    ])
  ])
}

// ---------------------------------------------------------------------------
// WORKSHOP

const UPGRADE_COSTS = [10, 20, 30, 60, 120]
const UPGRADE_MATERIALS: Record<string, 'IR' | 'ST' | 'WD'> = { power: 'IR', control: 'ST', aim: 'WD' }
const ATTR_COLORS: Record<string, Color4> = { power: hex('#FF8A1C'), control: C.cyan, aim: C.yellow }
const BLUE_BG = hex('#1D47A8')
const BLUE_CARD = hex('#163C93')
const BLUE_TRACK = hex('#0F2B6E')
const BLUE_TEXT = hex('#BFD3FF')

// MY CLUBS pagination, in design px (the panel scales uniformly). The column
// is the row under the header: the panel's padding, the header and the row's
// top margin come off DESIGN_H. A card slot is the pressable's wrapper (face +
// shadow + hover lift) plus its bottom margin. The pager only appears when the
// clubs do not all fit, so a short collection keeps the full height.
const CLUBS_COLUMN_H = DESIGN_H - 22 - 24 - 66 - 18
const CLUB_CARD_H = 92
const CLUB_CARD_SHADOW = 6
const CLUB_CARD_GAP = 10
const CLUB_CARD_SLOT = CLUB_CARD_H + CLUB_CARD_SHADOW * 1.25 + CLUB_CARD_GAP
const CLUBS_LABEL_H = 24 + 10
const CLUBS_NOTE_H = 44 + 10
const CLUBS_PAGER_H = 46 + 6

const clubName = (club: BoardGolfclub) => club.DisplayName || GOLF_CLUB_NAMES[Number(club.golfclubId)] || 'Golf club'
const clubLevel = (club: BoardGolfclub) => 1 + club.attributes.power + club.attributes.control + club.attributes.aim
// eslint-disable-next-line eqeqeq
const isBasic = (club: BoardGolfclub) => club.golfclubId == '1'

const effectText = (attribute: string, value: number) => {
  if (value >= 5) return 'Maxed out'
  if (attribute === 'power') return `Max power ${maxPowerByGolfclubLevel[value]}% → ${maxPowerByGolfclubLevel[value + 1]}%`
  if (attribute === 'control') {
    const wobble = (v: number) => (MAX_DEGREES_DEVIANCE * devianceFactorLevels[v]).toFixed(1)
    return `Shot wobble ±${wobble(value)}° → ±${wobble(value + 1)}°`
  }
  return `Longer aim line: ${aimLengths[value]} → ${aimLengths[value + 1]}`
}

export const WorkshopView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const r = lobbyHudState.resources
  const num = (value: number) => (r.loaded ? fmt(value) : '-')
  const clubs = getGolfclubCollection()
  const activeTokenId = globalStore.userData.getState().activeGolfClubTokenId || null
  const equippedIndex = Math.max(0, clubs.findIndex((c) => c.tokenId === activeTokenId))
  const selectedIndex = (() => {
    if (lobbyMenuState.selectedClubTokenId === undefined) return equippedIndex
    const i = clubs.findIndex((c) => c.tokenId === lobbyMenuState.selectedClubTokenId)
    return i >= 0 ? i : equippedIndex
  })()
  const club = clubs[selectedIndex]
  const level = club ? clubLevel(club) : 1
  const xpLevel = club ? getLevelInfo(club.xp).currentLevel : 1
  const upgradeAvailable = !!club && !!club.xp && xpLevel > level && level < 16 && isBasic(club)
  const upgradesNow = upgradeAvailable ? Math.min(16, xpLevel) - level : 0
  const equipped = !!club && club.tokenId === activeTokenId
  const busy = lobbyMenuState.busy

  const fitAll = Math.max(1, Math.floor((CLUBS_COLUMN_H - CLUBS_LABEL_H - CLUBS_NOTE_H) / CLUB_CARD_SLOT))
  const paged = clubs.length > fitAll
  const perPage = paged ? Math.max(1, Math.floor((CLUBS_COLUMN_H - CLUBS_LABEL_H - CLUBS_NOTE_H - CLUBS_PAGER_H) / CLUB_CARD_SLOT)) : fitAll
  const pages = Math.max(1, Math.ceil(clubs.length / perPage))
  const page = Math.max(0, Math.min(pages - 1, lobbyMenuState.clubsPage ?? Math.floor(selectedIndex / perPage)))
  const pageClubs = clubs.slice(page * perPage, (page + 1) * perPage)

  const pageButton = (id: string, text: string, enabled: boolean, target: number) =>
    pressable(
      {
        id,
        width: px(40),
        height: px(40),
        color: enabled ? C.white : C.disabled,
        radius: px(12),
        borderWidth: Math.max(1, px(3)),
        borderColor: C.dark,
        shadow: px(4),
        disabled: !enabled,
        onClick: () => {
          lobbyMenuState.clubsPage = target
        }
      },
      <Label value={text} fontSize={fs(22)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: px(40), height: px(40) }} />
    )

  const clubCard = (c: BoardGolfclub, i: number) =>
    pressable(
      {
        id: `club-${i}`,
        width: '100%',
        height: px(CLUB_CARD_H),
        color: i === selectedIndex ? C.yellow : BLUE_CARD,
        radius: px(20),
        borderWidth: Math.max(2, px(4)),
        borderColor: C.dark,
        shadow: px(CLUB_CARD_SHADOW),
        margin: { bottom: px(CLUB_CARD_GAP) },
        padding: { left: px(12), right: px(12) },
        justifyContent: 'flex-start',
        onClick: () => {
          lobbyMenuState.selectedClubTokenId = c.tokenId
        }
      },
      <UiEntity uiTransform={{ width: px(64), height: px(64), borderRadius: px(16), padding: px(4) }} uiBackground={{ color: C.dark }}>
        <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: `images/${c.golfclubId}.png` }, textureMode: 'stretch' }} />
      </UiEntity>,
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(12) } }}>
        <Label value={clubName(c)} fontSize={fs(19)} color={i === selectedIndex ? C.dark : C.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />
        <Label
          value={isBasic(c) ? `Level ${clubLevel(c)} / 16` : 'NFT · max 5 / 5 / 5'}
          fontSize={fs(14)}
          color={i === selectedIndex ? C.dark : C.white}
          textAlign="middle-left"
          textWrap="nowrap"
          uiTransform={{ height: px(20) }}
        />
        {c.tokenId === activeTokenId ? (
          <UiEntity uiTransform={{ height: px(20), padding: { left: px(8), right: px(8) }, margin: { top: px(2) }, borderRadius: px(8), justifyContent: 'center', alignSelf: 'flex-start' }} uiBackground={{ color: C.green }}>
            <Label value="EQUIPPED" fontSize={fs(12)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />
          </UiEntity>
        ) : null}
      </UiEntity>
    )

  const attributeRow = (attribute: 'power' | 'control' | 'aim') => {
    const value = club ? club.attributes[attribute] : 0
    const material = UPGRADE_MATERIALS[attribute]
    const cost = UPGRADE_COSTS[value] || 0
    const balance = (r as any)[material] || 0
    const canUpgrade = upgradeAvailable && value < 5 && balance >= cost && !busy
    return (
      <UiEntity
        key={attribute}
        uiTransform={{
          width: '100%',
          flexGrow: 1,
          flexDirection: 'row',
          alignItems: 'center',
          margin: { bottom: px(12) },
          padding: { left: px(16), right: px(14) },
          borderRadius: px(22),
          borderWidth: Math.max(2, px(4)),
          borderColor: C.dark
        }}
        uiBackground={{ color: C.white }}
      >
        <UiEntity uiTransform={{ width: px(56), height: px(56), borderRadius: px(16), borderWidth: Math.max(1, px(3)), borderColor: C.dark }} uiBackground={{ color: ATTR_COLORS[attribute] }} />
        <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(14) } }}>
          <UiEntity uiTransform={{ height: px(30), flexDirection: 'row', alignItems: 'center' }}>
            <Label value={attribute.toUpperCase()} fontSize={fs(24)} color={C.dark} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(30) }} />
            <Label value={effectText(attribute, value)} fontSize={fs(14)} color={hex('#5A4A7A')} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(30), margin: { left: px(10) } }} />
          </UiEntity>
          <UiEntity uiTransform={{ height: px(18), flexDirection: 'row', margin: { top: px(6) } }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <UiEntity
                key={i}
                uiTransform={{ width: px(40), height: px(18), borderRadius: px(6), borderWidth: Math.max(1, px(2)), borderColor: C.dark, margin: { right: px(6) } }}
                uiBackground={{ color: i < value ? ATTR_COLORS[attribute] : hex('#EDE7F7') }}
              />
            ))}
          </UiEntity>
        </UiEntity>
        {upgradeAvailable && value < 5
          ? pressable(
              {
                id: `upgrade-${attribute}`,
                width: px(120),
                height: px(54),
                color: canUpgrade ? C.yellow : C.disabled,
                radius: px(16),
                borderWidth: Math.max(2, px(4)),
                borderColor: C.dark,
                shadow: px(6),
                disabled: !canUpgrade,
                onClick: () => {
                  if (!club) return
                  lobbyMenuState.busy = true
                  upgradeGolfclubAttribute(club.ItemInstanceId, attribute).finally(() => {
                    lobbyMenuState.busy = false
                  })
                }
              },
              <Label value="+1" fontSize={fs(22)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(54) }} />,
              <UiEntity uiTransform={{ height: px(28), flexDirection: 'row', alignItems: 'center', margin: { left: px(6) }, padding: { left: px(8), right: px(6) }, borderRadius: px(9) }} uiBackground={{ color: C.dark }}>
                <Label value={String(cost)} fontSize={fs(16)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(28) }} />
                {materialIcon(px, material, 20, { left: px(4) })}
              </UiEntity>
            )
          : null}
      </UiEntity>
    )
  }

  return screen(L, px, BLUE_BG, [
    header(
      px, fs, 'WORKSHOP', C.white,
      [
        <UiEntity uiTransform={{ flexGrow: 1 }} />,
        counter(px, fs, 'WD', num(r.WD)),
        counter(px, fs, 'ST', num(r.ST)),
        counter(px, fs, 'IR', num(r.IR)),
        counter(px, fs, 'DM', num(r.DM))
      ],
      'images/icons/workshop.png'
    ),
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', margin: { top: px(18) } }}>
      {/* My clubs */}
      <UiEntity uiTransform={{ width: px(250), height: '100%', flexDirection: 'column' }}>
        <Label value="MY CLUBS" fontSize={fs(16)} color={BLUE_TEXT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24), margin: { bottom: px(10) } }} />
        {/* Fixed height, so the pager stays put on a short last page. */}
        <UiEntity uiTransform={{ width: '100%', height: px(perPage * CLUB_CARD_SLOT), flexDirection: 'column' }}>
          {pageClubs.map((c, j) => clubCard(c, page * perPage + j))}
        </UiEntity>
        {paged ? (
          <UiEntity uiTransform={{ width: '100%', height: px(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { top: px(6) } }}>
            {pageButton('clubs-prev', '<', page > 0, page - 1)}
            <Label value={`${page + 1} / ${pages}`} fontSize={fs(18)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(40) }} />
            {pageButton('clubs-next', '>', page < pages - 1, page + 1)}
          </UiEntity>
        ) : null}
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        <Label
          value="NFT clubs come maxed out. Your basic club levels up with materials."
          fontSize={fs(14)}
          color={hex('#D7E3FF')}
          textAlign="middle-left"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(44), margin: { top: px(10) } }}
        />
      </UiEntity>
      <UiEntity uiTransform={{ width: px(22) }} />
      {/* Selected club */}
      {panelFrame(px, { width: px(380), height: '100%', padding: { top: px(20), bottom: px(20), left: px(24), right: px(24) }, align: 'center' }, BLUE_CARD, [
        <Label value={club ? clubName(club) : '-'} fontSize={fs(28)} color={C.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(34) }} />,
        <UiEntity uiTransform={{ width: px(200), height: px(200), margin: { top: px(10) } }} uiBackground={club ? { texture: { src: `images/${club.golfclubId}.png` }, textureMode: 'stretch' } : { color: BLUE_TRACK }} />,
        <UiEntity uiTransform={{ width: '100%', height: px(26), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: { top: px(12) } }}>
          <Label value="CLUB LEVEL" fontSize={fs(17)} color={C.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(26) }} />
          <Label value={club && !isBasic(club) ? 'MAX' : `${level} / 16`} fontSize={fs(17)} color={C.yellow} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(26) }} />
        </UiEntity>,
        <UiEntity uiTransform={{ width: '100%', height: px(20), margin: { top: px(6) }, borderRadius: px(11), borderWidth: Math.max(1, px(3)), borderColor: C.dark }} uiBackground={{ color: BLUE_TRACK }}>
          <UiEntity uiTransform={{ width: `${club && !isBasic(club) ? 100 : Math.round((100 * level) / 16)}%`, height: '100%', borderRadius: px(8) }} uiBackground={{ color: C.yellow }} />
        </UiEntity>,
        <Label
          value={
            club && isBasic(club)
              ? club.xp
                ? `Club XP level ${xpLevel}: ${upgradesNow} upgrade${upgradesNow === 1 ? '' : 's'} available now`
                : 'Play holes with this club to earn club XP'
              : 'NFT club: all attributes at their maximum'
          }
          fontSize={fs(14)}
          color={hex('#D7E3FF')}
          textAlign="middle-left"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(40), margin: { top: px(6) } }}
        />,
        <UiEntity uiTransform={{ flexGrow: 1 }} />,
        <UiEntity uiTransform={{ width: '100%', height: px(64), flexDirection: 'row' }}>
          {pressable(
            {
              id: 'club-equip',
              width: '42%',
              height: px(56),
              color: equipped || busy ? C.disabled : C.white,
              radius: px(16),
              borderWidth: Math.max(2, px(4)),
              borderColor: C.dark,
              shadow: px(6),
              disabled: equipped || busy || !club,
              onClick: () => {
                if (!club) return
                lobbyMenuState.busy = true
                selectGolfclub(club.tokenId).finally(() => {
                  lobbyMenuState.busy = false
                })
              }
            },
            <Label value={equipped ? 'EQUIPPED' : 'EQUIP'} fontSize={fs(20)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(56) }} />
          )}
          <UiEntity uiTransform={{ width: '4%' }} />
          <UiEntity
            uiTransform={{ width: '54%', height: px(56), flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: px(16), borderWidth: Math.max(2, px(4)), borderColor: C.dark }}
            uiBackground={{ color: hex('#3A5DAF') }}
          >
            <Label value="MINT AS NFT" fontSize={fs(17)} color={hex('#D7E3FF')} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />
            <Label value="level 16 + 120 diamonds" fontSize={fs(12)} color={hex('#D7E3FF')} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
          </UiEntity>
        </UiEntity>
      ])}
      <UiEntity uiTransform={{ width: px(22) }} />
      {/* Attributes */}
      <UiEntity uiTransform={{ flexGrow: 1, height: '100%', flexDirection: 'column' }}>
        <Label value="ATTRIBUTES" fontSize={fs(16)} color={BLUE_TEXT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24), margin: { bottom: px(10) } }} />
        {attributeRow('power')}
        {attributeRow('control')}
        {attributeRow('aim')}
      </UiEntity>
    </UiEntity>
  ])
}

// ---------------------------------------------------------------------------
// PRIZES

// A 5x4 grid of square cells with the wearable's thumbnail, next to the TOP 10
// list. Sizes in design px: the grid is as tall as the row under the header
// allows (DESIGN_H minus the panel's padding, the header and the row margin
// is 590), the side panel takes what is left of the panel's inner width.
const PRIZE_COLS = 5
const PRIZE_ROWS = 4
const PRIZE_CELL = 130
const PRIZE_GAP = 10
const PRIZE_GRID_PAD = 10
const PRIZE_BORDER = 4
const PRIZE_GRID_W = 2 * (PRIZE_BORDER + PRIZE_GRID_PAD) + PRIZE_COLS * PRIZE_CELL + (PRIZE_COLS - 1) * PRIZE_GAP
const PRIZE_GRID_H = 2 * (PRIZE_BORDER + PRIZE_GRID_PAD) + PRIZE_ROWS * PRIZE_CELL + (PRIZE_ROWS - 1) * PRIZE_GAP
const PRIZE_SIDE_W = DESIGN_W - 2 * 28 - PRIZE_GRID_W - 24
const PRIZE_THUMB = 74
// Diamonds for the Season's top 10, by position.
const TOP10_PRIZES = [3000, 2000, 1000, 500, 500, 500, 500, 500, 500, 500]

const prizeTier = (p: SeasonPrize) => Number(getTierFromSub(p.tierReward) || 0)
// "Golfcraft x COCOBAY Cap" -> "Cap": the header already names the collection.
const prizeName = (name: string) => shortName(name).replace(/^cocobay\s*/i, '')
const dim = (c: Color4) => Color4.create(c.r * 0.55, c.g * 0.55, c.b * 0.55, 1)

// Without the stock service there are still 20 wearable tiers in the season
// table; show those ranks so the grid is never blank.
const fallbackPrizes = (): SeasonPrize[] =>
  seasonTierDefinitions
    .map((def: any, tier: number) => ({ def, tier }))
    .filter(({ def }: any) => def?.prize?.wearable)
    .slice(0, 20)
    .map(({ tier }: any, i: number) => ({ name: `Wearable ${i + 1}`, tierReward: Number(getPointsToTier(tier) || 0), stock: -1 }))

const rankChip = (px: Px, fs: Px, tier: number, name: string, height: number, width?: number) => (
  <UiEntity
    uiTransform={{
      width,
      height: px(height),
      flexDirection: 'row',
      alignItems: 'center',
      padding: { left: px(6), right: px(6) },
      borderRadius: px(height / 2.5),
      alignSelf: 'flex-start'
    }}
    uiBackground={{ color: C.dark }}
  >
    <UiEntity
      uiTransform={{ width: px(9), height: px(9), borderRadius: px(5), borderWidth: Math.max(1, px(1.5)), borderColor: C.white }}
      uiBackground={{ color: hex(TIER_COLORS[getCatFromTier(tier)] || '#FFFFFF') }}
    />
    <Label value={name} fontSize={fs(10)} color={C.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(height), margin: { left: px(4) } }} />
  </UiEntity>
)

export const PrizesView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const userData = globalStore.userData.getState()
  const tierSub = Number(userData['statistic_tier-sub'] || 0)
  const tierSubMax = Number(userData['statistic_tier-sub-max'] || 0)
  const live = lobbyMenuState.prizes.length > 0
  const prizes = (live ? [...lobbyMenuState.prizes].sort((a, b) => a.tierReward - b.tierReward) : fallbackPrizes()).slice(0, 20)
  const nextIndex = live ? prizes.findIndex((p) => p.tierReward > tierSubMax) : -1
  const received = live ? prizes.filter((p) => p.tierReward <= tierSubMax) : []
  const last = received.length ? received[received.length - 1] : null
  const next = nextIndex >= 0 ? prizes[nextIndex] : null
  const myTier = Number(getTierFromSub(tierSub) || 0)
  const myRank = seasonTierDefinitions[myTier]?.name || 'WOOD 5'
  const toNext = next ? Math.max(0, next.tierReward - tierSub) : 0
  const myPlayFabId = getPlayFabId()
  const board = lobbyMenuState.leaderboard

  const cell = (p: SeasonPrize, i: number) => {
    const tier = prizeTier(p)
    const rank = seasonTierDefinitions[tier]?.name || ''
    const soldOut = live && p.stock <= 0
    const claimed = live && p.tierReward <= tierSubMax
    const isNext = i === nextIndex
    const base = i < 10 ? C.blue : i < 15 ? hex('#6B21D9') : C.pink
    const textColor = soldOut ? C.muted : C.white
    const col = i % PRIZE_COLS
    const row = Math.floor(i / PRIZE_COLS)
    return (
      <UiEntity
        key={`${p.name}-${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: px(PRIZE_GRID_PAD + col * (PRIZE_CELL + PRIZE_GAP)), top: px(PRIZE_GRID_PAD + row * (PRIZE_CELL + PRIZE_GAP)) },
          width: px(PRIZE_CELL),
          height: px(PRIZE_CELL),
          borderRadius: px(16),
          borderWidth: Math.max(1, px(isNext ? 4 : 3)),
          borderColor: isNext ? C.white : C.dark
        }}
        uiBackground={{ color: soldOut ? dim(base) : base }}
      >
        {p.thumbnail ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: px((PRIZE_CELL - PRIZE_THUMB) / 2 - 3), top: px(10) }, width: px(PRIZE_THUMB), height: px(PRIZE_THUMB) }}
            uiBackground={{ texture: { src: p.thumbnail }, textureMode: 'stretch', color: soldOut ? Color4.create(1, 1, 1, 0.5) : C.white }}
          />
        ) : null}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { left: px(5), top: px(5) } }}>{rankChip(px, fs, tier, rank, 18)}</UiEntity>
        <Label
          value={prizeName(p.name)}
          fontSize={fs(11)}
          color={textColor}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ positionType: 'absolute', position: { left: px(4), top: px(84) }, width: px(PRIZE_CELL - 14), height: px(28) }}
        />
        <Label
          value={!live ? 'Stock unavailable' : soldOut ? 'SOLD OUT' : `${p.stock} left`}
          fontSize={fs(10)}
          color={textColor}
          textAlign="middle-center"
          textWrap="nowrap"
          uiTransform={{ positionType: 'absolute', position: { left: 0, top: px(108) }, width: '100%', height: px(14) }}
        />
        {claimed ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: px(-9), right: px(-7) }, width: px(26), height: px(26), borderRadius: px(13), borderWidth: Math.max(1, px(3)), borderColor: C.dark, justifyContent: 'center', alignItems: 'center' }}
            uiBackground={{ color: C.green }}
          >
            <UiEntity uiTransform={{ width: px(10), height: px(10), borderRadius: px(5) }} uiBackground={{ color: C.dark }} />
          </UiEntity>
        ) : null}
        {isNext ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: px(-11), right: px(-7) }, height: px(22), padding: { left: px(7), right: px(7) }, borderRadius: px(8), borderWidth: Math.max(1, px(3)), borderColor: C.dark, justifyContent: 'center' }}
            uiBackground={{ color: C.yellow }}
          >
            <Label value="NEXT" fontSize={fs(12)} color={C.dark} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />
          </UiEntity>
        ) : null}
      </UiEntity>
    )
  }

  // One leaderboard row: position, name, rank, points and the diamonds that
  // position wins. Mine is pink. Without data the names and points read "—".
  const boardRow = (i: number) => {
    const entry = board[i]
    const mine = !!entry && !!myPlayFabId && entry.playFabId === myPlayFabId
    const tier = entry ? Number(getTierFromSub(entry.points) || 0) : 0
    return (
      <UiEntity
        key={i}
        uiTransform={{
          width: '100%',
          height: px(34),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(8), right: px(8) },
          margin: { bottom: px(1) },
          borderRadius: px(10)
        }}
        uiBackground={{ color: mine ? C.pink : i % 2 ? hex('#6B4500') : C.transparent }}
      >
        <Label value={String(i + 1)} fontSize={fs(15)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: px(26), height: px(34) }} />
        <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: px(34), overflow: 'hidden' }}>
          <Label value={entry ? entry.name : '—'} fontSize={fs(14)} color={C.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '100%', height: px(34) }} />
        </UiEntity>
        <UiEntity uiTransform={{ width: px(104), height: px(34), justifyContent: 'center' }}>
          {entry ? rankChip(px, fs, tier, seasonTierDefinitions[tier]?.name || '', 20) : null}
        </UiEntity>
        <Label value={entry ? String(entry.points) : '—'} fontSize={fs(14)} color={C.white} textAlign="middle-right" textWrap="nowrap" uiTransform={{ width: px(44), height: px(34) }} />
        <Label value={String(TOP10_PRIZES[i])} fontSize={fs(14)} color={C.yellow} textAlign="middle-right" textWrap="nowrap" uiTransform={{ width: px(48), height: px(34), margin: { left: px(8) } }} />
        {materialIcon(px, 'DM', 18, { left: px(4) })}
      </UiEntity>
    )
  }

  return screen(L, px, C.bg, [
    header(px, fs, 'PRIZES BY RANK', C.yellow, [
      tag(px, fs, 'Golfcraft x COCOBAY', C.pink, C.white, true),
      <UiEntity uiTransform={{ flexGrow: 1 }} />,
      <Label value="Reach the rank and it is sent to you, while stock lasts" fontSize={fs(17)} color={C.lilac} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(30) }} />
    ]),
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', margin: { top: px(18) } }}>
      <UiEntity
        uiTransform={{ width: px(PRIZE_GRID_W), height: px(PRIZE_GRID_H), borderRadius: px(26), borderWidth: Math.max(2, px(PRIZE_BORDER)), borderColor: C.dark }}
        uiBackground={{ color: C.yellow }}
      >
        {prizes.map((p, i) => cell(p, i))}
      </UiEntity>
      <UiEntity uiTransform={{ width: px(24) }} />
      {panelFrame(px, { width: px(PRIZE_SIDE_W), height: px(PRIZE_GRID_H), padding: { top: px(16), bottom: px(14), left: px(16), right: px(16) } }, hex('#8A5A00'), [
        <Label value="TOP 10" fontSize={fs(28)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(34) }} />,
        <Label value="Diamonds for the best players when the season ends" fontSize={fs(13)} color={hex('#FFF0C2')} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '100%', height: px(20) }} />,
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: px(8) } }}>{Array.from({ length: 10 }, (_, i) => boardRow(i))}</UiEntity>,
        <UiEntity uiTransform={{ flexGrow: 1 }} />,
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', padding: px(12), borderRadius: px(16) }} uiBackground={{ color: C.dark }}>
          <Label value={`YOU · ${myRank}`} fontSize={fs(16)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22) }} />
          <Label
            value={
              !live
                ? 'Stock unavailable right now'
                : `${last ? `${prizeName(last.name)} received. ` : 'No prize received yet. '}${
                    next ? `${prizeName(next.name)} unlocks at ${seasonTierDefinitions[prizeTier(next)]?.name || ''}, ${toNext} points away.` : 'Every prize received!'
                  }`
            }
            fontSize={fs(13)}
            color={C.lilac}
            textAlign="middle-left"
            textWrap="wrap"
            uiTransform={{ width: '100%', height: px(46), margin: { top: px(4) } }}
          />
        </UiEntity>
      ])}
    </UiEntity>
  ])
}
