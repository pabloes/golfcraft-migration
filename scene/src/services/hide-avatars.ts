// SDK6 services/hide-avatars.ts: while a hole is played, an AvatarModifierArea
// over the course hides the other players and disables their passports. SDK6
// kept the player's own avatar visible; with the camera circling the ball
// (CAMERA_AIM_MODE) it would only be in the way, so it is hidden too. On
// phones the anchor camera (anchor-camera.ts) relies on this: the hidden
// avatar stands on the ball and the explorer's camera orbits it.
import { AvatarModifierArea, AvatarModifierType, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { isCameraAimMode } from './game-options'

let modArea: Entity | null = null

export const hideAvatars = () => {
  if (modArea !== null) return
  const userId = getPlayer()?.userId
  modArea = engine.addEntity()
  Transform.create(modArea, { position: Vector3.create(24, 0, 24) })
  AvatarModifierArea.create(modArea, {
    area: Vector3.create(16 * 3, 40, 16 * 3),
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: isCameraAimMode() || !userId ? [] : [userId]
  })
}

export const showAvatars = () => {
  if (modArea === null) return
  engine.removeEntity(modArea)
  modArea = null
}
