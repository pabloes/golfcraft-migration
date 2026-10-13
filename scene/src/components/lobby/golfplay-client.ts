import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import CANNON from 'cannon'

import { createVisualCourse } from '../../../golfplay/src/components/course/course-visual-loader'
import { VisualBallFactory } from '../../../golfplay/src/components/ball'
import { createPhysicsWorld, initializeMaterials } from '../../../golfplay/physics/world'
import { createPhysicBall } from '../../../golfplay/physics/ball'
import { loadCoursePhysics } from '../../../golfplay/physics/course-element-loader'
import { createShootControl } from '../../../golfplay/src/components/shoot-control'
import { createGameHandler } from '../../../golfplay/src/gameplay-handlers/gameplay-handler'
import { EVENT } from '../../../golfplay/src/gameplay-handlers/handler-def'
import { CheckpointFactory } from '../../../golfplay/src/components/visual-checkpoint'
import { VisualZoneFactory } from '../../../golfplay/src/components/visual-zone'
import { getCourseDefinition } from '../../../../common/course-definitions/course-definition-repository'
import { showAvatars, hideAvatars } from '../../services/hide-avatars'
import { reproduceAvatarSound, registerSound } from '../../../golfplay/mana-fever-utils/lib/sound/avatar-sound'
import { fadeOutOverlay } from '../ui/overlay'
import { globalStore } from '../../services/globalStore/globalStore'
// @ts-ignore - course-animations-migration has @ts-nocheck
import { migrateCourseDefinitionAnimations } from '../../../../common/course-animations-migration'
import { MovingPartComponent } from '../../../golfplay/src/components/course/visual-part'
import { createEventManager } from '../../../golfplay/src/services/EventManagerFactory'
// @ts-ignore
import { createFrameReproduction } from '../../../../common/frame-reproductor'
import MESSAGE from '../../../../server/rooms/mesages'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../../../common/utils'
import { createVisualChest } from './visualChest'
import { showMessage } from './server-notification'
import { createFixBugButton as createFixBugButtonStub } from './golfplay-client-season'
import { createBallOrbitCamera } from '../../../golfplay/src/components/orbit-camera'
import { CAMERA_AIM_MODE } from '../../config/controls'
import { mobileShootState } from '../../ui/mobile-shoot-state'

const REWARD_NAMES: any = {
  WD: 'wood',
  ST: 'stone',
  IR: 'iron',
  GD: 'gold',
  DM: 'diamond',
  FT: 'fashion ticket',
  EN: 'energy',
  wearable: 'wearable'
}
const onlyServerPhysics = false

// Map MovingPartComponent entities to their partId string (SDK6 used new Entity(id)).
const movingPartIds = new Map<Entity, string>()

// avatar-sound's registerSound throws on re-registration (same as SDK6); the
// factory can run multiple times in SDK7 (lobby NPC is re-created per mission).
let soundsRegistered = false

