import CANNON from 'cannon'
import { createEventManager } from '../services/EventManagerFactory'
import { zoneHandler } from './training-zone-handler'
import { voxtersHandler } from './training-voxters-handler'
import { animationHandler as animationHandlerFn } from './animation-handler'
import { magnetHandler } from './magnet-handler'
import { windHandler, sandHandler } from './fx-handler'
import { explosiveHandler } from './explosive-handler'
import { BALL_SLEEP_TIMEOUT, BALL_SLEEP_VEL } from '../../../../common/physics-config'
import { EVENT, GameplayHandler } from './handler-def'
import { createSmartPart } from './smart-part'
import ExpressionStorage from '../../../../lib/expression-storage/_expression-storage'
import { directionAreaHandler } from './direction-area-handler'
import { partsWithHole } from '../editor/hole-part-registry'

const { createExpressionStorage } = ExpressionStorage

export type FrameData = {
  data: {
    partId: any
    currentFrame: any
    kinematics: any
    endKinematics: any
    duration: any
    start: any
  }
}

const createGameHandler = ({
  gameType,
  world,
  ballBody,
  state,
  courseDefinition,
  movingPhysicParts,
  parts,
  excludeHandlers,
  onExpressionEvent,
  applySmartParts
}: any) => {
  const gameEvents = createEventManager()
  const runtimeAssignments = courseDefinition.expressions?.assignments
  let disposed = false
  state.disabledEvents = false

  let handlers: any = getGameHandlersFromCourse(courseDefinition, excludeHandlers).map((h: any) =>
    h(world, gameEvents, { ballBody, state, courseDefinition, movingPhysicParts })
  )

  const animationHandlerInstance = handlers.find((h: any) => h.id === 'animation')

  function decorateInitialStateWithStorageDefaults(_initialState: any, courseDefinition: any) {
    const initialState = { ..._initialState }
    courseDefinition.parts.forEach((partInstanceDef: any) => {
      if (
        partInstanceDef?.expressions?.runtime?.storage &&
        !initialState[partInstanceDef?.expressions.runtime.storage]
      ) {
        initialState[partInstanceDef.expressions.runtime.storage] = getDefaultStorageValuePerType(
          partInstanceDef.subtype
        )
      }
    })
    return initialState

    function getDefaultStorageValuePerType(subtype: string) {
      if (subtype && subtype.indexOf('control_switch') !== -1) {
        return false
      }
    }
  }

  const eStorage = createExpressionStorage(
    {
      seed: courseDefinition.expressions?.seed,
      ...decorateInitialStateWithStorageDefaults(courseDefinition.expressions?.initialState || {}, courseDefinition)
    },
    courseDefinition.expressions?.initialAssignments
  )

  eStorage.onEvent((event: any) => {
    if (onExpressionEvent) onExpressionEvent(event)
    gameEvents.trigger({ type: EVENT.EVENT_VARIABLE_CHANGE, data: event.data })
  })

  const smartParts: any[] =
    (applySmartParts &&
      courseDefinition.parts
        .filter((p: any) => p.expressions?.runtime)
        .map((partDef: any) => {
          return createSmartPart(parts[partDef.id] || { definition: partDef, bodies: [] }, ballBody, eStorage)
        })) ||
    []

  if (runtimeAssignments) {
    Object.keys(runtimeAssignments).forEach((assignmentStorage: string) => {
      eStorage.addRuntimeAssignment({ storage: assignmentStorage, ...runtimeAssignments[assignmentStorage] })
    })
  }

  let ballBackup: any
  let frameEvents: any[] = []
  gameEvents.onEvent(EVENT.ANY, (event: any) => {
    frameEvents.push(event)
  })

  return {
    getExpressionState: () => eStorage.getState(),
    update: (dt: number, onlyAnimations?: boolean, isSimulation?: boolean) => {
      if (disposed) return []
      if (onlyAnimations) {
        animationHandlerInstance && animationHandlerInstance.update(dt, onlyAnimations, isSimulation)
      } else {
        handlers && handlers.forEach((handler: any) => handler.update(dt, false, isSimulation))
      }
      smartParts.forEach((s: any) => s.update(dt))
      const updateEvents = frameEvents
      frameEvents = []
      return updateEvents
    },
    dispose: () => {
      disposed = true
      gameEvents.dispose()
      handlers = null
    },
    setAnimationGlobalDt: (value: number) => {
      if (animationHandlerInstance) {
        animationHandlerInstance.getState().globalAnimationDt = value
        animationHandlerInstance.update(0)
      }
    },
    getAnimationGlobalDt: () => animationHandlerInstance && animationHandlerInstance.getState().globalAnimationDt,
    onEvent: (type: number, fn: Function) =>
      gameEvents.onEvent(type, (...args: any[]) => {
        if (disposed) return
        if (state.disabledEvents) return
        fn(...args)
      }),
    disableEvents: () => {
      state.disabledEvents = true
    },
    enableEvents: () => {
      state.disabledEvents = false
    },
    saveState: () => {
      if (disposed) return
      handlers.forEach((h: any) => h.saveState && h.saveState())
      ballBackup = {
        position: { x: ballBody.position.x, y: ballBody.position.y, z: ballBody.position.z },
        velocity: { x: ballBody.velocity.x, y: ballBody.velocity.y, z: ballBody.velocity.z },
        angularVelocity: {
          x: ballBody.angularVelocity.x,
          y: ballBody.angularVelocity.y,
          z: ballBody.angularVelocity.z
        },
        quaternion: {
          x: ballBody.quaternion.x,
          y: ballBody.quaternion.y,
          z: ballBody.quaternion.z,
          w: ballBody.quaternion.w
        }
      }
    },
    restoreState: () => {
      if (disposed || !ballBackup) return
      handlers.forEach((h: any) => h.restoreState && h.restoreState())
      copyCoords(ballBackup.position, ballBody.position)
      copyCoords(ballBackup.velocity, ballBody.velocity)
      copyCoords(ballBackup.angularVelocity, ballBody.angularVelocity)
      copyCoords(ballBackup.quaternion, ballBody.quaternion)
    }
  }

  function copyCoords(source: any, target: { set: Function }) {
    source.w ? target.set(source.x, source.y, source.z, source.w) : target.set(source.x, source.y, source.z)
  }
}

