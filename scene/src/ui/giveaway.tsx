// The giveaway in the lobby HUD (services/giveaway.ts): a small card of the
// poster at the bottom centre of the full-screen grid (clear of the explorer's
// touch controls in the corners, CLAUDE.md §4), and the poster full-screen
// when the card or the wall banner is clicked. E / F or a click close it.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction, PointerEventType, inputSystem } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { globalStore } from '../services/globalStore/globalStore'
import { GIVEAWAY, isGiveawayActive } from '../services/giveaway'
import { giveawayUiState } from './giveaway-state'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState } from './lobby-menu-state'
import { fullLayout, scaler } from './ui-scale'
import { placeAt } from './ui2'
import { isMobile } from '../services/platform'

const CARD = 104
const BORDER = 3

// The card shows in the lobby only: not during a game, under a dialog or
// before the intro is dismissed.
const cardVisible = () => {
  const game = globalStore.game.getState()
  return (
    isGiveawayActive() &&
    lobbyHudState.visible &&
    !lobbyMenuState.visible &&
    !giveawayUiState.open &&
    !game.playing &&
    !game.starting &&
    !game.introScreen &&
    !game.bootError
  )
}

export const GiveawayCard = () => {
  if (!cardVisible()) return null
  const L = fullLayout()
  const { px } = scaler(L.scale)
  return (
    <UiEntity
      uiTransform={{ ...placeAt(L, px, (667 - CARD) / 2, 375 - CARD - 8, CARD, CARD), borderRadius: px(12), padding: px(BORDER) }}
      uiBackground={{ color: Color4.White() }}
      onMouseDown={() => {
        giveawayUiState.open = true
      }}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: px(10) }}
        uiBackground={{ texture: { src: GIVEAWAY.poster }, textureMode: 'stretch' }}
      />
    </UiEntity>
  )
}

export const GiveawayPoster = () => {
  if (!giveawayUiState.open) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const size = Math.min(L.panelH * 0.9, L.panelW * 0.9)
  const close = () => {
    giveawayUiState.open = false
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      onMouseDown={close}
    >
      <UiEntity
        uiTransform={{ width: size, height: size, borderRadius: px(14), padding: px(BORDER) }}
        uiBackground={{ color: Color4.White() }}
        onMouseDown={close}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', borderRadius: px(12) }}
          uiBackground={{ texture: { src: GIVEAWAY.poster }, textureMode: 'stretch' }}
        />
      </UiEntity>
      <Label
        value={isMobile() ? 'Tap to close' : 'Click or press E to close'}
        fontSize={fs(12)}
        color={Color4.create(1, 1, 1, 0.8)}
        textAlign="middle-center"
        uiTransform={{ height: px(18), margin: { top: px(6) } }}
      />
    </UiEntity>
  )
}

export const giveawayInputSystem = () => {
  if (!giveawayUiState.open) return
  if (
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
  ) {
    giveawayUiState.open = false
  }
}
