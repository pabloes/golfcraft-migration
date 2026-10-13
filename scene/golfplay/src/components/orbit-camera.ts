// Ball orbit camera for CAMERA_AIM_MODE (Golf With Your Friends style).
//
// A VirtualCamera that circles the ball for the whole hole, whether the ball is
// still or rolling. The player turns it, and its heading IS the aim: the shoot
// control reads getYaw() instead of having its own rotation step. While it is
// active InputModifier keeps the avatar still; release() hands back both the
// camera and the legs as soon as the hole is over for this player.
//
// A VirtualCamera takes no input from the explorer, so the scene reads it:
//   - the pointer, from PrimaryPointerInfo on the root entity;
//   - A/D to turn and W/S to zoom (the joystick on mobile), which reach the
//     scene even while InputModifier keeps the avatar still.
import {
  Entity,
  InputAction,
  InputModifier,
  MainCamera,
  PrimaryPointerInfo,
  Transform,
  VirtualCamera,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  ORBIT_DISTANCE,
  ORBIT_DISTANCE_MAX,
  ORBIT_DISTANCE_MIN,
  ORBIT_FOLLOW_SMOOTH,
  ORBIT_KEY_SPEED,
  ORBIT_MOUSE_SENSITIVITY,
  ORBIT_PITCH,
  ORBIT_PITCH_MAX,
  ORBIT_PITCH_MIN,
  ORBIT_ZOOM_SPEED
} from '../../../src/config/controls'
import { mobileShootState } from '../../../src/ui/mobile-shoot-state'
import { isMobile } from '../../../src/services/platform'

type Vec3Like = { x: number; y: number; z: number }

type Options = {
  // The visual ball entity, for lookAtEntity.
  ballEntity: Entity
  // Physics ball, in course coordinates (local to the scene root at 24,0,24).
  getBallPosition: () => Vec3Like
  // The tee's rotation, so the first aim is the one the course intends.
  initialRotation: number[]
}

const pressed = (action: InputAction) => (inputSystem.isPressed(action) ? 1 : 0)
// Degrees per second while a pitch arrow is held on mobile.
const ORBIT_PITCH_KEY_SPEED = 45
// How fast the camera catches up with a touch drag on mobile (1/s): about
// 90 % of the way in a quarter of a second.
const ORBIT_TOUCH_EASE = 9

// Zoom and tilt carry over from one hole to the next; only the heading starts
// again from each tee.
let distance = ORBIT_DISTANCE
let pitch = ORBIT_PITCH

