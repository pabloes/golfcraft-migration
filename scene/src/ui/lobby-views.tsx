// The lobby dialog's sub-views, after the "Escritorio · propuesta 2" page of
// the GolfCraft UI canvas: SEASON (Season2.dc.html), TUTORIAL (Story2),
// WORKSHOP (Workshop2), PRIZES (Prizes2) and DAILY MISSIONS (DailyMissions2).
// Same 1280x720 contained panel as the lobby view, with the back button and
// the screen's ribbon on top. They only read the scene's state and call the
// handlers the 3D lobby already uses.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState, DailyMission } from './lobby-hud-state'
import { lobbyMenuState, showLobbyView, closeLobbyMenu, SeasonPrize, markStartedFromMenu, nextSeasonPrize, prizeSoldOut, seasonPlayState } from './lobby-menu-state'
import { C, hex, fmt, shortName, materialIcon } from './ui-theme'
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px } from './ui-scale'
import {
  P, at, img, imgW, text, box, frame, button2, viewHeader, headerRight, yellowTag, navyPill, resIcon, rankBadge, border, nextPrizeBar, energyChip
} from './ui2'
import { talkToNpc } from '../components/lobby/npc-storymode/npc-storymode'
import { getGolfclubCollection, selectGolfclub, upgradeGolfclubAttribute } from '../components/lobby/lobby-training'
import { BoardGolfclub } from '../components/lobby/golfclub-screen/golfclub-screen-ui'
import { GOLF_CLUB_NAMES, getPlayFabId } from '../meta/bootstrap'
import { seasonCatalog } from '../components/lobby/seasons/season-catalog'
import {
  aimLengths,
  devianceFactorLevels,
  maxPowerByGolfclubLevel,
  MAX_DEGREES_DEVIANCE
} from '../../golfplay/src/components/shoot-control'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getLevelInfo, getPointsOnCurrentTier, getPointsToTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIER_CATEGORIES, TIER_COLORS } from '../../../common/constants'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const MARGIN = 16
const back = () => showLobbyView('lobby')
const card = { color: P.navy, radius: 20, border: 4, shadow: 10 }
const tierOf = (tierSub: number) => Number(getTierFromSub(tierSub) || 0)
const seasonNameNow = () =>
  (seasonCatalog as any)[String(globalStore.userData.getState()?.config?.currentSeasonCollectionId ?? 4)]?.name || 'MOUNTAIN'

// ---------------------------------------------------------------------------
// SEASON (Season2.dc.html)

// Time the other players get once someone holes, by tier category
// (server/rooms/Season-Room.ts countdownByTierCat).
const ENDING_SECONDS = [30, 28, 25, 20, 15, 15, 15, 15, 15, 15]
const NUMERALS = ['V', 'IV', 'III', 'II', 'I']

