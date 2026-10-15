// The lobby menu: a centred dialog over the 3D lobby, after the design
// "Lobby" of the GolfCraft UI canvas, page "Escritorio · propuesta 2"
// (Main2.dc.html). It shows the real data and wires PLAY / WITH FRIENDS to the
// season panel's own logic; the cards open the sub-views (lobby-views.tsx).
//
// Closing: E or F (IA_PRIMARY / IA_SECONDARY — a scene cannot read Escape,
// which every explorer keeps for itself) or the X button. The 3D lobby stays
// as it is underneath.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState, closeOrBack, showLobbyView, nextSeasonPrize, prizeSoldOut, seasonPlayState } from './lobby-menu-state'
import { TutorialView, WorkshopView, PrizesView, DailyMissionsView, SeasonView } from './lobby-views'
import { C, hex, fmt, shortName, materialIcon } from './ui-theme'
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px } from './ui-scale'
import { P, at, img, text, box, frame, button2, imageButton, navyIconButton, resIcon, rankBadge, border, nextPrizeBar, energyChip } from './ui2'
import { seasonCatalog } from '../components/lobby/seasons/season-catalog'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getPointsOnCurrentTier, getPointsToTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIER_CATEGORIES } from '../../../common/constants'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'
import { isMobile } from '../services/platform'
import { opensInText } from '../services/game-window'
import { avatarFaceUrl } from '../services/avatar-face'

const MARGIN = 16 // keeps the panel off the interactable area's edges
const HINT_H = 40 // the "Press E or F to close" line under the panel

const TUTORIAL_STEPS = 9
const TUTORIAL_CAPTIONS: Record<number, string> = {
  1: 'Play your first hole',
  2: 'Catch the first sphere',
  3: 'Catch the second sphere',
  4: 'Catch the third sphere',
  5: 'Catch the fourth sphere',
  6: 'Claim your greeting emote',
  7: 'Improve your golf club',
  8: 'Reach STONE rank in Season',
  9: 'Collect your reward'
}
// Workshop: cost of the next upgrade step for the basic club (cloudscript
// csGolfclub, indexed by the attribute's current value).
const UPGRADE_COSTS = [10, 20, 30, 60, 120]

const RANK_TEXT = hex('#E8DFFF')
const BAR_TRACK = hex('#150A33')
const XP_TRACK = hex('#0B0E33')
const AVATAR_EDGE = hex('#7CE34A')
const CHIP_DARK = hex('#1C0A3F')

// Features of the SDK6 game that this scene does not have yet; the design
// keeps their buttons, so they show as "soon".
const SOON = [
  { icon: 'ic_flag_w', title: 'CUSTOM GAME', sub: 'Play any map' },
  { icon: 'ic_people_w', title: 'COMMUNITY', sub: 'Tournaments & events' },
  { icon: 'ic_map_w', title: 'MY MAPS', sub: 'Build and share' },
  { icon: 'ic_cart_w', title: 'SHOP', sub: 'Clothes, items, gems' }
]

