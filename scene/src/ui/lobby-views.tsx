// The lobby dialog's sub-views, after the "Móvil · propuesta 2" page of the
// GolfCraft UI canvas, on phones and desktop alike: SEASON (M2Season.dc.html),
// TUTORIAL (M2Story), WORKSHOP (M2Workshop), PRIZES (M2Prizes), DAILY
// MISSIONS (M2Daily) and MORE GAMES (page "Más juegos", OGList). Full screen
// like the lobby view, with back, the screen's ribbon and close on top. They
// only read the scene's state and call the handlers the 3D lobby already uses.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { changeRealm } from '~system/RestrictedActions'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState, DailyMission } from './lobby-hud-state'
import { lobbyMenuState, showLobbyView, closeLobbyMenu, SeasonPrize, markStartedFromMenu, nextSeasonPrize, prizeSoldOut, seasonPlayState } from './lobby-menu-state'
import { C, hex, fmt, shortName, materialIcon } from './ui-theme'
import { fullLayout, scaler, type Px } from './ui-scale'
import {
  P, at, img, imgW, imgBox, text, box, fullFrame, button2, squareButton, sideCard, nextPrizeStrip, yellowTag, resIcon, rankBadge, border, energyChip
} from './ui2'
import { isMobile } from '../services/platform'
import { gameOptions, setControlScheme, type ControlScheme } from '../services/game-options'
import { talkToNpc } from '../components/lobby/npc-storymode/npc-storymode'
import { getGolfclubCollection, selectGolfclub, upgradeGolfclubAttribute } from '../components/lobby/lobby-training'
import { BoardGolfclub } from '../components/lobby/golfclub-screen/golfclub-screen-ui'
import { GOLF_CLUB_NAMES, getPlayFabId, nftClubsReadFailed } from '../meta/bootstrap'
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
// WATCH: the games being played right now (2026-11-04).
import { liveGamesAreStale, liveGamesState, refreshLiveGames, type LiveGame } from '../services/live-games'

const back = () => showLobbyView('lobby')
const tierOf = (tierSub: number) => Number(getTierFromSub(tierSub) || 0)
const seasonNameNow = () =>
  (seasonCatalog as any)[String(globalStore.userData.getState()?.config?.currentSeasonCollectionId ?? 4)]?.name || 'MOUNTAIN'

// ---------------------------------------------------------------------------
// The sub-views are full screen, like the lobby (canvas page "Móvil ·
// propuesta 2"): a 667x375 design with the explorer's corners left free.

const RIBBON_SCALE = 0.55
// Top bar of every sub-view: back, the screen's ribbon, close.
const fullHeader = (px: Px, ribbonKey: string) => [
  squareButton(px, 'view-back', 140, 6, 'ic_chev_left_w', 0.8, back),
  img(px, ribbonKey, 194, 9, RIBBON_SCALE),
  squareButton(px, 'view-close', 617, 6, 'ic_close_w', 0.67, closeLobbyMenu)
]
const afterRibbon = (ribbonKey: string) => 194 + imgW(ribbonKey, RIBBON_SCALE) + 8
const topTag = (px: Px, fs: Px, value: string, x: number, w: number) => yellowTag(px, fs, value, x, 17, w, 22, 11)

// Diamonds for the Season's top 10, by position.
const TOP10_PRIZES = [500, 300, 200, 100, 100, 100, 100, 100, 100, 100]
const GOLD_ROW = Color4.create(8 / 255, 18 / 255, 40 / 255, 0.3)