export const SeasonView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const userData = globalStore.userData.getState()
  const tierSub = Number(userData['statistic_tier-sub'] || 0)
  const tierSubMax = Math.max(tierSub, Number(userData['statistic_tier-sub-max'] || 0))
  const tier = tierOf(tierSub)
  const cat = getCatFromTier(tier)
  const step = Math.max(0, Math.min(4, tier - cat * 5))
  const ptsOnTier = Number(getPointsOnCurrentTier(tierSub) || 0)
  const ptsPerTier = Number(seasonPointsPerCategory[cat] || 5)
  const prize = nextSeasonPrize(tierSubMax)
  const prizeTier = prize ? seasonTierDefinitions[tierOf(prize.tierReward)]?.name || '' : ''
  const st = seasonPlayState()
  const hx = headerRight(px, 'rb_season')

  const segW = (542 - 4 * 6) / 5
  const segments = NUMERALS.map((numeral, k) => {
    const x = 258 + k * (segW + 6)
    const fill = k < step ? 100 : k === step ? Math.max(0, Math.min(100, (100 * ptsOnTier) / ptsPerTier)) : 0
    return [
      box(px, `seg-${k}`, x, 222, segW, 18, { color: P.glass, radius: 8, border: 3, borderColor: Color4.create(1, 1, 1, 0.35) }, [
        <UiEntity uiTransform={{ width: `${fill}%`, height: '100%', borderRadius: px(5) }} uiBackground={{ color: C.yellow }} />
      ]),
      text(px, fs, numeral, x, 244, segW, 18, 14, k === step ? C.yellow : P.white, 'middle-center')
    ]
  })

  const medals = TIER_CATEGORIES.map((name: string, c: number) => {
    const col = c % 5
    const row = Math.floor(c / 5)
    const x = 78 + col * 145
    const y = 436 + row * 120
    const mine = c === cat
    return [
      mine ? box(px, `medal-ring-${c}`, x + (145 - 84) / 2, y - 6, 84, 84, { color: Color4.create(1, 0.82, 0.12, 0.25), radius: 42, border: 4, borderColor: C.yellow }) : null,
      img(px, `medal_${c}`, x + (145 - 72) / 2, y, 1.2, mine ? undefined : Color4.create(1, 1, 1, 0.6)),
      text(px, fs, name.charAt(0) + name.slice(1).toLowerCase().replace('master', 'Master'), x, y + 82, 145, 18, 13, mine ? C.yellow : Color4.create(1, 1, 1, 0.75), 'middle-center')
    ]
  })

  const holeTiles = [
    ['1st', '+2'],
    ['2nd', '+1'],
    ['3rd', '0'],
    ['4th', '−1']
  ].map(([place, pts], k) =>
    box(px, `pts-${k}`, 874 + k * 86, 258, 80, 60, { color: k === 0 ? C.yellow : P.glass, radius: 12, column: true, justify: 'center', align: 'center' }, [
      <Label value={place} fontSize={fs(15)} color={k === 0 ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />,
      <Label value={pts} fontSize={fs(24)} color={k === 0 ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(30) }} />
    ])
  )

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_season', back),
    yellowTag(px, fs, `${seasonNameNow()} Season`, hx, 51, 170),
    navyPill(px, fs, 'energy', 1068, 44, 160, 46, [
      resIcon(px, 'EN', 30),
      <Label value={fmt(st.energy)} fontSize={fs(19)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(8) } }} />,
      <Label value="energy" fontSize={fs(14)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(6) } }} />
    ]),

    box(px, 'your-rank', 52, 122, 778, 236, card),
    rankBadge(px, tier, 150, 82, 165),
    text(px, fs, 'YOUR RANK', 258, 140, 200, 20, 14),
    <UiEntity key="rank-name" uiTransform={{ ...at(px, 258, 160, 540, 52), flexDirection: 'row', alignItems: 'center' }}>
      <Label value={seasonTierDefinitions[tier]?.name || 'WOOD 5'} fontSize={fs(44)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(52) }} />
      <Label value={`${tierSub} pts`} fontSize={fs(24)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(52), margin: { left: px(16) } }} />
    </UiEntity>,
    ...segments,
    nextPrizeBar(px, fs, 258, 294, prize, prizeTier, prize ? Math.max(0, prize.tierReward - tierSub) : 0, lobbyMenuState.prizes.length > 0, 542),

    box(px, 'ranks', 52, 376, 778, 314, card),
    img(px, 'tt_ranks', 78, 394),
    ...medals,

    box(px, 'how', 850, 122, 378, 376, card),
    img(px, 'tt_how_a_run', 874, 142),
    box(px, 'four', 874, 182, 40, 40, { color: C.yellow, radius: 12, justify: 'center', align: 'center' }, [
      <Label value="4" fontSize={fs(22)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    text(px, fs, 'holes against 3 other players at your rank', 926, 180, 280, 44, 15, P.white, 'middle-left', true),
    text(px, fs, 'SEASON POINTS PER HOLE', 874, 234, 300, 18, 13, P.pale),
    ...holeTiles,
    img(px, 'gl_energy', 874, 340, 0.68),
    text(px, fs, 'Each run costs 1 energy', 916, 340, 290, 32, 15),
    img(px, 'ic_timer_w', 878, 386, 0.7),
    text(px, fs, `Once someone holes, the rest get ${ENDING_SECONDS[cat] || 15} s`, 916, 388, 290, 32, 15),

    button2(
      px,
      { id: 'season-play', x: 850, y: 516, w: 378, h: 84, color: st.canPlay ? P.yellow : C.disabled, radius: 18, shadow: 7, shadowColor: st.canPlay ? P.yellowShadow : C.dark, disabled: !st.canPlay, onClick: st.startSeason },
      [
        img(px, 'bt_play_m'),
        <UiEntity uiTransform={{ width: px(16) }} />,
        img(px, 'ic_play_n', undefined, undefined, 0.9),
        energyChip(px, fs, 'season-play-energy', (378 - 116) / 2, 58, 116, 22, st.playCaption)
      ]
    ),
    button2(
      px,
      {
        id: 'season-friends', x: 850, y: 620, w: 214, h: 70, color: st.canFriends ? P.lavender : C.disabled, radius: 18, shadow: 7,
        shadowColor: st.canFriends ? P.lavenderShadow : C.dark, disabled: !st.canFriends, onClick: st.startFriends,
        justify: 'flex-start', padding: { left: px(12), right: px(8) }
      },
      [
        img(px, 'ic_people_n', undefined, undefined, 0.7),
        <Label value={st.friendsCaption.replace('PLAY\n', '')} fontSize={fs(15)} color={P.ink} textAlign="middle-left" textWrap="wrap" uiTransform={{ width: px(150), height: px(60), margin: { left: px(10) } }} />
      ]
    ),
    button2(px, { id: 'season-prizes', x: 1078, y: 620, w: 150, h: 70, color: P.pink, radius: 18, border: 4, shadow: 7, onClick: () => showLobbyView('prizes') }, [
      img(px, 'tt_card_prizes', undefined, undefined, 0.75)
    ])
  ])
}

// ---------------------------------------------------------------------------
// TUTORIAL (Story2.dc.html)

const TUTORIAL_STEPS = 9
const NODE_LABELS = ['Welcome, intern', 'Sphere 1 of 4', 'Sphere 2 of 4', 'Sphere 3 of 4', 'Sphere 4 of 4', 'Secret emote', 'Sharpen your aim', 'Play ranked', 'Reach STONE']
const NODE_GLYPHS = ['gl_lock', 'gl_lock', 'gl_lock', 'gl_lock', 'gl_lock', 'gl_hand', 'gl_club', 'gl_cup', 'gl_star']
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
// Node centres on the map, inside the map card (Story2: 822x368 inner box).
const MAP_X = 56
const MAP_Y = 126
const NODE_X = [58, 150, 242, 334, 426, 518, 610, 702, 794]
const NODE_Y = (i: number) => (i % 2 === 0 ? 250 : 130)
const SAND_LIGHT = hex('#F7E7B0')
const SPHERE = hex('#EF57B4')
const SPHERE_RING = hex('#9FF5E8')
const PINK_SHADOW = hex('#8E145F')

