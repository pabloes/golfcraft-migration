import CANNON from 'cannon'
import { EVENT, GameplayHandler } from './handler-def'
// @ts-ignore - common/utils has @ts-nocheck
import { cloneJSON, isInsideBox } from '../../../../common/utils'

export const directionAreaHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const winds = courseDefinition.parts.filter((p: any) => p.subtype === 'direction_area')

  const handlerState: { inWind: boolean[] } = { inWind: [] }
  const backupState = cloneJSON(handlerState)
  const FORCE = 120

  const WIND_POSITIONS_WITH_OFFSET = winds.map((wind: any) => [wind.position[0], wind.position[1] + 0.25, wind.position[2]])
  const BOX_SCALE = [2, 0.25, 2]

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
    winds.forEach((wind: any, index: number) => {
      if (isInsideBox(WIND_POSITIONS_WITH_OFFSET[index], BOX_SCALE, ballBody.position)) {
        if (!handlerState.inWind[index]) {
          gameEvents.trigger({ type: EVENT.WIND, data: {} })
        }
        handlerState.inWind[index] = true
        const [rx, ry, rz, rw] = wind.rotation
        const q = new CANNON.Quaternion(rx, ry, rz, rw)
        const vector = wind.rotation.every((r: number) => !r)
          ? new CANNON.Vec3(0, 0, dt * FORCE)
          : q.vmult(new CANNON.Vec3(0, 0, dt * FORCE))

        ballBody.applyForce(vector, ballBody.position)
      } else {
        handlerState.inWind[index] = false
      }
    })
  }
}
