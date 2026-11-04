// "Somebody opened a party" in the lobby HUD (user request, 2026-11-04).
//
// A party only lives for a minute (season-party-lobby auto-cancels or
// auto-starts after 60 s with no change), so whoever is walking around the
// lobby with the dialog closed never learnt about it: the only sign was the
// caption of a button inside the dialog and on the 3D Season board. This puts
// it on the HUD, bottom centre, while a party is open and the player is in the
// lobby. Tapping it opens the lobby dialog, where PLAY WITH FRIENDS does the
// actual joining: a HUD tap must not commit anyone to a run by itself.
//
// It reads the same three accessors the dialog's FRIENDS button reads
// (lobbyMenuState.actions, filled by seasons/season-menu.ts from
// seasons/season-party.ts), so there is no second source of truth. It reads
// them RAW, not through seasonPlayState(), because a player with no energy
// still wants to know a party is waiting.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState, openLobbyMenu } from './lobby-menu-state'
import { giveawayUiState } from './giveaway-state'
import { seasonWaitState } from './season-wait-state'
import { fullLayout, scaler } from './ui-scale'
import { P, rankBadge } from './ui2'
import { isMobile } from '../services/platform'
// @ts-ignore - common/* has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const W = 212
const H = 48
const BORDER = 2

// Same rule as the giveaway card: the lobby only. Not during a game, not
// under a dialog, not before the intro is dismissed.
const inLobby = () => {
  const game = globalStore.game.getState()
  return (
    lobbyHudState.visible &&
    !lobbyMenuState.visible &&
    !giveawayUiState.open &&
    // the waiting screen is already showing the party full screen
    !seasonWaitState.visible &&
    !game.playing &&
    !game.starting &&
    !game.introScreen &&
    !game.bootError
  )
}

export const PartyNotice = () => {
  if (!inLobby()) return null
  const actions = lobbyMenuState.actions
  if (!actions.friendsAction || !actions.friendsLabel) return null
  const action = actions.friendsAction()
  // 'create' means no party is waiting, and 'busy' is the moment one is
  // already starting without me: neither is news.
  if (action !== 'join' && action !== 'leave') return null
  const label = actions.friendsLabel()
  if (!label) return null
  const mine = action === 'leave'
  const tier = actions.friendsRoomTier ? actions.friendsRoomTier() : -1
  const tierName = tier >= 0 ? seasonTierDefinitions[tier]?.name || '' : ''

  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const c = L.canvas
  const margin = px(14)
  // Anchored to the canvas, not to the 667x375 panel, for the same reason the
  // giveaway card is: a portrait phone centres that panel mid-screen. Bottom
  // centre is clear of the explorer's lobby controls, which take the two
  // bottom corners (joystick and emotes left, E / F / + / jump right).
  const bottom = isMobile() ? c.height - margin : c.height - c.area.bottom - margin
  const top = bottom - px(H)
  const left = (c.width - px(W)) / 2

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left, top },
        width: px(W),
        height: px(H),
        borderRadius: px(12),
        padding: px(BORDER),
        flexDirection: 'row',
        alignItems: 'center'
      }}
      uiBackground={{ color: mine ? P.green : P.yellow }}
      onMouseDown={openLobbyMenu}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          borderRadius: px(10),
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: px(8), right: px(8) }
        }}
        uiBackground={{ color: P.navy }}
      >
        {tier >= 0 ? rankBadge(px, tier, 26) : null}
        <UiEntity uiTransform={{ flexGrow: 1, height: '100%', flexDirection: 'column', justifyContent: 'center', margin: { left: px(7) } }}>
          <Label
            value={mine ? 'YOUR PARTY' : 'PARTY OPEN'}
            fontSize={fs(12)}
            color={mine ? P.green : P.yellow}
            textAlign="middle-left"
            textWrap="nowrap"
            uiTransform={{ width: '100%', height: px(15) }}
          />
          <Label
            value={tierName ? `${label} · ${tierName}` : label}
            fontSize={fs(10)}
            color={P.white}
            textAlign="middle-left"
            textWrap="nowrap"
            uiTransform={{ width: '100%', height: px(14) }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
