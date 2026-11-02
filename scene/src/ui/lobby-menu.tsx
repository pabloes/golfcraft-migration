// The lobby menu: a full-screen dialog over the 3D lobby, after the design
// "Lobby" of the GolfCraft UI canvas, page "Móvil · propuesta 2"
// (M2Main.dc.html), used on phones and desktop alike. It shows the real data
// and wires PLAY / FRIENDS to the season panel's own logic; the cards open the
// sub-views (lobby-views.tsx).
//
// The 667x375 design leaves its corners empty for the explorer's own controls
// on a phone: avatar and chat top-left, joystick and emotes bottom-left,
// E / F / + / jump bottom-right (ui-scale.ts fullLayout).
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
import { lobbyMenuState, closeOrBack, showLobbyView, nextSeasonPrize, seasonPlayState } from './lobby-menu-state'
import { TutorialView, WorkshopView, PrizesView, DailyMissionsView, SeasonView, MoreGamesView } from './lobby-views'
import { C, hex, fmt, materialIcon } from './ui-theme'
import { fullLayout, scaler, type Px } from './ui-scale'
import { P, at, img, imgW, imgBox, text, box, fullFrame, button2, imageButton, squareButton, sideCard, nextPrizeStrip, resIcon, rankBadge, border, energyChip } from './ui2'
import { isGiveawayActive } from '../services/giveaway'
import { giveawayPosterBox } from './giveaway'
import { pingLabel } from './ping-label'
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

const TUTORIAL_STEPS = 9
// Workshop: cost of the next upgrade step for the basic club (cloudscript
// csGolfclub, indexed by the attribute's current value).
const UPGRADE_COSTS = [10, 20, 30, 60, 120]

const RANK_TEXT = hex('#E8DFFF')
const BAR_TRACK = hex('#150A33')
const XP_TRACK = hex('#0B0E33')
const AVATAR_EDGE = hex('#7CE34A')
const CHIP_DARK = hex('#1C0A3F')
const SOON_TEXT = Color4.create(201 / 255, 207 / 255, 1, 0.8)

// Features of the SDK6 game that this scene does not have yet; the design
// keeps their buttons, so they show as "soon".
const SOON = [
  { icon: 'ic_flag_w', title: 'CUSTOM' },
  { icon: 'ic_map_w', title: 'MY MAPS' },
  { icon: 'ic_cart_w', title: 'SHOP' }
]
// MORE GAMES, the last slot of that row (canvas page "Más juegos", OGMainA).
const MORE_GAMES = hex('#FF8A1F')
const MORE_GAMES_SHADOW = hex('#A9480A')
const NEW_TAG = hex('#2BD9C6')

// 155,100 -> 155K, 8,717 -> 8.7K: the lobby only has room for short amounts
// (the workshop shows the exact ones).
const compact = (n: number) => {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  if (n < 1000000) return `${Math.round(n / 1000)}K`
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
}

