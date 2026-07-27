import CANNON from 'cannon'
import { EVENT, GameplayHandler } from './handler-def'
// @ts-ignore
import { cloneJSON, isInsideBox } from '../../../../common/utils'

export const windHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const winds = courseDefinition.parts.filter((p: any) => p.type === 'wind')

  const handlerState = { inWind: false }
  const backupState = cloneJSON(handlerState)
  return {
    update,
    onEvent,
    enable: (_value: any) => {},
    saveState: () => Object.assign(backupState, handlerState),
    restoreState: () => Object.assign(handlerState, backupState)
  }

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.WIND, fn)
  }

  function update(dt: number) {
    if (state.idle || state.finished) return
    winds.forEach((wind: any) => {
      if (isInsideBox(wind.position, wind.scale, ballBody.position)) {
        if (!handlerState.inWind) gameEvents.trigger({ type: EVENT.WIND, data: {} })
        handlerState.inWind = true
        const [rx, ry, rz, rw] = wind.rotation
        const q = new CANNON.Quaternion(rx, ry, rz, rw)
        const vector = q.vmult(new CANNON.Vec3(0, 0, dt * 80))
        ballBody.applyForce(vector, ballBody.position)
      } else {
        handlerState.inWind = false
      }
    })
  }
}

export const sandHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const sands = courseDefinition.parts.filter((p: any) => p.type === 'sand')
  const handlerState = { currentCheck: 0, inSand: false }
  const backupState = cloneJSON(handlerState)
  return {
    update,
    onEvent,
    enable: (_value: any) => {},
    saveState: () => Object.assign(backupState, handlerState),
    restoreState: () => Object.assign(handlerState, backupState)
  }

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.SAND, fn)
  }

  function update(_dt: number) {
    if (state.idle || state.finished) return
    if (sands.length === 0) return
    const sand = sands[handlerState.currentCheck]

    if (isInsideBox(sand.position, sand.scale, ballBody.position)) {
      if (!handlerState.inSand) gameEvents.trigger({ type: EVENT.SAND, data: {} })
      handlerState.inSand = true
      const coefficient = 0.09
      const speed = ballBody.velocity.length()
      const dragMagnitude = coefficient * Math.pow(speed, 2)
      const drag = ballBody.velocity.clone()
      drag.scale(-1, drag)
      drag.normalize()
      drag.scale(dragMagnitude, drag)
      ballBody.applyForce(drag, ballBody.position)
      ballBody.angularVelocity = new CANNON.Vec3()
    } else {
      handlerState.inSand = false
    }

    handlerState.currentCheck++
    if (handlerState.currentCheck === sands.length) handlerState.currentCheck = 0
  }
}
