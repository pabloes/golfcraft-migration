// The giveaway in the lobby HUD (services/giveaway.ts): a small card of the
// poster in the bottom-right corner, left of the HUD's sprite strip (which
// runs down the right edge) and, on a phone, above the explorer's E / F / +
// / jump buttons, which own that corner (CLAUDE.md §4). The card opens the
// lobby dialog; the poster opens full-screen from the dialog's Season card or
// the sign by the Season wall. E / F or a click close it.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction, PointerEventType, inputSystem } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { globalStore } from '../services/globalStore/globalStore'
import { GIVEAWAY, isGiveawayActive } from '../services/giveaway'
import { giveawayUiState } from './giveaway-state'
import { lobbyHudState } from './lobby-hud-state'
import { lobbyMenuState, openLobbyMenu } from './lobby-menu-state'
import { fullLayout, hudScale, scaler } from './ui-scale'
import { HUD_H, STRIP_W } from './lobby-hud-layout'
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
  const mobile = isMobile()
  // The strip's width and right margin in canvas px, as lobby-hud.tsx draws it
  // (full height flush right at 8 px on phones, the HUD scale at the
  // interactable area's edge on desktop).
  const stripCanvas = mobile
    ? STRIP_W * Math.min(1, (L.canvas.height - 16) / HUD_H) + 8
    : hudScale().s.px(STRIP_W) + L.canvas.area.right
  const left = L.canvas.width - stripCanvas - px(8) - px(CARD)
  // phones: the explorer's buttons take the corner below y = 232
  const top = L.top + px(mobile ? 232 - CARD - 6 : 375 - CARD - 8)
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left, top }, width: px(CARD), height: px(CARD), borderRadius: px(12), padding: px(BORDER) }}
      uiBackground={{ color: Color4.White() }}
      // the HUD card opens the lobby dialog (user, 2026-11-02); its Season
      // card shows the poster and opens it big
      onMouseDown={openLobbyMenu}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: px(10) }}
        uiBackground={{ texture: { src: GIVEAWAY.poster }, textureMode: 'stretch' }}
      />
    </UiEntity>
  )
}

// The poster as a box of the lobby dialog (design px), opening it full-screen.
export const giveawayPosterBox = (px: (n: number) => number, x: number, y: number, size: number) => (
  <UiEntity
    key="giveaway-poster-box"
    uiTransform={{ positionType: 'absolute', position: { left: px(x), top: px(y) }, width: px(size), height: px(size), borderRadius: px(12), padding: px(BORDER) }}
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
