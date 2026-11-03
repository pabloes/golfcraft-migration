// Ball orbit camera for CAMERA_AIM_MODE (Golf With Your Friends style).
//
// A VirtualCamera that circles the ball for the whole hole, whether the ball is
// still or rolling. The player turns it, and its heading IS the aim: the shoot
// control reads getYaw() instead of having its own rotation step. While it is
// active InputModifier keeps the avatar still; release() hands back the camera
// as soon as the hole is over for this player, and the legs too unless a Season
// run holds them (lockAvatarForRun).
//
// A VirtualCamera takes no input from the explorer, so the scene reads it:
//   - the pointer, from PrimaryPointerInfo on the root entity;
//   - A/D to turn and W/S to zoom, which reach the scene even while
//     InputModifier keeps the avatar still (on mobile, the touch panel's
//     arrows and zoom buttons, through mobileShootState).
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
import { mobileShootState, type ArrowPress } from '../../../src/ui/mobile-shoot-state'
import { isMobile } from '../../../src/services/platform'
import { createCameraOcclusion } from './camera-occlusion'

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
// The mobile panel's aim arrows (< >). A press turns one small step at once;
// a hold then waits ARROW_HOLD_DELAY_MS (enough to absorb a release the
// explorer reports late, so a tap stays one step) and accelerates evenly over
// ARROW_RAMP_MS to the full speed (ORBIT_KEY_SPEED). The scene ticks slower
// than the screen and the explorer reports touches late, so at full speed
// from the first tick even a quick tap turned several degrees. The pitch
// arrows (^ v) just move at ORBIT_PITCH_KEY_SPEED while held (user,
// 2026-11-03): a tilt needs no fine steps.
const ARROW_AIM_STEP = 0.4
const ARROW_HOLD_DELAY_MS = 100
const ARROW_RAMP_MS = 500

// Degrees an arrow has turned `ms` after its press: the step, then constant
// acceleration (the speed grows in a straight line, the travel with the
// square of the time) until the ramp ends and the speed stays. 90 deg/s over
// 0.5 s: 0.9° at 100 ms into the ramp, 5.6° at 250 ms, 22.5° at the end.
const arrowTravel = (ms: number, step: number, speed: number) => {
  const held = Math.max(0, ms - ARROW_HOLD_DELAY_MS) / 1000
  const ramp = ARROW_RAMP_MS / 1000
  if (held <= ramp) return step + (speed * held * held) / (2 * ramp)
  return step + (speed * ramp) / 2 + speed * (held - ramp)
}

// Degrees to turn this tick for an arrow. Measured from the press time, not
// summed from dt, so the result doesn't depend on how often the scene ticks.
// Module level, like the zoom and tilt, so a press is never counted twice
// by the next hole's camera.
const arrowMotion = (step: number, speed: number) => {
  let seen: ArrowPress | null = null
  let travelled = 0
  return (press: ArrowPress | null, holding: number) => {
    if (press !== seen) {
      seen = press
      travelled = 0
    }
    if (!press) return 0
    // Released: only the step, if it hasn't landed yet.
    const travel = holding === press.dir ? arrowTravel(Date.now() - press.at, step, speed) : Math.max(travelled, step)
    const move = travel - travelled
    travelled = travel
    return press.dir * move
  }
}
const aimArrow = arrowMotion(ARROW_AIM_STEP, ORBIT_KEY_SPEED)
const clampPitch = (value: number) => Math.max(ORBIT_PITCH_MIN, Math.min(ORBIT_PITCH_MAX, value))

// Zoom and tilt carry over from one hole to the next; only the heading starts
// again from each tee.
let distance = ORBIT_DISTANCE
let pitch = ORBIT_PITCH

// A Season run keeps the avatar still from its first tee to the end of the run,
// not only while a hole's camera is up. With the legs handed back when the ball
// holed, a player could walk out of the 48 m scene while the others finished,
// during the hole result or while the next course loaded (W/S and A/D are the
// aim keys): outside it the explorer draws none of the scene's UI and ignores
// its movePlayerTo, so the next hole started without them (CLAUDE.md §6 #34).
// unlockAvatar() ends it; a run that ends without telling us (a lost room the
// run never closes) is freed by the watchdog once no camera has been up for
// RUN_LOCK_MAX_MS.
const RUN_LOCK_MAX_MS = 180000
let lockedForRun = false
let activeCameras = 0
let lastReleaseAt = 0
let watchdogAdded = false