// The Season's TOP 10 like the original panel, in the right column: position,
// player, season points and the diamonds that place wins, with no rank per
// line. Mine is pink; without data the names and points read "—". It is only
// information, so it may run under the explorer's buttons.
const top10Card = (px: Px, fs: Px, y: number, h: number, rowH: number, subtitle: string) => {
  const board = lobbyMenuState.leaderboard
  const myPlayFabId = getPlayFabId()
  const rowsTop = y + 54
  return [
    box(px, 'top10', 498, y, 163, h, { color: P.gold, radius: 14, border: 3, shadow: 4 }),
    img(px, 'tt_top10', 507, y + 7, 0.62),
    text(px, fs, subtitle, 507, y + 26, 147, 13, 10, hex('#FFF4DD')),
    text(px, fs, '#', 509, y + 41, 14, 12, 9, hex('#FFF0CC')),
    text(px, fs, 'PLAYER', 524, y + 41, 60, 12, 9, hex('#FFF0CC')),
    text(px, fs, 'PTS', 584, y + 41, 28, 12, 9, hex('#FFF0CC'), 'middle-right'),
    text(px, fs, 'PRIZE', 613, y + 41, 40, 12, 9, hex('#FFF0CC'), 'middle-right'),
    ...Array.from({ length: 10 }, (_, i) => {
      const entry = board[i]
      const mine = !!entry && !!myPlayFabId && entry.playFabId === myPlayFabId
      const ry = rowsTop + i * (rowH + 2)
      return [
        box(px, `top-${i}`, 504, ry, 151, rowH, { color: mine ? P.pink : GOLD_ROW, radius: 6 }),
        text(px, fs, String(i + 1), 509, ry, 14, rowH, 11),
        <UiEntity key={`top-name-${i}`} uiTransform={{ ...at(px, 524, ry, 60, rowH), overflow: 'hidden' }}>
          <Label value={entry ? entry.name : '—'} fontSize={fs(11)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        </UiEntity>,
        text(px, fs, entry ? String(entry.points) : '—', 584, ry, 28, rowH, 11, P.white, 'middle-right'),
        text(px, fs, String(TOP10_PRIZES[i]), 613, ry, 28, rowH, 11, P.white, 'middle-right'),
        <UiEntity key={`top-dm-${i}`} uiTransform={at(px, 643, ry + (rowH - 10) / 2, 10, 10)}>
          {materialIcon(px, 'DM', 10)}
        </UiEntity>
      ]
    })
  ]
}

// ---------------------------------------------------------------------------
// SEASON (M2Season.dc.html)

// Time the other players get once someone holes, by tier category
// (server/rooms/Season-Room.ts countdownByTierCat).
const ENDING_SECONDS = [30, 28, 25, 20, 15, 15, 15, 15, 15, 15]
const NUMERALS = ['V', 'IV', 'III', 'II', 'I']
const RANK_TEXT = hex('#E8DFFF')
const BAR_TRACK = hex('#150A33')

export const SeasonView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const userData = globalStore.userData.getState()
  const tierSub = Number(userData['statistic_tier-sub'] || 0)
  const tierSubMax = Math.max(tierSub, Number(userData['statistic_tier-sub-max'] || 0))
  const tier = tierOf(tierSub)
  const cat = getCatFromTier(tier)
  const step = Math.max(0, Math.min(4, tier - cat * 5))
  const ptsOnTier = Number(getPointsOnCurrentTier(tierSub) || 0)
  const ptsPerTier = Number(seasonPointsPerCategory[cat] || 5)
  const nextTierName = seasonTierDefinitions[tier + 1]?.name || null
  const nextCat = Math.min(cat + 1, TIER_CATEGORIES.length - 1)
  const nextCatAt = Number(getPointsToTier(nextCat * 5) || 0)
  const prize = nextSeasonPrize(tierSubMax)
  const prizeTier = prize ? seasonTierDefinitions[tierOf(prize.tierReward)]?.name || '' : ''
  const st = seasonPlayState()
  const hx = afterRibbon('rb_season')

  const segments = NUMERALS.map((numeral, k) => {
    const x = 226 + k * 51
    const fill = k < step ? 100 : k === step ? Math.max(0, Math.min(100, (100 * ptsOnTier) / ptsPerTier)) : 0
    return [
      box(px, `seg-${k}`, x, 118, 46, 14, { color: k < step ? P.green : BAR_TRACK, radius: 5, border: k === step ? 2 : 0, borderColor: C.yellow }, [
        k === step ? <UiEntity uiTransform={{ width: `${fill}%`, height: '100%', borderRadius: px(3) }} uiBackground={{ color: C.yellow }} /> : null
      ]),
      text(px, fs, numeral, x, 134, 46, 12, 10, k === step ? C.yellow : RANK_TEXT, 'middle-center')
    ]
  })

  const medals = TIER_CATEGORIES.map((_: string, c: number) => {
    const x = 163 + c * 32.5
    const mine = c === cat
    return [
      mine ? box(px, `medal-ring-${c}`, x - 2, 263, 26, 26, { color: Color4.create(1, 0.82, 0.12, 0.25), radius: 13, border: 2, borderColor: C.yellow }) : null,
      img(px, `medal_${c}`, x, 265, 22 / 60, mine ? undefined : Color4.create(1, 1, 1, 0.6))
    ]
  })

  const holePoints = [
    ['1st', '+2', P.green],
    ['2nd', '+1', P.green],
    ['3rd', '0', P.white],
    ['4th', '−1', SHORT]
  ].map(([place, pts, color], k) => [
    text(px, fs, place as string, 16, 133 + k * 17, 60, 15, 12),
    text(px, fs, pts as string, 90, 133 + k * 17, 46, 15, 12, color as Color4, 'middle-right')
  ])

  const friendsSub = st.friendsCaption.indexOf('\n') >= 0 ? 'Play together' : st.friendsCaption
  return fullFrame(L, [
    ...fullHeader(px, 'rb_season'),
    topTag(px, fs, `${seasonNameNow()} Season`, hx, 116),
    box(px, 'energy', 521, 10, 90, 36, { color: P.navyDeep, radius: 10, border: 2, borderColor: P.navyEdge, align: 'center', justify: 'center' }, [
      resIcon(px, 'EN', 20),
      <Label value={`${fmt(st.energy)} energy`} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32), margin: { left: px(5) } }} />
    ]),

    box(px, 'how', 6, 58, 140, 188, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'HOW A RUN WORKS', 16, 64, 124, 16, 13),
    text(px, fs, '4 holes against 3 players at your rank', 16, 82, 124, 30, 11, P.white, 'middle-left', true),
    text(px, fs, 'SEASON POINTS PER HOLE', 16, 116, 124, 13, 10, P.pale),
    ...holePoints,
    text(px, fs, `Once someone holes, the rest get ${ENDING_SECONDS[cat] || 15} s`, 16, 206, 124, 30, 10, P.pale, 'middle-left', true),

    box(px, 'your-rank', 152, 58, 340, 132, { color: P.rankBox, radius: 14, border: 2, borderColor: P.rankEdge, shadow: 4, shadowColor: P.rankShadow }),
    rankBadge(px, tier, 52, 162, 70),
    text(px, fs, 'YOUR RANK', 226, 67, 120, 13, 10, RANK_TEXT),
    text(px, fs, seasonTierDefinitions[tier]?.name || 'WOOD 5', 226, 79, 180, 30, 24),
    text(px, fs, `${tierSub} pts`, 400, 86, 82, 16, 13, P.white, 'middle-right'),
    ...segments,
    text(px, fs, nextTierName ? `${ptsPerTier - ptsOnTier} pts to ${nextTierName}` : 'Top rank reached', 226, 158, 140, 14, 11, RANK_TEXT),
    nextCat > cat ? text(px, fs, `${TIER_CATEGORIES[nextCat]} at ${nextCatAt} pts`, 360, 158, 122, 14, 11, RANK_TEXT, 'middle-right') : null,

    ...nextPrizeStrip(px, fs, 'season-prize', 152, 196, 340, 44, prize, prizeTier, prize ? Math.max(0, prize.tierReward - tierSub) : 0, lobbyMenuState.prizes.length > 0),

    box(px, 'ranks', 152, 246, 340, 48, { color: P.navyDeep, radius: 12, border: 2, borderColor: P.navyEdge }),
    text(px, fs, '10 RANKS · 5 STEPS EACH', 163, 249, 200, 12, 10, P.pale),
    ...medals,

    button2(
      px,
      {
        id: 'season-play', x: 152, y: 302, w: 222, h: 52, color: st.canPlay ? P.yellow : C.disabled, radius: 15, shadow: 5, shadowColor: st.canPlay ? P.yellowShadow : C.dark,
        disabled: !st.canPlay, onClick: st.startSeason, padding: { bottom: px(12) }
      },
      [
        img(px, 'bt_play', undefined, undefined, 0.5),
        <UiEntity uiTransform={{ width: px(8) }} />,
        img(px, 'ic_play_n', undefined, undefined, 0.5),
        energyChip(px, fs, 'season-play-energy', 63, 32, 96, 16, st.playCaption, 10)
      ]
    ),
    button2(
      px,
      {
        id: 'season-friends', x: 380, y: 302, w: 112, h: 52, color: st.canFriends ? P.lavender : C.disabled, radius: 15, shadow: 5,
        shadowColor: st.canFriends ? P.lavenderShadow : C.dark, disabled: !st.canFriends, onClick: st.startFriends, row: false
      },
      [
        // While a party waits, its rank (the host's) takes the icon's place.
        st.friendsRoomTier >= 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: px(16) }}>
            {rankBadge(px, st.friendsRoomTier, 16)}
            <Label value={st.friendsRoomTierName} fontSize={fs(10)} color={P.ink} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(16), margin: { left: px(3) } }} />
          </UiEntity>
        ) : (
          img(px, 'ic_people_n', undefined, undefined, 0.42)
        ),
        <Label value="FRIENDS" fontSize={fs(14)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />,
        <Label value={friendsSub} fontSize={fs(10)} color={P.ink} textAlign="middle-center" textWrap="wrap" uiTransform={{ width: px(106), height: px(14) }} />
      ]
    ),

    sideCard(px, 'season-prizes', 58, P.pink, 'art_prizes_sq', 'tt_card_prizes', () => showLobbyView('prizes'), [
      text(px, fs, lobbyMenuState.prizes.length ? `${lobbyMenuState.prizes.length} wearables` : 'Season wearables', 51, 26, 100, 14, 11)
    ]),
    ...top10Card(px, fs, 116, 255, 16, 'Diamonds when the season ends')
  ])
}

// ---------------------------------------------------------------------------
// TUTORIAL (M2Story.dc.html)

const TUTORIAL_STEPS = 9
const NODE_LABELS = ['Welcome, intern', 'Sphere 1 of 4', 'Sphere 2 of 4', 'Sphere 3 of 4', 'Sphere 4 of 4', 'Secret emote', 'Sharpen your aim', 'Play ranked', 'Reach STONE']
// One line per mission for Dr. Par's card: a summary, not the dialog.
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
// Node centres on the map card: a zigzag of 9 nodes, 36 px apart.
const NODE_CX = (i: number) => 177 + 36 * i
const NODE_CY = (i: number) => (i % 2 === 0 ? 131 : 185)
const SPHERE = hex('#EF57B4')
const SPHERE_RING = hex('#9FF5E8')
const NODE_TODO = hex('#2A3170')
const NODE_TODO_EDGE = hex('#4A55B8')
const NODE_TODO_TEXT = hex('#9FA8E8')
const PATH_DOT = Color4.create(1, 1, 1, 0.35)