const GolfplayClientFactory = ({ golfplayBaseUrl }: { golfplayBaseUrl: string }) => {
  const { createVisualBall } = VisualBallFactory({ baseResourceUrl: golfplayBaseUrl })
  const { createCheckpoint } = CheckpointFactory({ baseResourceUrl: golfplayBaseUrl })
  const { createVisualZone } = VisualZoneFactory({ baseResourceUrl: golfplayBaseUrl })

  // SDK6 ran this factory ONCE (its lobby hid/showed the NPC instead of
  // re-creating it — and left a "//TODO MEMOIZE" here). Our spawnLobby
  // re-creates the NPC after each mission, re-running the factory, and
  // registerSound throws "already registered" on the second run, aborting the
  // NPC respawn. Register once, like SDK6 effectively did.
  if (!soundsRegistered) {
    registerSound('checkpoint', golfplayBaseUrl)
    registerSound('voxter', golfplayBaseUrl)
    registerSound('hole', golfplayBaseUrl)
    soundsRegistered = true
  }
  initializeMaterials()

  const createClientGolfPlay = async (
    parent: Entity,
    {
      gameDefinition,
      room,
      roomBall = room.state.ball,
      golfclub,
      wip,
      colyseus,
      expressionState = {},
      currentGame
    }: any
  ) => {
    const state = {
      reconnecting: false,
      disposed: false
    }

    const frameEventHandler = createEventManager()
    hideAvatars()
    const courseDefinition: any = migrateCourseDefinitionAnimations(
      await getCourseDefinition(gameDefinition, fetch, wip)
    )

    if (globalStore?.game) {
      const gs = globalStore.game.getState()
      gs.courseAuthor = courseDefinition.authorName || null
      gs.courseName = courseDefinition.displayName || courseDefinition.alias
      gs.courseIsSeason = !!courseDefinition.isSeason
      gs.playing = true
    }

    const callbacks: { [key: string]: null | Function } = {
      onFinish: null,
      onComplete: null
    }

    const remoteBallPosition = roomBall.position.toJSON()
    const remoteBallRotation = roomBall.quaternion.toJSON()
    const ballSpawnDefinition = {
      position: [remoteBallPosition.x, remoteBallPosition.y, remoteBallPosition.z],
      rotation: [remoteBallRotation.x, remoteBallRotation.y, remoteBallRotation.z, remoteBallRotation.w]
    }

    const spawnPart = courseDefinition.parts.find((part: any) => part.type === 'spawn')
    const initialPlayerPosition = Vector3.create(
      spawnPart.position[0],
      spawnPart.position[1],
      spawnPart.position[2]
    )
    const { world } = createPhysicsWorld()
    const ball = createVisualBall(parent, {
      position: Vector3.create(
        ballSpawnDefinition.position[0],
        ballSpawnDefinition.position[1],
        ballSpawnDefinition.position[2]
      ),
      collectionId: courseDefinition.collectionId
    })
    const physicBall = createPhysicBall(world, {
      position: ballSpawnDefinition.position,
      onlyKinematic: false
    })
    physicBall.body.sleep()
    const physicParts = loadCoursePhysics(world, { courseDefinition })
    const movingPhysicParts: { [id: string]: any } = Object.values(physicParts as any)
      .filter((pp: any) => pp.definition.animation)
      .reduce<{ [id: string]: any }>((acc, current: any) => {
        acc[current.definition.id] = current
        current.animationState = { currentFrame: 0, count: 0 }
        return acc
      }, {})

    physicBall.onCollide((e: any) => {
      if (e.body.material.name === 'woodMaterial') {
        ball.reproduceSound('wood', Math.min(1, physicBall.body.velocity.length() / 10))
      } else if (e.body.material.name === 'dumperMaterial') {
        ball.reproduceSound('bumper', Math.min(1, physicBall.body.velocity.length() / 25))
      }
    })

    // Mobile QUIT button (src/ui/mobile-shoot-controls.tsx): leaving the room
    // ends the hole for this player the same way a server kick does
    // (room.onLeave -> the finish handler).
    mobileShootState.quit = () => {
      try {
        room.leave()
      } catch (err) {
        console.log('[golfplay] leave failed', err)
      }
    }
    // CAMERA_AIM_MODE: circles the ball for the whole hole and gives the shoot
    // control its aim (see orbit-camera.ts). Null in the classic scheme.
    const orbitCam = CAMERA_AIM_MODE
      ? createBallOrbitCamera(parent, {
          ballEntity: ball.getEntity(),
          getBallPosition: () => physicBall.body.position,
          initialRotation: ballSpawnDefinition.rotation
        })
      : null

    const control = createShootControl(parent, {
      position: Vector3.create(
        ballSpawnDefinition.position[0],
        ballSpawnDefinition.position[1],
        ballSpawnDefinition.position[2]
      ),
      rotation: Quaternion.create(
        ballSpawnDefinition.rotation[0],
        ballSpawnDefinition.rotation[1],
        ballSpawnDefinition.rotation[2],
        ballSpawnDefinition.rotation[3]
      ),
      golfclub,
      getAimYaw: orbitCam ? () => orbitCam.getYaw() : undefined
    })
    control.hide()
    const gamePlayState = { idle: true, started: false, finished: false }

    const visualCourse = createVisualCourse(parent, { courseDefinition })

    const gameHandler = createGameHandler({
      gameType: gameDefinition.type,
      world,
      ballBody: physicBall.body,
      state: gamePlayState,
      courseDefinition,
      movingPhysicParts,
      parts: physicParts,
      excludeHandlers: ['animation'],
      onExpressionEvent: ({ type, data }: any) => {
        const { targetControlIds, newValues, isDelayed } = data
        if (isDelayed) {
          Object.assign(expressionState, newValues)
          targetControlIds.forEach((partId: string) => {
            visualCourse.applyReactiveValue(partId, expressionState)
          })
        }
      },
      applySmartParts: true
    })

    visualCourse.applyAllValues(expressionState)
    let positionBeforeShoot: any

    await movePlayerTo({
      newRelativePosition: Vector3.create(initialPlayerPosition.x + 24, initialPlayerPosition.y, initialPlayerPosition.z + 24),
      cameraTarget: Vector3.create(8 + 24, 1, 8 + 24)
    })

    await fadeOutOverlay(1)

    const fixBug = await createFixBugButtonStub(visualCourse, () => {
      visualCourse.reset()
      visualCourse.applyAllValues(expressionState)
      control.show()
      room.send(MESSAGE.FIX_BUGS)
    })

    frameEventHandler.onEvent(EVENT.EVENT_VARIABLE_CHANGE, ({ type, data }: any) => {
      Object.assign(expressionState, data.newValues)
      data.targetControlIds.forEach((partId: string) => {
        visualCourse.applyReactiveValue(partId, expressionState)
      })
    })

    frameEventHandler.onEvent(EVENT.SLEEP, () => {
      physicBall.body.sleep()
      if (gamePlayState.finished) return
      setIdle()
    })

    frameEventHandler.onEvent(EVENT.HOLE, () => {
      control.hide()
      gamePlayState.idle = false
      gamePlayState.finished = true
      releasePlayer()
      ball.reproduceSound('hole')
      visualCourse.reproduceHoleAction()
    })
    frameEventHandler.onEvent(EVENT.WIND, () => ball.reproduceSound('wind'))
    frameEventHandler.onEvent(EVENT.SAND, () => ball.reproduceSound('sand'))
    frameEventHandler.onEvent(EVENT.OUT, async () => {
      physicBall.body.sleep()
      if (gamePlayState.finished) return
      await sleep(100)
      physicBall.body.position.set(positionBeforeShoot.x, positionBeforeShoot.y, positionBeforeShoot.z)
      await sleep(100)
      setIdle()
    })
    frameEventHandler.onEvent(EVENT.EXPLOSIVE, ({ type, data }: any) => {
      visualCourse.getParts()[data.id]?.reproduceAction()
    })

    // SDK6 declared these `let`s after `listenRoom()` and relied on hoisting.
    // In the SDK7 sandbox runtime, the `let` TDZ throws when listenRoom()
    // touches them too early -- "Cannot access 'checkpointCallback' before
    // initialization". Hoist them above the call so the closure sees the
    // (initially undefined) bindings.
    let checkpointCallback: any
    let voxterCallback: any

    let lastPingTime = Date.now()
    let lastPing = 0
    room.send(MESSAGE.PING)
    listenRoom()

    function onMessagePong() {
      lastPing = (Date.now() - lastPingTime) / 2
      room.send(MESSAGE.PING2)
    }
    function onClientLog(data: any) {
      console.log('CLIENT_LOG', data)
    }

    // Self-terminating ping: after the mission ends, this kept firing every 5s
    // against the closed socket ("InvalidStateError: readyState not OPEN")
    // even though dispose() runs clearInterval — the sandbox's setInterval and
    // clearInterval don't reliably pair (the timer fires from deno_web). Guard
    // with the disposed flag and swallow sends on a dead connection.
    let pingDisposed = false
    const pingInterval = setInterval(() => {
      if (pingDisposed || state.reconnecting) return
      lastPingTime = Date.now()
      try {
        room.send(MESSAGE.PING)
      } catch (_) {
        pingDisposed = true
      }
    }, 5000)

    room.onMessage(MESSAGE.COMPLETED, onMessageCompleted)

    if (gameDefinition.type === 'training') {
      if (gameDefinition.subType === '1') {
        const checkpoints = courseDefinition.parts.filter((part: any) => part.type === 'checkpoint')
        const visualCheckpoint = createCheckpoint(parent, {
          position: Vector3.create(checkpoints[0].position[0], checkpoints[0].position[1], checkpoints[0].position[2]),
          visible: true
        })
        checkpointCallback = getOnMessageCheckpoint(visualCheckpoint, checkpoints)
        room.onMessage(MESSAGE.CHECKPOINT, checkpointCallback)
        room.onLeave((code: number) => {
          if (code >= 4000) visualCheckpoint.dispose()
        })
      } else if (gameDefinition.subType === '2') {
        const zoneDefinition = courseDefinition.parts.find((part: any) => part.type === 'zone')
        const visualZone = createVisualZone(parent, {
          position: Vector3.create(zoneDefinition.position[0], zoneDefinition.position[1], zoneDefinition.position[2]),
          scale: Vector3.create(zoneDefinition.scale[0], zoneDefinition.scale[1], zoneDefinition.scale[2])
        })
        room.onLeave((code: number) => {
          if (code >= 4000) visualZone.dispose()
        })
      }
    }

    let shootFramesInfo: any = null
    control.onShoot(({ impulse, delayMs }) => {
      if (state.reconnecting) return
      control.hide()
      gamePlayState.idle = false
      room.send(MESSAGE.SHOOT, { impulse, timeStep, delayMs })
    })

    let frameReproductor: any = null

    const visualChests: any[] = []
    setTimeout(() => {
      if (room.state.chests) {
        room.state.chests.forEach((chest: any, index: number) => {
          const [chestRewardKey, chestRewardAmount] = chest.reward.split(':')
          visualChests.push(
            createVisualChest(parent, {
              chest,
              onClick: async () => {
                if (state.reconnecting) return
                room.send(MESSAGE.CHEST, { index })
                showMessage({
                  timeout: 5000,
                  message: `HI! Found ${chestRewardAmount} ${REWARD_NAMES[chestRewardKey]} !!`
                })
                await sleep(1000)
                visualChests[index].dispose()
              },
              model: room.state.chestModel
            })
          )
        })
      }
    }, 1000)

    room.onLeave(onLeave)

    engine.addSystem(update)

    const STEPS_FPS = 60 * 4
    const timeStep = 1 / STEPS_FPS

    function listenRoom() {
      room.onLeave(cancellableCallback(onLeave))
      room.onMessage(MESSAGE.CLIENT_LOG, cancellableCallback(onClientLog))
      room.onMessage(MESSAGE.PONG, cancellableCallback(onMessagePong))
      room.onMessage(MESSAGE.SHOOT_FRAMES, cancellableCallback(onMessageShootFrames))
      room.onMessage(MESSAGE.START_SHOOT_FRAMES, cancellableCallback(onMessageStartShootFrame))
      room.onMessage(MESSAGE.COMPLETED, cancellableCallback(onMessageCompleted))
      if (checkpointCallback) room.onMessage(MESSAGE.CHECKPOINT, cancellableCallback(checkpointCallback))
      if (voxterCallback) room.onMessage(MESSAGE.VOXTER, cancellableCallback(voxterCallback))
    }

    function cancellableCallback(fn: Function) {
      return (...args: any[]) => {
        if (!state.disposed) fn(...args)
      }
    }
    // The hole is over for this player (holed, or the round/room ended): give
    // back the normal camera, the avatar's legs and the avatars until the next
    // hole's client takes them again. dispose() repeats it harmlessly.
    function releasePlayer() {
      orbitCam?.release()
      showAvatars()
    }

    function onLeave(code: number) {
      if (code < 4000 && code !== 1000) {
        const roomId = room.id
        const sessionId = room.sessionId
        state.reconnecting = true
        colyseus.reconnect(roomId, sessionId).then((_room: any) => {
          state.reconnecting = false
          control.show()
          room = _room
          listenRoom()
        })
      } else {
        showAvatars()
        callbacks.onFinish && callbacks.onFinish(code)
      }
    }
    function onMessageCompleted(
      data: { xp: number; GC: number; time: number; shoots: number; PT: number; materialDrops: any } = {
        xp: 0,
        GC: 0,
        time: 0,
        shoots: 0,
        PT: 0,
        materialDrops: {}
      }
    ) {
      const { xp, GC, PT, time, shoots, materialDrops } = data
      releasePlayer()
      callbacks.onComplete && callbacks.onComplete({ xp, GC, PT, time, shoots, materialDrops })
    }

    function getOnMessageCheckpoint(visualCheckpoint: any, checkpoints: any[]) {
      return function onMessageCheckpoint({ checkpoint, index, altIndex }: any) {
        reproduceAvatarSound('checkpoint')
        if (altIndex === checkpoints.length - 1) {
          visualCheckpoint.dispose()
        } else {
          visualCheckpoint.moveTo(
            Vector3.create(
              checkpoints[altIndex + 1].position[0],
              checkpoints[altIndex + 1].position[1],
              checkpoints[altIndex + 1].position[2]
            )
          )
        }
      }
    }
    function onMessageShootFrames({ timeStep, impulse, frames }: any) {
      shootFramesInfo = { frames, impulse, timeStep }
      positionBeforeShoot = physicBall.body.position.clone()
    }
    function onMessageStartShootFrame() {
      ball.reproduceSound('shoot1')
      physicBall.wakeUp()
      frameReproductor = createFrameReproduction({
        timeStep,
        frames: shootFramesInfo.frames,
        onEvent: (event: any) => frameEventHandler.trigger(event),
        onUpdateBall: ({ position, velocity }: any) => {
          Object.assign(physicBall.body.position, position)
          Object.assign(physicBall.body.velocity, velocity)
        },
        onFinish: () => (frameReproductor = null)
      })
    }

    function update(dt: number) {
      if (!gamePlayState.started) return
      if (frameReproductor) frameReproductor.update(dt)
      if (!onlyServerPhysics) world.step(timeStep, dt)

      ball.setPosition(physicBall.body.position, physicBall.body.quaternion)

      movingPhysicParts &&
        Object.values(movingPhysicParts).forEach((physicPart: any) => {
          physicPart.bodies.forEach((body: any) => {
            const partId = physicPart.definition.id
            const movingParts = room.state.movingParts?.toJSON?.() || []
            const serverPart = movingParts.find((m: any) => m.partId === partId)
            if (!serverPart) return
            const { x, y, z } = serverPart.velocity
            body.velocity.set(x, y, z)
          })
        })

      // SDK7 replacement for engine.getComponentGroup(MovingPartComponent).entities
      for (const [entity] of engine.getEntitiesWith(MovingPartComponent)) {
        const partId = movingPartIds.get(entity)
        if (!partId) continue
        const movingParts = room.state.movingParts?.toJSON?.() || []
        const serverPart = movingParts.find((m: any) => m.partId === partId)
        if (!serverPart) continue
        const t = Transform.getMutableOrNull(entity)
        if (!t) continue
        t.position = Vector3.create(serverPart.position.x, serverPart.position.y, serverPart.position.z)
        t.rotation = Quaternion.create(
          serverPart.quaternion.x,
          serverPart.quaternion.y,
          serverPart.quaternion.z,
          serverPart.quaternion.w
        )
      }

      gameHandler.update(dt, true)
    }

    return {
      ready: () => room.send(MESSAGE.READY),
      setExpressionState: (data: any) => Object.assign(expressionState, data),
      id: Date.now(),
      dispose,
      onFinish,
      start,
      onComplete,
      setAnimationGlobalDt: gameHandler.setAnimationGlobalDt
    }

    function start() {
      gamePlayState.started = true
      control.show()
    }

    function setIdle() {
      gamePlayState.idle = true
      control.show()
      control.setPosition(physicBall.body.position)
    }

    function dispose() {
      pingDisposed = true
      mobileShootState.quit = null
      mobileShootState.quitConfirm = false
      fixBug.hide()
      clearInterval(pingInterval)
      visualChests.forEach((v: any) => v.dispose())

      checkpointCallback = null
      voxterCallback = null
      frameEventHandler.dispose()
      gameHandler.dispose()
      visualCourse.dispose()
      control.dispose()
      orbitCam?.dispose()
      ball.dispose()

      engine.removeSystem(update)
      callbacks.onFinish = null
      callbacks.onComplete = null

      state.disposed = true
    }

    function onComplete(fn: Function) {
      callbacks.onComplete = fn
    }

    function onFinish(fn: Function) {
      callbacks.onFinish = fn
    }
  }

  return { createClientGolfPlay }
}

export { GolfplayClientFactory }