const mapNode = (px: Px, fs: Px, i: number, mission: number, done: boolean) => {
  const n = i + 1
  const status = done || n < mission ? 'done' : n === mission ? 'current' : 'pending'
  const cx = MAP_X + NODE_X[i]
  const cy = MAP_Y + NODE_Y(i)
  const upper = i % 2 === 1
  const label = `${n} · ${NODE_LABELS[i]}`
  if (status === 'current') {
    const s = 96
    return [
      box(px, `node-ring-${i}`, cx - s / 2 - 4, cy - s / 2 - 4, s + 8, s + 8, { color: P.ink, radius: (s + 8) / 2, shadow: 8, shadowColor: PINK_SHADOW }),
      box(px, `node-${i}`, cx - s / 2, cy - s / 2, s, s, { color: SPHERE, radius: s / 2, border: 5, justify: 'center', align: 'center' }, [
        <Label value={String(n)} fontSize={fs(44)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ]),
      yellowTag(px, fs, 'YOU ARE HERE', cx - 70, cy - s / 2 - (upper ? 66 : 44), 140, 28, 15),
      text(px, fs, label, cx - 75, cy + s / 2 + 12, 150, 22, 15, P.white, 'middle-center')
    ]
  }
  const s = 64
  const glyph = status === 'done' ? img(px, 'gl_check', cx - 15, cy - 12, 0.9) : img(px, NODE_GLYPHS[i], cx - imgW(NODE_GLYPHS[i], 0.75) / 2, cy - 15, 0.75, Color4.create(1, 1, 1, 0.9))
  return [
    status === 'done'
      ? box(px, `node-${i}`, cx - s / 2, cy - s / 2, s, s, { color: C.yellow, radius: s / 2, border: 4, borderColor: P.ink, shadow: 5, shadowColor: P.yellowShadow })
      : box(px, `node-${i}`, cx - s / 2, cy - s / 2, s, s, { color: Color4.create(1, 1, 1, 0.12), radius: s / 2, border: 4, borderColor: Color4.create(1, 1, 1, 0.5) }),
    glyph,
    text(px, fs, label, cx - 70, upper ? cy - s / 2 - 42 : cy + s / 2 + 10, 140, 22, 15, status === 'pending' ? Color4.create(1, 1, 1, 0.85) : P.white, 'middle-center')
  ]
}

// The zigzag path between the nodes, as dots (no lines in the UI).
const mapPath = (px: Px) => {
  const dots: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < NODE_X.length - 1; i++) {
    for (let k = 1; k < 7; k++) {
      const t = k / 7
      const x = MAP_X + NODE_X[i] + (NODE_X[i + 1] - NODE_X[i]) * t
      const y = MAP_Y + NODE_Y(i) + (NODE_Y(i + 1) - NODE_Y(i)) * t
      dots.push(<UiEntity key={`dot-${i}-${k}`} uiTransform={{ ...at(px, x - 6, y - 6, 12, 12), borderRadius: px(6) }} uiBackground={{ color: SAND_LIGHT }} />)
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
  const portrait = done || mission === 9 ? 'drpar_box_3' : 'drpar_box_1'
  const line = done ? 'Tutorial complete. Thank you, intern: the lab is safe again.' : MISSION_LINES[mission] || ''
  const hx = headerRight(px, 'rb_tutorial')

  const sphereCells = [0, 1, 2, 3].map((i) => {
    const x = 936 + (i % 2) * 138
    const y = 248 + Math.floor(i / 2) * 78
    return box(px, `sphere-${i}`, x, y, 128, 68, { color: P.dimmer, radius: 14, justify: 'center', align: 'center' }, [
      <UiEntity
        uiTransform={{ width: px(50), height: px(50), borderRadius: px(25), borderWidth: border(px, 3), borderColor: i < spheres ? P.white : SPHERE_RING }}
        uiBackground={{ color: i < spheres ? SPHERE : P.clear }}
      />
    ])
  })

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_tutorial', back),
    yellowTag(px, fs, 'Ancient Egypt', hx, 51, 140),
    navyPill(px, fs, 'mission', 1048, 44, 180, 46, [
      <Label value={done ? 'Tutorial complete' : 'Mission'} fontSize={fs(19)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40) }} />,
      done ? null : <Label value={`${mission} / ${TUTORIAL_STEPS}`} fontSize={fs(19)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(8) } }} />
    ]),

    box(px, 'map', 52, 122, 830, 376, card),
    ...mapPath(px),
    ...NODE_X.map((_, i) => mapNode(px, fs, i, mission, done)),

    box(px, 'spheres', 900, 122, 328, 376, { ...card, color: P.teal }),
    img(px, 'tt_energy_spheres', 922, 144),
    text(px, fs, 'Four spheres escaped back to ancient Egypt. Push each one into the hole.', 924, 178, 282, 50, 16, hex('#E8FFFB'), 'middle-left', true),
    box(px, 'sphere-grid', 924, 236, 280, 168, { color: P.dim, radius: 16 }),
    ...sphereCells,
    text(px, fs, `${spheres} of 4 caught`, 924, 440, 280, 32, 22, C.yellow),

    box(px, 'drpar', 52, 518, 1176, 172, { ...card, color: P.purple }),
    img(px, portrait, 68, 531),
    yellowTag(px, fs, 'DR. PAR', 236, 552, 96, 26, 15),
    text(px, fs, line, 236, 584, 700, 84, 24, P.white, 'middle-left', true),
    done
      ? null
      : button2(
          px,
          {
            id: 'tutorial-go', x: 976, y: 539, w: 230, h: 66, color: P.yellow, radius: 18, shadow: 7, shadowColor: P.yellowShadow,
            onClick: () => {
              closeLobbyMenu()
              markStartedFromMenu()
              talkToNpc().catch((err) => console.log('[lobby] talkToNpc failed', err))
            }
          },
          [img(px, 'bt_lets_go'), <UiEntity uiTransform={{ width: px(12) }} />, img(px, 'ic_play_n', undefined, undefined, 0.6)]
        ),
    done
      ? null
      : button2(px, { id: 'tutorial-not-now', x: 976, y: 619, w: 230, h: 52, color: P.lavender, radius: 18, shadow: 7, shadowColor: P.lavenderShadow, onClick: back }, [img(px, 'bt_not_now')])
  ])
}

// ---------------------------------------------------------------------------
// WORKSHOP (Workshop2.dc.html)

const UPGRADE_COSTS = [10, 20, 30, 60, 120]
const UPGRADE_MATERIALS: Record<string, 'IR' | 'ST' | 'WD'> = { power: 'IR', control: 'ST', aim: 'WD' }
const ATTR_COLORS: Record<string, Color4> = { power: hex('#FF8230'), control: hex('#33CDBC'), aim: C.yellow }
const ATTR_GLYPHS: Record<string, [string, number]> = { power: ['ic_bolt_w', 0.75], control: ['gl_target', 0.75], aim: ['gl_aim', 0.8] }
const PIP_EMPTY = Color4.create(8 / 255, 18 / 255, 40 / 255, 0.45)
const MATERIAL_NAMES: Record<string, string> = { IR: 'iron', ST: 'stone', WD: 'wood' }
const SHORT = hex('#FF9A8A')

