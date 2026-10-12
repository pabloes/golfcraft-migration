import { engine, Entity, Transform, GltfContainer, AudioSource, Animator, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import * as npc from 'dcl-npc-toolkit'
import { Dialog, NPCType } from 'dcl-npc-toolkit'

import { globalStore } from '../../../services/globalStore/globalStore'
import { GolfplayClientFactory } from '../golfplay-client'
import { fadeInOverlay, fadeOutOverlay } from '../../ui/overlay'
import { getMusicForCollection, reproduceMapMusic, stopMapMusic } from '../../../services/map-music'
import { refreshUserData } from '../../../meta/bootstrap'
import { movePlayerTo } from '~system/RestrictedActions'
import { signedFetch } from '~system/SignedFetch'
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../../../common/constants'
import { GAME_SPAWN } from '../../spawns'
import { showBanner } from '../../../ui/centerpanel-state'
import { hideTopBar } from '../../../ui/topbar-state'
import MESSAGE from '../../../../../server/rooms/mesages'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep, waitFor } from '../../../../../common/utils'

const portraits = {
  smiling: { path: 'images/NPC/expresion1.png' },
  concerned: { path: 'images/NPC/expresion2.png' },
  happy: { path: 'images/NPC/expresion3.png' },
  disappointed: { path: 'images/NPC/expresion4.png' },
  shame: { path: 'images/NPC/expresion5.png' }
}

const animations = {
  talking: '0_Hablando_Normal',
  upset: '1_Angustiado',
  wins: '2_Jugador_Gana_Partida',
  fails: '3_Jugador_Pierde_Partida',
  container1: '4_Mirando_Contenedor_01',
  container2: '5_Mirando_Contenedor_02',
  danger: '6_Escapan_Esferas'
}

function getSound(): string {
  const id = Math.floor(Math.random() * 3) + 1
  return `sounds/NPC/npc_${id}.mp3`
}

function waitForInitialisedState(room: any): Promise<void> {
  return new Promise(async (resolve) => {
    while (!room) {
      await sleep(100)
    }
    room.onStateChange.once(() => resolve())
  })
}

// A hung request would otherwise block the dialog forever (the NPC awaits it
// while holding its `loading` flag). The sandbox has no AbortController, so bound
// it with a race instead.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms))
  ])
}

export type CreateNpcOptions = {
  position: Vector3.MutableVector3
  parent?: Entity
  root: Entity
  colyseus: any
  clientInfo?: any
  PlayFabId: string
  user: any
  realm: any
  onStart: () => void
  onFinish: (leaveCode?: number) => Promise<void> | void
}

// current_mission once the mission-9 farewell has been shown: the storymode is
// over and neither the scientist nor the sphere containers are spawned again.
const STORYMODE_DONE = 10

let NPC_scientist: Entity | null = null
// The current NPC's onActivate, so the lobby dialog's TUTORIAL view can start
// the same conversation (missions, requestStartMission...) without copying it.
let activateNpcDialog: (() => Promise<void>) | null = null
export const talkToNpc = async () => {
  if (activateNpcDialog) await activateNpcDialog()
}
let container1: Entity | null = null
let container2: Entity | null = null
let container_sound: Entity | null = null
let first_time = true
let completed_mission = false

