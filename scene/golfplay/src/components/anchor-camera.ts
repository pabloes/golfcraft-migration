// Aim camera for phones (MOBILE_ANCHOR_CAMERA): the avatar stands on the ball,
// hidden, and the explorer's own third-person camera is the aim.
//
// The orbit camera (orbit-camera.ts) is a VirtualCamera, and the mobile
// explorer does not update PrimaryPointerInfo during a touch drag while one is
// active, so on a phone only the panel's < > arrows could turn it. Here there
// is no VirtualCamera. When it is the player's turn (the shoot control shows:
// mobileShootState.visible, at the start and after every shot once the ball
// sleeps) the avatar is teleported onto the ball with movePlayerTo, kept still
// (avatar-lock.ts) and hidden (services/hide-avatars.ts hides every avatar over
// the course, the player's own included), and the explorer's third-person
// camera, which the native touch drag turns, gives the heading: the shot leaves
// where the camera looks, plus the fine offset of the panel's < > arrows (one
// small step per tap, a ramp while held, the orbit camera's arrowMotion). The
// ^ v arrows and the zoom buttons have no job here and stay hidden
// (mobileShootState.pitchable / zoomable). The parts between the camera and
// the ball still step aside (camera-occlusion.ts) through a probe entity that
// follows the explorer camera, because a raycast is cast from an entity.
import { CameraModeArea, CameraType, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { ORBIT_KEY_SPEED } from '../../../src/config/controls'
import { mobileShootState } from '../../../src/ui/mobile-shoot-state'
import type { AimCamera, AimCameraOptions } from './aim-camera'
import { holdAvatar, releaseAvatar } from './avatar-lock'
import { createCameraOcclusion } from './camera-occlusion'
import { ARROW_AIM_STEP, arrowMotion } from './orbit-camera'

// Metres ahead of the ball the camera is pointed at when the avatar lands on it,
// and how far below the ball: from an eye some 1.6 m up that is a tilt of about
// 24° down (the orbit camera's ORBIT_PITCH), so the ball at the avatar's feet
// sits in the frame and not under the panel's < SHOOT > buttons. The touch drag
// tilts it afterwards anyway.
const LOOK_AHEAD = 8
const LOOK_AHEAD_Y = -2
// The trial readout on the mobile panel (mobileShootState.debug) is refreshed
// this often.
const DEBUG_EVERY_MS = 100
// After a teleport the explorer takes a few frames (and maybe an easing) to
// turn its camera towards cameraTarget: the aim holds meanwhile, so the arrow
// does not swing through the camera's old heading.
const SETTLE_MS = 500
// The scene root the course hangs from, if the parent has no Transform.
const DEFAULT_ORIGIN = Vector3.create(24, 0, 24)
// The whole scene stays in third person while a hole is played: in first
// person the ball would sit under the camera, out of sight.
const THIRD_PERSON_AREA = Vector3.create(48, 40, 48)

const toDeg = 180 / Math.PI
// Module level like the orbit camera's, so a press is never counted twice by
// the next hole's camera.
const aimArrow = arrowMotion(ARROW_AIM_STEP, ORBIT_KEY_SPEED)

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

  // The aim is base + offset. base is the explorer camera's heading once the
  // avatar has landed on the ball and the camera has settled; until then, and
  // whenever the explorer gives no camera transform, it is frozenYaw (the tee's
  // heading first, then the heading the camera had at the last anchor). offset
  // is what the < > arrows added since the last anchor.
  let frozenYaw = teeYaw
  let offset = 0
  let yaw = teeYaw
  let anchored = false
  let settleUntil = 0
  let wasVisible = false
  let anchors = 0
  let cameraSeen = false
  let debugAt = 0

  // The course is local to the scene root; movePlayerTo wants scene coordinates.
  const origin = Transform.getOrNull(parent)?.position || DEFAULT_ORIGIN
  const ballWorld = () => {
    const b = getBallPosition()
    return Vector3.create(b.x + origin.x, b.y + origin.y, b.z + origin.z)
  }

  const modeArea = engine.addEntity()
  Transform.create(modeArea, { position: Vector3.create(origin.x, origin.y, origin.z) })
  CameraModeArea.create(modeArea, { area: THIRD_PERSON_AREA, mode: CameraType.CT_THIRD_PERSON })

  // Stands in for the explorer camera in the occlusion raycast.
  const probe = engine.addEntity()
  Transform.create(probe, { position: Vector3.create(origin.x, origin.y + 2, origin.z) })
  const cameraDistance = () => Vector3.distance(Transform.get(probe).position, ballWorld())
  const occlusion = createCameraOcclusion(probe, ballEntity, cameraDistance, getBallPosition)

  const base = () => {
    const cam = anchored && !settleUntil ? explorerCameraYaw() : null
    return cam === null ? frozenYaw : cam
  }

  // The player's turn: the avatar onto the ball, the camera looking along the
  // tee's heading the first time, and afterwards the way it already looked
  // (so the view does not turn, only the viewpoint moves to the ball). The
  // arrows' offset starts again from the camera.
  function anchor() {
    const cam = explorerCameraYaw()
    const aim = anchors === 0 || cam === null ? yaw : cam
    anchors++
    const at = ballWorld()
    const ahead = Vector3.add(at, Vector3.scale(dirOf(aim), LOOK_AHEAD))
    frozenYaw = aim
    offset = 0
    anchored = true
    settleUntil = Date.now() + SETTLE_MS
    console.log(
      '[anchor] avatar onto the ball #' + anchors,
      JSON.stringify({ x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) }),
      'aim',
      aim.toFixed(1),
      'camera',
      cam === null ? 'none' : cam.toFixed(1)
    )
    movePlayerTo({
      newRelativePosition: at,
      cameraTarget: Vector3.create(ahead.x, at.y + LOOK_AHEAD_Y, ahead.z)
    }).catch((err) => console.log('[anchor] movePlayerTo failed', err))
  }

  function update() {
    const cam = Transform.getOrNull(engine.CameraEntity)
    if (cam) {
      Transform.getMutable(probe).position = Vector3.create(cam.position.x, cam.position.y, cam.position.z)
      if (!cameraSeen) {
        cameraSeen = true
        console.log('[anchor] explorer camera transform available')
      }
    }

    const visible = mobileShootState.visible
    if (visible && !wasVisible) anchor()
    wasVisible = visible

    if (settleUntil && Date.now() >= settleUntil) {
      settleUntil = 0
      const now = explorerCameraYaw()
      console.log('[anchor] settled, camera', now === null ? 'none' : now.toFixed(1), 'wanted', frozenYaw.toFixed(1))
      // Without a camera transform the arrows keep working from the frozen heading.
      if (now !== null) frozenYaw = now
    }

    offset += aimArrow(mobileShootState.aimPress, mobileShootState.aimHold)
    yaw = base() + offset

    // Trial readout: what the phone sees of the explorer camera, so the test
    // tells whether the camera transform updates with the drag and whether
    // cameraTarget was honoured. Remove once the scheme is settled.
    const now = Date.now()
    if (now - debugAt >= DEBUG_EVERY_MS) {
      debugAt = now
      const camYaw = explorerCameraYaw()
      mobileShootState.debug =
        `cam ${camYaw === null ? '-' : camYaw.toFixed(0)}°  aim ${yaw.toFixed(0)}°  off ${offset.toFixed(1)}°  #${anchors}` +
        (settleUntil ? ' settling' : '') +
        (cam ? '' : '  NO CAMERA TRANSFORM')
    }
  }

  holdAvatar()
  engine.addSystem(update)

  let released = false
  function release() {
    if (released) return
    released = true
    engine.removeSystem(update)
    occlusion.dispose()
    engine.removeEntity(modeArea)
    engine.removeEntity(probe)
    mobileShootState.debug = ''
    releaseAvatar()
  }

  return {
    getYaw: () => yaw,
    release,
    dispose: release
  }
}