// MY CLUBS: cards from y 160 down to the note box, 110 px a slot (92 card +
// its 6 px shadow + gap); paged when the clubs do not all fit.
const CLUBS_TOP = 160
const CLUBS_BOTTOM = 612
const CLUB_SLOT = 110
const CLUB_H = 92
const PAGER_H = 52

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

  const fitAll = Math.max(1, Math.floor((CLUBS_BOTTOM - CLUBS_TOP) / CLUB_SLOT))
  const paged = clubs.length > fitAll
  const perPage = paged ? Math.max(1, Math.floor((CLUBS_BOTTOM - CLUBS_TOP - PAGER_H) / CLUB_SLOT)) : fitAll
  const pages = Math.max(1, Math.ceil(clubs.length / perPage))
  const page = Math.max(0, Math.min(pages - 1, lobbyMenuState.clubsPage ?? Math.floor(selectedIndex / perPage)))
  const pageClubs = clubs.slice(page * perPage, (page + 1) * perPage)

  const clubCard = (c: BoardGolfclub, i: number, slot: number) => {
    const selected = i === selectedIndex
    const fg = selected ? P.ink : P.white
    const y = CLUBS_TOP + slot * CLUB_SLOT
    return button2(
      px,
      {
        id: `club-${i}`, x: 52, y, w: 290, h: CLUB_H, color: selected ? P.yellow : P.navy, radius: 20, border: 4, shadow: 6,
        justify: 'flex-start', padding: { left: px(8), right: px(8) },
        onClick: () => {
          lobbyMenuState.selectedClubTokenId = c.tokenId
        }
      },
      [
        <UiEntity uiTransform={{ width: px(70), height: px(70), borderRadius: px(14), flexShrink: 0 }} uiBackground={{ texture: { src: `images/${c.golfclubId}.png` }, textureMode: 'stretch' }} />,
        <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(12) } }}>
          <Label value={clubName(c)} fontSize={fs(19)} color={fg} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />
          <Label value={isBasic(c) ? `Level ${clubLevel(c)} / 16` : 'NFT · max 5 / 5 / 5'} fontSize={fs(14)} color={selected ? P.ink : P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20) }} />
          {selected || c.tokenId === activeTokenId ? (
            <UiEntity uiTransform={{ height: px(18), padding: { left: px(8), right: px(8) }, margin: { top: px(3) }, borderRadius: px(8), justifyContent: 'center', alignSelf: 'flex-start' }} uiBackground={{ color: c.tokenId === activeTokenId ? P.green : P.ink }}>
              <Label value={c.tokenId === activeTokenId ? 'EQUIPPED' : 'SELECTED'} fontSize={fs(11)} color={c.tokenId === activeTokenId ? P.ink : C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(18) }} />
            </UiEntity>
          ) : null}
        </UiEntity>
      ]
    )
  }

  const pageButton = (id: string, icon: string, enabled: boolean, target: number, x: number) =>
    button2(px, { id, x, y: CLUBS_TOP + perPage * CLUB_SLOT + 4, w: 44, h: 40, color: enabled ? P.navy : C.disabled, radius: 12, border: 3, borderColor: P.navyEdge, shadow: 4, disabled: !enabled, onClick: () => (lobbyMenuState.clubsPage = target) }, [
      img(px, icon, undefined, undefined, 0.7)
    ])

  // One attribute: icon, name, effect of the next level and five pips, then on
  // the right what the next upgrade costs (the material's icon, the amount and
  // what the player has) with the +1 button under it.
  const attributeRow = (attribute: 'power' | 'control' | 'aim', y: number) => {
    const value = club ? club.attributes[attribute] : 0
    const material = UPGRADE_MATERIALS[attribute]
    const cost = UPGRADE_COSTS[value] || 0
    const balance = (r as any)[material] || 0
    const maxed = value >= 5 || (!!club && !isBasic(club))
    const enough = balance >= cost
    const canUpgrade = upgradeAvailable && !maxed && enough && !busy
    const [glyph, glyphScale] = ATTR_GLYPHS[attribute]
    const why = !upgradeAvailable ? 'Needs more club XP' : !enough ? `Not enough ${MATERIAL_NAMES[material]}` : ''
    return [
      box(px, `attr-${attribute}`, 762, y, 466, 124, card),
      box(px, `attr-icon-${attribute}`, 782, y + 33, 58, 58, { color: ATTR_COLORS[attribute], radius: 14, justify: 'center', align: 'center' }, [img(px, glyph, undefined, undefined, glyphScale)]),
      text(px, fs, attribute.toUpperCase(), 856, y + 22, 200, 30, 24),
      text(px, fs, effectText(attribute, value), 856, y + 52, 200, 20, 13, P.pale),
      ...[0, 1, 2, 3, 4].map((k) => (
        <UiEntity
          key={`pip-${attribute}-${k}`}
          uiTransform={{ ...at(px, 856 + k * 41, y + 80, 36, 16), borderRadius: px(6), borderWidth: border(px, 2), borderColor: Color4.create(1, 1, 1, 0.5) }}
          uiBackground={{ color: k < value ? ATTR_COLORS[attribute] : PIP_EMPTY }}
        />
      )),
      maxed
        ? box(px, `attr-max-${attribute}`, 1066, y + 38, 144, 48, { color: P.green, radius: 14, border: 3, justify: 'center', align: 'center' }, [
            <Label value="MAXED" fontSize={fs(20)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
          ])
        : [
            box(px, `attr-cost-${attribute}`, 1066, y + 12, 144, 58, { color: P.navyDeep, radius: 12, border: 2, borderColor: Color4.create(1, 1, 1, 0.35), column: true, justify: 'center', align: 'center' }, [
              <Label value="NEXT UPGRADE" fontSize={fs(10)} color={P.pale} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(14) }} />,
              <UiEntity uiTransform={{ height: px(28), flexDirection: 'row', alignItems: 'center' }}>
                {materialIcon(px, material, 26)}
                <Label value={String(cost)} fontSize={fs(21)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(28), margin: { left: px(6) } }} />
                <Label value={MATERIAL_NAMES[material]} fontSize={fs(13)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(28), margin: { left: px(5) } }} />
              </UiEntity>,
              <Label value={`you have ${fmt(balance)}`} fontSize={fs(11)} color={enough ? P.green : SHORT} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(14) }} />
            ]),
            upgradeAvailable && enough
              ? button2(
                  px,
                  {
                    id: `upgrade-${attribute}`, x: 1066, y: y + 76, w: 144, h: 36, color: canUpgrade ? P.yellow : C.disabled, radius: 12, shadow: 4,
                    shadowColor: canUpgrade ? P.yellowShadow : C.dark, disabled: !canUpgrade,
                    onClick: () => {
                      if (!club) return
                      lobbyMenuState.busy = true
                      upgradeGolfclubAttribute(club.ItemInstanceId, attribute).finally(() => {
                        lobbyMenuState.busy = false
                      })
                    }
                  },
                  [<Label value="+1 UPGRADE" fontSize={fs(15)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(36) }} />]
                )
              : text(px, fs, why, 1066, y + 78, 144, 30, 12, enough ? P.pale : SHORT, 'middle-center')
          ]
    ]
  }

  const materialPill = (code: string, x: number) =>
    navyPill(px, fs, `ws-${code}`, x, 44, 120, 46, [
      materialIcon(px, code, 28),
      <Label value={num((r as any)[code] || 0)} fontSize={fs(17)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(8) } }} />
    ])

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_workshop', back),
    materialPill('WD', 724),
    materialPill('ST', 852),
    materialPill('IR', 980),
    materialPill('DM', 1108),

    img(px, 'tt_my_clubs', 52, 126),
    ...pageClubs.map((c, j) => clubCard(c, page * perPage + j, j)),
    paged ? pageButton('clubs-prev', 'ic_chev_left_w', page > 0, page - 1, 52) : null,
    paged ? text(px, fs, `${page + 1} / ${pages}`, 100, CLUBS_TOP + perPage * CLUB_SLOT + 4, 194, 40, 18, P.white, 'middle-center') : null,
    paged ? pageButton('clubs-next', 'ic_chev_right_w', page < pages - 1, page + 1, 298) : null,
    box(px, 'clubs-note', 52, 622, 290, 68, { color: P.navyDeep, radius: 16, border: 3, borderColor: P.navyEdge, align: 'center', padding: { left: px(14), right: px(12) } }, [
      <Label value="NFT clubs come maxed out. Your basic club levels up with materials." fontSize={fs(13)} color={P.pale} textAlign="middle-left" textWrap="wrap" uiTransform={{ width: '100%', height: px(56) }} />
    ]),

    box(px, 'club', 362, 122, 380, 568, { ...card, color: P.purple }),
    text(px, fs, club ? clubName(club) : '-', 380, 140, 344, 36, 28, P.white, 'middle-center'),
    <UiEntity
      key="club-thumb"
      uiTransform={{ ...at(px, 437, 186, 230, 230), borderRadius: px(24), borderWidth: border(px, 4), borderColor: P.white }}
      uiBackground={club ? { texture: { src: `images/${club.golfclubId}.png` }, textureMode: 'stretch' } : { color: P.dim }}
    />,
    text(px, fs, 'CLUB LEVEL', 388, 430, 200, 24, 16),
    text(px, fs, club && !isBasic(club) ? 'MAX' : `${level} / 16`, 516, 430, 200, 24, 16, C.yellow, 'middle-right'),
    box(px, 'club-bar', 388, 460, 328, 18, { color: P.dim, radius: 9 }, [
      <UiEntity uiTransform={{ width: `${club && !isBasic(club) ? 100 : Math.round((100 * level) / 16)}%`, height: '100%', borderRadius: px(9) }} uiBackground={{ color: C.yellow }} />
    ]),
    text(
      px, fs,
      club && isBasic(club)
        ? club.xp
          ? `Club XP level ${xpLevel}: ${upgradesNow} upgrade${upgradesNow === 1 ? '' : 's'} available now`
          : 'Play holes with this club to earn club XP'
        : 'NFT club: all attributes at their maximum',
      388, 484, 328, 40, 14, hex('#F1E6FF'), 'middle-left', true
    ),
    button2(
      px,
      {
        id: 'club-equip', x: 388, y: 546, w: 328, h: 56, color: equipped || busy ? C.disabled : P.lavender, radius: 16, shadow: 6,
        shadowColor: equipped || busy ? C.dark : P.lavenderShadow, disabled: equipped || busy || !club,
        onClick: () => {
          if (!club) return
          lobbyMenuState.busy = true
          selectGolfclub(club.tokenId).finally(() => {
            lobbyMenuState.busy = false
          })
        }
      },
      [<Label value={equipped ? 'EQUIPPED' : 'EQUIP'} fontSize={fs(22)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(56) }} />]
    ),
    box(px, 'club-mint', 388, 616, 328, 58, { color: P.dim, radius: 16, border: 3, borderColor: Color4.create(1, 1, 1, 0.5), column: true, justify: 'center', align: 'center' }, [
      <Label value="MINT AS NFT" fontSize={fs(17)} color={hex('#D9D2FF')} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />,
      <Label value="level 16 + 120 diamonds" fontSize={fs(12)} color={hex('#D9D2FF')} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
    ]),

    img(px, 'tt_attributes', 762, 126),
    ...attributeRow('power', 158),
    ...attributeRow('control', 294),
    ...attributeRow('aim', 430),
    box(px, 'ws-tip', 762, 572, 466, 118, { ...card, color: P.teal }),
    // The workshop's craftsman, popping out of the tip card.
    img(px, 'workshop_bust', 770, 536),
    text(
      px, fs,
      'Upgrade costs grow with each level: 10, 20, 30, 60 then 120 materials. Power eats iron, control eats stone, aim eats wood.',
      930, 584, 284, 94, 14, hex('#E8FFFB'), 'middle-left', true
    )
  ])
}