const mapNode = (px: Px, fs: Px, i: number, mission: number, done: boolean) => {
  const n = i + 1
  const status = done || n < mission ? 'done' : n === mission ? 'current' : 'pending'
  const cx = NODE_CX(i)
  const cy = NODE_CY(i)
  if (status === 'current') {
    return [
      box(px, `node-ring-${i}`, cx - 19, cy - 19, 38, 38, { color: C.yellow, radius: 19 }),
      box(px, `node-${i}`, cx - 16, cy - 16, 32, 32, { color: SPHERE, radius: 16, border: 3, justify: 'center', align: 'center' }, [
        <Label value={String(n)} fontSize={fs(14)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ]),
      box(px, `node-here-${i}`, cx - 30, cy + 21, 60, 13, { color: C.yellow, radius: 6, justify: 'center', align: 'center' }, [
        <Label value="YOU ARE HERE" fontSize={fs(9)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ])
    ]
  }
  if (status === 'done') {
    return box(px, `node-${i}`, cx - 13, cy - 13, 26, 26, { color: C.yellow, radius: 13, border: 2, justify: 'center', align: 'center' }, [img(px, 'gl_check', undefined, undefined, 0.4)])
  }
  return box(px, `node-${i}`, cx - 13, cy - 13, 26, 26, { color: NODE_TODO, radius: 13, border: 2, borderColor: NODE_TODO_EDGE, justify: 'center', align: 'center' }, [
    <Label value={String(n)} fontSize={fs(12)} color={NODE_TODO_TEXT} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
  ])
}

// The zigzag between the nodes, as two dots a segment (no lines in the UI).
const mapPath = (px: Px) => {
  const dots: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < TUTORIAL_STEPS - 1; i++) {
    for (const t of [1 / 3, 2 / 3]) {
      const x = NODE_CX(i) + (NODE_CX(i + 1) - NODE_CX(i)) * t
      const y = NODE_CY(i) + (NODE_CY(i + 1) - NODE_CY(i)) * t
      dots.push(<UiEntity key={`dot-${i}-${t}`} uiTransform={{ ...at(px, x - 2.5, y - 2.5, 5, 5), borderRadius: px(2.5) }} uiBackground={{ color: PATH_DOT }} />)
    }
  }
  return dots
}

export const TutorialView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const mission = Number(globalStore.userData.getState()['statistic_current_mission'] || 1)
  const done = mission > TUTORIAL_STEPS
  const spheres = Math.max(0, Math.min(4, mission - 2))
  const portrait = done || mission === 9 ? 'drpar_box_3' : 'drpar_box_1'
  const line = done ? 'Tutorial complete. Thank you, intern: the lab is safe again.' : MISSION_LINES[mission] || ''
  const hx = afterRibbon('rb_tutorial')

  return fullFrame(L, [
    ...fullHeader(px, 'rb_tutorial'),
    topTag(px, fs, 'Ancient Egypt', hx, 96),
    box(px, 'mission', 515, 10, 96, 36, { color: P.navyDeep, radius: 10, border: 2, borderColor: P.navyEdge, align: 'center', justify: 'center' }, [
      <Label value={done ? 'Complete' : 'Mission'} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32) }} />,
      done ? null : <Label value={`${mission} / ${TUTORIAL_STEPS}`} fontSize={fs(13)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32), margin: { left: px(4) } }} />
    ]),

    box(px, 'spheres', 6, 58, 140, 188, { color: P.teal, radius: 14, border: 2 }),
    img(px, 'tt_energy_spheres', 16, 65, 0.53),
    ...[0, 1, 2, 3].map((i) => (
      <UiEntity
        key={`sphere-${i}`}
        uiTransform={{ ...at(px, 16 + i * 30, 86, 24, 24), borderRadius: px(12), borderWidth: border(px, i < spheres ? 3 : 2), borderColor: i < spheres ? SPHERE_RING : Color4.create(1, 1, 1, 0.7) }}
        uiBackground={{ color: i < spheres ? SPHERE : P.clear }}
      />
    )),
    text(px, fs, `${spheres} of 4 caught`, 16, 118, 124, 16, 12, C.yellow),
    text(px, fs, 'Four spheres escaped back to ancient Egypt. Push each one into the hole.', 16, 138, 124, 80, 11, hex('#E8FFFB'), 'middle-left', true),

    box(px, 'map', 152, 58, 340, 236, { color: P.navyDeep, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, '9 MISSIONS · ANCIENT EGYPT', 164, 68, 220, 12, 10, P.pale),
    ...mapPath(px),
    ...NODE_LABELS.map((_, i) => mapNode(px, fs, i, mission, done)),
    box(px, 'now', 162, 220, 320, 64, { color: P.navy, radius: 12, border: 2, borderColor: P.navyEdge }),
    text(px, fs, done ? 'ALL 9 MISSIONS DONE' : `NOW · MISSION ${mission}`, 172, 225, 300, 12, 10, P.pale),
    text(px, fs, done ? 'Tutorial complete' : NODE_LABELS[mission - 1] || '', 172, 238, 300, 22, 17),
    text(px, fs, done ? 'Thank you, intern: the lab is safe again.' : mission < TUTORIAL_STEPS ? `Next: ${NODE_LABELS[mission]}` : 'The last mission', 172, 261, 300, 14, 11, P.pale),

    box(px, 'drpar', 498, 58, 163, 168, { color: P.purple, radius: 14, border: 2, shadow: 4 }),
    img(px, portrait, 504, 64, 52 / imgW(portrait)),
    text(px, fs, 'DR. PAR', 564, 68, 90, 18, 16),
    text(px, fs, 'your mentor', 564, 88, 90, 12, 10, hex('#E6DAFF')),
    text(px, fs, line, 506, 122, 147, 96, 11, P.white, 'middle-left', true),

    done
      ? null
      : button2(
          px,
          {
            id: 'tutorial-go', x: 152, y: 302, w: 222, h: 52, color: P.yellow, radius: 15, shadow: 5, shadowColor: P.yellowShadow,
            onClick: () => {
              closeLobbyMenu()
              markStartedFromMenu()
              talkToNpc().catch((err) => console.log('[lobby] talkToNpc failed', err))
            }
          },
          [img(px, 'bt_lets_go', undefined, undefined, 0.75), <UiEntity uiTransform={{ width: px(8) }} />, img(px, 'ic_play_n', undefined, undefined, 0.5)]
        ),
    done
      ? null
      : button2(px, { id: 'tutorial-not-now', x: 380, y: 302, w: 112, h: 52, color: P.lavender, radius: 15, shadow: 5, shadowColor: P.lavenderShadow, onClick: back }, [
          img(px, 'bt_not_now', undefined, undefined, 0.75)
        ])
  ])
}

// ---------------------------------------------------------------------------
// WORKSHOP (M2Workshop.dc.html)

