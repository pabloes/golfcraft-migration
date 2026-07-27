// @ts-ignore - common/utils has @ts-nocheck
import { lerp, slerp } from '../../../../common/utils'
import { GameplayHandler } from './handler-def'

export const animationHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, movingPhysicParts } = gameplay
  const definitionMovingParts = courseDefinition.parts.filter((p: any) => p.animation)
  const handlerState = { globalAnimationDt: 0 }
  const backupState = { globalAnimationDt: 0 }
  let eventFilterCount = 0

  return {
    id: 'animation',
    update,
    onEvent,
    saveState,
    restoreState,
    getState
  } as any

  function getState() {
    return handlerState
  }

  function saveState() {
    backupState.globalAnimationDt = handlerState.globalAnimationDt
  }

  function restoreState() {
    handlerState.globalAnimationDt = backupState.globalAnimationDt
  }

  function onEvent(_fn: Function) {
    // Animation handler doesn't emit events.
  }

  function update(dt: number) {
    eventFilterCount += dt
    if (eventFilterCount > 0.5) eventFilterCount = 0

    handlerState.globalAnimationDt += dt
    const globalDt = handlerState.globalAnimationDt

    definitionMovingParts.forEach((definitionMovingPart: any) => {
      const partAnimationTime = globalDt % definitionMovingPart.partAnimationTotalTime
      const currentTransitionIndex = definitionMovingPart.animationTransitions.findIndex(
        (t: any) => partAnimationTime < t.targetTime
      )
      const currentTransition = definitionMovingPart.animationTransitions[currentTransitionIndex]
      const currentTransitionDt = partAnimationTime - definitionMovingPart.animationFrameTimes[currentTransitionIndex]
      const physicPart = movingPhysicParts[definitionMovingPart.id]
      if (!physicPart) return

      physicPart.bodies.forEach((body: any) => {
        const { x, y, z } = definitionMovingPart.animation.kinematics[currentTransitionIndex].velocity
        body.velocity.set(x, y, z)
      })

      const { x: lx, y: ly, z: lz } = lerp(
        definitionMovingPart.animation.kinematics[currentTransitionIndex].position,
        definitionMovingPart.animation.kinematics[currentTransitionIndex + 1].position,
        currentTransitionDt / currentTransition.duration
      )
      physicPart.bodies.forEach((body: any) => {
        body.position.set(lx, ly, lz)
      })

      const { x: sx, y: sy, z: sz, w: sw } = slerp(
        definitionMovingPart.animation.kinematics[currentTransitionIndex].quaternion,
        definitionMovingPart.animation.kinematics[currentTransitionIndex + 1].quaternion,
        currentTransitionDt / currentTransition.duration
      )
      physicPart.bodies.forEach((body: any) => {
        body.quaternion.set(sx, sy, sz, sw)
      })
    })
  }
}
