// SDK7 port of SDK6 scene/src/components/lobby/golfplay-client-season.ts
//
// The per-round gameplay client for a Season run. SDK6 kept this as a hard FORK
// of golfplay-client.ts rather than a parameterisation, and this port keeps the
// fork (project rule #4: mirror file paths, don't reorganise) so the working
// storymode client is not destabilised. What season adds on top of it:
//
//   - GHOST PLAYBACK: 3 extra visual balls replaying recorded frame arrays
//     (IDLE/SHOOT/MOVE/HOLE) on a 30fps interval, so you race pre-recorded
//     opponents instead of live players.
//   - A 4-ROUND LIFECYCLE: the room drives rounds 0..3 over one connection, so
//     `ready()` is called per round and stale handlers from round N must not
//     fire in round N+1 (`cancellableCallback` + the `disposed` flag).
//   - HOLE COUNTDOWNS: MESSAGE.COUNTDOWN / END_COUNTDOWN drive the on-screen
//     "Ending in... N" once an opponent holes out.
//   - A LIVE SCOREBOARD fed by onChange listeners on the Colyseus results schema.
//   - The ball spawns from the course definition's `initial_position` part,
//     NOT from room.state.ball as storymode does.
import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { createVisualCourse } from '../../../golfplay/src/components/course/course-visual-loader'
import { VisualBallFactory } from '../../../golfplay/src/components/ball'
import { createPhysicsWorld, initializeMaterials } from '../../../golfplay/physics/world'
import { createPhysicBall } from '../../../golfplay/physics/ball'
import { loadCoursePhysics } from '../../../golfplay/physics/course-element-loader'
import { createShootControl } from '../../../golfplay/src/components/shoot-control'
import { createGameHandler } from '../../../golfplay/src/gameplay-handlers/gameplay-handler'
import { EVENT } from '../../../golfplay/src/gameplay-handlers/handler-def'
import { getCourseDefinition } from '../../../../common/course-definitions/course-definition-repository'
import { showAvatars, hideAvatars } from '../../services/hide-avatars'
import { registerSound } from '../../../golfplay/mana-fever-utils/lib/sound/avatar-sound'
import { fadeInOverlay } from '../ui/overlay'
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
import { hideWaitPlayers } from './season-game-countdown'
import { createInGameResultsUi, createInGameTime } from './ingame-ui'
import { seasonCountdownState, seasonHoleState, hideSeasonHud } from '../../ui/season-hud-state'
import { createAimCamera } from '../../../golfplay/src/components/aim-camera'
import { lockAvatarForRun, unlockAvatar, freeAvatarForNow, holdAvatarForRun } from '../../../golfplay/src/components/avatar-lock'
import { isCameraAimMode } from '../../services/game-options'
import { mobileShootState } from '../../ui/mobile-shoot-state'
import { reportPing } from '../../ui/ping-state'
import { reconnectRoom } from './room-reconnect'
import { holdGroundUnderPlayer } from '../scene-bounds'
import { raisePlayFloor } from '../scene-bounds'
import { startMapMusic } from '../../services/map-music'
import { COURSE_REMOVE_DELAY_MS, FADE_BETWEEN_HOLES } from '../../config/hole-end'

const REWARD_NAMES: any = {
  WD: 'wood',
  ST: 'stone',
  IR: 'iron',
  GD: 'gold',
  DM: 'diamond',
  FT: 'fashion ticket',
  wearable: 'wearable'
}

const onlyServerPhysics = false

// Map MovingPartComponent entities to their partId (SDK6 used new Entity(id)).
const movingPartIds = new Map<Entity, string>()

// Ghost frame types, as recorded by the server's frame recorder.
const GHOST_FRAME = { IDLE: 0, SHOOT: 1, MOVE: 2, HOLE: 3 }

// SDK6 kept these as module-level singletons created at import time. Keep them
// module-level (one clock / one scoreboard across rounds) but build them lazily
// so importing this file has no side effects.
let timeUI: ReturnType<typeof createInGameTime> | null = null
let inGameResults: ReturnType<typeof createInGameResultsUi> | null = null

// registerSound throws on re-registration and this factory can run once per
// round; same guard as golfplay-client.ts (see CLAUDE.md §6 #23).
let soundsRegistered = false