const UPGRADE_COSTS = [10, 20, 30, 60, 120]
const UPGRADE_MATERIALS: Record<string, 'IR' | 'ST' | 'WD'> = { power: 'IR', control: 'ST', aim: 'WD' }
const ATTR_COLORS: Record<string, Color4> = { power: hex('#FF8230'), control: hex('#33CDBC'), aim: C.yellow }
const ATTR_GLYPHS: Record<string, [string, number]> = { power: ['ic_bolt_w', 0.75], control: ['gl_target', 0.75], aim: ['gl_aim', 0.8] }
const PIP_EMPTY = Color4.create(8 / 255, 18 / 255, 40 / 255, 0.45)
const MATERIAL_NAMES: Record<string, string> = { IR: 'iron', ST: 'stone', WD: 'wood' }
const SHORT = hex('#FF9A8A')
const WARN_BG = Color4.create(1, 210 / 255, 31 / 255, 0.14)

// MY CLUBS: two cards a page in the left column, with a pager under them.
const CLUBS_PER_PAGE = 2

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

// Full screen, like the lobby (canvas page "Móvil · propuesta 2",
// M2Workshop.dc.html): the clubs on the left, the three attributes in the
// centre and the selected club on the right.
export const WorkshopView = () => {
  const L = fullLayout()
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
  const equipped = !!club && club.tokenId === activeTokenId
  const busy = lobbyMenuState.busy

  const pages = Math.max(1, Math.ceil(clubs.length / CLUBS_PER_PAGE))
  const page = Math.max(0, Math.min(pages - 1, lobbyMenuState.clubsPage ?? Math.floor(selectedIndex / CLUBS_PER_PAGE)))
  const pageClubs = clubs.slice(page * CLUBS_PER_PAGE, (page + 1) * CLUBS_PER_PAGE)

  const clubCard = (c: BoardGolfclub, i: number, slot: number) => {
    const selected = i === selectedIndex
    const isEquipped = c.tokenId === activeTokenId
    const n = clubName(c)
    return button2(
      px,
      {
        id: `club-${i}`, x: 6, y: 78 + slot * 60, w: 140, h: 54, color: selected ? P.yellow : P.navy, radius: 12, border: 2,
        borderColor: selected ? P.white : P.navyEdge,
        onClick: () => {
          lobbyMenuState.selectedClubTokenId = c.tokenId
        }
      },
      [
        <UiEntity uiTransform={{ ...at(px, 4, 5, 40, 40), borderRadius: px(9) }} uiBackground={{ texture: { src: `images/${c.golfclubId}.png` }, textureMode: 'stretch' }} />,
        text(px, fs, n.length > 14 ? `${n.slice(0, 13)}…` : n, 50, 4, 86, 16, 13, selected ? P.ink : P.white),
        text(px, fs, isBasic(c) ? `Lv ${clubLevel(c)} / 16` : 'NFT · 5 / 5 / 5', 50, 21, 86, 14, 11, selected ? P.ink : P.pale),
        selected || isEquipped
          ? box(px, `club-tag-${i}`, 50, 36, 54, 13, { color: isEquipped ? P.green : P.ink, radius: 6, justify: 'center', align: 'center' }, [
              <Label value={isEquipped ? 'EQUIPPED' : 'SELECTED'} fontSize={fs(9)} color={isEquipped ? P.ink : C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
            ])
          : null
      ]
    )
  }

  const pageButton = (id: string, icon: string, enabled: boolean, target: number, x: number) =>
    button2(px, { id, x, y: 200, w: 44, h: 44, color: enabled ? P.navy : C.disabled, radius: 12, border: 2, borderColor: P.navyEdge, disabled: !enabled, onClick: () => (lobbyMenuState.clubsPage = target) }, [
      img(px, icon, undefined, undefined, 0.8)
    ])

  // One attribute: icon, name, effect of the next level, five pips and the
  // level; on the right what the next upgrade costs (the material's icon, the
  // amount and what the player has) with the +1 button under it.
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
      box(px, `attr-${attribute}`, 152, y, 340, 96, { color: P.navy, radius: 14, border: 2 }),
      box(px, `attr-icon-${attribute}`, 162, y + 12, 40, 40, { color: ATTR_COLORS[attribute], radius: 10, justify: 'center', align: 'center' }, [
        img(px, glyph, undefined, undefined, glyphScale * 0.69)
      ]),
      text(px, fs, attribute.toUpperCase(), 210, y + 9, 150, 22, 18),
      text(px, fs, effectText(attribute, value), 210, y + 33, 160, 14, 11, P.pale),
      ...[0, 1, 2, 3, 4].map((k) => (
        <UiEntity
          key={`pip-${attribute}-${k}`}
          uiTransform={{ ...at(px, 210 + k * 26, y + 54, 22, 10), borderRadius: px(4), borderWidth: border(px, 1.5), borderColor: Color4.create(1, 1, 1, 0.4) }}
          uiBackground={{ color: k < value ? ATTR_COLORS[attribute] : PIP_EMPTY }}
        />
      )),
      text(px, fs, maxed ? 'Level 5 of 5' : `Level ${value} of 5`, 210, y + 70, 120, 14, 11, P.pale),
      maxed
        ? box(px, `attr-max-${attribute}`, 376, y + 28, 108, 40, { color: P.green, radius: 12, border: 2, justify: 'center', align: 'center' }, [
            <Label value="MAXED" fontSize={fs(16)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
          ])
        : [
            <UiEntity key={`attr-cost-${attribute}`} uiTransform={{ ...at(px, 378, y + 7, 108, 22), flexDirection: 'row', alignItems: 'center' }}>
              {materialIcon(px, material, 20)}
              <Label value={String(cost)} fontSize={fs(19)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22), margin: { left: px(4) } }} />
              <Label value={MATERIAL_NAMES[material]} fontSize={fs(11)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22), margin: { left: px(4) } }} />
            </UiEntity>,
            text(px, fs, `you have ${fmt(balance)}`, 378, y + 31, 108, 12, 10, enough ? P.green : SHORT),
            upgradeAvailable && enough
              ? button2(
                  px,
                  {
                    id: `upgrade-${attribute}`, x: 376, y: y + 47, w: 108, h: 40, color: canUpgrade ? P.yellow : C.disabled, radius: 12, shadow: 3,
                    shadowColor: canUpgrade ? P.yellowShadow : C.dark, disabled: !canUpgrade,
                    onClick: () => {
                      if (!club) return
                      lobbyMenuState.busy = true
                      upgradeGolfclubAttribute(club.ItemInstanceId, attribute).finally(() => {
                        lobbyMenuState.busy = false
                      })
                    }
                  },
                  [<Label value="+1 UPGRADE" fontSize={fs(16)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />]
                )
              : !upgradeAvailable
                ? [
                    // The club needs more XP: a yellow warning that says what to do.
                    box(px, `attr-xp-${attribute}`, 344, y + 50, 140, 38, { color: WARN_BG, radius: 10, border: 2, borderColor: C.yellow }),
                    box(px, `attr-xp-icon-${attribute}`, 351, y + 55, 14, 14, { color: C.yellow, radius: 7, justify: 'center', align: 'center' }, [
                      <Label value="!" fontSize={fs(10)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
                    ]),
                    text(px, fs, 'Needs more club XP', 369, y + 54, 113, 16, 11, C.yellow),
                    text(px, fs, 'To upgrade, play more!', 351, y + 71, 131, 14, 10, P.white)
                  ]
                : text(px, fs, why, 376, y + 50, 108, 34, 11, SHORT, 'middle-center', true)
          ]
    ]
  }

  const materialPill = (code: string, x: number, w: number) =>
    box(px, `ws-${code}`, x, 10, w, 36, { color: P.navyDeep, radius: 10, border: 2, borderColor: P.navyEdge, align: 'center', padding: { left: px(5) } }, [
      materialIcon(px, code, 20),
      <Label value={num((r as any)[code] || 0)} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32), margin: { left: px(4) } }} />
    ])

  const nft = !!club && !isBasic(club)
  return fullFrame(L, [
    ...fullHeader(px, 'rb_workshop'),
    materialPill('WD', 365, 86),
    materialPill('ST', 455, 80),
    materialPill('IR', 539, 72),

    img(px, 'tt_my_clubs', 8, 58, 0.64),
    ...pageClubs.map((c, j) => clubCard(c, page * CLUBS_PER_PAGE + j, j)),
    pages > 1 ? pageButton('clubs-prev', 'ic_chev_left_w', page > 0, page - 1, 6) : null,
    pages > 1 ? text(px, fs, `${page + 1} / ${pages}`, 50, 214, 52, 16, 13, P.white, 'middle-center') : null,
    pages > 1 ? pageButton('clubs-next', 'ic_chev_right_w', page < pages - 1, page + 1, 102) : null,
    // The chain read for the wallet's NFT clubs failed, so the collection is
    // missing them. Say it where they should be instead of leaving the player
    // to work out that their clubs are gone. Sits in the pager's slot, which
    // is free exactly when the collection came back short.
    nftClubsReadFailed && pages <= 1
      ? box(px, 'clubs-warn', 6, 200, 140, 44, { color: WARN_BG, radius: 10, border: 2, borderColor: SHORT }, [
          <Label
            key="clubs-warn-text"
            value={'Could not read your\nNFT clubs'}
            fontSize={fs(11)}
            color={SHORT}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: '100%' }}
          />
        ])
      : null,

    ...attributeRow('power', 58),
    ...attributeRow('control', 158),
    ...attributeRow('aim', 258),

    box(px, 'club', 498, 58, 163, 168, { color: P.purple, radius: 14, border: 2, shadow: 4 }),
    text(px, fs, club ? clubName(club) : '-', 508, 64, 145, 18, 15),
    <UiEntity
      key="club-thumb"
      uiTransform={{ ...at(px, 507, 87, 52, 52), borderRadius: px(10), borderWidth: border(px, 2), borderColor: P.white }}
      uiBackground={club ? { texture: { src: `images/${club.golfclubId}.png` }, textureMode: 'stretch' } : { color: P.dim }}
    />,
    text(px, fs, 'CLUB LEVEL', 567, 89, 84, 12, 10, hex('#E6DAFF')),
    text(px, fs, nft ? 'MAX' : `${level} / 16`, 567, 101, 84, 22, 19, C.yellow),
    box(px, 'club-bar', 567, 127, 84, 7, { color: P.dim, radius: 4 }, [
      <UiEntity uiTransform={{ width: `${nft ? 100 : Math.round((100 * level) / 16)}%`, height: '100%', borderRadius: px(4) }} uiBackground={{ color: C.yellow }} />
    ]),
    button2(
      px,
      {
        id: 'club-equip', x: 506, y: 146, w: 147, h: 40, color: equipped || busy ? C.disabled : P.lavender, radius: 12, shadow: 3,
        shadowColor: equipped || busy ? C.dark : P.lavenderShadow, disabled: equipped || busy || !club,
        onClick: () => {
          if (!club) return
          lobbyMenuState.busy = true
          selectGolfclub(club.tokenId).finally(() => {
            lobbyMenuState.busy = false
          })
        }
      },
      [<Label value={equipped ? 'EQUIPPED' : 'EQUIP'} fontSize={fs(17)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />]
    ),
    box(px, 'club-mint', 506, 193, 147, 26, { color: P.dim, radius: 10, border: 2, borderColor: Color4.create(1, 1, 1, 0.5), justify: 'center', align: 'center' }, [
      <Label value="MINT AS NFT · Lv 16 + 120" fontSize={fs(10)} color={hex('#E6DAFF')} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22) }} />,
      materialIcon(px, 'DM', 13, { left: px(3) })
    ])
  ])
}

