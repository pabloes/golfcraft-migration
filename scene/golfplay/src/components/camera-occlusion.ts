// Hides the course parts that stand between the aim camera and the ball, and
// shows them again as soon as they no longer block the view. Active while the
// player is lining up a shot (the shoot control's `visible`, mirrored in
// mobileShootState on every platform) AND while the ball is rolling and the
// camera is following it (user, 2026-11-06), which is the other half of the
// time a wall stands between the player and what they are watching. `camera` is the
// orbit camera's entity, or on phones a probe that anchor-camera.ts keeps at
// the explorer camera's position.
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
// The ball counts as rolling once it has moved this far between two frames,
// and stays "rolling" for a moment after it stops, so a ball that crawls or
// pauses against a wall doesn't make the parts flicker back and forth.
const MOVE_EPS = 0.01
const MOVING_TAIL_MS = 500
// stop just short of the ball, so the ball's own surroundings never count
const BALL_MARGIN = 0.1
// a ray whose result never arrives (an explorer without raycasts) is dropped
const RESULT_TIMEOUT_MS = 1000

type Vec3Like = { x: number; y: number; z: number }

// A hit at or below the ball's centre is the ground the ball sits on (or a
// border level with it), never something in front of it: the ray descends
// from the camera, so anything that really blocks the view is hit higher.
const ABOVE_BALL = 0.05

export const createCameraOcclusion = (camera: Entity, ballEntity: Entity, getDistance: () => number, getBallPosition: () => Vec3Like) => {
  // hidden part -> checks in a row that didn't hit it
  const hidden = new Map<Entity, number>()
  let sinceCheck = 0
  let sentAt = 0
  // Where the ball was last frame, and until when it counts as rolling.
  let lastBall: Vec3Like | null = null
  let movingUntil = 0

  const setOccluded = (part: Entity, value: boolean) => occludableParts.get(part)?.(value)

  function showAll() {
    hidden.forEach((_, part) => setOccluded(part, false))
    hidden.clear()
  }

  function onResult(hits: ReadonlyArray<{ readonly entityId?: number; readonly position?: Vec3Like }>) {
    sentAt = 0
    if (!mobileShootState.visible) return
    // the course sits under the scene root at y = 0, so local and global y match
    const floorLine = getBallPosition().y + ABOVE_BALL
    const blocking = new Set<Entity>()
    for (const hit of hits) {
      const part = hit.entityId as Entity | undefined
      if (part === undefined || !occludableParts.has(part)) continue
      if (hit.position && hit.position.y < floorLine) continue
      blocking.add(part)
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
    // Not only while lining up a shot: also while the camera is following the
    // ball (user, 2026-11-06), which is exactly when a wall between the two
    // hides the thing the player is watching. Rolling is read from the ball
    // itself rather than wired in from the clients, so it works the same for
    // both aim cameras and needs nothing passed down.
    const ball = getBallPosition()
    if (lastBall) {
      const moved = Math.abs(ball.x - lastBall.x) + Math.abs(ball.y - lastBall.y) + Math.abs(ball.z - lastBall.z)
      if (moved > MOVE_EPS) movingUntil = Date.now() + MOVING_TAIL_MS
    }
    lastBall = { x: ball.x, y: ball.y, z: ball.z }

    if (!mobileShootState.visible && Date.now() > movingUntil) {
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
