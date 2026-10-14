// Must run before colyseus.js is used (matchmaking needs XMLHttpRequest).
import './meta/xhr-polyfill'

import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

import { createNpcTest, hideNpc, CreateNpcOptions } from './components/lobby/npc-storymode/npc-storymode'
import { createBuilding, destroyBuilding } from './components/lobby/building'
import { createLobbyTraining, destroyLobbyTraining, destroyLobbyBoards } from './components/lobby/lobby-training'
import { fadeInOverlay, fadeOutOverlay } from './components/ui/overlay'
import { refreshUserData } from './meta/bootstrap'
import { movePlayerTo } from '~system/RestrictedActions'
import { GAME_SPAWN } from './components/spawns'
import { globalStore } from './services/globalStore/globalStore'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../common/utils'
import { bootstrap } from './meta/bootstrap'
import { setupUI } from './ui'
import { startGameWindow } from './services/game-window'
import { returnToMenuIfRequested } from './ui/lobby-menu-state'

// Mission-1 production flow:
//   1. bootstrap() -> PlayFab LoginWithCustomID, get user, realm, Colyseus client
//   2. spawnLobby() -> building + NPC scientist (re-called on mission end)
//   3. Player clicks NPC -> dialog "Welcome new intern" -> requestStartMission
//   4. onStart -> destroyLobby() (building + NPC + containers)
//   5. colyseus.joinOrCreate('mission-room', { PlayFabId, gameDefinition: { courseId: 'mission-1' } })
//   6. Server fetches mission-1 from web API (localhost:2569) backed by MySQL
//   7. clientGolfPlay renders course + ball + control. Player plays.
//   8. onFinish -> spawnLobby() restores building+NPC

console.log('[main] golfcraft-sdk7 scene module loaded')

export async function main() {
  console.log('[main] main() entered')
  setupUI()

  const sceneRoot: Entity = engine.addEntity()
  Transform.create(sceneRoot, { position: Vector3.create(24, 0, 24) })

  try {
    const { colyseus, PlayFabId, user, realm } = await bootstrap()
    console.log('[main] bootstrap done')
    // Monthly game window (services/game-window.ts) for this wallet.
    startGameWindow(user.publicKey || user.userId)

    const spawnLobby = () => {
      console.log('[main] spawnLobby (building + golfclub board + NPC)')
      createBuilding(sceneRoot)
      // SDK6 createLobby() also called createLobbyTraining(), which builds the
      // golfclub board the mission-7 dialog points the player at. Guarded: the
      // NPC is created after it, and an exception here would abort spawnLobby
      // and leave the player with no NPC to talk to at all.
      try {
        createLobbyTraining(sceneRoot, {
          root: sceneRoot,
          colyseus,
          // SDK6 lobby.hide()/show() around a season run: the lobby disappears
          // while playing and comes back when the run ends.
          onStarting: () => {
            destroyBuilding()
            destroyLobbyBoards()
            hideNpc()
          },
          // SDK6 lobby.ts:289 ends a season run with
          // `handleLeavePlay(leaveCode, GAME_SPAWN.TRAINING)`: fade to black,
          // restore the lobby, refresh user data, teleport, fade back in.
          // Without the teleport the player is left standing on the course
          // where the last hole finished, with the lobby rebuilt far away.
          // Note it is GAME_SPAWN.TRAINING (the season/training wall), not
          // MISSION — that one is the storymode NPC's spot.
          onFinish: async () => {
            await fadeInOverlay(1)
            // handleLeavePlay also clears `playing` (and courseId). Without it
            // the bottom-right course footer stays up in the lobby, and
            // createNpcTest bails out, so the scientist never comes back. It
            // must happen before spawnLobby, which creates the NPC.
            const gameState = globalStore.game.getState()
            gameState.playing = false
            gameState.courseId = null
            spawnLobby()
            await refreshUserData()
            await sleep(500)
            const [spawnPos, spawnCam] = GAME_SPAWN.TRAINING
            await movePlayerTo({
              newRelativePosition: Vector3.create(spawnPos.x, spawnPos.y, spawnPos.z),
              cameraTarget: Vector3.create(spawnCam.x, spawnCam.y, spawnCam.z)
            })
            await fadeOutOverlay(1)
            // Started from the lobby dialog: show it again.
            returnToMenuIfRequested()
          }
        })
      } catch (err) {
        console.log('[main] golfclub board failed to spawn:', err)
      }
      const npcOpts: CreateNpcOptions = {
        // SDK6 npc-storymode hardcoded NPC at (2, 1.1, 8) parented to root
        // (24, 0, 24) -> world (26, 1.1, 32), next to container1 at (24.5, 1.1, 32).
        position: Vector3.create(2, 1.1, 8),
        parent: sceneRoot,
        root: sceneRoot,
        colyseus,
        PlayFabId,
        user,
        realm,
        clientInfo: { sessionTicket: '' },
        // SDK6 lobby.hide(): destroyBuilding() + npc.hide(). Mirror that here so
        // the lobby disappears when the player accepts the mission and the
        // course renders cleanly.
        onStart: () => {
          console.log('[main] onStart -> destroy lobby')
          destroyBuilding()
          destroyLobbyTraining()
          hideNpc()
        },
        onFinish: async (leaveCode) => {
          console.log('[main] mission finished, leaveCode:', leaveCode, '- restoring lobby')
          // SDK6 lobby.show(): re-attach lobby entity + scenario.show() + npc.show().
          // We can't re-attach (entity was destroyed) so we re-spawn the whole
          // lobby. Module-level state in npc-storymode (first_time,
          // completed_mission) persists, so the next dialog reflects progress.
          spawnLobby()
        }
      }
      createNpcTest(sceneRoot, npcOpts)
    }

    spawnLobby()
    console.log('[main] lobby spawned, ready')
  } catch (err: any) {
    console.log('[main] bootstrap failed:', err)
    // No game at all rather than a wrong account or a dead backend behind a
    // normal-looking lobby: the building stays as scenery, and the UI shows a
    // dialog (dismissed with E or a click, like the intro) in place of the HUD.
    globalStore.game.setState({ introScreen: false, bootError: String(err?.message || err) })
    createBuilding(sceneRoot)
  }
}
