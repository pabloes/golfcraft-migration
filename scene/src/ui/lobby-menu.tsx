// The lobby menu: a centred dialog over the 3D lobby, after the design in the
// "GolfCraft UI" canvas (Main.dc.html). Phase 1 shows the real data and wires
// PLAY / WITH FRIENDS to the season panel's own logic; the sub-screens
// (Season, Workshop, Prizes, Joining) come later.
//
// Closing: E or F (IA_PRIMARY / IA_SECONDARY — a scene cannot read Escape,
// which every explorer keeps for itself) or the X button. The 3D lobby stays
// as it is underneath.
//
// Outlined display titles (GOLF CRAFT, SEASON RANKED...) would need images,
// like today's "STEP 2 SET POWER" panel; for now they are big sans-serif text.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState, closeLobbyMenu, openLobbyMenu, closeOrBack, showLobbyView } from './lobby-menu-state'
import { TutorialView, WorkshopView, PrizesView, DailyMissionsView } from './lobby-views'
import { C, fmt, shortName, pressable, counter, chip, materialIcon } from './ui-theme'
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px } from './ui-scale'
import { seasonCatalog } from '../components/lobby/seasons/season-catalog'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getPointsOnCurrentTier, getPointsToTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - common/constants has @ts-nocheck
import { TIER_CATEGORIES } from '../../../common/constants'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'
import { isMobile } from '../services/platform'

const MARGIN = 16 // keeps the border off the interactable area's edges
const HINT_H = 40 // the "Press E or F to close" line under the panel

const TUTORIAL_STEPS = 9
const TUTORIAL_CAPTIONS: Record<number, string> = {
  1: 'play your first hole',
  2: 'catch the first sphere',
  3: 'catch the second sphere',
  4: 'catch the third sphere',
  5: 'catch the fourth sphere',
  6: 'claim your greeting emote',
  7: 'improve your golf club',
  8: 'reach STONE rank in Season',
  9: 'collect your reward'
}
// Workshop: cost of the next upgrade step for the basic club (cloudscript
// csGolfclub, indexed by the attribute's current value).
const UPGRADE_COSTS = [10, 20, 30, 60, 120]

