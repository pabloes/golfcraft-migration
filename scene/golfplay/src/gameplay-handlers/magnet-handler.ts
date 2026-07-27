import CANNON from 'cannon'
import { EVENT, GameplayHandler } from './handler-def'

export const magnetHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const magnets = courseDefinition.parts.filter((p: any) => p.type === 'magnet')

  const scales = magnets.reduce((acc: any, magnet: any) => {
    acc[magnet.id] = magnet?.expressions?.physics?.radius ? magnet.expressions.physics.radius : 2
    return acc
  }, {} as any)

  return {
    update,
    onEvent,
    enable: (_value: any) => {},
    saveState: () => {},
    restoreState: () => {}
  }

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.WIND, fn)
  }

  function update(dt: number) {
    if (state.idle || state.finished) return
    magnets.forEach((magnet: any) => {
      if (isInsideSphere(magnet.position, scales[magnet.id], ballBody.position)) {
        const [px, py, pz] = magnet.position
        const magnetPosition = new CANNON.Vec3(px, py, pz)

        const distance = ballBody.position.distanceTo(magnetPosition)
        const MULT = Number(magnet.expressions?.physics?.force || 150)
        const force = (dt * MULT) / distance
        const diffVector = magnetPosition.vsub(ballBody.position)
        diffVector.normalize()

        ballBody.applyForce(diffVector.mult(force), ballBody.position)
      }
    })

    function isInsideSphere(position: number[], radius: number, ballPosition: any) {
      const [px, py, pz] = position
      return ballPosition.distanceTo(new CANNON.Vec3(px, py, pz)) < radius
    }
  }
}
