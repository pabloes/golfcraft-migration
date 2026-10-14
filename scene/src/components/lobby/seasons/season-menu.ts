// SDK7 port of SDK6 scene/src/components/lobby/seasons/season-menu.ts
//
// The Season board on the north wall: your rank emblem cropped out of the
// season-badges atlas, the rank/points/energy readout, a Play button that
// launches a 4-round run, and a Teleport button to the tournaments area.
//
// Gating is SDK6's: below storymode mission 6 the board explains you must finish
// Dr. Par's missions first and hides both buttons.
import { Entity, GltfContainer, TextAlignMode, TextShape, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { createImageButton } from '../../imageButton'
import { globalStore } from '../../../services/globalStore/globalStore'
// @ts-ignore - common/utils has @ts-nocheck
import {
  getCatFromTier,
  getPointsOnCurrentTier,
  getTierFromSub,
  seasonPointsPerCategory
} from '../../../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../../../common/season-tier-definitions'
import { createSeasonDemo } from '../../../../golfplay/src/season-demo'
import { createSeasonParty } from './season-party'
import { getGLTFShape } from '../../../../golfplay/services/resource-repo'
import { seasonCatalog } from './season-catalog'
import { claimSeasonReward, getSeasonActionStatus } from './season-rewards-bridge'
import { lobbyHudState } from '../../../ui/lobby-hud-state'
import { lobbyMenuState } from '../../../ui/lobby-menu-state'
import { showMessage } from '../server-notification'
import { canStartGame, formatUtc, gameWindowState, guardGameStart, onGameWindowChange } from '../../../services/game-window'

const SEASON_CATALOG: Record<string, { name: string }> = seasonCatalog as any

// Set once a reward claim is queued, then polled until the bridge resolves it.
// Stays null in local dev: the bridge is disabled there so nothing can be minted.
let actionId: string | null = null
let itemData: any = null

export const createSeasonMenu = async (
  parent: Entity,
  { root, position, rotation, colyseus, wip, onStarting, onFinish }: any
) => {
  const gameState = globalStore.game.getState()
  // Declared up here on purpose: transactionStatusSystem is a hoisted function
  // but this `let` is not, and engine.addSystem() below starts calling it on the
  // very next frame. Declaring it further down threw "Cannot access
  // 'statusPollElapsed' before initialization" every frame until the sandbox
  // killed the whole scene (CLAUDE.md §6 #7).
  let statusPollElapsed = 0

  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, rotation })

  const board = engine.addEntity()
  Transform.create(board, { parent: entity })
  GltfContainer.create(board, { src: getGLTFShape('models/board.glb').src })

  // Rank emblem. SDK6 cropped it live out of the 1536x1024 season-badges atlas
  // with getUvsFromSprite + PlaneShape.uvs. That UV array does NOT survive the
  // move to SDK7's MeshRenderer.setPlane: the crop never applied, the plane
  // showed the WHOLE atlas (a grid of tiny badges) and the throw aborted the
  // rest of refresh() — which is why the text was missing and both buttons
  // showed at once. The 50 badges are now pre-cut into images/season-badges/N.png
  // (same coordinates, computed by the identical procedural formula), so the
  // emblem is just a plain textured plane and there is no UV convention to get
  // wrong.
  const emblem = createImageButton(entity, {
    position: Vector3.create(0, 2.2, -0.05),
    scale: Vector3.create(0.7, 0.7, 0.7),
    rotation: Quaternion.Identity(),
    imageSrc: 'images/season-badges/0.png',
    hoverText: 'This is your current rank'
  })

  const textWrapper = engine.addEntity()
  // SDK6 had this at y 3.6; nudged up so the last line ("Energy: ...") clears
  // the buttons.
  Transform.create(textWrapper, { parent: entity, position: Vector3.create(0, 3.69, -0.05) })
  TextShape.create(textWrapper, { text: '', fontSize: 2, textAlign: TextAlignMode.TAM_TOP_CENTER })

  const playButton = createImageButton(entity, {
    position: Vector3.create(0.8, 1.3, -0.1),
    scale: Vector3.create(1, 0.4, 1),
    rotation: Quaternion.Identity(),
    imageSrc: 'images/button-play.png',
    hoverText: 'Play season'
  })
  // SDK6 also built a "Teleport to tournaments" button here, shown instead of
  // Play when the player runs out of energy. Community Tournaments are not
  // migrated, so it would drop the player into an area that doesn't exist —
  // left out on purpose. Restore it together with the tournament lobby.

  // NOT in SDK6: "play ranked with friends" (CLAUDE.md §12). Its face says
  // what it does right now, CREATE / JOIN / LEAVE (images/button-*.png, drawn
  // in the PLAY sprite's style), with a caption underneath for the party
  // status ("JOIN PARTY (2/4) 41s", "WAITING FRIENDS..."...).
  const friendsButton = createImageButton(entity, {
    position: Vector3.create(-0.8, 1.3, -0.1),
    scale: Vector3.create(1, 0.4, 1),
    rotation: Quaternion.Identity(),
    imageSrc: 'images/button-create.png',
    hoverText: 'Play ranked with friends'
  })
  let friendsImage = 'create'
  const friendsLabel = engine.addEntity()
  Transform.create(friendsLabel, { parent: entity, position: Vector3.create(-0.8, 1.04, -0.11) })
  TextShape.create(friendsLabel, {
    text: 'PLAY WITH FRIENDS',
    fontSize: 0.7,
    textAlign: TextAlignMode.TAM_TOP_CENTER
  })

  // While the player waits for friends, Play has nothing to do, so its slot
  // becomes the way out of the party (cancel it if you are the host, leave it
  // otherwise) without having to reach for the waiting screen. The artwork is
  // SDK6's images/cancel.png, which was an opaque black-on-white 2D UI image:
  // its luminance is baked into an alpha channel so it reads as white glyphs on
  // the board, like button-play.png (CLAUDE.md §11 #2).
  const cancelButton = createImageButton(entity, {
    position: Vector3.create(0.8, 1.3, -0.1),
    scale: Vector3.create(1, 0.4, 1),
    rotation: Quaternion.Identity(),
    imageSrc: 'images/button-cancel.png',
    hoverText: 'Leave the party'
  })
  cancelButton.hide()
  const cancelLabel = engine.addEntity()
  Transform.create(cancelLabel, { parent: entity, position: Vector3.create(0.8, 1.04, -0.11) })
  TextShape.create(cancelLabel, { text: '', fontSize: 0.7, textAlign: TextAlignMode.TAM_TOP_CENTER })

  const seasonGame = await createSeasonDemo(root, {
    colyseus,
    wip,
    onFinish: async () => {
      show()
      // Awaited: the lobby's onFinish fades, respawns, refreshes user data and
      // teleports. refresh() below must run AFTER that or it repaints the panel
      // with the pre-run tier and stale energy.
      if (onFinish) await onFinish()
      claimRewards()
      refresh()
    },
    userDataState: globalStore.userData.getState(),
    onStarting: () => {
      gameState.playing = true
      onStarting && onStarting()
      hide()
    },
    onStarted: () => {}
  })

  // Both entry points check the monthly game window first.
  const playSeason = () => {
    if (!guardGameStart()) return
    seasonGame.startGame()
  }
  playButton.onClick(playSeason)
  // The lobby menu dialog (ui/lobby-menu.tsx) drives the same run.
  lobbyMenuState.actions.playSeason = playSeason
  const stopWindowListener = onGameWindowChange(() => refresh())

  // The party lobby is a shared room on the server; if it can't be reached the
  // panel must still work for solo play, so the button simply stays hidden.
  let seasonParty: any = null
  try {
    seasonParty = await createSeasonParty(root, {
      colyseus,
      wip,
      userDataState: globalStore.userData.getState(),
      onStarting: () => {
        gameState.playing = true
        onStarting && onStarting()
        hide()
      },
      onFinish: async () => {
        show()
        if (onFinish) await onFinish()
        claimRewards()
        refresh()
      },
      onStarted: () => {},
      // Fires on every party state patch (once a second while a party waits),
      // so it only repaints the button, not the whole panel.
      onChange: () => refreshFriendsButton()
    })
    friendsButton.onClick(() => seasonParty.click())
    cancelButton.onClick(() => seasonParty.cancel())
    lobbyMenuState.actions.playWithFriends = () => seasonParty.click()
    lobbyMenuState.actions.friendsLabel = () => seasonParty.getLabel()
    lobbyMenuState.actions.friendsAction = () => seasonParty.getAction()
  } catch (err) {
    console.log('[season] party lobby unavailable', err)
  }

  refresh()
  engine.addSystem(transactionStatusSystem)

  return { show, hide, refresh, dispose }

  // SDK6 fired this blindly after every run against the hardcoded production
  // bridge. It now goes through season-rewards-bridge, which is a no-op in local
  // dev so testing can never mint a real wearable.
  async function claimRewards() {
    const userData = globalStore.userData.getState()
    const result = await claimSeasonReward({
      PlayFabId: userData.PlayFabId,
      displayName: userData.displayName
    })
    if (result?.ok) {
      actionId = result.actionID || null
      itemData = result
    }
  }

  // SDK6 TransactionStatusSystem: poll the queued mint every 15s.
  function transactionStatusSystem(dt: number) {
    statusPollElapsed += dt
    if (statusPollElapsed < 15) return
    statusPollElapsed = 0
    if (!actionId) return
    const pending = actionId
    getSeasonActionStatus(pending).then((response: any) => {
      const result = response?.result
      if (!result || result.state === 1) return
      actionId = null
      if (result.state === 2) {
        const message = itemData?.sends_wearable
          ? `Reward sent successfully!\n${itemData.wearable?.name}`
          : `Reward sent successfully!\nFT ${(itemData?.wearable?.tierReward || 0) * 10}`
        showMessage({ timeout: 5000, message })
      } else if (result.state === 0) {
        showMessage({ timeout: 5000, message: 'Error sending reward. Play again to retry.' })
      }
    })
  }

  function show() {
    const t = Transform.getMutableOrNull(entity)
    if (t) t.parent = parent
  }

  function hide() {
    const t = Transform.getMutableOrNull(entity)
    if (t) t.parent = engine.RootEntity
    emblem.hide()
    playButton.hide()
    friendsButton.hide()
    cancelButton.hide()
  }

  // Never let a failure here leave the panel half-built (no text, both buttons
  // showing) — that's exactly what the emblem UV throw did.
  function refresh() {
    try {
      refreshInner()
    } catch (err) {
      console.log(
        '[season] refresh FAILED', err,
        '| getTierFromSub=', typeof getTierFromSub,
        '| seasonTierDefinitions=', typeof seasonTierDefinitions,
        '| getPointsOnCurrentTier=', typeof getPointsOnCurrentTier,
        '| getCatFromTier=', typeof getCatFromTier,
        '| seasonPointsPerCategory=', typeof seasonPointsPerCategory
      )
    }
  }

  // Deviation from SDK6 (user request, 2026-10-12): the Season no longer waits
  // for Dr. Par's missions (SDK6 hid the panel until current_mission >= 6).
  function refreshInner() {
    const userData = globalStore.userData.getState()
    const userTierSub = userData['statistic_tier-sub'] || 0
    const tier = getTierFromSub(userTierSub)
    const tierDefinition = seasonTierDefinitions[tier || 0]
    const text = TextShape.getMutableOrNull(textWrapper)

    emblem.show()
    emblem.setImage(`images/season-badges/${tier || 0}.png`)

    // Outside the monthly window the board only says when it opens.
    if (!canStartGame()) {
      playButton.hide()
      friendsButton.hide()
      setFriendsLabel('')
      hideCancelButton()
      if (text) {
        text.text =
          'GOLFCRAFT IS CLOSED\n\nIt opens the first week\nof every month\n\n' +
          (gameWindowState.opensAt ? `Next opening:\n${formatUtc(gameWindowState.opensAt)}` : 'Next opening: soon')
      }
      return
    }

    // SDK6 read the energy from its own userData store; ours lands in the lobby
    // HUD state (bootstrap:applyCombinedInfoToHud), same as the golfclub board.
    const energy = lobbyHudState.resources.EN || 0
    const seasonName = SEASON_CATALOG[String(userData?.config?.currentSeasonCollectionId ?? 4)]?.name || 'UNKNOWN'

    if (text) {
      let value = `${seasonName} SEASON\n\n`
      value += `You are rank ${tierDefinition?.name} ${getPointsOnCurrentTier(userTierSub)}/${
        seasonPointsPerCategory[getCatFromTier(tier)]
      }\n(${userTierSub} Season points) `
      value += `\n\n\n\n\nEnergy: ${energy} ( Recharges 1 every 2.4 hours )`
      if (!energy) value += `\nMeanwhile, You can play Community Tournaments`
      text.text = value
    }

    refreshFriendsButton()
  }

  // SDK6 swapped Play for the teleport button at zero energy; with no
  // tournaments to send the player to, we just hide Play. The party button
  // follows the same energy rule (a run costs 1 EN per player) and takes Play's
  // place while the player is committed to a party.
  function refreshFriendsButton() {
    const energy = lobbyHudState.resources.EN || 0

    if (!energy || !seasonParty) {
      friendsButton.hide()
      setFriendsLabel('')
      hideCancelButton()
      if (!energy) playButton.hide()
      return
    }

    const action = seasonParty.getAction()
    if (action === 'busy') {
      friendsButton.hide()
    } else {
      if (action !== friendsImage) {
        friendsImage = action
        friendsButton.setImage(`images/button-${action}.png`)
      }
      friendsButton.show()
    }
    setFriendsLabel(seasonParty.getLabel())

    if (seasonParty.isBusy()) {
      playButton.hide()
      // The host's way to drop the whole party; everyone else just LEAVEs
      // with the party button.
      if (seasonParty.isHost()) {
        cancelButton.show()
        setCancelLabel(seasonParty.getCancelLabel())
      } else {
        hideCancelButton()
      }
    } else {
      playButton.show()
      hideCancelButton()
    }
  }

  function hideCancelButton() {
    cancelButton.hide()
    setCancelLabel('')
  }

  function setFriendsLabel(value: string) {
    const label = TextShape.getMutableOrNull(friendsLabel)
    if (label) label.text = value
  }

  function setCancelLabel(value: string) {
    const label = TextShape.getMutableOrNull(cancelLabel)
    if (label) label.text = value
  }

  function dispose() {
    engine.removeSystem(transactionStatusSystem)
    lobbyMenuState.actions.playSeason = null
    stopWindowListener()
    lobbyMenuState.actions.playWithFriends = null
    lobbyMenuState.actions.friendsLabel = null
    lobbyMenuState.actions.friendsAction = null
    seasonParty?.dispose()
    emblem.dispose()
    playButton.dispose()
    friendsButton.dispose()
    cancelButton.dispose()
    engine.removeEntity(friendsLabel)
    engine.removeEntity(cancelLabel)
    engine.removeEntity(textWrapper)
    engine.removeEntity(board)
    engine.removeEntity(entity)
  }
}