export { createGameHandler }

function getGameHandlersFromCourse(courseDefinition: any, excludeHandlers?: string[]) {
  const result: GameplayHandler[] = [outHandler, sleepHandler]
  if (courseDefinition.parts.find((p: any) => Object.keys(partsWithHole).indexOf(p.subtype) > -1)) {
    result.push(holeHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'checkpoint')) {
    result.push(checkpointHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'wind')) {
    result.push(windHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.subtype === 'direction_area')) {
    result.push(directionAreaHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'sand')) {
    result.push(sandHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'zone')) {
    result.push(zoneHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'voxter')) {
    result.push(voxtersHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'explosive' || p.subtype === 'explosive_mine')) {
    result.push(explosiveHandler)
  }
  if (courseDefinition.parts.find((p: any) => p.type === 'magnet')) {
    result.push(magnetHandler)
  }
  if (
    courseDefinition.parts.find((p: any) => p.animation) &&
    !((excludeHandlers || []).indexOf('animation') >= 0)
  ) {
    result.push(animationHandlerFn)
  }

  return result
}

const outHandler: GameplayHandler = (_world: any, gameEvents: any, gameplay: any) => {
  const { ballBody, state } = gameplay
  return { onEvent, update } as any

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.OUT, fn)
  }

  function update(_dt: number) {
    if (state.idle) return
    if (ballBody.position.y < -2) {
      gameEvents.trigger({ type: EVENT.OUT, data: { position: ballBody.position } })
    }
  }
}