// ---------------------------------------------------------------------------
// PRIZES (Prizes2.dc.html)

// A 5x4 grid of the season's wearables next to the real TOP 10. A sold-out
// wearable pays Fashion Tickets instead, so its cell shows the FT icon and
// that amount; no stock counts.
const CELL_W = (790 - 8 - 24 - 40) / 5
const CELL_H = (568 - 8 - 24 - 30) / 4
const CELL_COLORS = [hex('#2D6FE0'), hex('#8B2BE0'), hex('#E03AB8')]
// Diamonds for the Season's top 10, by position.
const TOP10_PRIZES = [500, 300, 200, 100, 100, 100, 100, 100, 100, 100]
const GOLD_ROW = Color4.create(8 / 255, 18 / 255, 40 / 255, 0.3)

// "Golfcraft x COCOBAY Cap" -> "Cap": the header already names the collection.
const prizeName = (name: string) => shortName(name).replace(/^cocobay\s*/i, '')

// Without the stock service there are still 20 wearable tiers in the season
// table; show those ranks so the grid is never blank.
const fallbackPrizes = (): SeasonPrize[] =>
  seasonTierDefinitions
    .map((def: any, tier: number) => ({ def, tier }))
    .filter(({ def }: any) => def?.prize?.wearable)
    .slice(0, 20)
    .map(({ tier }: any, i: number) => ({ name: `Wearable ${i + 1}`, tierReward: Number(getPointsToTier(tier) || 0), stock: 1 }))