export const LobbyMenu = () => {
  const gs = globalStore.game.getState()
  if (!lobbyMenuState.visible || gs.bootError || gs.playing || gs.starting || gs.introScreen) return null
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
  const energy = r.EN || 0
  const canPlay = energy > 0 && !!lobbyMenuState.actions.playSeason
  const friendsLabel = lobbyMenuState.actions.friendsLabel ? lobbyMenuState.actions.friendsLabel() : ''
  const canFriends = canPlay && !!lobbyMenuState.actions.playWithFriends && friendsLabel !== ''

  const nextPrize = lobbyMenuState.prizes.find((p) => p.tierReward > tierSub) || null
  const nextPrizeTier = nextPrize ? seasonTierDefinitions[Number(getTierFromSub(nextPrize.tierReward) || 0)]?.name : ''
  const soldOut = lobbyMenuState.prizes.filter((p) => p.stock <= 0)

  const club = r.golfclub
  // Today's daily missions are done in order: the index is how many are done.
  const daily = lobbyHudState.dailyMissions
  const dailyDone = daily ? `${Math.min(daily.dailyMissionIndex, daily.state.missions.length)} / ${daily.state.missions.length}` : '- / 5'
  const clubAim = club?.aim || 0
  const upgradeHint =
    club && club.id === 1 && clubAim < UPGRADE_COSTS.length ? `Basic club: aim +1 for ${UPGRADE_COSTS[clubAim]} wood` : null

  const num = (value: number) => (r.loaded ? fmt(value) : '-')

  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}
      uiBackground={{ color: C.backdrop }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: L.left, top: L.top },
          width: L.panelW,
          height: L.panelH,
          flexDirection: 'column',
          padding: { top: px(22), bottom: px(20), left: px(28), right: px(28) },
          borderRadius: px(24),
          borderWidth: Math.max(2, px(4)),
          borderColor: C.dark
        }}
        uiBackground={{ color: C.bg }}
      >
        {/* ---------------- header ---------------- */}
        <UiEntity uiTransform={{ width: '100%', height: px(76), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <UiEntity
            uiTransform={{ height: px(70), flexDirection: 'row', alignItems: 'center', padding: { left: px(6), right: px(18) }, borderRadius: px(20) }}
            uiBackground={{ color: C.dark }}
          >
            <UiEntity
              uiTransform={{ width: px(58), height: px(58), borderRadius: px(16), borderWidth: Math.max(2, px(3)), borderColor: C.yellow }}
              uiBackground={player ? { avatarTexture: { userId: player.userId }, color: C.teal } : { color: C.teal }}
            />
            <UiEntity uiTransform={{ width: px(210), height: px(58), flexDirection: 'column', justifyContent: 'center', margin: { left: px(12) } }}>
              <UiEntity uiTransform={{ width: '100%', height: px(26), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label value={displayName} fontSize={fs(20)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(26) }} textWrap="nowrap" />
                <Label value={`LV ${r.level}`} fontSize={fs(18)} color={C.yellow} textAlign="middle-right" uiTransform={{ height: px(26) }} textWrap="nowrap" />
              </UiEntity>
              <UiEntity
                uiTransform={{ width: '100%', height: px(14), margin: { top: px(7) }, borderRadius: px(8), borderWidth: Math.max(1, px(2)), borderColor: C.darker }}
                uiBackground={{ color: C.purpleTrack }}
              >
                <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, r.levelPct))}%`, height: '100%', borderRadius: px(6) }} uiBackground={{ color: C.green }} />
              </UiEntity>
            </UiEntity>
          </UiEntity>

          <UiEntity uiTransform={{ height: px(76), flexDirection: 'row', alignItems: 'center' }}>
            <Label value="GOLF" fontSize={fs(50)} color={C.green} textAlign="middle-center" uiTransform={{ height: px(76) }} textWrap="nowrap" />
            <Label value=" CRAFT" fontSize={fs(50)} color={C.yellow} textAlign="middle-center" uiTransform={{ height: px(76) }} textWrap="nowrap" />
          </UiEntity>

          <UiEntity uiTransform={{ height: px(76), flexDirection: 'row', alignItems: 'center' }}>
            {counter(px, fs, 'EN', num(energy))}
            {counter(px, fs, 'GC', num(r.GC))}
            {counter(px, fs, 'DM', num(r.DM))}
            {counter(px, fs, 'FT', num(r.FT))}
          </UiEntity>
        </UiEntity>

        {/* ---------------- main ---------------- */}
        <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', margin: { top: px(18), bottom: px(18) } }}>
          {/* Season ranked */}
          <UiEntity
            uiTransform={{
              width: '48%',
              height: '100%',
              flexDirection: 'column',
              padding: { top: px(20), bottom: px(24), left: px(28), right: px(28) },
              borderRadius: px(28),
              borderWidth: Math.max(2, px(5)),
              borderColor: C.yellow
            }}
            uiBackground={{ color: C.purple }}
          >
            <UiEntity uiTransform={{ width: '100%', height: px(48), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label value="SEASON RANKED" fontSize={fs(40)} color={C.yellow} textAlign="middle-left" uiTransform={{ height: px(48) }} textWrap="nowrap" />
              <UiEntity uiTransform={{ height: px(32), padding: { left: px(14), right: px(14) }, borderRadius: px(12), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
                <Label value={`${seasonName} Season`} fontSize={fs(15)} color={C.green} textAlign="middle-center" uiTransform={{ height: px(32) }} textWrap="nowrap" />
              </UiEntity>
            </UiEntity>
            <Label
              value="Race 3 ghost players over 4 holes. Win to climb."
              fontSize={fs(18)}
              color={C.lilac}
              textAlign="middle-left"
              uiTransform={{ width: '100%', height: px(28), margin: { top: px(6) } }} textWrap="nowrap"
            />

            <UiEntity
              uiTransform={{
                width: '100%',
                height: px(150),
                flexDirection: 'row',
                alignItems: 'center',
                margin: { top: px(14) },
                padding: { left: px(20), right: px(22) },
                borderRadius: px(22),
                borderWidth: Math.max(1, px(3)),
                borderColor: C.dark
              }}
              uiBackground={{ color: C.purpleCard }}
            >
              <UiEntity
                uiTransform={{ width: px(112), height: px(112), borderRadius: px(56) }}
                uiBackground={{ texture: { src: `images/season-badges/${tier}.png` }, textureMode: 'stretch' }}
              />
              <UiEntity uiTransform={{ flexGrow: 1, height: px(112), flexDirection: 'column', justifyContent: 'center', margin: { left: px(22) } }}>
                <UiEntity uiTransform={{ width: '100%', height: px(38), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Label value={tierName} fontSize={fs(34)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(38) }} textWrap="nowrap" />
                  <Label value={`${tierSub} pts`} fontSize={fs(17)} color={C.lilac} textAlign="middle-right" uiTransform={{ height: px(38) }} textWrap="nowrap" />
                </UiEntity>
                <UiEntity
                  uiTransform={{ width: '100%', height: px(22), margin: { top: px(8) }, borderRadius: px(12), borderWidth: Math.max(1, px(3)), borderColor: C.dark }}
                  uiBackground={{ color: C.bg }}
                >
                  <UiEntity uiTransform={{ width: `${Math.round((100 * ptsOnTier) / ptsPerTier)}%`, height: '100%', borderRadius: px(8) }} uiBackground={{ color: C.green }} />
                </UiEntity>
                <UiEntity uiTransform={{ width: '100%', height: px(22), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: { top: px(6) } }}>
                  <Label
                    value={nextTierName ? `${ptsPerTier - ptsOnTier} pts to ${nextTierName}` : 'Top rank reached'}
                    fontSize={fs(15)}
                    color={C.lilac}
                    textAlign="middle-left"
                    uiTransform={{ height: px(22) }} textWrap="nowrap"
                  />
                  <Label
                    value={nextCat > cat ? `${nextCatName} at ${nextCatAt} pts` : ''}
                    fontSize={fs(15)}
                    color={C.lilac}
                    textAlign="middle-right"
                    uiTransform={{ height: px(22) }}
                  />
                </UiEntity>
              </UiEntity>
            </UiEntity>

            <UiEntity
              uiTransform={{
                width: '100%',
                height: px(52),
                flexDirection: 'row',
                alignItems: 'center',
                margin: { top: px(14) },
                padding: { left: px(16), right: px(14) },
                borderRadius: px(16),
                borderWidth: Math.max(1, px(3)),
                borderColor: C.dark
              }}
              uiBackground={{ color: C.magenta }}
            >
              <Label
                value={nextPrize ? `Next prize: ${shortName(nextPrize.name)} at ${nextPrizeTier}` : 'Next prize: loading...'}
                fontSize={fs(17)}
                color={C.white}
                textAlign="middle-left"
                uiTransform={{ flexGrow: 1, height: px(52) }} textWrap="nowrap"
              />
              {nextPrize ? (
                <UiEntity uiTransform={{ height: px(30), padding: { left: px(10), right: px(10) }, borderRadius: px(10), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
                  <Label value={`${nextPrize.stock} left`} fontSize={fs(16)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
                </UiEntity>
              ) : null}
            </UiEntity>

            <UiEntity uiTransform={{ flexGrow: 1 }} />

            <UiEntity uiTransform={{ width: '100%', height: px(72 + 10), flexDirection: 'row' }}>
              {pressable(
                {
                  id: 'play',
                  width: '49%',
                  height: px(72),
                  color: canPlay ? C.yellow : C.disabled,
                  radius: px(20),
                  borderWidth: Math.max(2, px(4)),
                  borderColor: C.dark,
                  shadow: px(8),
                  disabled: !canPlay,
                  onClick: () => {
                    closeLobbyMenu()
                    lobbyMenuState.actions.playSeason && lobbyMenuState.actions.playSeason()
                  }
                },
                <Label value="PLAY" fontSize={fs(36)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(72) }} textWrap="nowrap" />,
                <UiEntity uiTransform={{ height: px(30), margin: { left: px(12) }, padding: { left: px(10), right: px(10) }, borderRadius: px(10), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
                  <Label
                    value={energy > 0 ? '1 energy' : 'no energy'}
                    fontSize={fs(16)}
                    color={C.cyan}
                    textAlign="middle-center"
                    uiTransform={{ height: px(30) }}
                  />
                </UiEntity>
              )}
              <UiEntity uiTransform={{ width: '2%' }} />
              {pressable(
                {
                  id: 'friends',
                  width: '49%',
                  height: px(72),
                  color: canFriends ? C.white : C.disabled,
                  radius: px(20),
                  borderWidth: Math.max(2, px(4)),
                  borderColor: C.dark,
                  shadow: px(8),
                  disabled: !canFriends,
                  onClick: () => {
                    closeLobbyMenu()
                    lobbyMenuState.actions.playWithFriends && lobbyMenuState.actions.playWithFriends()
                  }
                },
                <Label
                  value={canFriends ? friendsLabel : 'WITH FRIENDS'}
                  fontSize={fs(24)}
                  color={C.dark}
                  textAlign="middle-center"
                  uiTransform={{ width: '100%', height: px(72) }} textWrap="nowrap"
                />
              )}
            </UiEntity>
          </UiEntity>

          <UiEntity uiTransform={{ width: '2%' }} />

          {/* Right column */}
          <UiEntity uiTransform={{ width: '50%', height: '100%', flexDirection: 'column', justifyContent: 'space-between' }}>
            {card(
              px, fs, 'tutorial',
              C.teal,
              C.tealDark,
              'TUTORIAL',
              tutorialDone ? 'All 9 missions completed' : `Mission ${currentMission} of ${TUTORIAL_STEPS} · ${TUTORIAL_CAPTIONS[currentMission] || ''}`,
              <UiEntity uiTransform={{ height: px(10), flexDirection: 'row', margin: { top: px(6) } }}>
                {Array.from({ length: TUTORIAL_STEPS }, (_, i) => (
                  <UiEntity
                    key={i}
                    uiTransform={{ width: px(22), height: px(10), borderRadius: px(5), margin: { right: px(6) } }}
                    uiBackground={{
                      color: i + 1 < currentMission ? C.yellow : i + 1 === currentMission && !tutorialDone ? C.white : tutorialDone ? C.yellow : C.tealDark
                    }}
                  />
                ))}
              </UiEntity>,
              () => showLobbyView('tutorial'),
              // Dr. Par, happy once the tutorial is done (or about to be).
              tutorialDone || currentMission === 9 ? 'images/NPC/expresion3.png' : 'images/NPC/expresion1.png'
            )}
            {card(
              px, fs, 'workshop',
              C.blue,
              C.blueDark,
              'WORKSHOP',
              club ? `Equipped: ${club.name} · ${club.power} / ${club.control} / ${club.aim}` : 'Equipped: -',
              upgradeHint ? chip(px, fs, upgradeHint, C.green) : null,
              () => showLobbyView('workshop'),
              // The equipped club's thumbnail (same one the WORKSHOP view and the
              // 3D board use); refreshUserData updates r.golfclub after EQUIP.
              `images/${club?.id || 1}.png`
            )}
            {card(
              px, fs, 'prizes',
              C.pink,
              C.pinkDark,
              'PRIZES',
              lobbyMenuState.prizes.length ? `${lobbyMenuState.prizes.length} COCOBAY wearables, diamonds for the top 10` : 'Season wearables and diamonds for the top 10',
              soldOut.length ? chip(px, fs, soldOut.length === 1 ? `${shortName(soldOut[0].name)} sold out` : `${soldOut.length} wearables sold out`, C.yellow) : null,
              () => showLobbyView('prizes'),
              'images/icons/prizes.png'
            )}
          </UiEntity>
        </UiEntity>

        {/* ---------------- footer ---------------- */}
        <UiEntity uiTransform={{ width: '100%', height: px(50), flexDirection: 'row', alignItems: 'center' }}>
          <Label value="MATERIALS" fontSize={fs(15)} color={C.muted} textAlign="middle-left" uiTransform={{ height: px(50), margin: { right: px(10) } }} textWrap="nowrap" />
          {material(px, fs, 'WD', num(r.WD))}
          {material(px, fs, 'ST', num(r.ST))}
          {material(px, fs, 'IR', num(r.IR))}
          {material(px, fs, 'GD', num(r.GD))}
          <UiEntity uiTransform={{ flexGrow: 1 }} />
          {pressable(
            {
              id: 'daily-missions',
              width: px(236),
              height: px(44),
              color: C.transparent,
              radius: px(14),
              borderWidth: Math.max(2, px(3)),
              borderColor: C.white,
              shadow: 0,
              padding: { left: px(14), right: px(6) },
              justifyContent: 'space-between',
              onClick: () => showLobbyView('daily')
            },
            <Label value="DAILY MISSIONS" fontSize={fs(18)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(44) }} textWrap="nowrap" />,
            <UiEntity uiTransform={{ height: px(28), padding: { left: px(10), right: px(10) }, borderRadius: px(9), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
              <Label value={dailyDone} fontSize={fs(15)} color={C.yellow} textAlign="middle-center" uiTransform={{ height: px(28) }} textWrap="nowrap" />
            </UiEntity>
          )}
        </UiEntity>

        {/* close button */}
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: px(8), right: px(12) }, width: px(36), height: px(36 + 6) }}>
          {pressable(
            {
              id: 'close',
              width: px(36),
              height: px(36),
              color: C.dark,
              radius: px(10),
              borderWidth: 0,
              borderColor: C.dark,
              shadow: px(4),
              onClick: closeOrBack
            },
            <Label value="X" fontSize={fs(20)} color={C.white} textAlign="middle-center" uiTransform={{ width: px(36), height: px(36) }} textWrap="nowrap" />
          )}
        </UiEntity>
      </UiEntity>

      {/* Outside the dialog, as the design asks; it names the real keys, and
          it stays inside the interactable area because HINT_H was reserved. */}
      {mobile ? null : (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: L.left, top: L.top + L.panelH + 6 },
            width: L.panelW,
            height: HINT_H - 6,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Label value="Press E or F to close" fontSize={16} color={C.white} textAlign="middle-center" uiTransform={{ height: HINT_H - 6 }} textWrap="nowrap" />
        </UiEntity>
      )}
    </UiEntity>
  )
}

// Footer material: the game's icon and the amount, no text code.
const material = (px: Px, fs: Px, code: string, value: string) => (
  <UiEntity
    uiTransform={{ height: px(48), flexDirection: 'row', alignItems: 'center', margin: { right: px(8) }, padding: { left: px(6), right: px(14) }, borderRadius: px(14) }}
    uiBackground={{ color: C.dark }}
  >
    {materialIcon(px, code, 34)}
    <Label value={value} fontSize={fs(19)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(48), margin: { left: px(8) } }} textWrap="nowrap" />
  </UiEntity>
)

// Design: main area 516 px tall, three cards with 18 px gaps -> 160 each. The
// 10 px the hard shadow needs is part of each card's slot.
const CARD_H = 150

const card = (
  px: Px,
  fs: Px,
  id: string,
  color: Color4,
  iconColor: Color4,
  title: string,
  subtitle: string,
  extra: ReactEcs.JSX.Element | null,
  onClick: (() => void) | null,
  // Optional picture inside the card's icon box (transparent PNG over the
  // box's own colour), e.g. Dr. Par's portrait on the TUTORIAL card.
  iconSrc?: string
) =>
  pressable(
    {
      id,
      width: '100%',
      height: px(CARD_H),
      color,
      radius: px(24),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.dark,
      shadow: px(8),
      padding: { left: px(22), right: px(22) },
      justifyContent: 'flex-start',
      onClick: onClick || undefined
    },
    <UiEntity
      uiTransform={{ width: px(92), height: px(92), borderRadius: px(22), borderWidth: Math.max(1, px(3)), borderColor: C.dark, padding: px(3) }}
      uiBackground={{ color: iconColor }}
    >
      {iconSrc ? <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: iconSrc }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(20) } }}>
      <Label value={title} fontSize={fs(32)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(36) }} textWrap="nowrap" />
      <Label value={subtitle} fontSize={fs(17)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(24), margin: { top: px(2) } }} textWrap="nowrap" />
      {extra}
    </UiEntity>,
    <Label value=">" fontSize={fs(30)} color={C.white} textAlign="middle-center" uiTransform={{ width: px(24), height: px(40) }} />
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