export const createBallOrbitCamera = (
  parent: Entity,
  { ballEntity, getBallPosition, initialRotation }: Options
) => {
  const [rx, ry, rz, rw] = initialRotation
  // Degrees. Yaw uses the shoot control's convention: the shot leaves along
  // (sin yaw, 0, cos yaw), and the camera sits on the opposite side of the ball.
  let yaw = Quaternion.toEulerAngles(Quaternion.create(rx, ry, rz, rw)).y
  // Input moves these; yaw / pitch follow them. On desktop they snap (the
  // mouse is already smooth); on phones they ease in, because the scene only
  // sees the finger once per tick and applying each step at once made a drag
  // look jerky.
  let targetYaw = yaw
  let targetPitch = pitch

  const start = getBallPosition()
  // What the camera circles: the ball, slightly smoothed so bounces don't shake it.
  let centre = Vector3.create(start.x, start.y, start.z)
  let lastPointer: { x: number; y: number } | null = null
  let touchDown = false

  const camera = engine.addEntity()
  Transform.create(camera, { parent })
  VirtualCamera.create(camera, {
    lookAtEntity: ballEntity,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.4 } }
  })

  function place() {
    const yawRad = (yaw * Math.PI) / 180
    const pitchRad = (pitch * Math.PI) / 180
    const flat = distance * Math.cos(pitchRad)
    Transform.getMutable(camera).position = Vector3.create(
      centre.x - Math.sin(yawRad) * flat,
      centre.y + distance * Math.sin(pitchRad),
      centre.z - Math.cos(yawRad) * flat
    )
  }

  // Pixels the pointer moved since the last tick.
  function pointerDelta() {
    const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
    if (!pointer) return { x: 0, y: 0 }

    // Measured here from the position when it moves, because the explorer's own
    // screenDelta is per rendered frame and the scene ticks slower than that.
    const at = pointer.screenCoordinates
    const previous = lastPointer
    lastPointer = at ? { x: at.x, y: at.y } : null
    if (isMobile()) {
      // Touch: a finger landing somewhere else must not swing the camera, so
      // only a finger that was already down counts, and one tick is capped so
      // a flick cannot spin it. Explorers that report no touch position give
      // zero, and the panel's arrows do the job instead.
      const down = inputSystem.isPressed(InputAction.IA_POINTER)
      const wasDown = touchDown
      touchDown = down
      if (!down || !wasDown || !at || !previous) return { x: 0, y: 0 }
      // Only a guard against a glitched sample; the easing does the rest.
      const cap = 160
      return {
        x: Math.max(-cap, Math.min(cap, at.x - previous.x)),
        y: Math.max(-cap, Math.min(cap, at.y - previous.y))
      }
    }
    if (at && previous && (at.x !== previous.x || at.y !== previous.y)) {
      return { x: at.x - previous.x, y: at.y - previous.y }
    }
    // A locked cursor doesn't move; explorers that still report its motion
    // (bevy) do it through screenDelta.
    return { x: pointer.screenDelta?.x || 0, y: pointer.screenDelta?.y || 0 }
  }

  function update(dt: number) {
    const mouse = pointerDelta()
    // The mobile touch panel's aim arrows count as A / D.
    const turn = pressed(InputAction.IA_RIGHT) - pressed(InputAction.IA_LEFT) + mobileShootState.aimHold
    // W brings the camera in, S takes it out.
    const zoom = pressed(InputAction.IA_BACKWARD) - pressed(InputAction.IA_FORWARD)

    targetYaw += mouse.x * ORBIT_MOUSE_SENSITIVITY + turn * ORBIT_KEY_SPEED * dt
    // Screen Y grows upwards in the desktop client, so pushing the mouse up
    // raises the camera over the ball.
    // The mobile panel's ^ / v arrows raise and lower the camera.
    targetPitch += mouse.y * ORBIT_MOUSE_SENSITIVITY + mobileShootState.pitchHold * ORBIT_PITCH_KEY_SPEED * dt
    targetPitch = Math.max(ORBIT_PITCH_MIN, Math.min(ORBIT_PITCH_MAX, targetPitch))
    if (isMobile()) {
      const ease = 1 - Math.exp(-ORBIT_TOUCH_EASE * dt)
      yaw += (targetYaw - yaw) * ease
      pitch += (targetPitch - pitch) * ease
    } else {
      yaw = targetYaw
      pitch = targetPitch
    }
    distance += zoom * ORBIT_ZOOM_SPEED * dt
    distance = Math.max(ORBIT_DISTANCE_MIN, Math.min(ORBIT_DISTANCE_MAX, distance))

    const ball = getBallPosition()
    centre = Vector3.lerp(centre, Vector3.create(ball.x, ball.y, ball.z), Math.min(1, dt * ORBIT_FOLLOW_SMOOTH))
    place()
  }

  place()
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camera })
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })
  engine.addSystem(update)

  let released = false
  function release() {
    if (released) return
    released = true
    engine.removeSystem(update)
    if (MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity === camera) {
      MainCamera.deleteFrom(engine.CameraEntity)
    }
    InputModifier.deleteFrom(engine.PlayerEntity)
  }

  return {
    getYaw: () => yaw,

    release,

    dispose() {
      release()
      engine.removeEntity(camera)
    }
  }
}
