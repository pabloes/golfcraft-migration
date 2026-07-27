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
import { getGLTFShape } from '../../../../golfplay/services/resource-repo'
import { seasonCatalog } from './season-catalog'
import { claimSeasonReward, getSeasonActionStatus } from './season-rewards-bridge'
import { lobbyHudState } from '../../../ui/lobby-hud-state'
import { showMessage } from '../server-notification'

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
  Transform.create(textWrapper, { parent: entity, position: Vector3.create(0, 3.6, -0.05) })
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

  const seasonGame = await createSeasonDemo(root, {
    colyseus,
    wip,
    onFinish: () => {
      onFinish && onFinish()
      show()
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

  playButton.onClick(() => {
    seasonGame.startGame()
  })

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
  let statusPollElapsed = 0
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

  function refreshInner() {
    const userData = globalStore.userData.getState()
    console.log(
      '[season] refresh: current_mission=', userData['statistic_current_mission'],
      'tier-sub=', userData['statistic_tier-sub'],
      'hasTextShape=', !!TextShape.getMutableOrNull(textWrapper)
    )
    const currentMission = userData['statistic_current_mission'] || 0
    const userTierSub = userData['statistic_tier-sub'] || 0
    const tier = getTierFromSub(userTierSub)
    const tierDefinition = seasonTierDefinitions[tier || 0]
    const text = TextShape.getMutableOrNull(textWrapper)

    if (!currentMission || currentMission < 6) {
      emblem.hide()
      playButton.hide()
      if (text) {
        text.text =
          'MOUNTAIN SEASON\n\n\n\nYou need to complete\nDr. Par initial missions\nbefore participating on\nSeason competition'
      }
      return
    }

    emblem.show()
    emblem.setImage(`images/season-badges/${tier || 0}.png`)

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

    // SDK6 swapped Play for the teleport button at zero energy; with no
    // tournaments to send the player to, we just hide Play.
    if (!energy) playButton.hide()
    else playButton.show()
  }

  function dispose() {
    engine.removeSystem(transactionStatusSystem)
    emblem.dispose()
    playButton.dispose()
    engine.removeEntity(textWrapper)
    engine.removeEntity(board)
    engine.removeEntity(entity)
  }
}