// ---------------------------------------------------------------------------
// PRIZES (M2Prizes.dc.html)

// The season's 20 wearables, ten a tab (5x2 cells), next to the real TOP 10.
// A sold-out wearable pays Fashion Tickets instead, so its cell shows the FT
// icon and that amount; no stock counts.
const CELL_W = (340 - 4 * 6) / 5
const CELL_H = 122
const PER_TAB = 10
const CELL_EDGE = Color4.create(1, 1, 1, 0.55)
const SOLD_BG = hex('#2B1F6E')

// "Golfcraft x COCOBAY Cap" -> "Cap": the header already names the collection.
const prizeName = (name: string) => shortName(name).replace(/^cocobay\s*/i, '')
// "GRAND MASTER 3" does not fit a cell.
const cellTierName = (tier: number) => (seasonTierDefinitions[tier]?.name || '').replace('GRAND MASTER', 'G.MASTER')
const catName = (tier: number) => String(TIER_CATEGORIES[getCatFromTier(tier)] || '')

// Without the stock service there are still 20 wearable tiers in the season
// table; show those ranks so the grid is never blank.
const fallbackPrizes = (): SeasonPrize[] =>
  seasonTierDefinitions
    .map((def: any, tier: number) => ({ def, tier }))
    .filter(({ def }: any) => def?.prize?.wearable)
    .slice(0, 20)
    .map(({ tier }: any, i: number) => ({ name: `Wearable ${i + 1}`, tierReward: Number(getPointsToTier(tier) || 0), stock: 1 }))

