// Hides the course parts that stand between the orbit camera and the ball
// while the player is lining up a shot, and shows them again as soon as they
// no longer block the view or the shot is taken (the shoot control's
// `visible`, mirrored in mobileShootState on every platform).
//
// A ray from the camera to the ball, on the layer the model parts collide on
// (visual-part.ts OCCLUSION_LAYER), every CHECK_EVERY seconds. The camera never
// tilts below the ball (ORBIT_PITCH_MIN > 0), so the ray stays above the floor
// the ball rests on and only walls, decorations or a slope in front count.
// A part only comes back after MISSES_TO_SHOW checks without a hit, so one
// missed ray doesn't make it flicker.
import { Entity, RaycastQueryType, engine, raycastSystem } from '@dcl/sdk/ecs'

import { OCCLUSION_LAYER, occludableParts } from './course/visual-part'
import { mobileShootState } from '../../../src/ui/mobile-shoot-state'

const CHECK_EVERY = 0.15
const MISSES_TO_SHOW = 2
// stop just short of the ball, so the ball's own surroundings never count
const BALL_MARGIN = 0.1
// a ray whose result never arrives (an explorer without raycasts) is dropped
const RESULT_TIMEOUT_MS = 1000

export const createCameraOcclusion = (camera: Entity, ballEntity: Entity, getDistance: () => number) => {
  // hidden part -> checks in a row that didn't hit it
  const hidden = new Map<Entity, number>()
  let sinceCheck = 0
  let sentAt = 0

  const setOccluded = (part: Entity, value: boolean) => occludableParts.get(part)?.(value)

  function showAll() {
    hidden.forEach((_, part) => setOccluded(part, false))
    hidden.clear()
  }

  function onResult(hits: ReadonlyArray<{ readonly entityId?: number }>) {
    sentAt = 0
    if (!mobileShootState.visible) return
    const blocking = new Set<Entity>()
    for (const hit of hits) {
      const part = hit.entityId as Entity | undefined
      if (part !== undefined && occludableParts.has(part)) blocking.add(part)
    }
    blocking.forEach((part) => {
      if (!hidden.has(part)) setOccluded(part, true)
      hidden.set(part, 0)
    })
    hidden.forEach((misses, part) => {
      if (blocking.has(part)) return
      if (misses + 1 >= MISSES_TO_SHOW || !occludableParts.has(part)) {
        setOccluded(part, false)
        hidden.delete(part)
      } else {
        hidden.set(part, misses + 1)
      }
    })
  }

  function system(dt: number) {
    if (!mobileShootState.visible) {
      if (hidden.size) showAll()
      sinceCheck = CHECK_EVERY
      return
    }
    sinceCheck += dt
    if (sentAt && Date.now() - sentAt < RESULT_TIMEOUT_MS) return
    if (sinceCheck < CHECK_EVERY) return
    sinceCheck = 0
    sentAt = Date.now()
    raycastSystem.registerTargetEntityRaycast(
      {
        entity: camera,
        opts: {
          targetEntity: ballEntity,
          collisionMask: OCCLUSION_LAYER,
          queryType: RaycastQueryType.RQT_QUERY_ALL,
          maxDistance: Math.max(0, getDistance() - BALL_MARGIN),
          continuous: false
        }
      },
      (result) => onResult(result.hits || [])
    )
  }

  engine.addSystem(system)

  return {
    dispose() {
      engine.removeSystem(system)
      raycastSystem.removeRaycasterEntity(camera)
      showAll()
    }
  }
}
