// Which camera aims the shot in CAMERA_AIM_MODE.
//
// Desktop: the orbit camera (orbit-camera.ts), a VirtualCamera circling the
// ball that the mouse and A/D turn. Phones: the mobile explorer does not update
// PrimaryPointerInfo during a touch drag while a VirtualCamera is active, so
// the orbit could only be turned with the panel's arrows there. With
// MOBILE_ANCHOR_CAMERA the phone gets anchor-camera.ts instead: the hidden
// avatar stands on the ball and the explorer's own third-person camera, which
// the native touch drag turns, is the aim. Both hand the shoot control the same
// handle (getYaw / release / dispose).
import { Entity } from '@dcl/sdk/ecs'

import { MOBILE_ANCHOR_CAMERA } from '../../../src/config/controls'
import { isMobile } from '../../../src/services/platform'
import { createAvatarAnchorCamera } from './anchor-camera'
import { createBallOrbitCamera } from './orbit-camera'

type Vec3Like = { x: number; y: number; z: number }

export type AimCameraOptions = {
  // The visual ball entity (lookAtEntity, occlusion raycast target).
  ballEntity: Entity
  // Physics ball, in course coordinates (local to the scene root at 24,0,24).
  getBallPosition: () => Vec3Like
  // The tee's rotation, so the first aim is the one the course intends.
  initialRotation: number[]
}

export type AimCamera = {
  // The aim, in degrees: the shot leaves along (sin yaw, 0, cos yaw).
  getYaw: () => number
  // The hole is over for this player: hand back camera and legs (unless a
  // Season run holds the legs, avatar-lock.ts).
  release: () => void
  dispose: () => void
}

export const createAimCamera = (parent: Entity, options: AimCameraOptions): AimCamera =>
  isMobile() && MOBILE_ANCHOR_CAMERA ? createAvatarAnchorCamera(parent, options) : createBallOrbitCamera(parent, options)