const sleepHandler: GameplayHandler = (_world: any, gameEvents: any, gameplay: any) => {
  const { ballBody, state } = gameplay
  const handlerState = { counter: 0 }
  const backupState = { counter: 0 }
  return {
    onEvent,
    update,
    saveState: () => (backupState.counter = handlerState.counter),
    restoreState: () => (handlerState.counter = backupState.counter)
  } as any

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.SLEEP, fn)
  }

  function update(dt: number) {
    if (state.idle) return
    if (ballBody.position.y <= -0.6) return

    const vel = ballBody.velocity.length()

    if (vel < BALL_SLEEP_VEL) {
      handlerState.counter += dt
      if (handlerState.counter >= BALL_SLEEP_TIMEOUT) {
        gameEvents.trigger({ type: EVENT.SLEEP, data: { position: ballBody.position } })
        ballBody.velocity.set(0, 0, 0)
        ballBody.angularVelocity.set(0, 0, 0)
        handlerState.counter = 0
      }
    } else {
      handlerState.counter = 0
    }
  }
}

const holeHandler: GameplayHandler = (_world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const hole = courseDefinition.parts.find((p: any) => Object.keys(partsWithHole).indexOf(p.subtype) > -1)
  const hole_visible_position = new CANNON.Vec3(hole.position[0], hole.position[1], hole.position[2])
  const hole_visible_rotation = new CANNON.Vec3(hole.rotation[0], hole.rotation[1], hole.rotation[2])
  const hole_sensor_local_position = new CANNON.Vec3(
    -(partsWithHole as any)[hole.subtype][0],
    -(partsWithHole as any)[hole.subtype][1],
    -(partsWithHole as any)[hole.subtype][2]
  )

  const hole_sensor_global_position = hole_visible_position.vadd(
    rotateVectorByEuler(hole_sensor_local_position, hole_visible_rotation)
  )

  return {
    update,
    onEvent,
    enable: (_value: any) => {}
  } as any

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.HOLE, fn)
  }

  function update(_dt: number) {
    if (state.idle || state.finished) return
    const distance = hole_sensor_global_position.distanceTo(ballBody.position)
    if (distance < 0.4) {
      gameEvents.trigger({ type: EVENT.HOLE, data: {} })
      state.finished = true
    }
  }
}

const checkpointHandler: GameplayHandler = (_world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const checkpoints = courseDefinition.parts.filter((p: any) => p.type === 'checkpoint')
  const handlerState = { currentCheck: 0 }

  return {
    update,
    onEvent,
    enable: (_value: any) => {},
    saveState: () => {},
    restoreState: () => {}
  } as any

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.CHECKPOINT, fn)
  }

  function update(_dt: number, _animationsOnly?: boolean, isSimulation?: boolean) {
    if (state.idle || state.finished || !isSimulation) return
    const checkpoint = checkpoints[handlerState.currentCheck]
    const [x2, y2, z2] = checkpoint.position
    const { x, y, z } = ballBody.position
    const distance = Math.pow(Math.pow(x2 - x, 2) / 2 + Math.pow(y2 - y, 2) / 2 + Math.pow(z2 - z, 2), 0.5)
    if (distance < 0.5) {
      if (handlerState.currentCheck === checkpoints.length - 1) {
        state.finished = true
      }
      gameEvents.trigger({
        type: EVENT.CHECKPOINT,
        data: { index: handlerState.currentCheck, checkpoint: { ...checkpoint } }
      })
      handlerState.currentCheck++
    }
  }
}

function rotateVectorByEuler(vector: any, rotation: any): any {
  const radiansX = degreesToRadians(rotation.x)
  const radiansY = degreesToRadians(rotation.y)
  const radiansZ = degreesToRadians(rotation.z)

  const cosX = Math.cos(radiansX)
  const sinX = Math.sin(radiansX)
  const cosY = Math.cos(radiansY)
  const sinY = Math.sin(radiansY)
  const cosZ = Math.cos(radiansZ)
  const sinZ = Math.sin(radiansZ)

  return new CANNON.Vec3(
    vector.x * (cosY * cosZ) + vector.y * (-cosY * sinZ) + vector.z * sinY,
    vector.x * (sinX * sinY * cosZ + cosX * sinZ) +
      vector.y * (sinX * sinY * sinZ - cosX * cosZ) +
      vector.z * (-sinX * cosY),
    vector.x * (-cosX * sinY * cosZ + sinX * sinZ) +
      vector.y * (-cosX * sinY * sinZ - sinX * cosZ) +
      vector.z * (cosX * cosY)
  )
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}