export const PrizesView = () => {
  const L = fullLayout()
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
  const tabs = Math.max(1, Math.ceil(prizes.length / PER_TAB))
  const tab = Math.max(0, Math.min(tabs - 1, lobbyMenuState.prizesTab ?? Math.floor(Math.max(0, nextIndex) / PER_TAB)))
  const hx = afterRibbon('rb_prizes')

  // "WOOD → SILVER": the categories of a tab's first and last prize.
  const tabLabel = (t: number) => {
    const slice = prizes.slice(t * PER_TAB, (t + 1) * PER_TAB)
    if (!slice.length) return ''
    const a = catName(tierOf(slice[0].tierReward))
    const b = catName(tierOf(slice[slice.length - 1].tierReward))
    return a === b ? a : `${a} → ${b}`
  }

  const cell = (p: SeasonPrize, i: number) => {
    const j = i - tab * PER_TAB
    const tier = tierOf(p.tierReward)
    const soldOut = live && prizeSoldOut(p)
    const claimed = live && p.tierReward <= tierSubMax
    const isNext = i === nextIndex
    const x = 152 + (j % 5) * (CELL_W + 6)
    const y = 104 + Math.floor(j / 5) * (CELL_H + 8)
    const picX = x + (CELL_W - 52) / 2
    return [
      box(px, `prize-${i}`, x, y, CELL_W, CELL_H, { color: P.navy, radius: 12, border: 2, borderColor: isNext ? C.yellow : CELL_EDGE }),
      soldOut ? box(px, `prize-sold-${i}`, picX, y + 4, 52, 52, { color: SOLD_BG, radius: 9 }) : null,
      soldOut ? (
        <UiEntity key={`prize-ft-${i}`} uiTransform={at(px, picX + 9, y + 13, 34, 34)} uiBackground={{ texture: { src: 'images/icons/ft.png' }, textureMode: 'stretch' }} />
      ) : p.thumbnail ? (
        <UiEntity key={`prize-pic-${i}`} uiTransform={{ ...at(px, picX, y + 4, 52, 52), borderRadius: px(9) }} uiBackground={{ texture: { src: p.thumbnail }, textureMode: 'stretch' }} />
      ) : null,
      <UiEntity key={`prize-tier-${i}`} uiTransform={{ ...at(px, x, y + 62, CELL_W, 14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <UiEntity uiTransform={{ width: px(8), height: px(8), borderRadius: px(4), borderWidth: border(px, 1.5), borderColor: P.white, flexShrink: 0 }} uiBackground={{ color: hex(TIER_COLORS[getCatFromTier(tier)] || '#FFFFFF') }} />
        <Label value={cellTierName(tier)} fontSize={fs(10)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14), margin: { left: px(3) } }} />
      </UiEntity>,
      text(px, fs, soldOut ? 'SOLD OUT' : prizeName(p.name), x + 3, y + 79, CELL_W - 6, 14, 10, soldOut ? C.yellow : P.paler, 'middle-center'),
      text(
        px, fs,
        claimed ? 'RECEIVED' : isNext ? 'NEXT' : soldOut ? `${p.fashionTickets ? fmt(p.fashionTickets) + ' ' : ''}FT` : '',
        x + 3, y + 96, CELL_W - 6, 14, 10, claimed ? P.green : C.yellow, 'middle-center'
      ),
      claimed
        ? box(px, `prize-ok-${i}`, x + CELL_W - 14, y - 6, 20, 20, { color: P.green, radius: 10, border: 2, justify: 'center', align: 'center' }, [img(px, 'gl_check', undefined, undefined, 0.3)])
        : null
    ]
  }

  const tabButton = (t: number, x: number) =>
    button2(
      px,
      {
        id: `prizes-tab-${t}`, x, y: 58, w: 167, h: 40, color: t === tab ? P.yellow : P.navy, radius: 12, border: 2, borderColor: t === tab ? P.white : P.navyEdge,
        onClick: () => (lobbyMenuState.prizesTab = t)
      },
      [<Label value={tabLabel(t)} fontSize={fs(14)} color={t === tab ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />]
    )

  const receivedLine = !live ? 'Prize stock unavailable right now' : last ? `${prizeName(last.name)} received.` : 'No prize received yet.'
  const nextLine = !live ? '' : next ? `${prizeName(next.name)} unlocks ${toNext} points away.` : 'Every prize received!'

  return fullFrame(L, [
    ...fullHeader(px, 'rb_prizes'),
    topTag(px, fs, `${seasonNameNow()} Season`, hx, 116),

    box(px, 'you', 6, 58, 140, 188, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    rankBadge(px, myTier, 40, 14, 66),
    text(px, fs, 'YOU', 60, 69, 80, 12, 10, P.pale),
    text(px, fs, seasonTierDefinitions[myTier]?.name || 'WOOD 5', 60, 81, 84, 20, 16),
    text(px, fs, receivedLine, 14, 112, 124, 28, 11, P.white, 'middle-left', true),
    text(px, fs, nextLine, 14, 142, 124, 28, 11, C.yellow, 'middle-left', true),
    text(px, fs, 'Reach the rank and the wearable is sent to you.', 14, 172, 124, 28, 10, P.pale, 'middle-left', true),
    <UiEntity key="you-ft" uiTransform={at(px, 14, 210, 22, 22)} uiBackground={{ texture: { src: 'images/icons/ft.png' }, textureMode: 'stretch' }} />,
    text(px, fs, 'Sold out? You get Fashion Tickets', 40, 206, 100, 30, 10, P.white, 'middle-left', true),

    ...(tabs > 1 ? [tabButton(0, 152), tabButton(1, 325)] : []),
    ...prizes.slice(tab * PER_TAB, (tab + 1) * PER_TAB).map((p, j) => cell(p, tab * PER_TAB + j)),

    ...top10Card(px, fs, 58, 313, 23, 'Diamonds for the best players when the season ends')
  ])
}

// ---------------------------------------------------------------------------
// DAILY MISSIONS (M2Daily.dc.html)

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

const LOCKED_ROW = Color4.create(P.navy.r, P.navy.g, P.navy.b, 0.85)
const REWARD_CHIP = Color4.create(8 / 255, 18 / 255, 40 / 255, 0.3)
const NOT_YET = hex('#FFB38A')

export const DailyMissionsView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const data = lobbyHudState.dailyMissions
  const missions: DailyMission[] = data?.state.missions || []
  const index = data ? data.dailyMissionIndex : 0
  const stepNow = data ? data.dailyMissionStep : 0
  const total = missions.length || 5
  const doneCount = Math.min(index, total)
  const renew = renewalText(data?.state.date)

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
  const toEarnCodes = Object.keys(toEarn).sort((a, b) => order(a) - order(b)).slice(0, 5)

  const missionRow = (m: DailyMission, i: number) => {
    const done = i < index
    const active = i === index
    const y = 58 + i * 60
    const target = missionTarget(m.alias)
    const available = missionAvailable(m.alias)
    const fg = active ? P.ink : P.white
    const rewards = m.rewards ? Object.keys(m.rewards).slice(0, 4) : []
    return [
      box(px, `mission-${i}`, 152, y, 340, 54, { color: done ? P.teal : active ? P.yellow : LOCKED_ROW, radius: 12, border: 2, borderColor: done || active ? P.white : P.navyEdge }),
      box(px, `mission-badge-${i}`, 160, y + 13, 28, 28, { color: done ? P.green : active ? P.ink : P.dim, radius: 14, border: 2, borderColor: Color4.create(1, 1, 1, 0.8), justify: 'center', align: 'center' }, [
        done
          ? img(px, 'gl_check', undefined, undefined, 0.35)
          : <Label value={String(i + 1)} fontSize={fs(13)} color={active ? C.yellow : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ]),
      text(px, fs, m.description, 196, y + 4, 164, 30, 12, fg, 'middle-left', true),
      active && target
        ? [
            box(px, `mission-bar-${i}`, 196, y + 39, 116, 8, { color: Color4.create(P.ink.r, P.ink.g, P.ink.b, 0.3), radius: 4 }, [
              <UiEntity uiTransform={{ width: `${Math.round((100 * Math.min(stepNow, target)) / target)}%`, height: '100%', borderRadius: px(4) }} uiBackground={{ color: P.ink }} />
            ]),
            text(px, fs, `${Math.min(stepNow, target)} / ${target}`, 316, y + 35, 44, 16, 10, P.ink)
          ]
        : [
            ...[1, 2, 3, 4, 5].map((n) => img(px, n <= (m.difficulty || 0) ? 'gl_star_on' : 'gl_star_off', 196 + (n - 1) * 11, y + 38, 0.27)),
            done ? text(px, fs, 'DONE', 254, y + 35, 40, 16, 9, P.white) : !available ? text(px, fs, 'Not in this version yet', 254, y + 35, 106, 16, 9, NOT_YET) : null
          ],
      ...rewards.map((code, k) => (
        <UiEntity
          key={`mission-${i}-reward-${code}`}
          uiTransform={{ ...at(px, 364 + (k % 2) * 62, y + 5 + Math.floor(k / 2) * 22, 58, 19), flexDirection: 'row', alignItems: 'center', padding: { left: px(4) }, borderRadius: px(6) }}
          uiBackground={{ color: REWARD_CHIP }}
        >
          {materialIcon(px, code, 14)}
          <Label value={`${m.rewards ? m.rewards[code] : ''} ${code}`} fontSize={fs(10)} color={fg} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(19), margin: { left: px(3) } }} />
        </UiEntity>
      ))
    ]
  }

  return fullFrame(L, [
    ...fullHeader(px, 'rb_daily'),
    box(px, 'renew', 487, 10, 124, 36, { color: P.navyDeep, radius: 10, border: 2, borderColor: P.navyEdge, column: true, justify: 'center', align: 'center' }, [
      renew ? <Label value="NEW MISSIONS IN" fontSize={fs(9)} color={P.pale} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(12) }} /> : null,
      <Label value={renew || 'New missions soon'} fontSize={fs(renew ? 13 : 11)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
    ]),

    box(px, 'today', 6, 58, 140, 96, { color: P.teal, radius: 14, border: 2, column: true, justify: 'center', align: 'center' }, [
      <Label value="TODAY" fontSize={fs(10)} color={hex('#E8FFFB')} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(14) }} />,
      <Label value={`${doneCount} / ${total}`} fontSize={fs(32)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(38) }} />,
      <Label value="missions done" fontSize={fs(11)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
    ]),
    box(px, 'daily-note', 6, 160, 140, 86, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'Done in order, one at a time.', 16, 166, 124, 30, 11, P.white, 'middle-left', true),
    text(px, fs, 'Rewards land the moment a mission completes.', 16, 198, 124, 40, 10, P.pale, 'middle-left', true),

    ...(missions.length
      ? missions.slice(0, 5).map((m, i) => missionRow(m, i))
      : [text(px, fs, data ? 'No missions today' : 'Loading missions...', 152, 58, 340, 294, 14, P.white, 'middle-center')]),

    box(px, 'earn', 498, 58, 163, 168, { color: P.purple, radius: 14, border: 2, shadow: 4 }),
    img(px, 'tt_still_to_earn', 508, 65, 0.55),
    ...toEarnCodes.map((code, k) => (
      <UiEntity key={`earn-${code}`} uiTransform={{ ...at(px, 508, 84 + k * 22, 145, 22), flexDirection: 'row', alignItems: 'center' }}>
        {materialIcon(px, code, 20)}
        <Label value={String(toEarn[code])} fontSize={fs(14)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22), margin: { left: px(6) } }} />
        <Label value={code} fontSize={fs(10)} color={hex('#E6DAFF')} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22), margin: { left: px(6) } }} />
      </UiEntity>
    )),
    toEarnCodes.length ? null : text(px, fs, data ? 'Everything earned today!' : 'Loading...', 508, 86, 145, 30, 11, hex('#E6DAFF'), 'middle-left', true),
    text(px, fs, 'Missions renew every 24 hours.', 508, 204, 147, 14, 10, hex('#E6DAFF'))
  ])
}