const rankChip = (px: Px, fs: Px, tier: number, h: number, size: number) => (
  <UiEntity uiTransform={{ height: px(h), flexDirection: 'row', alignItems: 'center', padding: { left: px(6), right: px(8) }, borderRadius: px(h / 2.4), alignSelf: 'flex-start', flexShrink: 0 }} uiBackground={{ color: P.dimmer }}>
    <UiEntity
      uiTransform={{ width: px(10), height: px(10), borderRadius: px(5), borderWidth: border(px, 2), borderColor: P.white }}
      uiBackground={{ color: hex(TIER_COLORS[getCatFromTier(tier)] || '#FFFFFF') }}
    />
    <Label value={seasonTierDefinitions[tier]?.name || ''} fontSize={fs(size)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(h), margin: { left: px(5) } }} />
  </UiEntity>
)

export const PrizesView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const userData = globalStore.userData.getState()
  const tierSub = Number(userData['statistic_tier-sub'] || 0)
  const tierSubMax = Math.max(tierSub, Number(userData['statistic_tier-sub-max'] || 0))
  const live = lobbyMenuState.prizes.length > 0
  const prizes = (live ? [...lobbyMenuState.prizes].sort((a, b) => a.tierReward - b.tierReward) : fallbackPrizes()).slice(0, 20)
  const nextIndex = live ? prizes.findIndex((p) => p.tierReward > tierSubMax) : -1
  const received = live ? prizes.filter((p) => p.tierReward <= tierSubMax) : []
  const last = received.length ? received[received.length - 1] : null
  const next = nextIndex >= 0 ? prizes[nextIndex] : null
  const myTier = tierOf(tierSub)
  const toNext = next ? Math.max(0, next.tierReward - tierSub) : 0
  const myPlayFabId = getPlayFabId()
  const board = lobbyMenuState.leaderboard
  const hx = headerRight(px, 'rb_prizes')

  const cell = (p: SeasonPrize, i: number) => {
    const tier = tierOf(p.tierReward)
    const soldOut = live && prizeSoldOut(p)
    const claimed = live && p.tierReward <= tierSubMax
    const isNext = i === nextIndex
    const x = 56 + 12 + (i % 5) * (CELL_W + 10)
    const y = 126 + 12 + Math.floor(i / 5) * (CELL_H + 10)
    const pic = soldOut ? 'images/icons/ft.png' : p.thumbnail
    const picSize = soldOut ? 62 : 84
    return [
      box(px, `prize-${i}`, x, y, CELL_W, CELL_H, { color: CELL_COLORS[i < 10 ? 0 : i < 15 ? 1 : 2], radius: 14, border: isNext ? 4 : 3, borderColor: isNext ? C.yellow : Color4.create(1, 1, 1, 0.7) }),
      pic ? (
        <UiEntity key={`prize-pic-${i}`} uiTransform={at(px, x + (CELL_W - picSize) / 2, y + (soldOut ? 26 : 14), picSize, picSize)} uiBackground={{ texture: { src: pic }, textureMode: 'stretch' }} />
      ) : null,
      <UiEntity key={`prize-rank-${i}`} uiTransform={at(px, x + 6, y + 6)}>
        {rankChip(px, fs, tier, 18, 11)}
      </UiEntity>,
      box(px, `prize-foot-${i}`, x + 3, y + CELL_H - 27, CELL_W - 6, 24, { color: P.dimmer, radius: 10, align: 'center', padding: { left: px(8), right: px(6) } }, [
        <Label
          value={soldOut ? `SOLD OUT · ${p.fashionTickets ? fmt(p.fashionTickets) + ' ' : ''}FT` : prizeName(p.name)}
          fontSize={fs(soldOut ? 11 : 12)}
          color={soldOut ? C.yellow : P.white}
          textAlign="middle-left"
          textWrap="nowrap"
          uiTransform={{ height: px(24) }}
        />
      ]),
      claimed
        ? box(px, `prize-ok-${i}`, x + CELL_W - 30, y + 4, 26, 26, { color: P.green, radius: 13, border: 3, justify: 'center', align: 'center' }, [img(px, 'gl_check', undefined, undefined, 0.45)])
        : null,
      isNext
        ? box(px, `prize-next-${i}`, x + CELL_W - 54, y + 5, 48, 20, { color: C.yellow, radius: 9, border: 2, justify: 'center', align: 'center' }, [
            <Label value="NEXT" fontSize={fs(11)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />
          ])
        : null
    ]
  }

  // One leaderboard row: position, name, rank, points and the diamonds that
  // position wins. Mine is pink. Without data the names and points read "—".
  const boardRow = (i: number) => {
    const entry = board[i]
    const mine = !!entry && !!myPlayFabId && entry.playFabId === myPlayFabId
    return box(px, `top-${i}`, 882, 210 + i * 36, 326, 34, { color: mine ? P.pink : GOLD_ROW, radius: 10, align: 'center', padding: { left: px(8), right: px(8) } }, [
      <Label value={String(i + 1)} fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: px(24), height: px(34), flexShrink: 0 }} />,
      <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: px(34), overflow: 'hidden' }}>
        <Label value={entry ? entry.name : '—'} fontSize={fs(14)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '100%', height: px(34) }} />
      </UiEntity>,
      <UiEntity uiTransform={{ width: px(98), height: px(34), justifyContent: 'center', flexShrink: 0 }}>{entry ? rankChip(px, fs, tierOf(entry.points), 20, 10) : null}</UiEntity>,
      <Label value={entry ? String(entry.points) : '—'} fontSize={fs(14)} color={P.white} textAlign="middle-right" textWrap="nowrap" uiTransform={{ width: px(38), height: px(34), flexShrink: 0 }} />,
      <Label value={String(TOP10_PRIZES[i])} fontSize={fs(14)} color={P.white} textAlign="middle-right" textWrap="nowrap" uiTransform={{ width: px(40), height: px(34), margin: { left: px(4) }, flexShrink: 0 }} />,
      materialIcon(px, 'DM', 18, { left: px(4) })
    ])
  }

  const youText = !live
    ? 'Prize stock unavailable right now'
    : `${last ? `${prizeName(last.name)} received. ` : 'No prize received yet. '}${
        next ? `${prizeName(next.name)} unlocks at ${seasonTierDefinitions[tierOf(next.tierReward)]?.name || ''}, ${toNext} season points away.` : 'Every prize received!'
      }`

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_prizes', back),
    box(px, 'collection', hx, 51, 200, 32, { color: P.pink, radius: 12, border: 2, justify: 'center', align: 'center' }, [
      <Label value="Golfcraft x COCOBAY" fontSize={fs(15)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(32) }} />
    ]),
    text(px, fs, 'Reach the rank and it is sent to you. Sold out? You get Fashion Tickets.', 690, 52, 538, 30, 15, P.paler, 'middle-right'),

    box(px, 'prize-grid', 52, 122, 790, 568, card),
    ...prizes.map((p, i) => cell(p, i)),

    box(px, 'top10', 862, 122, 366, 568, { ...card, color: P.gold }),
    img(px, 'tt_top10', 884, 144),
    text(px, fs, 'Diamonds for the best players when the season ends', 884, 180, 326, 22, 13, hex('#FFF3D6')),
    ...Array.from({ length: 10 }, (_, i) => boardRow(i)),
    box(px, 'you', 882, 586, 326, 88, { color: P.navy, radius: 16, border: 3, borderColor: P.navyEdge, align: 'center', padding: { left: px(10), right: px(10) } }, [
      rankBadge(px, myTier, 46),
      <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: 'column', margin: { left: px(10) } }}>
        <Label value={`YOU · ${seasonTierDefinitions[myTier]?.name || 'WOOD 5'}`} fontSize={fs(14)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20) }} />
        <Label value={youText} fontSize={fs(12)} color={P.paler} textAlign="middle-left" textWrap="wrap" uiTransform={{ width: '100%', height: px(50) }} />
      </UiEntity>
    ])
  ])
}