export const LobbyMenu = () => {
  const gs = globalStore.game.getState()
  if (!lobbyMenuState.visible || gs.bootError || gs.playing || gs.starting || gs.introScreen) return null
  if (lobbyMenuState.view === 'season') return <SeasonView />
  if (lobbyMenuState.view === 'tutorial') return <TutorialView />
  if (lobbyMenuState.view === 'workshop') return <WorkshopView />
  if (lobbyMenuState.view === 'prizes') return <PrizesView />
  if (lobbyMenuState.view === 'daily') return <DailyMissionsView />
  if (lobbyMenuState.view === 'games') return <MoreGamesView />

  const L = fullLayout()
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
  // PLAY / FRIENDS state, shared with the SEASON view.
  const { energy, gameOpen, canPlay, canFriends, playCaption, friendsCaption, friendsRoomTier, friendsRoomTierName, startSeason, startFriends } = seasonPlayState()

  const nextPrize = nextSeasonPrize(tierSubMax)
  const toNextPrize = nextPrize ? Math.max(0, nextPrize.tierReward - tierSub) : 0
  const prizesLoaded = lobbyMenuState.prizes.length > 0

  const club = r.golfclub
  // Today's daily missions are done in order: the index is how many are done.
  const daily = lobbyHudState.dailyMissions
  const dailyTotal = daily ? daily.state.missions.length : 5
  const dailyIndex = daily ? Math.min(daily.dailyMissionIndex, dailyTotal) : 0
  const clubAim = club?.aim || 0
  const upgradeHint = club && club.id === 1 && clubAim < UPGRADE_COSTS.length ? `Aim +1: ${UPGRADE_COSTS[clubAim]} wood` : null

  const num = (value: number) => (r.loaded ? fmt(value) : '-')
  const short = (value: number) => (r.loaded ? compact(value) : '-')
  const face = avatarFaceUrl(player?.userId)
  const name = displayName.length > 10 ? `${displayName.slice(0, 9)}…` : displayName

  // ------------------------------------------------------------- top bar
  const resourceWidths = [72, 108, 87, 108]
  const top = [
    img(px, 'logo', 142, 3, 64 / imgW('logo')),
    box(px, 'resources', 212, 6, 399, 44, { color: P.navy, radius: 12, border: 2, borderColor: P.navyEdge, align: 'center', padding: { left: px(4), right: px(4) } }, [
      resourceChip(px, fs, 'EN', num(energy), resourceWidths[0], true),
      resourceChip(px, fs, 'GC', num(r.GC), resourceWidths[1], true),
      resourceChip(px, fs, 'DM', num(r.DM), resourceWidths[2], true),
      resourceChip(px, fs, 'FT', num(r.FT), resourceWidths[3], false)
    ]),
    squareButton(px, 'close', 617, 6, 'ic_close_w', 0.67, closeOrBack)
  ]

  // --------------------------------------------------------- left column
  const left = [
    box(px, 'player', 6, 58, 140, 62, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    <UiEntity key="avatar" uiTransform={{ ...at(px, 13, 65, 40, 40), borderRadius: px(10), borderWidth: border(px, 2), borderColor: AVATAR_EDGE }} uiBackground={{ color: C.teal }}>
      {face ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(8) }} uiBackground={{ texture: { src: face }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, name, 60, 64, 84, 18, 14),
    text(px, fs, `LV ${r.level}`, 60, 83, 84, 20, 17, C.yellow),
    box(px, 'xp', 13, 109, 126, 6, { color: XP_TRACK, radius: 3 }, [
      <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, r.levelPct))}%`, height: '100%', borderRadius: px(3) }} uiBackground={{ color: P.green }} />
    ]),

    button2(
      px,
      { id: 'daily-missions', x: 6, y: 126, w: 140, h: 50, color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge, justify: 'flex-start', padding: { left: px(10) }, onClick: () => showLobbyView('daily') },
      [
        <UiEntity uiTransform={{ width: px(80), height: px(40), flexDirection: 'column', justifyContent: 'center' }}>
          <Label value="DAILY" fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(17) }} />
          <Label value="MISSIONS" fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(17) }} />
        </UiEntity>,
        box(px, 'daily-count', 92, 13, 36, 20, { color: C.yellow, radius: 8, justify: 'center', align: 'center' }, [
          <Label value={daily ? `${dailyIndex}/${dailyTotal}` : '-/5'} fontSize={fs(12)} color={CHIP_DARK} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        ])
      ]
    ),
    daily && dailyIndex < dailyTotal
      ? box(px, 'daily-badge', 131, 118, 20, 20, { color: P.red, radius: 10, border: 2, justify: 'center', align: 'center' }, [
          <Label value="!" fontSize={fs(13)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        ])
      : null,

    box(px, 'materials', 6, 182, 140, 64, { color: P.navyDeep, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'MATERIALS', 15, 187, 120, 13, 10, P.pale),
    ...['WD', 'ST', 'IR', 'GD'].map((code, i) => (
      <UiEntity key={`mat-${code}`} uiTransform={{ ...at(px, 15 + (i % 2) * 63, 204 + Math.floor(i / 2) * 21, 60, 20), flexDirection: 'row', alignItems: 'center' }}>
        {materialIcon(px, code, 18)}
        <Label value={short((r as any)[code] || 0)} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20), margin: { left: px(4) } }} />
      </UiEntity>
    ))
  ]

  // ---------------------------------------------------------- season card
  const toNextTier = nextTierName ? `${ptsPerTier - ptsOnTier} pts to ${nextTierName}` : 'Top rank reached'
  // While a giveaway runs (services/giveaway.ts) its poster takes the champion's
  // column and the rank box and the next prize narrow to leave it room; the
  // card goes back to the design by itself when the campaign ends.
  const promo = isGiveawayActive()
  const rx = promo ? 290 : 255
  const rw = promo ? 191 : 226
  const season = [
    imgBox(px, 'season_card_m', 152, 58, 340, 236),
    // The champion stands in the card's left column, behind the PLAY button.
    promo ? giveawayPosterBox(px, 158, 94, 124) : img(px, 'champion', 154, 95, 104 / imgW('champion')),
    imageButton(px, 'season-ribbon', 'rb_season_lobby', 163, 64, () => showLobbyView('season'), 0.5),
    box(px, 'season-tag', 373, 71, 112, 20, { color: C.yellow, radius: 10, justify: 'center', align: 'center' }, [
      <Label value={`${seasonName} Season`} fontSize={fs(11)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),

    box(px, 'rank', rx, 105, rw, 66, { color: P.rankBox, radius: 12, border: 2, borderColor: P.rankEdge, shadow: 4, shadowColor: P.rankShadow }),
    rankBadge(px, tier, 44, rx + 8, 116),
    text(px, fs, tierName, rx + 60, 109, promo ? 92 : 110, 26, promo ? 18 : 20),
    text(px, fs, `${tierSub} pts`, rx + rw - 81, 114, 72, 16, 12, P.white, 'middle-right'),
    box(px, 'rank-bar', rx + 60, 139, rw - 74, 8, { color: BAR_TRACK, radius: 4 }, [
      <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, Math.round((100 * ptsOnTier) / ptsPerTier)))}%`, height: '100%', borderRadius: px(4) }} uiBackground={{ color: P.green }} />
    ]),
    text(px, fs, toNextTier, rx + 60, 151, 110, 14, 11, RANK_TEXT),
    // The next category only when the line on the left leaves room for it.
    nextCat > cat && toNextTier.length <= (promo ? 12 : 16) ? text(px, fs, `${nextCatName} at ${nextCatAt}`, rx + rw - 91, 151, 82, 14, 11, RANK_TEXT, 'middle-right') : null,

    ...(gameOpen
      ? [
          ...nextPrizeStrip(px, fs, 'next-prize', rx, 177, rw, 40, nextPrize, '', toNextPrize, prizesLoaded)
        ]
      : [
          box(px, 'closed', rx, 177, rw, 40, { color: P.navyDeep, radius: 10, border: 2, borderColor: C.yellow }),
          text(px, fs, 'CLOSED UNTIL THE FIRST WEEK', rx + 8, 181, rw - 14, 14, 10, C.yellow),
          text(px, fs, opensInText(), rx + 8, 195, rw - 14, 18, 13)
        ]),

    button2(
      px,
      {
        id: 'play', x: 163, y: 223, w: 200, h: 62, color: canPlay ? P.yellow : C.disabled, radius: 15, shadow: 5, shadowColor: canPlay ? P.yellowShadow : C.dark,
        disabled: !canPlay, onClick: startSeason, padding: { bottom: px(12) }
      },
      [
        img(px, 'bt_play', undefined, undefined, 0.55),
        <UiEntity uiTransform={{ width: px(8) }} />,
        img(px, 'ic_play_n', undefined, undefined, 0.55),
        energyChip(px, fs, 'play-energy', 52, 39, 96, 18, playCaption, 11)
      ]
    ),
    button2(
      px,
      {
        id: 'friends', x: 371, y: 223, w: 110, h: 62, color: canFriends ? P.lavender : C.disabled, radius: 15, shadow: 5,
        shadowColor: canFriends ? P.lavenderShadow : C.dark, disabled: !canFriends, onClick: startFriends, row: false
      },
      [
        // While a party waits, its rank (the host's) takes the icon's place.
        friendsRoomTier >= 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: px(16) }}>
            {rankBadge(px, friendsRoomTier, 16)}
            <Label value={friendsRoomTierName} fontSize={fs(10)} color={P.ink} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(16), margin: { left: px(3) } }} />
          </UiEntity>
        ) : (
          img(px, 'ic_people_n', undefined, undefined, 0.45)
        ),
        <Label value="FRIENDS" fontSize={fs(16)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(18) }} />,
        <Label
          value={friendsCaption.indexOf('\n') >= 0 ? 'Play together' : friendsCaption}
          fontSize={fs(10)}
          color={P.ink}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: px(104), height: px(24) }}
        />
      ]
    )
  ]

  // ---------------------------------------------------------- coming soon
  const soon = SOON.map((s, i) => {
    const x = 152 + i * 86.5
    const scale = 18 / Math.max(imgW(s.icon), 1)
    return [
      box(px, `soon-${i}`, x, 300, 80.5, 54, { color: P.navy, radius: 12, border: 2, borderColor: P.navyEdge }),
      img(px, s.icon, x + (80.5 - imgW(s.icon) * scale) / 2, 309, scale, SOON_TEXT),
      text(px, fs, s.title, x, 331, 80.5, 14, 12, SOON_TEXT, 'middle-center'),
      box(px, `soon-tag-${i}`, x + 80.5 - 3 - 32, 293, 32, 14, { color: C.yellow, radius: 6, justify: 'center', align: 'center' }, [
        <Label value="SOON" fontSize={fs(9)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ])
    ]
  })
  const moreX = 152 + SOON.length * 86.5
  const moreGames = [
    button2(
      px,
      { id: 'more-games', x: moreX, y: 300, w: 80.5, h: 50, color: MORE_GAMES, radius: 12, border: 2, borderColor: P.white, shadow: 4, shadowColor: MORE_GAMES_SHADOW, row: false, onClick: () => showLobbyView('games') },
      [
        img(px, 'ic_gamepad_w', undefined, undefined, 20 / imgW('ic_gamepad_w')),
        <Label value="MORE GAMES" fontSize={fs(11)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16), margin: { top: px(3) } }} />
      ]
    ),
    box(px, 'more-games-tag', moreX + 80.5 - 3 - 30, 293, 30, 14, { color: NEW_TAG, radius: 6, justify: 'center', align: 'center' }, [
      <Label value="NEW" fontSize={fs(9)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ])
  ]

  // ---------------------------------------------------------- right cards
  const cards = [
    sideCard(px, 'card-tutorial', 58, P.teal, tutorialDone || currentMission === 9 ? 'art_tutorial_3_sq' : 'art_tutorial_1_sq', 'tt_card_tutorial', () => showLobbyView('tutorial'), [
      <UiEntity key="tut-line" uiTransform={{ ...at(px, 51, 26, 100, 14), flexDirection: 'row', alignItems: 'center' }}>
        {tutorialDone ? (
          <Label value="All 9 done" fontSize={fs(11)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14) }} />
        ) : (
          [
            <Label value="Mission" fontSize={fs(11)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14) }} />,
            <Label value={`${currentMission} of ${TUTORIAL_STEPS}`} fontSize={fs(11)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(14), margin: { left: px(3) } }} />
          ]
        )}
      </UiEntity>
    ]),
    sideCard(px, 'card-workshop', 116, P.purple, 'art_workshop_sq', 'tt_card_workshop', () => showLobbyView('workshop'), [
      text(px, fs, upgradeHint || 'Upgrade your club', 51, 26, 100, 14, 11, upgradeHint ? C.yellow : P.white)
    ]),
    sideCard(px, 'card-prizes', 174, P.pink, 'art_prizes_sq', 'tt_card_prizes', () => showLobbyView('prizes'), [
      text(px, fs, prizesLoaded ? `${lobbyMenuState.prizes.length} wearables` : 'Season wearables', 51, 26, 100, 14, 11)
    ])
  ]

  // E / F close the dialog on desktop; on a phone that corner holds the
  // explorer's buttons and the X does it.
  const hint = isMobile() ? null : text(px, fs, 'Press E or F to close', 498, 338, 163, 16, 11, P.pale, 'middle-right')

  // Bottom centre, under the bottom row: clear of the explorer's corners.
  const ping = pingLabel(px, fs, 10, { ...at(px, 152, 355, 120, 16) })

  return fullFrame(L, [...top, ...left, ...season, ...soon, ...moreGames, ...cards, hint, ping])
}

// Resource chip of the top bar: the game's icon and the amount.
const resourceChip = (px: Px, fs: Px, code: string, value: string, w: number, gap: boolean) => (
  <UiEntity
    key={`res-${code}`}
    uiTransform={{ width: px(w), height: px(34), flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { right: gap ? px(4) : 0 }, borderRadius: px(9) }}
    uiBackground={{ color: P.glass }}
  >
    {resIcon(px, code, 24)}
    <Label value={value} fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(34), margin: { left: px(6) } }} />
  </UiEntity>
)

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
