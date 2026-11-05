// Must run before colyseus.js is used (matchmaking needs XMLHttpRequest).
import './meta/xhr-polyfill'

import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

import { createNpcTest, hideNpc, CreateNpcOptions } from './components/lobby/npc-storymode/npc-storymode'
import { createBuilding, destroyBuilding } from './components/lobby/building'
import { createLobbyTraining, destroyLobbyTraining, destroyLobbyBoards } from './components/lobby/lobby-training'
import { fadeInOverlay, fadeOutOverlay } from './components/ui/overlay'
import { refreshUserData } from './meta/bootstrap'
import { globalStore } from './services/globalStore/globalStore'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../common/utils'
import { bootstrap } from './meta/bootstrap'
import { setupUI } from './ui'
import { startGameWindow } from './services/game-window'
import { startSceneBounds, keepBounds, releaseBounds } from './components/scene-bounds'
import { teleportVerified } from './services/safe-teleport'
import { lobbyMenuState } from './ui/lobby-menu-state'
import { setSpectatorLobbyHooks, startSpectating } from './components/lobby/spectator-client'
import { GAME_SPAWN } from './components/spawns'

// A breath between the last hole and being put back in the lobby, so the run
// does not end with a jump cut (user, 2026-11-04). It happens behind the fade.
const RUN_END_TELEPORT_DELAY_MS = 1500
import { returnToMenuIfRequested } from './ui/lobby-menu-state'
import { joinGameLobby } from './meta/game-lobby'
import { createStreamScreens } from './components/lobby/stream-screens/stream-screens'
import { unlockAvatar } from '../golfplay/src/components/avatar-lock'

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

  // An invisible wall around the block (and a floor under it) while a hole is
  // on, so nobody can walk or fall out of the scene. Without it, "no teleport
  // at the end of a hole" only holds for the modes that lock the avatar.
  startSceneBounds()

  try {
    const { colyseus, PlayFabId, user, realm } = await bootstrap()
    console.log('[main] bootstrap done')
    // Monthly game window (services/game-window.ts) for this wallet.
    startGameWindow(user.publicKey || user.userId)
    // Watching somebody else's game: the lobby dialog's WATCH view calls this,
    // and only main() holds the colyseus client.
    lobbyMenuState.actions.spectate = (roomId: string, label: string) => {
      void startSpectating(colyseus, roomId, label)
    }
    // SDK6 joined the shared lobby room at login: attached NFT golf clubs,
    // connected days, passive income (meta/game-lobby.ts). Not awaited.
    joinGameLobby({ colyseus, user, PlayFabId, realm }).catch((err) => console.log('[main] game lobby failed', err))

    // The watched course is drawn where the lobby stands, so the building goes
    // while watching, the same way it does while playing. Wired after
    // spawnLobby exists: a closure over a const declared later is a trap the
    // SDK7 sandbox does not forgive (CLAUDE.md section 3, TDZ).
    const wireSpectatorLobby = () =>
      setSpectatorLobbyHooks(
        () => {
          destroyBuilding()
          hideNpc()
        },
        () => spawnLobby()
      )

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
            try {
              // The sequence below clears `playing` and then takes seconds
              // (the lobby, the data refresh, the delay, the teleport) with
              // the player still standing where the course was. The walls and
              // the floor must outlive all of it, not the 5 s grace.
              keepBounds(60000)
              await fadeInOverlay(1)
              // handleLeavePlay also clears `playing` (and courseId). Without it
              // the bottom-right course footer stays up in the lobby, and
              // createNpcTest bails out, so the scientist never comes back. It
              // must happen before spawnLobby, which creates the NPC.
              const gameState = globalStore.game.getState()
              gameState.playing = false
              gameState.courseId = null
              spawnLobby()
              // Bounded: it hits PlayFab, a Polygon RPC and our own API, and
              // it runs with the screen black. Racing it against a sleep keeps
              // the black window to a known length; the refresh carries on and
              // the HUD picks it up whenever it lands.
              await Promise.race([refreshUserData(), sleep(8000)])
              // Back to the lobby when the RUN ends, not when a hole ends
              // (user, 2026-11-04). It is the same teleport that used to
              // strand players, with the two things it was missing: the wall
              // (components/scene-bounds.ts) means the player cannot be
              // outside the scene by now, which is the condition the explorer
              // silently requires, and teleportVerified reads the position
              // back instead of trusting a call that resolves either way.
              await sleep(RUN_END_TELEPORT_DELAY_MS)
              const [spawnPos, spawnCam] = GAME_SPAWN.TRAINING
              const landed = await teleportVerified(
                Vector3.create(spawnPos.x, spawnPos.y, spawnPos.z),
                Vector3.create(spawnCam.x, spawnCam.y, spawnCam.z)
              )
              if (!landed) console.log('[main] the player could not be moved back to the lobby')
              // Back on the lobby's own ground: the walls and the floor under
              // the player can go.
              releaseBounds()
            } finally {
              // The run held the avatar still from its first tee
              // (orbit-camera.ts); only free it once it is back in the lobby,
              // or it could walk out of the scene before the teleport.
              unlockAvatar()
            }
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

    wireSpectatorLobby()
    spawnLobby()
    // SDK6 lobby.ts created them once with the lobby; they hide and show
    // themselves around games, so a respawned lobby doesn't recreate them.
    try {
      createStreamScreens(globalStore.userData.getState().TitleData?.streamURL)
    } catch (err) {
      console.log('[main] stream screens failed:', err)
    }
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