// ---------------------------------------------------------------------------
// DAILY MISSIONS (DailyMissions2.dc.html)

const DAILY_NOTE = 'Rewards land in your account the moment a mission completes. Missions renew every 24 hours.'
const REWARD_ORDER = ['FT', 'DM', 'GD', 'IR', 'ST', 'WD', 'GC', 'PT', 'EN']

// A counted mission's target is the number at the end of its alias
// (competition-played5 -> 5, tournament-finished4 -> 4); the all-modes
// training one counts its 4 modes. No number, no progress bar.
const missionTarget = (alias: string): number | null => {
  if (alias === 'training-success-all-modes') return 4
  const m = /(\d+)$/.exec(alias)
  return m ? Number(m[1]) : null
}
// Tournaments, competitions, refining and crafting are not in the SDK7 scene
// yet: only Season runs and training missions can actually be completed.
const missionAvailable = (alias: string) => alias === 'season-game' || alias.startsWith('training-')

// Time until the server redraws the set: its date + 24 h. Null once passed.
const renewalText = (date?: string): string | null => {
  const left = (date ? Date.parse(date) : NaN) + 24 * 3600 * 1000 - Date.now()
  if (isNaN(left) || left <= 0) return null
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  return `${h}h ${m}m`
}

export const DailyMissionsView = () => {
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const data = lobbyHudState.dailyMissions
  const missions: DailyMission[] = data?.state.missions || []
  const index = data ? data.dailyMissionIndex : 0
  const stepNow = data ? data.dailyMissionStep : 0
  const total = missions.length || 5
  const doneCount = Math.min(index, total)
  const renew = renewalText(data?.state.date)
  const hx = headerRight(px, 'rb_daily')

  // Rewards still to earn: every mission not yet done, grouped by material.
  const toEarn: Record<string, number> = {}
  missions.forEach((m, i) => {
    if (i < index || !m.rewards) return
    for (const code of Object.keys(m.rewards)) toEarn[code] = (toEarn[code] || 0) + Number(m.rewards[code] || 0)
  })
  const order = (code: string) => {
    const i = REWARD_ORDER.indexOf(code)
    return i < 0 ? 99 : i
  }
  const toEarnCodes = Object.keys(toEarn).sort((a, b) => order(a) - order(b))

  const rowH = (568 - 4 * 10) / 5
  const missionRow = (m: DailyMission, i: number) => {
    const done = i < index
    const active = i === index
    const locked = i > index
    const y = 122 + i * (rowH + 10)
    const target = missionTarget(m.alias)
    const available = missionAvailable(m.alias)
    const fg = active ? P.ink : P.white
    const rewards = m.rewards ? Object.keys(m.rewards) : []
    const smallTag = (value: string, color: Color4) => (
      <UiEntity uiTransform={{ height: px(20), padding: { left: px(9), right: px(9) }, margin: { left: px(10) }, borderRadius: px(8), justifyContent: 'center', flexShrink: 0 }} uiBackground={{ color: hex('#1C0A3F') }}>
        <Label value={value} fontSize={fs(12)} color={color} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />
      </UiEntity>
    )
    return [
      box(px, `mission-${i}`, 52, y, 840, rowH, {
        color: done ? P.teal : active ? P.yellow : Color4.create(P.navy.r, P.navy.g, P.navy.b, 0.8),
        radius: 18,
        border: 4,
        borderColor: locked ? Color4.create(1, 1, 1, 0.8) : P.white,
        shadow: 8
      }),
      box(px, `mission-badge-${i}`, 70, y + (rowH - 50) / 2, 50, 50, { color: done ? P.green : active ? P.ink : P.dim, radius: 25, border: 3, justify: 'center', align: 'center' }, [
        done ? img(px, 'gl_check', undefined, undefined, 0.75) : <Label value={String(i + 1)} fontSize={fs(24)} color={active ? C.yellow : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ]),
      <UiEntity key={`mission-title-${i}`} uiTransform={{ ...at(px, 138, y + 18, 560, 30), flexDirection: 'row', alignItems: 'center' }}>
        <Label value={m.description} fontSize={fs(21)} color={fg} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(30) }} />
        {active ? smallTag('IN PROGRESS', C.yellow) : null}
        {done ? smallTag('DONE', P.green) : null}
        {!done && !available ? smallTag('Not in this version yet', hex('#FFB38A')) : null}
      </UiEntity>,
      <UiEntity key={`mission-rewards-${i}`} uiTransform={{ ...at(px, 138, y + 56, 560, 26), flexDirection: 'row', alignItems: 'center' }}>
        <Label value="REWARDS" fontSize={fs(12)} color={active ? P.ink : P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(26) }} />
        {rewards.map((code) => (
          <UiEntity key={code} uiTransform={{ height: px(26), flexDirection: 'row', alignItems: 'center', padding: { left: px(5), right: px(9) }, margin: { left: px(8) }, borderRadius: px(9) }} uiBackground={{ color: P.dim }}>
            {materialIcon(px, code, 20)}
            <Label value={`${m.rewards ? m.rewards[code] : ''} ${code}`} fontSize={fs(14)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(26), margin: { left: px(5) } }} />
          </UiEntity>
        ))}
      </UiEntity>,
      active && target ? text(px, fs, `${Math.min(stepNow, target)} / ${target}`, 700, y + 24, 70, 20, 15, P.ink, 'middle-right') : null,
      active && target
        ? box(px, `mission-bar-${i}`, 620, y + 50, 150, 14, { color: P.dim, radius: 7 }, [
            <UiEntity uiTransform={{ width: `${Math.round((100 * Math.min(stepNow, target)) / target)}%`, height: '100%', borderRadius: px(7) }} uiBackground={{ color: P.green }} />
          ])
        : null,
      ...[1, 2, 3, 4, 5].map((n) => img(px, n <= (m.difficulty || 0) ? 'gl_star_on' : 'gl_star_off', 786 + (n - 1) * 19, y + rowH / 2 - 8, 0.5))
    ]
  }

  const earnPills = toEarnCodes.map((code, k) =>
    box(px, `earn-${code}`, 930 + (k % 2) * 142, 380 + Math.floor(k / 2) * 48, 134, 40, { color: P.glass, radius: 12, align: 'center', padding: { left: px(8) } }, [
      materialIcon(px, code, 26),
      <Label value={`${toEarn[code]} ${code}`} fontSize={fs(17)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(8) } }} />
    ])
  )

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_daily', back),
    yellowTag(px, fs, 'Done in order, one at a time', hx, 51, 236),
    navyPill(px, fs, 'renew', 1018, 38, 210, 60, [
      img(px, 'ic_timer_w', undefined, undefined, 0.7),
      renew ? (
        <UiEntity uiTransform={{ flexDirection: 'column', margin: { left: px(10) } }}>
          <Label value="NEW MISSIONS IN" fontSize={fs(11)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(16) }} />
          <Label value={renew} fontSize={fs(21)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(26) }} />
        </UiEntity>
      ) : (
        <Label value="New missions soon" fontSize={fs(16)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(52), margin: { left: px(10) } }} />
      )
    ]),

    ...(missions.length
      ? missions.map((m, i) => missionRow(m, i))
      : [text(px, fs, data ? 'No missions today' : 'Loading missions...', 52, 122, 840, 568, 22, P.white, 'middle-center')]),

    box(px, 'today', 912, 122, 316, 186, { ...card, color: P.purple }),
    text(px, fs, 'TODAY', 912, 138, 316, 18, 13, hex('#E9DDFF'), 'middle-center'),
    text(px, fs, `${doneCount} / ${total}`, 912, 158, 316, 70, 60, C.yellow, 'middle-center'),
    text(px, fs, 'missions done', 912, 228, 316, 22, 16, P.white, 'middle-center'),
    ...Array.from({ length: total }, (_, i) => (
      <UiEntity
        key={`today-${i}`}
        uiTransform={{ ...at(px, 912 + (316 - (total * 36 + (total - 1) * 6)) / 2 + i * 42, 264, 36, 12), borderRadius: px(6) }}
        uiBackground={{ color: i < index ? P.green : i === index ? C.yellow : P.dimmer }}
      />
    )),

    box(px, 'earn', 912, 324, 316, 366, card),
    img(px, 'tt_still_to_earn', 930, 342),
    ...earnPills,
    toEarnCodes.length ? null : text(px, fs, data ? 'Everything earned today!' : 'Loading...', 930, 380, 280, 40, 16, P.pale),
    text(px, fs, DAILY_NOTE, 930, 604, 280, 70, 14, P.pale, 'middle-left', true)
  ])
}

