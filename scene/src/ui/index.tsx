import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { NpcUtilsUi } from 'dcl-npc-toolkit'
import { engine, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from './lobby-hud-state'
import { overlayState } from '../components/ui/overlay'
import { centerPanelState, BANNER_SPRITES, showBanner } from './centerpanel-state'
import { LobbyMenu, lobbyMenuInputSystem } from './lobby-menu'
import { lobbyMenuState, openLobbyMenu } from './lobby-menu-state'
import { MissionTimer, HoleStats, LiveRanking, PowerColumn, ControlsHelp, MapFooter, EndingBanner } from './game-hud'
import { LobbyHud } from './lobby-hud'
import { ATLAS, spriteUvs } from './sprites'
import { JoiningScreen, PartyScreen, HoleResultScreen, RunCompleteScreen } from './season-screens'
import { containLayout, scaler } from './ui-scale'

// SDK6 game.ts called initializeIntroScreen() on startup. It used UICanvas +
// UIImage from the legacy DCL UI; here we port the same flow to ReactEcs.

const ui = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <LobbyHud />
    <MissionTimer />
    <HoleStats />
    <LiveRanking />
    <PowerColumn />
    <ControlsHelp />
    <MapFooter />
    <LobbyMenu />
    <IntroScreen />
    <BootErrorDialog />
    <NpcUtilsUi />
    <Overlay />
    {/* These three sit AFTER <Overlay /> on purpose: later siblings paint on
        top, and all of them are meant to be read WHILE the screen is faded to
        black. season-demo fades in before joining the room and only fades out
        once the course is ready, so a wait screen rendered before the overlay
        is invisible — the player just sees ~10s of black while the server picks
        the 4 courses and queries the ghosts. Same for the between-round
        scoreboard, which is shown before the fade-out. */}
    <JoiningScreen />
    <PartyScreen />
    <HoleResultScreen />
    <RunCompleteScreen />
    <CenterPopup />
    <EndingBanner />
  </UiEntity>
)

// Full-screen black fade overlay for the mission start/end cinematic. Driven by
// overlayState (alpha 0..1) animated in components/ui/overlay.ts. Rendered last
// so it covers the whole UI while fading.
const Overlay = () => {
  if (!overlayState.visible) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
      uiBackground={{ color: Color4.create(0, 0, 0, overlayState.alpha) }}
    />
  )
}

// Center popup banner (READY / GO! / SUCCESS / FAILED / TIMEOUT). SDK6
// centerpanel sprites, shown at 1/2 scale, centered. Rendered on top of the
// overlay so READY shows over the black fade at mission start.
const CenterPopup = () => {
  const banner = centerPanelState.banner
  if (!banner) return null
  const [l, t, w, h] = BANNER_SPRITES[banner]
  // Sized like every other panel: the sprite's half size is its 1280x720 size.
  const { scale } = containLayout()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: (w / 2) * scale, height: (h / 2) * scale, margin: { bottom: 140 * scale } }}
        uiBackground={{
          texture: { src: 'images/ui-spritesheet.png' },
          textureMode: 'stretch',
          uvs: spriteUvs(l, t, w, h, ATLAS)
        }}
      />
    </UiEntity>
  )
}

const IntroScreen = () => {
  if (!globalStore.game.getState().introScreen) return null
  const { scale } = containLayout()

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      onMouseDown={skipIntro}
    >
      <UiEntity
        uiTransform={{
          width: 708 * scale,
          height: 543 * scale
        }}
        uiBackground={{
          texture: { src: 'images/intro-screen.png' },
          textureMode: 'stretch'
        }}
      />
    </UiEntity>
  )
}

// Shown instead of the lobby when bootstrap failed (main() sets bootError):
// same full-screen treatment and the same E / click dismissal as the intro.
const BootErrorDialog = () => {
  const gs = globalStore.game.getState()
  if (!gs.bootError || gs.bootErrorDismissed) return null
  const { px, fs } = scaler(containLayout().scale)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      onMouseDown={dismissBootError}
    >
      {/* Labels get explicit heights: ReactEcs does not grow a Label to fit
          wrapped text, so without them the lines paint over each other. */}
      <UiEntity
        uiTransform={{
          width: px(640),
          height: px(290),
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: px(28), bottom: px(24), left: px(32), right: px(32) }
        }}
        uiBackground={{ color: Color4.create(0.08, 0.05, 0.16, 0.95) }}
      >
        <Label
          value="GolfCraft could not sign you in"
          fontSize={fs(26)}
          color={Color4.White()}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: px(40) }}
        />
        <Label
          value={
            'Your progress and rewards would not be saved,\nso the game has not been loaded.\n' +
            'Please try again, or come back from another realm or explorer.'
          }
          fontSize={fs(16)}
          color={Color4.White()}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: px(72), margin: { top: px(12) } }}
        />
        <Label
          value={gs.bootError}
          fontSize={fs(12)}
          color={Color4.create(0.75, 0.75, 0.8, 1)}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: px(36), margin: { top: px(10) } }}
        />
        <Label
          value="Press E or click to close"
          fontSize={fs(14)}
          color={Color4.create(1, 0.85, 0.3, 1)}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: px(24), margin: { top: px(16) } }}
        />
      </UiEntity>
    </UiEntity>
  )
}

const dismissBootError = () => {
  globalStore.game.setState({ bootErrorDismissed: true })
}

let systemsRegistered = false

const skipIntro = () => {
  console.log('[ui] skip intro')
  globalStore.game.setState({ introScreen: false })
  // The lobby menu takes over from the intro image. Not when bootstrap
  // failed: that screen is the error dialog's.
  if (!globalStore.game.getState().bootError) openLobbyMenu()
}

const introInputSystem = () => {
  const gs = globalStore.game.getState()
  if (!gs.introScreen && !(gs.bootError && !gs.bootErrorDismissed)) return
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    if (gs.introScreen) skipIntro()
    else dismissBootError()
  }
}

// SDK6 lobby-ui-controller: hide HUD while intro screen is showing and while
// the player is in a mission (gameState.playing). Reflect both into the HUD
// state once per frame so the React tree re-renders.
const lobbyHudVisibilitySystem = () => {
  const gs = globalStore.game.getState()
  const visible = !gs.introScreen && !gs.playing && !gs.starting && !gs.bootError && !lobbyMenuState.visible
  if (lobbyHudState.visible !== visible) {
    lobbyHudState.visible = visible
  }
}

// SDK6 centerpanel: READY while gameState.starting is true, GO! (1s) when it
// flips to false (the countdown finished and play begins). Mirror those
// transitions here off the gameState.starting flag.
let prevStarting = false
const centerPanelSystem = () => {
  const starting = !!globalStore.game.getState().starting
  if (starting && !prevStarting) {
    showBanner('ready')
  } else if (!starting && prevStarting) {
    showBanner('go', 1000)
  }
  prevStarting = starting
}

export const setupUI = () => {
  ReactEcsRenderer.setUiRenderer(ui)
  if (!systemsRegistered) {
    engine.addSystem(introInputSystem)
    engine.addSystem(lobbyMenuInputSystem)
    engine.addSystem(lobbyHudVisibilitySystem)
    engine.addSystem(centerPanelSystem)
    systemsRegistered = true
  }
}