export const createNpcTest = (parent: Entity, opts: CreateNpcOptions): Entity | undefined => {
  const baseUrl = (engine as any)['__COURSE_MODELS_BASE__'] || ''
  const { createClientGolfPlay } = GolfplayClientFactory({ golfplayBaseUrl: baseUrl })
  const gameState = globalStore.game.getState()
  const userDataState = globalStore.userData.getState()
  if (gameState.playing || gameState.starting) {
    console.log('[npc] createNpcTest ABORTED (playing/starting)', gameState.playing, gameState.starting)
    return
  }

  const { statistic_current_mission } = userDataState
  let current_mission = statistic_current_mission || 1
  console.log('[npc] createNpcTest: current_mission=', current_mission, 'onlyClickTrigger=', current_mission >= 7)
  if (current_mission >= STORYMODE_DONE) return

  // Sound entity for the sphere-teleport effect (played once during the
  // mission-2 "spheres escape" cinematic). SDK6: source_teleport, playOnce().
  container_sound = engine.addEntity()
  Transform.create(container_sound, { parent, position: Vector3.create(0.5, 1.1, 8) })
  AudioSource.create(container_sound, {
    audioClipUrl: 'sound/sphere_teleporter.mp3',
    playing: false,
    loop: false,
    volume: 1
  })

  // Container 1 GLB (mission 1 visual). Has the electricity hum (source_electricity)
  // and the '1. Escape' clip (container_scape) used in the mission-2 cinematic.
  container1 = engine.addEntity()
  Transform.create(container1, {
    position: Vector3.create(0.5, 1.1, 8),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0)
  })
  GltfContainer.create(container1, { src: 'models/NPC_Container_01.glb' })
  Animator.create(container1, {
    states: [
      { clip: '0. Idle', playing: true, loop: true },
      { clip: '1. Escape', playing: false, loop: false }
    ]
  })
  AudioSource.create(container1, {
    audioClipUrl: 'sound/electricity.mp3',
    playing: true,
    loop: true,
    volume: 0.05
  })

  // Container 2 GLB (post-mission-1, with sphere counters + electricity hum).
  container2 = engine.addEntity()
  Transform.create(container2, { position: Vector3.create(0.5, 1.1, 8) })
  GltfContainer.create(container2, { src: 'models/NPC_Container_02.glb' })
  Animator.create(container2, {
    states: [
      { clip: '0_Spheres', playing: true, loop: true },
      { clip: '1_Spheres', playing: false, loop: true },
      { clip: '2_Spheres', playing: false, loop: true },
      { clip: '3_Spheres', playing: false, loop: true },
      { clip: '4_Spheres', playing: false, loop: true },
      { clip: '5_Spheres', playing: false, loop: true }
    ]
  })
  AudioSource.create(container2, {
    audioClipUrl: 'sound/electricity.mp3',
    playing: true,
    loop: true,
    volume: 0.05
  })

  set_container()

  let loading = false
  const onActivateExecuteDialog = async () => {
    if (loading) return
    if (!NPC_scientist) return
    loading = true
    // `loading` MUST be cleared on every exit path. It used to be reset only on
    // the last line, so any throw in between (npc.talk, changeIdleAnim, a bad
    // dialog) left it stuck at true and the NPC went permanently mute — every
    // later click returned at the guard above. Hence try/finally.
    try {
      npc.talk(NPC_scientist, [{ text: 'Hi...' }])
      // SDK6: for missions >= 7 the authoritative current_mission lives on the web
      // API (mission 8->9 advances when tier-sub-max >= 25). Resync before dialog.
      if (current_mission >= 7) {
        try {
          const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
          const checked = await withTimeout(
            fetch(`${base}/api/check-npc-mission`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ PlayFabId: opts.PlayFabId })
            })
              .then((r) => r.json())
              .then((j) => j.current_mission),
            8000
          )
          if (checked != null && Number(checked) !== current_mission) current_mission = Number(checked)
        } catch (err) {
          console.log('[npc] check-npc-mission failed', err)
        }
      }
      const dialog = buildDialogForMission()
      // Mission 7: SDK6 refreshes user data on activation (picks up the golfclub
      // upgrade the player is told to do). Bounded: it hits PlayFab, a Polygon
      // RPC and the subgraph, and the dialog is blocked until it settles.
      if (current_mission === 7) {
        try {
          await withTimeout(refreshUserData(), 8000)
        } catch (err) {
          console.log('[npc] refreshUserData slow/failed, continuing', err)
        }
      }
      npc.talk(NPC_scientist, dialog)
    } catch (err) {
      console.log('[npc] onActivate failed', err)
    } finally {
      loading = false
    }
  }

  activateNpcDialog = onActivateExecuteDialog

  NPC_scientist = npc.create(
    {
      position: Vector3.create(opts.position.x, opts.position.y, opts.position.z),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(1, 1, 1),
      parent
    },
    {
      type: NPCType.CUSTOM,
      model: 'models/NPC.glb',
      idleAnim: current_mission <= 1 ? animations.container1 : animations.container2,
      faceUser: false,
      reactDistance: 5,
      onlyClickTrigger: current_mission >= 7,
      hoverText: 'Start mission',
      coolDownDuration: 1,
      continueOnWalkAway: false,
      portrait: portraits.smiling.path,
      onActivate: onActivateExecuteDialog,
      onWalkAway: () => {
        if (!NPC_scientist) return
        npc.changeIdleAnim(NPC_scientist, current_mission <= 1 ? animations.container1 : animations.container2, true)
      }
    }
  )

  // dcl-npc-toolkit.create ignores the `parent` field in the transform we
  // pass in (only reads position/rotation/scale). To get the NPC into the
  // same root-relative space as container1/container2, we set the parent on
  // the resulting Transform after the fact. The local position then resolves
  // correctly: (2, 1.1, 8) + root (24, 0, 24) = world (26, 1.1, 32).
  const t = Transform.getMutableOrNull(NPC_scientist)
  if (t) t.parent = parent

  // Second toolkit gap, same family as the parent one above: for NPCType.CUSTOM
  // it creates a bare GltfContainer and never gives the NPC a collider (only
  // NPCType.BLANK gets MeshCollider.setBox). SDK7 GltfContainers default to NO
  // collider on visible meshes, and models/NPC.glb has no *_collider mesh, so the
  // entity is invisible to raycasts — `pointerEventsSystem.onPointerDown`, which
  // the toolkit uses for the click trigger, could never fire. SDK6 didn't need
  // this because GLTFShape defaulted to isPointerBlocker = true.
  //
  // Only matters from mission 7 on, where SDK6 sets onlyClickTrigger (the NPC
  // must be clicked; walking up to it does nothing). Before that the toolkit uses
  // a camera trigger area, which needs no collider — which is why missions 1-6
  // worked and 7+ looked "mute".
  const npcGltf = GltfContainer.getMutableOrNull(NPC_scientist)
  if (npcGltf) npcGltf.visibleMeshesCollisionMask = ColliderLayer.CL_POINTER

  return NPC_scientist

  function set_container() {
    if (!container1 || !container2) return
    if (current_mission < 2 || (current_mission === 2 && !first_time && completed_mission)) {
      // Show container 1
      Transform.getMutable(container1).parent = parent
      if (container2) engine.removeEntity(container2)
      container2 = null
    } else {
      Transform.getMutable(container2).parent = parent
      if (container1) engine.removeEntity(container1)
      container1 = null
      if (first_time || !completed_mission) {
        set_spheres(current_mission - 2)
      } else {
        set_spheres(current_mission - 3)
      }
    }
  }

  function set_spheres(amount: number) {
    if (!container2) return
    if (amount < 0) amount = 0
    // SDK6: electricity hum is silent with 0 spheres, audible otherwise.
    const audio = AudioSource.getMutableOrNull(container2)
    if (audio) audio.volume = amount === 0 ? 0 : 0.05
    const animator = Animator.getMutableOrNull(container2)
    if (!animator) return
    for (const s of animator.states) s.playing = false
    const idx = Math.min(amount, 5)
    const target = animator.states[idx]
    if (target) target.playing = true
  }

  // Mission-2 cinematic helpers (SDK6: source_teleport.playOnce / container_scape.play).
  function playTeleport() {
    if (!container_sound) return
    const a = AudioSource.getMutableOrNull(container_sound)
    if (a) {
      a.playing = false
      a.playing = true
    }
  }
  function playScape() {
    if (!container1) return
    const anim = Animator.getMutableOrNull(container1)
    if (!anim) return
    for (const s of anim.states) s.playing = s.clip === '1. Escape'
  }
  function setElectricityVolume(v: number) {
    const c = container1 || container2
    if (!c) return
    const a = AudioSource.getMutableOrNull(c)
    if (a) a.volume = v
  }

  function getTryAgainDialogue(): Dialog[] {
    const tips = [
      'Check the controls on the right bottom corner of the screen ...',
      'Use the ramps to jump across long distances ...',
      'Try hitting the interactive parts (switches and areas) ...',
      'Use the environment at your advantage ...',
      'You almost have it! You need to be faster and you will have your reward...',
      'You almost have it! You need to be faster and you will have your reward...'
    ]
    const tip = tips[current_mission - 1] || tips[0]
    return [
      {
        text: `Lets try again\n\nWe have ${current_mission} spheres out of four.`,
        portrait: portraits.disappointed,
        audio: getSound(),
        triggeredByNext: () => {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
        }
      },
      { text: tip, portrait: portraits.disappointed, audio: getSound() },
      {
        text: "I'll be right here!",
        portrait: portraits.smiling,
        isEndOfDialog: true,
        audio: getSound(),
        triggeredByNext: () => {
          requestStartMission()
        }
      }
    ]
  }

  function getMission7Dialogue(): Dialog[] {
    return [
      { text: 'Yohoo! you have received your golf emote (NFT)!', portrait: portraits.happy, audio: getSound() },
      { text: "Do you want to win more NFT prizes.\n Let's continue!", portrait: portraits.smiling, audio: getSound() },
      {
        text: 'You can improve the aim of your golf club. Before shooting, a line appears to help you aim; the higher your "aim", the longer the line.',
        portrait: portraits.concerned,
        audio: getSound()
      },
      {
        text: 'You will need 10 wood to improve aim.\nBack there is a screen where you can improve your golfclub.\n\nI wait you here',
        portrait: portraits.concerned,
        isEndOfDialog: true,
        audio: getSound()
      }
    ]
  }

  function buildDialogForMission(): Dialog[] {
    if (current_mission <= 1) {
      if (first_time || completed_mission) {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
        return [
          {
            text: "Welcome! You are the new intern, right?\n\nYou've arrived at the perfect time ...",
            portrait: portraits.smiling,
            audio: getSound()
          },
          {
            text: "I need one additional energy sphere from ancient Egypt,\n\nbut I'd rather keep an eye here\nin case this became unstable ...",
            portrait: portraits.concerned,
            audio: getSound()
          },
          {
            text: 'Help me catch one energy sphere and you will get a secret emote\n\nJust push it to the hole ...',
            portrait: portraits.smiling,
            audio: getSound()
          },
          {
            text: "Don't get sunburned, and come here when you are done!",
            portrait: portraits.smiling,
            isEndOfDialog: true,
            audio: getSound(),
            triggeredByNext: () => {
              requestStartMission()
            }
          }
        ]
      } else {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.fails, true)
        return getTryAgainDialogue()
      }
    } else if (current_mission === 2) {
      if (first_time || completed_mission) {
        if (completed_mission) {
          // Just caught the mission-1 sphere: the "store it" cinematic where 4
          // more spheres escape back to Egypt (container1 escape anim + teleport).
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
          return [
            {
              text: "Wow!\nCan't believe you managed to catch it! ...",
              portrait: portraits.happy,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
              }
            },
            {
              text: 'I mean ... Of course you are fine ...\nno risk at all on working with unlimited sources of energy ...',
              portrait: portraits.shame,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.container1, true)
              }
            },
            {
              text: 'Just let me store this one, and ...',
              portrait: portraits.smiling,
              audio: getSound(),
              triggeredByNext: () => {
                playScape()
                playTeleport()
              }
            },
            {
              text: 'Oh no! ...',
              portrait: portraits.disappointed,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.danger, true)
              }
            },
            { text: 'No no no! ...', portrait: portraits.disappointed, audio: getSound() },
            {
              text: 'Four spheres scaped back to ancient Egypt ...',
              portrait: portraits.concerned,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.upset, true)
                setElectricityVolume(0)
              }
            },
            { text: "Luckily I've you now. Go and catch them all ...", portrait: portraits.shame, audio: getSound() },
            {
              text: 'Find me when you are done.',
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        } else {
          // Returning in a fresh session, already on mission 2.
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
          return [
            { text: "Finally!\nYou are back! ...", portrait: portraits.happy, audio: getSound() },
            { text: 'Do you like my new container? ...', portrait: portraits.happy, audio: getSound() },
            {
              text: 'Remember, four spheres scaped to ancient Egypt ...',
              portrait: portraits.concerned,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.upset, true)
              }
            },
            {
              text: 'Go and catch them all ...',
              portrait: portraits.shame,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
              }
            },
            {
              text: "I've some work to do here.",
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.upset, true)
                requestStartMission()
              }
            }
          ]
        }
      } else {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.fails, true)
        return getTryAgainDialogue()
      }
    } else if (current_mission === 3) {
      if (first_time || completed_mission) {
        if (completed_mission) {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
          return [
            {
              text: 'Nice work catching the first sphere!\nReady to get the next one? ...',
              portrait: portraits.happy,
              audio: getSound(),
              triggeredByNext: () => {
                set_spheres(1)
              }
            },
            {
              text: "Don't take too long! Three spheres to go!",
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        } else {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
          return [
            { text: 'Hi again!\nTime to get the second sphere ...', portrait: portraits.smiling, audio: getSound() },
            {
              text: 'Let me know when you have it! Only three left!',
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        }
      } else {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.fails, true)
        return getTryAgainDialogue()
      }
    } else if (current_mission === 4) {
      if (first_time || completed_mission) {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
        if (completed_mission) {
          return [
            {
              text: 'Two spheres! You are getting good at this!\n\nGoin to retrieve one more? ...',
              portrait: portraits.happy,
              audio: getSound(),
              triggeredByNext: () => {
                set_spheres(2)
              }
            },
            {
              text: 'Take some pics! Two more and we are done!',
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        } else {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
          return [
            { text: "Hello there!\n\nCan't wait to have the next sphere! ...", portrait: portraits.smiling, audio: getSound() },
            {
              text: 'We are half way there!',
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        }
      } else {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.fails, true)
        return getTryAgainDialogue()
      }
    } else if (current_mission === 5) {
      if (first_time || completed_mission) {
        if (completed_mission) {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
          return [
            {
              text: 'Three spheres! The golfclub and you are becoming one!\n\nYou should name it ...',
              portrait: portraits.happy,
              audio: getSound(),
              triggeredByNext: () => {
                if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
                set_spheres(3)
              }
            },
            { text: 'Ready to get the last sphere? ...', portrait: portraits.happy, audio: getSound() },
            {
              text: 'See you on the other side!',
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        } else {
          if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
          return [
            { text: 'Oh you are back!\n\nThis one is the last one! ...', portrait: portraits.smiling, audio: getSound() },
            {
              text: "I will've something for you when you're back!",
              portrait: portraits.smiling,
              isEndOfDialog: true,
              audio: getSound(),
              triggeredByNext: () => {
                requestStartMission()
              }
            }
          ]
        }
      } else {
        if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.fails, true)
        return getTryAgainDialogue()
      }
    } else if (current_mission === 6) {
      // Victory: caught all 4 spheres. No requestStartMission — there is no
      // mission-6 hole. Sends the secret greeting emote NFT + advances to 7, and
      // then flows STRAIGHT INTO the mission-7 dialogue (no isEndOfDialog in
      // between), so the player doesn't have to walk away and re-trigger the NPC
      // to hear what comes next.
      if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
      return [
        {
          text: 'You are amazing!\n\nYou did it! ...',
          portrait: portraits.happy,
          audio: getSound(),
          triggeredByNext: () => {
            if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
            set_spheres(4)
          }
        },
        {
          text: "I'll be sending you an Emote with the secret Golfcraft greeting.\n\nYou earned it!",
          portrait: portraits.smiling,
          audio: getSound(),
          triggeredByNext: () => {
            // Claim the greeting emote NFT via the onchain-queue bridge. Its
            // preClaimEmote advances current_mission 6->7 (optimistic; reverts
            // if the mint fails) and queues the mainnet mint. Remote → prod via
            // signedFetch. Local → the local onchain-queue on :8111 with a plain
            // fetch + hand-built x-identity-auth-chain-0 header (its
            // SIGNED_FETCH_MIDDLEWARE is bypassed in dev; controlMiddleware still
            // checks payload==address + address↔PlayFabId).
            const body = JSON.stringify({
              address: opts.user.publicKey,
              PlayFabId: opts.PlayFabId,
              itemId: 0,
              displayName: opts.user.displayName
            })
            if (USE_REMOTE_SERVER) {
              signedFetch({
                url: 'https://golfcraftgame.com/bridge/claim-emote',
                init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
              }).catch((err: any) => console.log('[npc] claim-emote failed', err))
            } else {
              fetch('http://localhost:8111/bridge/claim-emote', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-identity-auth-chain-0': JSON.stringify({ type: 'SIGNER', payload: opts.user.publicKey, signature: '' })
                },
                body
              })
                .then((r) => r.json())
                .then((j) => console.log('[npc] claim-emote (local) OK', JSON.stringify(j)))
                .catch((err: any) => console.log('[npc] claim-emote (local) failed', err))
            }
            current_mission = 7
            if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
          }
        },
        // Continue seamlessly into mission 7 — same conversation.
        ...getMission7Dialogue()
      ]
    } else if (current_mission === 7) {
      // Emote received; tell the player to improve the golfclub's aim (needs wood).
      if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.talking, true)
      return getMission7Dialogue()
    } else if (current_mission === 8) {
      // Golfclub improved; go play the "Season" multiplayer mode to reach STONE.
      if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
      return [
        {
          text: 'Great! You have improved your golf club.\n Now you are ready to compete.\n Lets win an NFT wearable',
          portrait: portraits.happy,
          audio: getSound()
        },
        {
          text: 'In that wall you can see some screens to play\nmultiplayer "Season" game mode.\n Go play and reach STONE rank.\nYou will receive an NFT wearable then.',
          portrait: portraits.happy,
          isEndOfDialog: true,
          audio: getSound()
        }
      ]
    } else if (current_mission === 9) {
      if (NPC_scientist) npc.changeIdleAnim(NPC_scientist, animations.wins, true)
      return [
        {
          text: 'Congrats for reaching STONE rank!\n You will receive an NFT wearable',
          portrait: portraits.happy,
          isEndOfDialog: true,
          audio: getSound(),
          triggeredByNext: finishStorymode
        }
      ]
    }
    // Beyond the storymode arc.
    return [
      {
        text: `Mission ${current_mission} dialog is not migrated yet.`,
        portrait: portraits.smiling,
        isEndOfDialog: true
      }
    ]
  }

  // The farewell has been shown: park current_mission at STORYMODE_DONE on
  // PlayFab (through the web API, like check-npc-mission) and locally, so
  // neither a lobby respawn nor a reload brings the scientist back. He and the
  // containers leave once the toolkit has closed its dialog window.
  function finishStorymode() {
    const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
    fetch(`${base}/api/finish-npc-storymode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayFabId: opts.PlayFabId })
    })
      .then((r) => r.json())
      .then((j) => console.log('[npc] finish-npc-storymode', JSON.stringify(j)))
      .catch((err: any) => console.log('[npc] finish-npc-storymode failed', err))
    current_mission = STORYMODE_DONE
    globalStore.userData.setState({ statistic_current_mission: STORYMODE_DONE })
    setTimeout(hideNpc, 500)
  }

  async function requestStartMission() {
    console.log('[npc] requestStartMission: start, current_mission=', current_mission)
    const state = { started: false }
    // SDK6 cinematic: start the egypt map music, then fade the screen to black.
    // The course loads behind the black; golfplay-client fades back out when the
    // course visual is ready (fadeOutOverlay).
    reproduceMapMusic(getMusicForCollection(0))
    fadeInOverlay(1)
    gameState.starting = true
    gameState.playing = true
    first_time = false

    await sleep(1000)
    console.log('[npc] requestStartMission: after sleep, calling onStart()')
    opts.onStart()
    let clientGolfPlay: any

    const gameDefinition: any = {
      type: 'competition',
      subType: '1',
      courseId: `mission-${current_mission || 1}`
    }
    completed_mission = false

    gameState.courseId = null
    console.log('[npc] joining mission-room with PlayFabId=', opts.PlayFabId, 'gameDefinition=', gameDefinition)
    const room: any = await opts.colyseus
      .joinOrCreate(`mission-room`, {
        user: { ...opts.user, avatar: undefined },
        realm: opts.realm,
        userId: opts.user.userId,
        roomInstanceId: `${opts.user.userId}-${Date.now()}`,
        PlayFabId: opts.PlayFabId,
        gameDefinition,
        clientInfo: opts.clientInfo
      })
      .then(
        (r: any) => {
          console.log('[npc] joinOrCreate OK, sessionId=', r?.sessionId)
          return r
        },
        (err: any) => {
          console.log('[npc] PROBLEM JOINING ROOM', err)
        }
      )

    if (!room) {
      console.log('[npc] No room returned, aborting mission start')
      gameState.starting = false
      gameState.playing = false
      // Recover from a failed join (e.g. onAuth rejects because the player's
      // server-side current_mission != the mission-1 we always request — see
      // CLAUDE.md §6 #21). onStart() already destroyed the lobby and faded to
      // black, so without this the player is stuck on a black screen. Reveal
      // the world, stop the music, and respawn the lobby.
      stopMapMusic()
      fadeOutOverlay(1)
      await opts.onFinish()
      return
    }

    const expressionState: any = {}
    room.onMessage(MESSAGE.VARIABLE_INITIALIZATION, (data: any) => {
      Object.assign(expressionState, data)
    })

    room.onMessage(MESSAGE.START, async () => {
      // Tutorial missions: NO pre-start countdown and NO on-screen timer. As
      // soon as the client golfplay is ready (course loaded behind the fade),
      // start — the player can shoot immediately. The server now enforces the
      // 1h hard cap and the 10min-idle kick and sends LEAVE_CODE.TIMEOUT, which
      // onFinish below turns into the TIMEOUT banner.
      if (state.started) return
      state.started = true
      await waitFor(() => clientGolfPlay?.start, 200, () => {
        console.log('[npc] clientGolfPlay not initialized')
      })
      clientGolfPlay.start()
      gameState.starting = false
    })

    console.log('[npc] waiting for initialised room state...')
    await waitForInitialisedState(room)
    console.log('[npc] room state initialised. ball=', room.state.ball)

    // A guest, or a player whose PlayFab data didn't load, has no golfclub in
    // the store. Without this fallback the next line reads .ItemId off
    // undefined and the mission dies with an unhandled rejection in the worker
    // — the player just stays on the READY banner. season-demo.ts already
    // defaulted to the basic club the same way.
    const golfclubs = userDataState.golfclubs || []
    const activeGolfClub =
      golfclubs.find(
        (item: any) => item.CustomData?.tokenId === userDataState.activeGolfClubTokenId
      ) ||
      golfclubs.find((item: any) => item.ItemId === 'golfclub-1') || { ItemId: 'golfclub-1' }

    console.log('[npc] creating clientGolfPlay with golfclub=', activeGolfClub.ItemId)
    try {
      clientGolfPlay = await createClientGolfPlay(opts.root, {
        gameType: 'training',
        room,
        gameDefinition,
        golfclub: {
          id: activeGolfClub.ItemId.replace('golfclub-', ''),
          power: Number(activeGolfClub.CustomData?.attribute_power || 0),
          control: Number(activeGolfClub.CustomData?.attribute_control || 0),
          aim: Number(activeGolfClub.CustomData?.attribute_aim || 0)
        },
        colyseus: opts.colyseus,
        expressionState
      })
      console.log('[npc] clientGolfPlay created')
    } catch (err) {
      console.log('[npc] FAILED to create clientGolfPlay:', err)
      return
    }

    clientGolfPlay.onFinish(async (leaveCode: number) => {
      // room.onLeave is registered twice (directly + via listenRoom, same as
      // SDK6), so this finish callback can fire twice per mission end. Only
      // act on the first invocation.
      if (!clientGolfPlay) return
      hideTopBar()
      stopMapMusic()
      // SDK6 lobby.ts:handleLeavePlay fades to black FIRST, then restores the
      // lobby + teleports the player — so they never see the course vanish or
      // the teleport. Mirror that here.
      await fadeInOverlay(1)
      // SDK6 centerpanel banners on mission end. LEAVE_CODE: 4000 COMPLETED
      // (success is shown by onComplete below), 4001 TIMEOUT, 4002 FAILED.
      if (leaveCode === 4001) showBanner('timeout', 3000)
      else if (leaveCode === 4002) showBanner('failed', 3000)
      clientGolfPlay.dispose()
      clientGolfPlay = null
      // Clear the playing/starting flags BEFORE respawning the lobby — otherwise
      // createNpcTest's `if (gameState.playing || gameState.starting) return`
      // guard aborts and the NPC never reappears (the building does, since it has
      // no such guard). SDK6 hid/showed the NPC instead of recreating it.
      gameState.playing = false
      gameState.starting = false
      // Refresh current_mission (+ resources) from PlayFab BEFORE respawning the
      // lobby, so the recreated NPC shows the next mission. The server awaits
      // completeMissionOnPlayFab (which bumps current_mission) before sending
      // COMPLETED, so the write is already done; the short wait just covers
      // PlayFab read-after-write. (SDK6 called refreshUserData() here.)
      await sleep(1000)
      await refreshUserData()
      await opts.onFinish(leaveCode) // respawn lobby (= SDK6 show())
      // Teleport the player back to the lobby/NPC spawn (SDK6 GAME_SPAWN.MISSION
      // via handleLeavePlay) — otherwise they're stranded where the ball holed.
      await sleep(500)
      const [spawnPos, spawnCam] = GAME_SPAWN.MISSION
      await movePlayerTo({
        newRelativePosition: Vector3.create(spawnPos.x, spawnPos.y, spawnPos.z),
        cameraTarget: Vector3.create(spawnCam.x, spawnCam.y, spawnCam.z)
      })
      await fadeOutOverlay(1)
    })

    clientGolfPlay.onComplete(async ({ xp, GC, PT, time, shoots, materialDrops }: any) => {
      completed_mission = true
      console.log('[npc] mission complete', { xp, GC, PT, time, shoots, materialDrops })
      showBanner('success', 3000)
      await sleep(1000)
    })

    console.log('[npc] sending MESSAGE.READY')
    room.send(MESSAGE.READY)
  }
}

export const hideNpc = () => {
  activateNpcDialog = null
  if (NPC_scientist !== null) {
    engine.removeEntity(NPC_scientist)
    NPC_scientist = null
  }
  if (container1 !== null) {
    engine.removeEntity(container1)
    container1 = null
  }
  if (container2 !== null) {
    engine.removeEntity(container2)
    container2 = null
  }
  if (container_sound !== null) {
    engine.removeEntity(container_sound)
    container_sound = null
  }
}