export const LobbyMenu = () => {
  const gs = globalStore.game.getState()
  if (!lobbyMenuState.visible || gs.bootError || gs.playing || gs.starting || gs.introScreen) return null
  if (lobbyMenuState.view === 'season') return <SeasonView />
  if (lobbyMenuState.view === 'tutorial') return <TutorialView />
  if (lobbyMenuState.view === 'workshop') return <WorkshopView />
  if (lobbyMenuState.view === 'prizes') return <PrizesView />
  if (lobbyMenuState.view === 'daily') return <DailyMissionsView />

  // Keeps the 1280x720 proportion, as large as fits in the interactable area,
  // with the "Press E or F to close" line reserved under it.
  // The E / F hint is a desktop thing; on a phone the X closes the dialog.
  const mobile = isMobile()
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN, reserveBottom: mobile ? 0 : HINT_H })
  const { px, fs } = scaler(L.scale)

  const r = lobbyHudState.resources
  const userData = globalStore.userData.getState()
  const player = getPlayer()
  const displayName = player?.name || 'player'

  // Season rank maths, the same calls the 3D panel uses.
  const tierSub = Number(userData['statistic_tier-sub'] || 0)
  const tierSubMax = Math.max(tierSub, Number(userData['statistic_tier-sub-max'] || 0))
  const tier = Number(getTierFromSub(tierSub) || 0)
  const cat = getCatFromTier(tier)
  const tierName = seasonTierDefinitions[tier]?.name || 'WOOD 5'
  const ptsOnTier = Number(getPointsOnCurrentTier(tierSub) || 0)
  const ptsPerTier = Number(seasonPointsPerCategory[cat] || 5)
  const nextTierName = seasonTierDefinitions[tier + 1]?.name || null
  const nextCat = Math.min(cat + 1, TIER_CATEGORIES.length - 1)
  const nextCatName = TIER_CATEGORIES[nextCat]
  const nextCatAt = Number(getPointsToTier(nextCat * 5) || 0)
  const seasonName = (seasonCatalog as any)[String(userData?.config?.currentSeasonCollectionId ?? 4)]?.name || 'MOUNTAIN'

  const currentMission = Number(userData['statistic_current_mission'] || 1)
  const tutorialDone = currentMission > TUTORIAL_STEPS
  // PLAY / WITH FRIENDS state, shared with the SEASON view.
  const { energy, gameOpen, canPlay, canFriends, playCaption, friendsCaption, startSeason, startFriends } = seasonPlayState()

  const nextPrize = nextSeasonPrize(tierSubMax)
  const nextPrizeTier = nextPrize ? seasonTierDefinitions[Number(getTierFromSub(nextPrize.tierReward) || 0)]?.name || '' : ''
  const toNextPrize = nextPrize ? Math.max(0, nextPrize.tierReward - tierSub) : 0
  const soldOut = lobbyMenuState.prizes.filter(prizeSoldOut)

  const club = r.golfclub
  // Today's daily missions are done in order: the index is how many are done.
  const daily = lobbyHudState.dailyMissions
  const dailyTotal = daily ? daily.state.missions.length : 5
  const dailyIndex = daily ? Math.min(daily.dailyMissionIndex, dailyTotal) : 0
  const dailyDone = daily ? `${dailyIndex} / ${dailyTotal}` : '- / 5'
  const clubAim = club?.aim || 0
  const upgradeHint =
    club && club.id === 1 && clubAim < UPGRADE_COSTS.length ? `Basic club: aim +1 for ${UPGRADE_COSTS[clubAim]} wood` : null

  const num = (value: number) => (r.loaded ? fmt(value) : '-')
  const face = avatarFaceUrl(player?.userId)
  // ---------------------------------------------------------------- header
  const header = [
    img(px, 'logo', 34, 2),
    box(px, 'player', 246, 40, 346, 66, { color: P.navy, radius: 18, border: 3, borderColor: P.navyEdge, shadow: 6 }),
    <UiEntity
      key="avatar"
      uiTransform={{ ...at(px, 255, 46, 54, 54), borderRadius: px(12), borderWidth: border(px, 2), borderColor: AVATAR_EDGE }}
      uiBackground={{ color: C.teal }}
    >
      {face ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(10) }} uiBackground={{ texture: { src: face }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, displayName, 321, 48, 170, 26, 19),
    text(px, fs, `LV ${r.level}`, 473, 47, 100, 28, 21, C.yellow, 'middle-right'),
    box(px, 'xp', 321, 83, 232, 12, { color: XP_TRACK, radius: 6 }, [
      <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, r.levelPct))}%`, height: '100%', borderRadius: px(6) }} uiBackground={{ color: P.green }} />
    ]),
    box(px, 'resources', 622, 40, 505, 66, { color: P.navy, radius: 18, border: 3, borderColor: P.navyEdge, shadow: 6, align: 'center', padding: { left: px(5) } }, [
      resourcePill(px, fs, 'EN', num(energy)),
      resourcePill(px, fs, 'GC', num(r.GC)),
      resourcePill(px, fs, 'DM', num(r.DM)),
      resourcePill(px, fs, 'FT', num(r.FT))
    ]),
    navyIconButton(px, 'close', 'ic_close_w', 1139, 40, 66, closeOrBack, 1.1)
  ]

  // ----------------------------------------------------------- season card
  const season = [
    img(px, 'season_card', 52, 134),
    // The champion stands in the card's left column, behind the PLAY button.
    img(px, 'champion', 64, 144),
    imageButton(px, 'season-ribbon', 'rb_season_lobby', 252, 147, () => showLobbyView('season')),
    box(px, 'season-tag', 596, 152, 150, 26, { color: C.yellow, radius: 13, justify: 'center', align: 'center' }, [
      <Label value={`${seasonName} Season`} fontSize={fs(13)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(26) }} />
    ]),
    text(
      px, fs,
      gameOpen ? 'Race 3 players over 4 holes. Win to climb.' : `Closed until the first week of the month. ${opensInText()}.`,
      308, 213, 445, 26, gameOpen ? 17 : 15, gameOpen ? P.white : C.yellow
    ),
    box(px, 'rank', 308, 246, 420, 126, { color: P.rankBox, radius: 16, border: 2, borderColor: P.rankEdge, shadow: 6, shadowColor: P.rankShadow }),
    rankBadge(px, tier, 78, 328, 266),
    text(px, fs, tierName, 426, 266, 200, 38, 30),
    text(px, fs, `${tierSub} pts`, 608, 276, 100, 22, 16, P.white, 'middle-right'),
    box(px, 'rank-bar', 426, 318, 288, 12, { color: BAR_TRACK, radius: 6 }, [
      <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, Math.round((100 * ptsOnTier) / ptsPerTier)))}%`, height: '100%', borderRadius: px(6) }} uiBackground={{ color: P.green }} />
    ]),
    text(px, fs, nextTierName ? `${ptsPerTier - ptsOnTier} pts to ${nextTierName}` : 'Top rank reached', 426, 336, 180, 20, 14, RANK_TEXT),
    text(px, fs, nextCat > cat ? `${nextCatName} at ${nextCatAt} pts` : '', 528, 336, 180, 20, 14, RANK_TEXT, 'middle-right'),
    nextPrizeBar(px, fs, 308, 382, nextPrize, nextPrizeTier, toNextPrize, lobbyMenuState.prizes.length > 0),
    button2(
      px,
      { id: 'play', x: 104, y: 440, w: 362, h: 102, color: canPlay ? P.yellow : C.disabled, radius: 22, shadow: 8, shadowColor: canPlay ? P.yellowShadow : C.dark, disabled: !canPlay, onClick: startSeason },
      [
        img(px, 'bt_play'),
        <UiEntity uiTransform={{ width: px(18) }} />,
        img(px, 'ic_play_n', undefined, undefined, 1.1),
        energyChip(px, fs, 'play-energy', (362 - 120) / 2, 74, 120, 24, playCaption)
      ]
    ),
    button2(
      px,
      {
        id: 'friends', x: 486, y: 444, w: 240, h: 94, color: canFriends ? P.lavender : C.disabled, radius: 18, shadow: 7,
        shadowColor: canFriends ? P.lavenderShadow : C.dark, disabled: !canFriends, onClick: startFriends,
        justify: 'flex-start', padding: { left: px(14), right: px(10) }
      },
      [
        img(px, 'ic_people_n', undefined, undefined, 0.9),
        <Label
          value={friendsCaption}
          fontSize={fs(friendsCaption.length > 14 && friendsCaption.indexOf('\n') < 0 ? 15 : 19)}
          color={P.ink}
          textAlign="middle-left"
          textWrap="wrap"
          uiTransform={{ width: px(150), height: px(80), margin: { left: px(12) } }}
        />,
        img(px, 'ic_chev_right_n', undefined, undefined, 1)
      ]
    )
  ]

  // ------------------------------------------------------------ right cards
  const dots = Array.from({ length: TUTORIAL_STEPS }, (_, i) => {
    const color = tutorialDone || i + 1 < currentMission ? C.yellow : i + 1 === currentMission ? P.white : Color4.create(0, 0, 0, 0.35)
    return <UiEntity key={`dot-${i}`} uiTransform={{ ...at(px, 160 + i * 23, 99, 18, 8), borderRadius: px(4) }} uiBackground={{ color }} />
  })
  const cards = [
    menuCard(px, fs, 'card-tutorial', 142, P.teal, tutorialDone || currentMission === 9 ? 'art_tutorial_3' : 'art_tutorial_1', 'tt_card_tutorial', () => showLobbyView('tutorial'), [
      text(px, fs, tutorialDone ? 'All 9 missions completed' : `Mission ${currentMission} of ${TUTORIAL_STEPS}`, 160, 54, 250, 20, 15, tutorialDone ? C.yellow : hex('#E8FFFB')),
      text(px, fs, tutorialDone ? 'Thank you, intern!' : TUTORIAL_CAPTIONS[currentMission] || '', 160, 74, 250, 20, 15),
      ...dots
    ]),
    menuCard(px, fs, 'card-workshop', 287, P.purple, 'art_workshop', 'tt_card_workshop', () => showLobbyView('workshop'), [
      text(px, fs, upgradeHint || 'Upgrade your golf club', 160, 54, 250, 20, 15, upgradeHint ? C.yellow : hex('#F1E6FF')),
      text(px, fs, club ? `Equipped: ${club.name} · ${club.power} / ${club.control} / ${club.aim}` : 'Equipped: -', 160, 78, 255, 20, 15)
    ]),
    menuCard(px, fs, 'card-prizes', 432, P.pink, 'art_prizes', 'tt_card_prizes', () => showLobbyView('prizes'), [
      text(
        px, fs,
        lobbyMenuState.prizes.length ? `${lobbyMenuState.prizes.length} COCOBAY wearables, diamonds for the top 10` : 'Season wearables and diamonds for the top 10',
        160, 50, 250, 40, 15, hex('#FFE4F5'), 'middle-left', true
      ),
      soldOut.length
        ? box(px, 'sold-chip', 160, 92, 250, 22, { color: CHIP_DARK, radius: 9, align: 'center', padding: { left: px(10) } }, [
            <Label
              value={soldOut.length === 1 ? `${shortName(soldOut[0].name)} sold out: FT instead` : `${soldOut.length} sold out: Fashion Tickets instead`}
              fontSize={fs(12)}
              color={C.yellow}
              textAlign="middle-left"
              textWrap="nowrap"
              uiTransform={{ height: px(22) }}
            />
          ])
        : null
    ])
  ]

  // --------------------------------------------------------------- bottom
  const soonButtons = SOON.map((s, i) => {
    const x = 58 + i * (283 + 12)
    return box(px, `soon-${i}`, x, 580, 283, 72, { color: Color4.create(P.navy.r, P.navy.g, P.navy.b, 0.75), radius: 16, border: 3, borderColor: P.navyEdge, shadow: 6, align: 'center', padding: { left: px(16), right: px(12) } }, [
      img(px, s.icon, undefined, undefined, 0.8, Color4.create(1, 1, 1, 0.55)),
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', margin: { left: px(14) } }}>
        <Label value={s.title} fontSize={fs(18)} color={Color4.create(1, 1, 1, 0.6)} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />
        <Label value={s.sub} fontSize={fs(12)} color={Color4.create(P.pale.r, P.pale.g, P.pale.b, 0.6)} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(18) }} />
      </UiEntity>,
      <UiEntity uiTransform={{ height: px(22), padding: { left: px(8), right: px(8) }, borderRadius: px(8), justifyContent: 'center', flexShrink: 0 }} uiBackground={{ color: P.navyEdge }}>
        <Label value="SOON" fontSize={fs(11)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />
      </UiEntity>
    ])
  })

  const materials = ['WD', 'ST', 'IR', 'GD'].map((code, i) =>
    box(px, `mat-${code}`, 178 + i * 136, 668, 128, 48, { color: P.navyDeep, radius: 14, border: 3, borderColor: P.navyEdge, align: 'center', padding: { left: px(8) } }, [
      materialIcon(px, code, 30),
      <Label value={num((r as any)[code] || 0)} fontSize={fs(17)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(42), margin: { left: px(8) } }} />
    ])
  )
  const footer = [
    box(px, 'materials-tag', 58, 668, 110, 48, { color: P.navyDeep, radius: 14, border: 3, borderColor: P.navyEdge, justify: 'center', align: 'center' }, [
      <Label value="MATERIALS" fontSize={fs(12)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(42) }} />
    ]),
    ...materials,
    button2(
      px,
      { id: 'daily-missions', x: 958, y: 668, w: 268, h: 48, color: P.navy, radius: 14, border: 3, borderColor: P.navyEdge, justify: 'space-between', padding: { left: px(14), right: px(10) }, onClick: () => showLobbyView('daily') },
      [
        <Label value="DAILY MISSIONS" fontSize={fs(18)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(42) }} />,
        <UiEntity uiTransform={{ height: px(26), padding: { left: px(10), right: px(10) }, borderRadius: px(9), justifyContent: 'center' }} uiBackground={{ color: C.yellow }}>
          <Label value={dailyDone} fontSize={fs(14)} color={CHIP_DARK} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(26) }} />
        </UiEntity>
      ]
    ),
    daily && dailyIndex < dailyTotal
      ? box(px, 'daily-badge', 1208, 656, 28, 28, { color: P.red, radius: 14, border: 3, justify: 'center', align: 'center' }, [
          <Label value="!" fontSize={fs(17)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        ])
      : null
  ]

  // Outside the dialog, as the design asks; it names the real keys, and it
  // stays inside the interactable area because HINT_H was reserved.
  const hint = mobile ? null : (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: L.left, top: L.top + L.panelH + 6 }, width: L.panelW, height: HINT_H - 6, justifyContent: 'center', alignItems: 'center' }}
    >
      <Label value="Press E or F to close" fontSize={16} color={C.white} textAlign="middle-center" uiTransform={{ height: HINT_H - 6 }} textWrap="nowrap" />
    </UiEntity>
  )

  return frame(L, 'lobby', [...header, ...season, ...cards, ...soonButtons, ...footer], hint)
}

