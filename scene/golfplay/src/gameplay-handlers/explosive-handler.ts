import CANNON from 'cannon'
import { EVENT, GameplayHandler } from './handler-def'
// @ts-ignore
import { cloneJSON, isInsideBox } from '../../../../common/utils'

export const explosiveHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const explosives = courseDefinition.parts.filter(
    (p: any) => p.type === 'explosive' || p.subtype === 'explosive_mine'
  )
  const handlerState = {
    currentCheck: 0,
    explosives: explosives.reduce(
      (acc: any, explosive: any) => ((acc[explosive.id] = { exploded: false }), acc),
      {} as any
    )
  }
  const scales = explosives.reduce((acc: any, explosive: any) => {
    acc[explosive.id] = explosive.expressions?.physics?.scale?.map((s: any) => Number(s)) || explosive.scale
    return acc
  }, {} as any)
  const FORCE_UP = 60
  const FORCE_DIRECTION = 220

  return {
    update,
    onEvent,
    enable: (_value: any) => {}
  }

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.EXPLOSIVE, fn)
  }

  function update(_dt: number) {
    if (state.idle || state.finished) return

    explosives
      .filter((e: any) => !handlerState.explosives[e.id].exploded)
      .forEach((explosive: any) => {
        if (isInsideBox(explosive.position, scales[explosive.id], ballBody.position)) {
          handlerState.explosives[explosive.id].exploded = true
          gameEvents.trigger({ type: EVENT.EXPLOSIVE, data: explosive })

          const [rx, ry, rz, rw] = explosive.rotation
          const q = new CANNON.Quaternion(rx, ry, rz, rw)
          const vectorUp = q.vmult(
            new CANNON.Vec3(0, Number(explosive.expressions?.physics?.forceUp || FORCE_UP), 0)
          )
          const [px, py, pz] = explosive.position
          const directionForce = ballBody.position.vsub(new CANNON.Vec3(px, py, pz))
          directionForce.normalize()
          ballBody.applyForce(vectorUp, ballBody.position)
          ballBody.applyForce(
            directionForce.mult(Number(explosive.expressions?.physics?.forceDirection || FORCE_DIRECTION)),
            ballBody.position
          )
        }
      })
  }
}