const GolfplayClientSeasonFactory = ({ golfplayBaseUrl }: { golfplayBaseUrl: string }) => {
  const { createVisualBall } = VisualBallFactory({ baseResourceUrl: golfplayBaseUrl })

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
      golfclub,
      wip,
      colyseus,
      expressionState = {},
      currentGame,
      ghostsData,
      // "Play ranked with friends" only: room.state.players (the live balls of
      // the other party members) and this client's own index in it. Absent in a
      // solo run, where the only other balls are the ghosts.
      partyPlayers = null,
      partyPlayerIndex = -1
    }: any
  ) => {
    const state = { reconnecting: false }
    console.log('[season] createClientGolfPlay round', currentGame)

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

    const callbacks: { [key: string]: null | Function } = { onFinish: null, onComplete: null }

    // Season spawns the ball from the course definition, NOT room.state.ball.
    const initialPosDef = courseDefinition.parts.find((p: any) => p.type === 'initial_position')
    const ballSpawnDefinition = {
      position: [...initialPosDef.position],
      rotation: [...initialPosDef.rotation]
    }

    const spawnPart = courseDefinition.parts.find((part: any) => part.type === 'spawn')
    const initialPlayerPosition = Vector3.create(spawnPart.position[0], spawnPart.position[1], spawnPart.position[2])

    const { world } = createPhysicsWorld()
    const ball = createVisualBall(parent, {
      position: Vector3.create(
        ballSpawnDefinition.position[0],
        ballSpawnDefinition.position[1],
        ballSpawnDefinition.position[2]
      ),
      collectionId: courseDefinition.collectionId
    })

    // The player must stand on a floor of OURS, never on the course: the
    // explorer pins them to the collider under their feet and carries them
    // wherever it goes, so a course taken away at the end of a hole can take
    // them to another parcel. The sheet is at PLAY_FLOOR_Y, where the courses'
    // own floors are.
    raisePlayFloor()

    // Music for this map, streamed from outside the scene
    // (services/map-music.ts). The map is read from the course's skybox part.
    // It carries on across the holes of a run: a track cut off at every hole
    // would mean nobody ever hears one.
    try {
      startMapMusic(courseDefinition)
    } catch (err) {
      console.log('[music] could not start', err)
    }


    const physicBall = createPhysicBall(world, { position: ballSpawnDefinition.position, onlyKinematic: false })
    physicBall.body.sleep()
    const physicParts = loadCoursePhysics(world, { courseDefinition })
    const movingPhysicParts: { [id: string]: any } = Object.values(physicParts as any)
      .filter((pp: any) => pp.definition.animation)
      .reduce<{ [id: string]: any }>((acc, current: any) => {
        acc[current.definition.id] = current
        current.animationState = { currentFrame: 0, count: 0 }
        return acc
      }, {})

    let cancelEnding = false

    physicBall.onCollide((e: any) => {
      if (e.body.material.name === 'woodMaterial') {
        ball.reproduceSound('wood', Math.min(1, physicBall.body.velocity.length() / 10))
      } else if (e.body.material.name === 'dumperMaterial') {
        ball.reproduceSound('bumper', Math.min(1, physicBall.body.velocity.length() / 25))
      }
    })

    // CAMERA_AIM_MODE: the aim camera (orbit on desktop, the avatar anchored on
    // the ball on phones, see aim-camera.ts) keeps the avatar still for the
    // whole hole and gives the shoot control its aim. Null in the classic scheme.
    const aimCam = isCameraAimMode()
      ? createAimCamera(parent, {
          ballEntity: ball.getEntity(),
          getBallPosition: () => physicBall.body.position,
          initialRotation: ballSpawnDefinition.rotation
        })
      : null
    // The avatar stays still until the run ends (index.ts onFinish), also
    // between holes, so nobody walks out of the scene meanwhile.
    if (aimCam) lockAvatarForRun()

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
      getAimYaw: aimCam ? () => aimCam.getYaw() : undefined
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
      onExpressionEvent: ({ data }: any) => {
        const { targetControlIds, newValues, isDelayed } = data
        if (isDelayed) {
          Object.assign(expressionState, newValues)
          targetControlIds.forEach((partId: string) => visualCourse.applyReactiveValue(partId, expressionState))
        }
      },
      applySmartParts: true
    })

    visualCourse.applyAllValues(expressionState)
    let positionBeforeShoot: any

    // Only to ENTER the run, not between hole and hole (user, 2026-11-04).
    // With the aim camera the view belongs to the camera, which sits on the
    // ball of the new hole, and the avatar is hidden and locked for the whole
    // run, so moving it between holes achieves nothing and is one more chance
    // to land somewhere the explorer will not move it from again (§6 #46).
    // Legacy controls have no aim camera: there the avatar IS the view, so it
    // still has to be put on each tee or the player is stranded.
    if (currentGame === 0 || !isCameraAimMode()) {
      await movePlayerTo({
        newRelativePosition: Vector3.create(
          initialPlayerPosition.x + 24,
          initialPlayerPosition.y,
          initialPlayerPosition.z + 24
        ),
        cameraTarget: Vector3.create(8 + 24, 1, 8 + 24)
      })
    }

    handleFrameEvents()

    let shootFramesInfo: any = null
    control.onShoot(({ impulse, delayMs }) => {
      if (state.reconnecting) return
      control.hide()
      gamePlayState.idle = false
      room.send(MESSAGE.SHOOT, { impulse, timeStep, delayMs })
    })

    let frameReproductor: any = null

    let lastPingTime = Date.now()
    let pingDisposed = false
    let pingInterval: any = null

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

    engine.addSystem(update)

    const STEPS_FPS = 60 * 4
    const timeStep = 1 / STEPS_FPS
    const ghostBalls: any[] = []
    // One visual ball per OTHER party member (index-aligned with partyPlayers).
    const partyBalls: any[] = []
    const GHOST_FPS = 30
    const GHOST_FMS = 1000 / GHOST_FPS
    let ghostInterval: any = null
    let timeInterval: any = null
    let startCountdownInterval: any = null
    let holeCountdownInterval: any = null
    let disposed = false

    listenPing()
    listenRoom()

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

    function listenPing() {
      lastPingTime = Date.now()
      room.send(MESSAGE.PING)
      // Self-terminating, same trap as storymode: the sandbox's setInterval and
      // clearInterval don't reliably pair, so the timer can outlive dispose()
      // and spam "readyState not OPEN" (CLAUDE.md §6 #23b).
      pingInterval = setInterval(() => {
        if (pingDisposed || disposed || state.reconnecting) return
        lastPingTime = Date.now()
        try {
          room.send(MESSAGE.PING)
        } catch (_) {
          pingDisposed = true
        }
      }, 5000)
    }

    function onMessagePong() {
      if (state.reconnecting) return
      reportPing(Date.now() - lastPingTime)
      room.send(MESSAGE.PING2)
    }

    // A season run reuses ONE room across 4 rounds, and colyseus.js gives us no
    // way to remove listeners, so round N's client is still subscribed when
    // round N+1 starts. Every handler goes through this guard so a disposed
    // round stops reacting.
    function cancellableCallback(fn: Function) {
      return (...args: any[]) => {
        if (!disposed) fn(...args)
      }
    }

    function onClientLog(data: any) {
      console.log('[season] CLIENT_LOG', data)
    }

    function listenRoom() {
      room.onLeave(cancellableCallback(onLeave))
      room.onMessage(MESSAGE.CLIENT_LOG, cancellableCallback(onClientLog))
      room.onMessage(MESSAGE.PONG, cancellableCallback(onMessagePong))
      room.onMessage(MESSAGE.SHOOT_FRAMES, cancellableCallback(onMessageShootFrames))
      room.onMessage(MESSAGE.START_SHOOT_FRAMES, cancellableCallback(onMessageStartShootFrame))
      room.onMessage(MESSAGE.COMPLETED, cancellableCallback(onMessageCompleted))
      room.onMessage(MESSAGE.START, cancellableCallback(onMessageStart))
      room.onMessage(MESSAGE.COUNTDOWN, cancellableCallback(onMessageHoleCountdown))
      room.onMessage(MESSAGE.END_COUNTDOWN, cancellableCallback(onMessageHoleEndCountdown))
      room.onMessage(MESSAGE.HOLE_SKIPPABLE, cancellableCallback(onMessageHoleSkippable))
    }

    // The first ball of the hole has dropped, so the hole may be skipped from
    // now on (server/rooms/hole-end.ts). A recorded opponent holing no longer
    // ends the hole, so this button is what a stuck player, or one who has
    // holed and does not want to watch the replays finish, presses instead.
    // The server decides what it means: in a party it only marks the sender
    // done unless they have been waiting a minute.
    function onMessageHoleSkippable() {
      mobileShootState.skip = () => {
        try {
          room.send(MESSAGE.SKIP_HOLE)
        } catch (err) {
          console.log('[golfplay] skip failed', err)
        }
      }
    }

    // The hole is over for this player (holed, or the round/room ended): give
    // back the normal camera and the avatars until the next hole's client takes
    // them again, and the legs for the rest of the hole (the "Ending in..."
    // wait; user, 2026-11-03), inside the scene's fence (avatar-lock.ts). They
    // are locked again when the hole ends. dispose() repeats it harmlessly.
    function releasePlayer() {
      aimCam?.release()
      showAvatars()
      freeAvatarForNow()
    }

    function onLeave(code: number) {
      console.log('[season] onLeave', code)
      if (code < 4000 && code !== 1000) {
        state.reconnecting = true
        reconnectRoom(
          colyseus,
          room.id,
          room.sessionId,
          (_room: any) => {
            state.reconnecting = false
            room = _room
            listenRoom()
          },
          () => {
            state.reconnecting = false
            showAvatars()
            // The room is gone for good and the run may never close: free the legs.
            unlockAvatar()
            callbacks.onFinish && callbacks.onFinish(code)
          }
        )
      } else {
        showAvatars()
        unlockAvatar()
        callbacks.onFinish && callbacks.onFinish(code)
      }
    }

    async function onMessageStart({ startTime, serverTime }: any) {
      const currentGameGhostsData = ghostsData?.[currentGame] || []
      const localStartTime = startTime - (serverTime - Date.now())
      const timeToStart = localStartTime - Date.now()

      hideWaitPlayers()

      // "Starting in... N"
      seasonCountdownState.visible = true
      startCountdownInterval = setInterval(() => {
        const remaining = localStartTime - Date.now()
        seasonCountdownState.text = 'Starting in...\n' + Math.floor(remaining / 1000).toString()
        if (remaining <= 0) {
          seasonCountdownState.visible = false
          clearInterval(startCountdownInterval)
          startCountdownInterval = null
        }
      }, 100)

      // Scoreboard rows: the local player's row and where the ghosts start (a
      // solo run is me + 3 ghosts; a party is the members, then 3 ghosts).
      const meIndex = partyPlayerIndex >= 0 ? partyPlayerIndex : 0
      const playerCount = partyPlayers ? partyPlayers.length : 1
      if (currentGame === 0) {
        inGameResults = inGameResults || createInGameResultsUi(room.state.results, meIndex, playerCount)
        // Colyseus schema listeners: any change to a player's row refreshes the
        // scoreboard. SDK6 wired onChange on the row, its time and its shots.
        room.state.results.forEach((playerResult: any) => {
          const refresh = () => inGameResults?.updateView(room.state.results, room.state.currentGame)
          playerResult.onChange = refresh
          if (playerResult.time) playerResult.time.onChange = refresh
          if (playerResult.shots) playerResult.shots.onChange = refresh
        })
      }

      if (!inGameResults) inGameResults = createInGameResultsUi(room.state.results, meIndex, playerCount)
      inGameResults.resetView()
      inGameResults.show()

      // Party: one extra visual ball per friend, driven by the server state
      // (each of them simulates their own physics, exactly like the live
      // tournament does).
      if (partyPlayers) {
        partyPlayers.forEach((p: any, index: number) => {
          if (index === partyPlayerIndex) return
          const [x, y, z] = initialPosDef.position
          partyBalls.push({
            index,
            visualBall: createVisualBall(parent, {
              position: Vector3.create(x, y, z),
              displayName: p.displayName,
              id: 20 + index,
              collectionId: courseDefinition.collectionId
            }),
            hidden: false
          })
        })
      }

      // Ghosts: one extra visual ball per recorded opponent, parked at the tee.
      currentGameGhostsData.forEach((g: any, index: number) => {
        const [x, y, z] = initialPosDef.position
        ghostBalls.push({
          visualBall: createVisualBall(parent, {
            position: Vector3.create(x, y, z),
            displayName: g.displayName,
            id: 10 + index,
            collectionId: courseDefinition.collectionId
          }),
          currentFrame: 0,
          finished: false,
          shooting: false,
          ...g
        })
      })

      setTimeout(() => {
        const idleStartTime: number[] = [0, 0, 0]
        ghostInterval = setInterval(() => {
          ghostBalls.forEach((ghost: any, index: number) => {
            if (ghost.finished) return
            const { visualBall, frames } = ghost
            if (!frames || !frames.length) return
            const frame = frames[ghost.currentFrame]
            if (!frame) {
              ghost.finished = true
              return
            }
            const [type] = frame

            if (type === GHOST_FRAME.IDLE) {
              idleStartTime[index] = idleStartTime[index] || Date.now()
              visualBall.changeColor && visualBall.changeColor('GREEN')
              const framesToPass = frame[4]
              const timeDiffInFrames = Math.floor((Date.now() - idleStartTime[index]) / GHOST_FMS)
              if (timeDiffInFrames > framesToPass) {
                idleStartTime[index] = 0
                ghost.currentFrame++
              }
            } else if (type === GHOST_FRAME.SHOOT) {
              visualBall.changeColor && visualBall.changeColor('RED')
              if (!ghost.shooting) {
                setTimeout(() => {
                  ghost.currentFrame++
                  ghost.shooting = false
                }, 400)
              }
              ghost.shooting = true
            } else if (type === GHOST_FRAME.MOVE) {
              visualBall.changeColor && visualBall.changeColor('BLUE')
              const [, gx, gy, gz] = frame
              visualBall.setPosition(Vector3.create(gx, gy, gz))
              ghost.currentFrame++
            } else if (type === GHOST_FRAME.HOLE) {
              visualBall.changeColor && visualBall.changeColor('YELLOW')
              ghost.finished = true
            }
          })
        }, GHOST_FMS)

        timeUI = timeUI || createInGameTime()
        timeUI.show()
        seasonHoleState.current = currentGame + 1
        timeInterval = setInterval(() => {
          if (room.state.finished) {
            clearInterval(timeInterval)
            timeInterval = null
          } else {
            timeUI && timeUI.updateMs(Date.now() - localStartTime)
          }
        }, 1000)
        start()
      }, timeToStart)
    }

    async function onMessageCompleted({
      xp,
      GC,
      time,
      shoots,
      PT,
      materialDrops,
      rewards,
      tierSub,
      newTierSub,
      rewardsBonus,
      // party runs only: false when the player was above the room's level and
      // therefore earned no season points
      eligible
    }: any) {
      console.log('[season] COMPLETED round', currentGame, 'tierSub', tierSub, '->', newTierSub)
      clearGhostTimers()
      releasePlayer()
      // The hole is over for everyone: no walking off during the results and
      // the next course's load (CLAUDE.md §6 #34).
      holdAvatarForRun()
      timeUI && timeUI.hide()
      await sleep(3000)
      callbacks.onComplete &&
        callbacks.onComplete({ xp, GC, PT, time, shoots, materialDrops, rewards, tierSub, newTierSub, rewardsBonus, eligible })
      inGameResults && inGameResults.hide()
    }

    function onMessageShootFrames({ impulse, frames }: any) {
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

    // Fired when an opponent holes out: the round ends in N seconds.
    async function onMessageHoleCountdown(ms: number) {
      seasonCountdownState.visible = true
      seasonCountdownState.text = ''
      let counter = Math.floor(ms / 1000)
      holeCountdownInterval = setInterval(() => {
        seasonCountdownState.text = 'Ending in...\n' + --counter
        if (counter <= 0 || room.state.finished || cancelEnding) {
          cancelEnding = false
          clearInterval(holeCountdownInterval)
          holeCountdownInterval = null
          seasonCountdownState.visible = false
        }
      }, 1000)
    }

    async function onMessageHoleEndCountdown() {
      cancelEnding = true
      // The hole is over: there is nothing left to skip.
      mobileShootState.skip = null
      // The hole ends: the legs are locked again before the fade to the results.
      holdAvatarForRun()
      // The fade is what has kept anyone from ever seeing the moment the
      // player is moved out of the scene (user, 2026-11-05): with the screen
      // black, you only find out where you ended up once it clears. Off while
      // that is being chased; FADE_BETWEEN_HOLES puts it back.
      if (FADE_BETWEEN_HOLES) await fadeInOverlay(3)
    }

    function handleFrameEvents() {
      frameEventHandler.onEvent(EVENT.EVENT_VARIABLE_CHANGE, ({ data }: any) => {
        Object.assign(expressionState, data.newValues)
        data.targetControlIds.forEach((partId: string) => visualCourse.applyReactiveValue(partId, expressionState))
      })

      frameEventHandler.onEvent(EVENT.SLEEP, () => {
        physicBall.body.sleep()
        setIdle()
      })

      frameEventHandler.onEvent(EVENT.HOLE, () => {
        gamePlayState.finished = true
        control.hide()
        releasePlayer()
        ball.reproduceSound('hole')
        ball.hide && ball.hide()
        visualCourse.reproduceHoleAction()
      })

      frameEventHandler.onEvent(EVENT.WIND, () => ball.reproduceSound('wind'))
      frameEventHandler.onEvent(EVENT.SAND, () => ball.reproduceSound('sand'))

      frameEventHandler.onEvent(EVENT.OUT, async () => {
        physicBall.body.sleep()
        await sleep(100)
        physicBall.body.position.set(positionBeforeShoot.x, positionBeforeShoot.y, positionBeforeShoot.z)
        await sleep(100)
        setIdle()
      })

      frameEventHandler.onEvent(EVENT.EXPLOSIVE, ({ data }: any) => {
        visualCourse.getParts()[data.id]?.reproduceAction()
      })
    }

    function update(dt: number) {
      if (!gamePlayState.started) return
      if (frameReproductor) frameReproductor.update(dt)
      if (!onlyServerPhysics) world.step(timeStep, dt)

      ball.setPosition(physicBall.body.position, physicBall.body.quaternion)

      // Friends' balls follow the server state; once they hole (or leave) their
      // ball goes away, same as the local one does on EVENT.HOLE.
      for (const partyBall of partyBalls) {
        const player = partyPlayers?.[partyBall.index]
        if (!player) continue
        if (player.holed || player.left) {
          if (!partyBall.hidden) {
            partyBall.hidden = true
            partyBall.visualBall.hide && partyBall.visualBall.hide()
          }
          continue
        }
        partyBall.visualBall.setPosition(Vector3.create(player.position.x, player.position.y, player.position.z))
      }

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

    function start() {
      gamePlayState.started = true
      setIdle()
      setTimeout(() => control.show(), 1)
    }

    function setIdle() {
      if (gamePlayState.finished) return
      gamePlayState.idle = true
      control.show()
      control.setPosition(physicBall.body.position)
    }

    function clearGhostTimers() {
      if (ghostInterval) {
        clearInterval(ghostInterval)
        ghostInterval = null
      }
      if (timeInterval) {
        clearInterval(timeInterval)
        timeInterval = null
      }
      if (startCountdownInterval) {
        clearInterval(startCountdownInterval)
        startCountdownInterval = null
      }
      if (holeCountdownInterval) {
        clearInterval(holeCountdownInterval)
        holeCountdownInterval = null
      }
    }

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
    function dispose() {
      // The course is the only ground the player has while a hole is on, and
      // the next one is not there yet. Put a floor under their feet before it
      // goes, or they fall and the explorer moves them out of the scene, which
      // is what players report as being teleported away (CLAUDE.md §6 #47).
      holdGroundUnderPlayer()
      disposed = true
      mobileShootState.quit = null
      mobileShootState.quitConfirm = false
      mobileShootState.skip = null
      pingDisposed = true
      clearInterval(pingInterval)
      clearGhostTimers()
      seasonCountdownState.visible = false
      visualChests.forEach((v: any) => v.dispose())
      frameEventHandler.dispose()
      gameHandler.dispose()
      // NOT now: the player is standing on it. unity-explorer carries the
      // player with the collider under their feet every frame
      // (InterpolateCharacterSystem), so a course removed from under them can
      // take them to another parcel, past every check movePlayerTo has. The
      // pad above went up first; these few frames are for the explorer to
      // make it the platform before the course leaves.
      // Colliders off first, so the explorer lets go of the player before
      // anything is removed; the parts leave a few frames later.
      try {
        visualCourse.releaseColliders()
      } catch (err) {
        console.log('[course] releasing colliders failed', err)
      }
      const courseToRemove = visualCourse
      setTimeout(() => {
        try {
          courseToRemove.dispose()
        } catch (err) {
          console.log('[season] course removal failed', err)
        }
      }, COURSE_REMOVE_DELAY_MS)
      control.dispose()
      aimCam?.dispose()
      ball.dispose()
      // Each round creates its own ghost balls; they must all go or they pile up
      // across the 4 rounds (SDK7 removeEntity does not cascade, CLAUDE.md §6 #11).
      ghostBalls.forEach((gb: any) => gb.visualBall.dispose())
      ghostBalls.length = 0
      partyBalls.forEach((pb: any) => pb.visualBall.dispose())
      partyBalls.length = 0
      engine.removeSystem(update)
      callbacks.onFinish = null
      callbacks.onComplete = null
      showAvatars()
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

// SDK6 had a "fix bug" sprite button to reset a stuck course. Kept as the same
// no-op stub the storymode client already imports from here.
export const createFixBugButton = async (_visualCourse?: any, _onClick?: () => void) => ({
  hide: () => {}
})

// Hides every season in-game overlay at once (used when a run is cancelled).
export const hideSeasonInGameUi = () => hideSeasonHud()

export { GolfplayClientSeasonFactory }