// ---------------------------------------------------------------------------
// MORE GAMES (canvas page "Más juegos", OGList.dc.html)

// Other Decentraland games by the team. GO leaves GolfCraft for the game's
// World through changeRealm, which the explorer confirms with the player. A
// game that only runs on desktop shows a red notice on phones instead of GO.
// lowpol.dcl.eth is the game's test World; xrace.dcl.eth is production.
const ROADSTER = { name: 'ELON RACE', realm: 'xrace.dcl.eth', desktopOnly: false }
const GAME_CARD_BG = hex('#08101F')
const RACING_TAG = hex('#3FE0FF')
const GAME_TAGLINE = hex('#B9E9F5')
const CHIP_GLASS = Color4.create(1, 1, 1, 0.12)
const DESKTOP_ONLY = hex('#FF5A5A')
const SOON_EDGE = hex('#5B67C9')
const SOON_FILL = Color4.create(18 / 255, 22 / 255, 70 / 255, 0.6)

const goToGame = (realm: string, name: string) => {
  closeLobbyMenu()
  changeRealm({ realm, message: `Go to ${name}?` }).catch((err) => console.log('[lobby] changeRealm failed', realm, err))
}

export const MoreGamesView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const playable = !(ROADSTER.desktopOnly && isMobile())
  return fullFrame(L, [
    ...fullHeader(px, 'rb_more_games'),

    box(px, 'games-about', 6, 58, 140, 188, { color: P.navyDeep, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'MADE BY THE GOLFCRAFT TEAM', 16, 68, 120, 34, 12, C.yellow, 'middle-left', true),
    text(px, fs, 'Other Decentraland games we built. Your GolfCraft progress stays here.', 16, 106, 120, 60, 11, P.pale, 'middle-left', true),
    text(px, fs, 'Decentraland asks you to confirm before you travel.', 16, 196, 120, 40, 10, P.pale, 'middle-left', true),

    box(px, 'game-roadster', 152, 58, 340, 236, { color: GAME_CARD_BG, radius: 16, border: 3, borderColor: P.white }),
    imgBox(px, 'art_roadster', 155, 61, 334, 150),
    box(px, 'game-roadster-tag', 161, 67, 58, 18, { color: RACING_TAG, radius: 9, justify: 'center', align: 'center' }, [
      <Label value="RACING" fontSize={fs(10)} color={GAME_CARD_BG} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    text(px, fs, ROADSTER.name, 162, 216, 320, 22, 17),
    text(px, fs, 'Stunt racing · ramps · thrusters', 162, 238, 220, 16, 11, GAME_TAGLINE),
    box(px, 'game-roadster-world', 162, 262, 128, 18, { color: CHIP_GLASS, radius: 9, justify: 'center', align: 'center' }, [
      <Label value={`World · ${ROADSTER.realm}`} fontSize={fs(10)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    box(px, 'game-roadster-free', 294, 262, 40, 18, { color: P.green, radius: 9, justify: 'center', align: 'center' }, [
      <Label value="Free" fontSize={fs(10)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    playable
      ? button2(
          px,
          { id: 'game-roadster-go', x: 390, y: 244, w: 92, h: 38, color: C.yellow, radius: 12, shadow: 4, shadowColor: P.yellowShadow, onClick: () => goToGame(ROADSTER.realm, ROADSTER.name) },
          [
            <Label value="GO" fontSize={fs(18)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(24) }} />,
            img(px, 'ic_play_n', undefined, undefined, 14 / imgW('ic_play_n'))
          ]
        )
      : text(px, fs, 'ONLY PLAYABLE IN DESKTOP', 340, 244, 142, 38, 12, DESKTOP_ONLY, 'middle-right', true),

    box(px, 'games-soon', 498, 58, 163, 168, { color: SOON_FILL, radius: 14, border: 2, borderColor: SOON_EDGE }),
    img(px, 'ic_gamepad_w', 498 + (163 - 30) / 2, 96, 30 / imgW('ic_gamepad_w'), SOON_EDGE),
    text(px, fs, 'MORE SOON', 498, 128, 163, 20, 15, P.pale, 'middle-center'),
    text(px, fs, 'The next game shows up here', 512, 150, 135, 30, 10, P.pale, 'middle-center', true)
  ])
}

// ---------------------------------------------------------------- OPTIONS
// Game options (user, 2026-11-04): the control scheme, kept on the account
// (services/game-options.ts). Two cards, the chosen one marked; a change
// applies from the player's next hole. The cards end above y 232 so the
// phone's bottom-right buttons stay clear.
const OPTION_CARDS: { scheme: ControlScheme; title: string; tag: string; lines: string[]; color: Color4 }[] = [
  {
    scheme: 'new',
    title: 'NEW CONTROLS',
    tag: 'Recommended',
    lines: [
      'The camera circles the ball and follows every shot.',
      'Mouse or A / D turn the aim, W / S zoom the camera.',
      'E / F set the power, click shoots.'
    ],
    color: P.purple
  },
  {
    scheme: 'legacy',
    title: 'LEGACY CONTROLS',
    tag: 'GolfCraft classic',
    lines: [
      'You walk your avatar to the ball; the camera stays with you and does not follow the shot.',
      'Step 1: E / F turn the aim, click sets it.',
      'Step 2: E / F set the power, click shoots.'
    ],
    color: P.teal
  }
]

export const OptionsView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const current = gameOptions.controls
  const cards = OPTION_CARDS.map((card, i) => {
    const x = 152 + i * 259
    const chosen = current === card.scheme
    return [
      box(px, `opt-${card.scheme}`, x, 58, 250, 172, { color: card.color, radius: 14, border: chosen ? 4 : 2, borderColor: chosen ? C.yellow : P.white, shadow: 4 }),
      text(px, fs, card.title, x + 12, 66, 160, 22, 16),
      yellowTag(px, fs, card.tag, x + 250 - 12 - 96, 68, 96, 20, 10),
      ...card.lines.map((line, j) => text(px, fs, line, x + 12, 94 + j * 24, 226, 24, 10, P.white, 'middle-left', true)),
      chosen
        ? box(px, `opt-${card.scheme}-on`, x + 12, 190, 226, 30, { color: C.yellow, radius: 10, justify: 'center', align: 'center' }, [
            <Label value={gameOptions.saving ? 'SAVING...' : gameOptions.saveError ? 'SELECTED (not saved to your account)' : 'SELECTED'} fontSize={fs(11)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
          ])
        : button2(
            px,
            { id: `opt-${card.scheme}-select`, x: x + 12, y: 190, w: 226, h: 30, color: P.navy, radius: 10, border: 2, borderColor: P.white, disabled: gameOptions.saving, onClick: () => { setControlScheme(card.scheme).catch(() => {}) } },
            [<Label value="SELECT" fontSize={fs(12)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(26) }} />]
          )
    ]
  })

  return fullFrame(L, [
    squareButton(px, 'view-back', 140, 6, 'ic_chev_left_w', 0.8, back),
    box(px, 'options-title', 194, 9, 200, 38, { color: P.navyDeep, radius: 12, border: 2, borderColor: P.navyEdge, justify: 'center', align: 'center' }, [
      <Label value="GAME OPTIONS" fontSize={fs(16)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    squareButton(px, 'view-close', 617, 6, 'ic_close_w', 0.67, closeLobbyMenu),

    box(px, 'options-info', 6, 58, 140, 172, { color: P.navyDeep, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'CONTROLS', 15, 66, 120, 16, 12, P.pale),
    text(px, fs, 'Pick how you aim and shoot on a computer. Phones always use the touch controls. Saved to your account, applies from your next hole.', 15, 86, 122, 130, 11, P.white, 'middle-left', true),
    ...cards.flat()
  ])
}

// ---------------------------------------------------------------------------
// WATCH: the games being played right now (user request, 2026-11-04).
//
// The list comes from the game server itself (services/live-games.ts), which
// is the only thing that knows what rooms exist. Rows, not cards, because the
// number of games is not bounded by anything.
const WATCH_ROW_H = 40
const WATCH_GAP = 4
const WATCH_ROWS = 5

const modeName = (mode: string) => (mode === 'party' ? 'Ranked with friends' : 'Ranked')

export const WatchView = () => {
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  // Asked when the view opens and refreshed while it is open: nobody needs
  // this list unless they are looking at it.
  if (liveGamesAreStale()) void refreshLiveGames()
  const games = liveGamesState.games
  const page = Math.max(0, lobbyMenuState.watchPage || 0)
  const pages = Math.max(1, Math.ceil(games.length / WATCH_ROWS))
  const shown = games.slice(page * WATCH_ROWS, (page + 1) * WATCH_ROWS)

  const row = (game: LiveGame, i: number) => {
    const y = 64 + i * (WATCH_ROW_H + WATCH_GAP)
    const who = game.players.length ? game.players.join(', ') : 'somebody'
    return [
      box(px, `watch-${i}`, 152, y, 400, WATCH_ROW_H, { color: P.navy, radius: 10, border: 2, borderColor: P.navyEdge }),
      text(px, fs, who.length > 38 ? `${who.slice(0, 37)}…` : who, 162, y + 4, 250, 16, 13),
      text(px, fs, `${modeName(game.mode)} · hole ${game.hole}/${game.holes}${game.spectators ? ` · ${game.spectators} watching` : ''}`, 162, y + 21, 250, 14, 10, P.pale),
      button2(
        px,
        {
          id: `watch-go-${i}`,
          x: 460,
          y: y + 6,
          w: 82,
          h: 28,
          color: C.yellow,
          radius: 8,
          onClick: () => {
            const spectate = lobbyMenuState.actions.spectate
            if (!spectate) return
            closeLobbyMenu()
            spectate(game.roomId, who)
          }
        },
        [<Label value="WATCH" fontSize={fs(12)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />]
      )
    ]
  }

  const empty = !games.length
  return fullFrame(L, [
    squareButton(px, 'view-back', 140, 6, 'ic_chev_left_w', 0.8, back),
    box(px, 'watch-title', 194, 9, 240, 38, { color: P.navyDeep, radius: 12, border: 2, borderColor: P.navyEdge, justify: 'center', align: 'center' }, [
      <Label value="GAMES BEING PLAYED" fontSize={fs(15)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    squareButton(px, 'view-close', 617, 6, 'ic_close_w', 0.67, closeLobbyMenu),

    box(px, 'watch-info', 6, 58, 140, 172, { color: P.navyDeep, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'WATCH', 15, 66, 120, 16, 12, P.pale),
    text(px, fs, 'Drop into a game somebody is playing and follow the ball. You can leave whenever you like; the player is not disturbed.', 15, 86, 122, 130, 11, P.white, 'middle-left', true),

    empty
      ? text(
          px,
          fs,
          liveGamesState.error || (liveGamesState.loading ? 'Looking for games…' : 'Nobody is playing right now'),
          152,
          120,
          400,
          20,
          13,
          P.pale,
          'middle-center'
        )
      : null,
    ...shown.map((game, i) => row(game, i)).flat(),
    pages > 1
      ? button2(px, { id: 'watch-prev', x: 152, y: 290, w: 44, h: 32, color: P.navy, radius: 8, border: 2, borderColor: P.navyEdge, disabled: page === 0, onClick: () => (lobbyMenuState.watchPage = page - 1) }, [
          img(px, 'ic_chev_left_w', undefined, undefined, 0.7)
        ])
      : null,
    pages > 1 ? text(px, fs, `${page + 1} / ${pages}`, 200, 296, 60, 16, 12, P.white, 'middle-center') : null,
    pages > 1
      ? button2(px, { id: 'watch-next', x: 264, y: 290, w: 44, h: 32, color: P.navy, radius: 8, border: 2, borderColor: P.navyEdge, disabled: page >= pages - 1, onClick: () => (lobbyMenuState.watchPage = page + 1) }, [
          img(px, 'ic_chev_right_w', undefined, undefined, 0.7)
        ])
      : null
  ])
}