// Resource pill of the header: the game's icon and the amount.
const resourcePill = (px: Px, fs: Px, code: string, value: string) => (
  <UiEntity
    key={`res-${code}`}
    uiTransform={{ height: px(48), flexDirection: 'row', alignItems: 'center', margin: { right: px(6) }, padding: { left: px(6), right: px(12) }, borderRadius: px(14) }}
    uiBackground={{ color: P.glass }}
  >
    {resIcon(px, code, 30)}
    <Label value={value} fontSize={fs(18)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(48), margin: { left: px(8) } }} />
  </UiEntity>
)

// One of the three cards on the right: art box, display title, two lines of
// text and a chevron. The whole card is the button.
const menuCard = (px: Px, fs: Px, id: string, y: number, color: Color4, art: string, titleKey: string, onClick: () => void, content: any[]) =>
  button2(px, { id, x: 772, y, w: 451, h: 133, color, radius: 20, border: 4, shadow: 10, onClick }, [
    img(px, art, 4, 4),
    img(px, titleKey, 156, 10),
    ...content,
    img(px, 'ic_chev_right_w', 404, 50, 1.1)
  ])

// E or F: back to the lobby from a sub-view, close from the lobby (E is also
// what dismisses the intro image).
export const lobbyMenuInputSystem = () => {
  if (!lobbyMenuState.visible) return
  if (
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  ) {
    closeOrBack()
  }
}
