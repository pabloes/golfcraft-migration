import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { NpcUtilsUi } from 'dcl-npc-toolkit'
import { engine, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { SCENE_VERSION } from '../version'
import { lobbyHudState } from './lobby-hud-state'
import { overlayState } from '../components/ui/overlay'
import { centerPanelState, BANNER_SPRITES, showBanner } from './centerpanel-state'
import { LobbyMenu, lobbyMenuInputSystem } from './lobby-menu'
import { lobbyMenuState, openLobbyMenu, returnToMenuIfRequested } from './lobby-menu-state'
import * as phoneHud from './game-hud'
import * as desktopHud from './game-hud-desktop'
import { LobbyHud } from './lobby-hud'
import { ATLAS, spriteUvs } from './sprites'
import { JoiningScreen, PartyScreen, HoleResultScreen, RunCompleteScreen } from './season-screens'
import { containLayout, fullLayout, scaler, isSmallCanvas } from './ui-scale'
import { serverNotificationState } from '../components/lobby/server-notification'
import { GiveawayCard, GiveawayPoster, giveawayInputSystem } from './giveaway'
import { PartyNotice } from './party-notice'
import { SpectateHud } from './spectate-hud'
import { MobileShootControls } from './mobile-shoot-controls'
import { isMobile } from '../services/platform'
import { dismissGameClosedNotice, formatOpeningDay, gameWindowState, showClosedNoticeOnce } from '../services/game-window'
import { C, pressable } from './ui-theme'
import { P, img, border, placeAt } from './ui2'

// SDK6 game.ts called initializeIntroScreen() on startup. It used UICanvas +
// UIImage from the legacy DCL UI; here we port the same flow to ReactEcs.

// The menus share one layout on phones and desktop; the in-hole HUD does not:
// phones get the full-screen grid, desktop a HUD anchored to the window edges.
const ui = () => {
  const mobile = isMobile()
  const hud = mobile ? phoneHud : desktopHud
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <LobbyHud />
      <GiveawayCard />
      <PartyNotice />
      <hud.MissionTimer />
      <hud.HoleStats />
      <hud.LiveRanking />
      <hud.PowerColumn />
      {mobile ? null : <desktopHud.ControlsHelp />}
      {mobile ? null : <desktopHud.RankPill />}
      {mobile ? null : <desktopHud.LeaveButton />}
      <MobileShootControls />
      <hud.MapFooter />
      {mobile ? null : <desktopHud.LeaveConfirm />}
      <LobbyMenu />
      <IntroScreen />
      <BootErrorDialog />
      <GameClosedNotice />
      <NpcUtilsUi />
      <GiveawayPoster />
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
      <hud.EndingBanner />
      <SpectateHud />
      <ServerNotification />
      <VersionTag />
    </UiEntity>
  )
}

// Which build is live, in small print along the bottom edge (user, 2026-11-05).
// Last of all, so it is readable over the menus and over the black fade: the
// point of it is to tell at a glance whether what is running is what was just
// deployed. scripts/build-scene-prod.sh stamps the commit into version.ts.
const VersionTag = () => (
  <Label
    // With no height of its own and bottom 0 the text sat half outside the
    // window: a Label is laid out by its box, so it needs one.
    uiTransform={{ positionType: 'absolute', position: { bottom: 8, left: 0 }, width: '100%', height: 16 }}
    value={SCENE_VERSION}
    fontSize={12}
    color={Color4.create(1, 1, 1, 0.55)}
    textAlign="middle-center"
  />
)

