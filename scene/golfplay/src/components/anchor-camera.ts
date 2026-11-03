// Aim camera for phones (MOBILE_ANCHOR_CAMERA): the avatar stands on the ball,
// hidden, and the explorer's own third-person camera is the aim.
//
// The orbit camera (orbit-camera.ts) is a VirtualCamera, and the mobile
// explorer does not update PrimaryPointerInfo during a touch drag while one is
// active, so on a phone the orbit could not be turned by dragging. Here the
// hole goes through three phases:
//   - overview: from the hole's creation until the player's first turn (the
//     READY / "Starting in..." time), a VirtualCamera high behind the tee,
//     looking at the ball.
//   - aim: the player's turn (the shoot control shows: mobileShootState.visible).
//     The avatar is teleported onto the ball with movePlayerTo, kept still
//     (avatar-lock.ts) and hidden (services/hide-avatars.ts hides every avatar
//     over the course, the player's own included), and the explorer's
//     third-person camera, which the native touch drag turns, gives the heading:
//     the shot leaves where the camera looks. No VirtualCamera is active, so the
//     drag works.
//   - roll: from the shot until the ball sleeps, a VirtualCamera that starts
//     where the explorer camera was and follows the ball, as the orbit camera
//     does on desktop. When the ball stops the avatar is moved onto it under
//     that camera, and the view is handed back to the explorer camera.
// The parts between the camera and the ball still step aside
// (camera-occlusion.ts) through a probe entity kept at the active camera's
// position, because a raycast is cast from an entity.
import { CameraModeArea, CameraType, Entity, MainCamera, Transform, VirtualCamera, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { ORBIT_DISTANCE, ORBIT_FOLLOW_SMOOTH, ORBIT_PITCH } from '../../../src/config/controls'
import { mobileShootState } from '../../../src/ui/mobile-shoot-state'
import type { AimCamera, AimCameraOptions } from './aim-camera'
import { holdAvatar, releaseAvatar } from './avatar-lock'
import { createCameraOcclusion } from './camera-occlusion'

// Metres ahead of the ball the camera is pointed at when the avatar lands on it,
// and how far below the ball: from an eye some 1.6 m up that is a tilt of about
// 24° down (the orbit camera's ORBIT_PITCH), so the ball at the avatar's feet
// sits in the frame and not under the panel's SHOOT button. The touch drag
// tilts it afterwards anyway.
const LOOK_AHEAD = 8
const LOOK_AHEAD_Y = -2
// The overview before the hole starts: metres behind the tee (against the
// tee's heading) and above the ball.
const OVERVIEW_BACK = 10
const OVERVIEW_UP = 12
// After movePlayerTo the explorer takes a few frames to put the avatar down and
// turn its camera towards cameraTarget; the VirtualCamera stays on meanwhile,
// so the move is never seen, and only then is the view handed back.
const HANDOVER_MS = 500
// After the handover the explorer camera transform is read again before the aim
// follows it, so the arrow does not swing through a stale heading.
const SETTLE_MS = 300
// The scene root the course hangs from, if the parent has no Transform.
const DEFAULT_ORIGIN = Vector3.create(24, 0, 24)
// The whole scene stays in third person while a hole is played: in first
// person the ball would sit under the camera, out of sight.
const THIRD_PERSON_AREA = Vector3.create(48, 40, 48)

type Phase = 'overview' | 'aim' | 'roll'

const toDeg = 180 / Math.PI

const dirOf = (yawDeg: number) => {
  const r = yawDeg / toDeg
  return Vector3.create(Math.sin(r), 0, Math.cos(r))
}

// The explorer camera's heading in the shoot control's convention (degrees,
// the shot leaves along (sin yaw, 0, cos yaw)), from its forward vector rather
// than an Euler decomposition, which wobbles when the camera looks steeply
// down. Null while the explorer has not written the camera transform.
export function explorerCameraYaw(): number | null {
  const t = Transform.getOrNull(engine.CameraEntity)
  if (!t) return null
  const fwd = Vector3.rotate(Vector3.Forward(), t.rotation)
  if (Math.abs(fwd.x) < 1e-6 && Math.abs(fwd.z) < 1e-6) return null
  return Math.atan2(fwd.x, fwd.z) * toDeg
}

export const createAvatarAnchorCamera = (
  parent: Entity,
  { ballEntity, getBallPosition, initialRotation }: AimCameraOptions
): AimCamera => {
  const [rx, ry, rz, rw] = initialRotation
  const teeYaw = Quaternion.toEulerAngles(Quaternion.create(rx, ry, rz, rw)).y

  // The aim: the explorer camera's heading while the player aims and the
  // camera has settled; otherwise frozenYaw (the tee's heading first, then the
  // heading the camera had when the shot was taken).
  let frozenYaw = teeYaw
  let yaw = teeYaw
  let phase: Phase = 'overview'
  let handoverAt = 0
  let settleUntil = 0
  let wasVisible = false
  let anchors = 0

  // The course is local to the scene root; movePlayerTo wants scene coordinates.
  const origin = Transform.getOrNull(parent)?.position || DEFAULT_ORIGIN
  const ballWorld = () => {
    const b = getBallPosition()
    return Vector3.create(b.x + origin.x, b.y + origin.y, b.z + origin.z)
  }

  const modeArea = engine.addEntity()
  Transform.create(modeArea, { position: Vector3.create(origin.x, origin.y, origin.z) })
  CameraModeArea.create(modeArea, { area: THIRD_PERSON_AREA, mode: CameraType.CT_THIRD_PERSON })

  // The VirtualCamera of the overview and the roll: it looks at the ball, its
  // position is centre (the ball, smoothed) plus an offset per phase.
  const vcam = engine.addEntity()
  let centre = ballWorld()
  let offset = Vector3.create(0, 0, 0)
  Transform.create(vcam, { position: centre })
  VirtualCamera.create(vcam, {
    lookAtEntity: ballEntity,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.4 } }
  })
  const vcamActive = () => MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity === vcam
  const showVcam = () => MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: vcam })
  const hideVcam = () => {
    if (vcamActive()) MainCamera.deleteFrom(engine.CameraEntity)
  }

  // Stands in for the active camera in the occlusion raycast.
  const probe = engine.addEntity()
  Transform.create(probe, { position: Vector3.create(origin.x, origin.y + 2, origin.z) })
  const cameraDistance = () => Vector3.distance(Transform.get(probe).position, ballWorld())
  const occlusion = createCameraOcclusion(probe, ballEntity, cameraDistance, getBallPosition)

  const overviewOffset = () => Vector3.add(Vector3.scale(dirOf(teeYaw), -OVERVIEW_BACK), Vector3.create(0, OVERVIEW_UP, 0))

  // Where the explorer camera stands relative to the ball, so the roll camera
  // starts from the same viewpoint; the orbit camera's default when the
  // explorer gives no transform.
  const rollOffset = () => {
    const cam = Transform.getOrNull(engine.CameraEntity)
    const ball = ballWorld()
    if (cam && Vector3.distance(cam.position, ball) > 0.5) return Vector3.subtract(cam.position, ball)
    const pitchRad = ORBIT_PITCH / toDeg
    return Vector3.add(
      Vector3.scale(dirOf(yaw), -ORBIT_DISTANCE * Math.cos(pitchRad)),
      Vector3.create(0, ORBIT_DISTANCE * Math.sin(pitchRad), 0)
    )
  }

  // Start the overview straight away: the first camera the player sees.
  offset = overviewOffset()
  Transform.getMutable(vcam).position = Vector3.add(centre, offset)
  showVcam()

  // The player's turn: the avatar onto the ball, the camera looking along the
  // tee's heading the first time and afterwards the way the last shot left,
  // under the VirtualCamera still showing; the view is handed back after
  // HANDOVER_MS.
  function anchor() {
    anchors++
    const at = ballWorld()
    const ahead = Vector3.add(at, Vector3.scale(dirOf(yaw), LOOK_AHEAD))
    frozenYaw = yaw
    handoverAt = Date.now() + HANDOVER_MS
    settleUntil = 0
    console.log(
      '[anchor] avatar onto the ball #' + anchors,
      JSON.stringify({ x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) }),
      'aim',
      yaw.toFixed(1)
    )
    movePlayerTo({
      newRelativePosition: at,
      cameraTarget: Vector3.create(ahead.x, at.y + LOOK_AHEAD_Y, ahead.z)
    }).catch((err) => console.log('[anchor] movePlayerTo failed', err))
  }

  // The shot: the roll camera takes over from where the explorer camera stood
  // and follows the ball until it sleeps.
  function startRoll() {
    phase = 'roll'
    frozenYaw = yaw
    handoverAt = 0
    settleUntil = 0
    centre = ballWorld()
    offset = rollOffset()
    Transform.getMutable(vcam).position = Vector3.add(centre, offset)
    showVcam()
  }

  function update(dt: number) {
    const visible = mobileShootState.visible
    if (visible && !wasVisible) anchor()
    else if (!visible && wasVisible && phase === 'aim') startRoll()
    wasVisible = visible

    // The avatar is down on the ball: hand the view back to the explorer camera.
    if (handoverAt && Date.now() >= handoverAt) {
      handoverAt = 0
      phase = 'aim'
      hideVcam()
      settleUntil = Date.now() + SETTLE_MS
    }
    if (settleUntil && Date.now() >= settleUntil) {
      settleUntil = 0
      const now = explorerCameraYaw()
      console.log('[anchor] settled, camera', now === null ? 'none' : now.toFixed(1), 'wanted', frozenYaw.toFixed(1))
      if (now !== null) frozenYaw = now
    }

    if (phase !== 'aim' || handoverAt) {
      // Overview and roll: the VirtualCamera follows the ball, smoothed like the orbit camera.
      const ball = ballWorld()
      centre = Vector3.lerp(centre, ball, Math.min(1, dt * ORBIT_FOLLOW_SMOOTH))
      Transform.getMutable(vcam).position = Vector3.add(centre, offset)
      Transform.getMutable(probe).position = Vector3.add(centre, offset)
    } else {
      const cam = Transform.getOrNull(engine.CameraEntity)
      if (cam) Transform.getMutable(probe).position = Vector3.create(cam.position.x, cam.position.y, cam.position.z)
    }

    const live = phase === 'aim' && !handoverAt && !settleUntil ? explorerCameraYaw() : null
    yaw = live === null ? frozenYaw : live
  }

  holdAvatar()
  engine.addSystem(update)

  let released = false
  function release() {
    if (released) return
    released = true
    engine.removeSystem(update)
    occlusion.dispose()
    hideVcam()
    engine.removeEntity(vcam)
    engine.removeEntity(modeArea)
    engine.removeEntity(probe)
    releaseAvatar()
  }

  return {
    getYaw: () => yaw,
    release,
    dispose: release
  }
}