export const lockAvatarForRun = () => {
  lockedForRun = true
  if (watchdogAdded) return
  watchdogAdded = true
  engine.addSystem(() => {
    if (lockedForRun && !activeCameras && Date.now() - lastReleaseAt > RUN_LOCK_MAX_MS) {
      console.log('[orbit] run lock timed out, freeing the avatar')
      unlockAvatar()
    }
  })
}

export const unlockAvatar = () => {
  lockedForRun = false
  if (!activeCameras) InputModifier.deleteFrom(engine.PlayerEntity)
}

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
  // Per touch: how many ticks the finger was seen moving, and the first move,
  // held back until a second one proves the explorer reports a drag live.
  let pressMoves = 0
  let pendingMove = { x: 0, y: 0 }

  const camera = engine.addEntity()
  Transform.create(camera, { parent })
  VirtualCamera.create(camera, {
    lookAtEntity: ballEntity,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.4 } }
  })
  // While aiming, the parts between the camera and the ball step aside.
  const occlusion = createCameraOcclusion(camera, ballEntity, () => distance, getBallPosition)

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
      // only a finger that was already down counts. The mobile explorer may
      // not report the finger while it drags, only where it was lifted: that
      // arrives as ONE move at the end of the touch and swung the camera
      // after the fact. So a touch only orbits once it has moved on two ticks
      // (a live drag); a touch with a single move does nothing, and the
      // panel's arrows do the job. Explorers that report the drag live get it.
      const down = inputSystem.isPressed(InputAction.IA_POINTER)
      const wasDown = touchDown
      touchDown = down
      if (!down || !wasDown) {
        if (wasDown && !down) console.log('[orbit] touch ended, ticks with movement:', pressMoves)
        pressMoves = 0
        pendingMove = { x: 0, y: 0 }
        return { x: 0, y: 0 }
      }
      if (!at || !previous || (at.x === previous.x && at.y === previous.y)) return { x: 0, y: 0 }
      // Only a guard against a glitched sample; the easing does the rest.
      const cap = 160
      const move = {
        x: Math.max(-cap, Math.min(cap, at.x - previous.x)),
        y: Math.max(-cap, Math.min(cap, at.y - previous.y))
      }
      pressMoves++
      if (pressMoves === 1) {
        pendingMove = move
        return { x: 0, y: 0 }
      }
      if (pressMoves === 2) return { x: pendingMove.x + move.x, y: pendingMove.y + move.y }
      return move
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
    const turn = pressed(InputAction.IA_RIGHT) - pressed(InputAction.IA_LEFT)
    // W brings the camera in, S takes it out; so do the mobile zoom buttons.
    const zoom = pressed(InputAction.IA_BACKWARD) - pressed(InputAction.IA_FORWARD) + mobileShootState.zoomHold
    // Degrees from the mobile panel's < > (aim, a step then a ramp) and
    // ^ v (raise / lower, full speed while held) arrows.
    const aimMove = aimArrow(mobileShootState.aimPress, mobileShootState.aimHold)
    const pitchMove = mobileShootState.pitchHold * ORBIT_PITCH_KEY_SPEED * dt

    targetYaw += mouse.x * ORBIT_MOUSE_SENSITIVITY + turn * ORBIT_KEY_SPEED * dt + aimMove
    // Screen Y grows upwards in the desktop client, so pushing the mouse up
    // raises the camera over the ball.
    targetPitch = clampPitch(targetPitch + mouse.y * ORBIT_MOUSE_SENSITIVITY + pitchMove)
    if (isMobile()) {
      // The arrows move the camera itself, not only its target: the easing
      // would spread a tap's step over a quarter of a second and keep turning
      // some 10° after a held arrow was let go.
      yaw += aimMove
      pitch = clampPitch(pitch + pitchMove)
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
  mobileShootState.zoomable = true
  activeCameras++

  let released = false
  function release() {
    if (released) return
    released = true
    activeCameras--
    lastReleaseAt = Date.now()
    engine.removeSystem(update)
    occlusion.dispose()
    mobileShootState.zoomable = false
    mobileShootState.zoomHold = 0
    if (MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity === camera) {
      MainCamera.deleteFrom(engine.CameraEntity)
    }
    // Inside a Season run the legs stay locked until unlockAvatar().
    if (!lockedForRun && !activeCameras) InputModifier.deleteFrom(engine.PlayerEntity)
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