// showMessage() (components/lobby/server-notification.ts): top centre of the
// full-screen grid, clear of the explorer's avatar and chat (top-left), and
// last so it reads over the menus and the black fade alike.
const ServerNotification = () => {
  const { message, until } = serverNotificationState
  if (!message || Date.now() > until) return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  return (
    <UiEntity
      uiTransform={{ ...placeAt(L, px, 153, 58, 361, 50), borderRadius: px(12), justifyContent: 'center', alignItems: 'center', padding: { left: px(12), right: px(12) } }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.78) }}
    >
      <Label value={message} fontSize={fs(13)} color={Color4.White()} textAlign="middle-center" textWrap="wrap" uiTransform={{ width: '100%', height: '100%' }} />
    </UiEntity>
  )
}

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
  // Contained like the lobby dialog on desktop. On phones and tablets the
  // card is text to read once and dismiss with a tap, so it takes 90 % of the
  // screen height (it may run under the corners of the touch controls, which
  // are drawn on top anyway). A very small desktop window gets 62 %, top.
  const L = containLayout()
  const c = L.canvas
  const mobile = isMobile()
  const small = !mobile && isSmallCanvas(L.scale)
  const scale = mobile
    ? Math.min((c.height * 0.9) / 543, (c.width * 0.96) / 708)
    : small
      ? Math.max(L.scale, Math.min(((c.width - 24) / 708) * 0.95, (c.height / 543) * 0.62))
      : L.scale
  const cardW = 708 * scale
  const cardH = 543 * scale
  const left = mobile ? (c.width - cardW) / 2 : c.area.left + (c.availW - cardW) / 2
  const top = mobile ? (c.height - cardH) / 2 : small ? c.area.top + 12 : c.area.top + (c.availH - cardH) / 2

  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      onMouseDown={skipIntro}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left, top },
          width: cardW,
          height: cardH
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

// Shown when the player tries to start something outside the monthly game
// window (services/game-window.ts). Same look and dismissal as the boot error.
const GameClosedNotice = () => {
  if (!gameWindowState.noticeVisible) return null
  const { px, fs } = scaler(containLayout().scale)
  const opensAt = gameWindowState.opensAt
  const mobile = isMobile()
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      // Swallows clicks on the backdrop so they don't reach the world behind;
      // only E or the GOT IT button close the dialog.
      onMouseDown={() => {}}
    >
      <UiEntity
        uiTransform={{
          width: px(720),
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: px(26), bottom: px(28), left: px(36), right: px(36) },
          borderRadius: px(22),
          borderWidth: border(px, 4),
          borderColor: P.white
        }}
        uiBackground={{ color: P.navy }}
      >
        {img(px, 'rb_closed')}
        <Label
          value={
            gameWindowState.message
              ? gameWindowState.message
              : opensAt
                ? `GolfCraft opens ${formatOpeningDay(opensAt)}`
                : 'GolfCraft opens soon'
          }
          fontSize={fs(28)}
          color={C.white}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(80), margin: { top: px(14) } }}
        />
        <UiEntity uiTransform={{ height: px(22) }} />
        {pressable(
          {
            id: 'closed-ok',
            width: px(220),
            height: px(56),
            color: P.yellow,
            radius: px(16),
            borderWidth: 0,
            borderColor: P.yellow,
            shadow: px(6),
            onClick: closeGameClosedNotice
          },
          img(px, 'bt_got_it')
        )}
        {mobile ? null : (
          <Label value="Press E or GOT IT to close" fontSize={fs(14)} color={C.lilac} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22), margin: { top: px(10) } }} />
        )}
      </UiEntity>
    </UiEntity>
  )
}

// A start blocked by the closed window: back to the lobby dialog if that is
// where the player came from.
const closeGameClosedNotice = () => {
  dismissGameClosedNotice()
  returnToMenuIfRequested()
}

const dismissBootError = () => {
  globalStore.game.setState({ bootErrorDismissed: true })
}

let systemsRegistered = false

const skipIntro = () => {
  console.log('[ui] skip intro')
  globalStore.game.setState({ introScreen: false })
  // The lobby menu takes over from the intro image. Not when bootstrap
  // failed: that screen is the error dialog's. Outside the monthly window
  // the "closed" dialog comes first, so nobody misses it.
  if (globalStore.game.getState().bootError) return
  if (!showClosedNoticeOnce()) openLobbyMenu()
}

const introInputSystem = () => {
  const gs = globalStore.game.getState()
  if (gameWindowState.noticeVisible) {
    if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) closeGameClosedNotice()
    return
  }
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
    engine.addSystem(giveawayInputSystem)
    engine.addSystem(lobbyHudVisibilitySystem)
    engine.addSystem(centerPanelSystem)
    systemsRegistered = true
  }
}
