// The avatar's legs during a hole, shared by the two aim cameras (orbit-camera.ts
// on desktop, anchor-camera.ts on phones; aim-camera.ts picks one).
//
// While an aim camera is up, InputModifier keeps the avatar still
// (holdAvatar / releaseAvatar). A Season run keeps it still from its first tee
// to the end of the run, not only while a hole's camera is up: with the legs
// handed back when the ball holed, a player could walk out of the 48 m scene
// while the others finished, during the hole result or while the next course
// loaded (W/S and A/D are the aim keys), and outside it the explorer draws none
// of the scene's UI and ignores its movePlayerTo, so the next hole started
// without them (CLAUDE.md §6 #34). unlockAvatar() ends it; a run that ends
// without telling us (a lost room the run never closes) is freed by the
// watchdog once no camera has been up for RUN_LOCK_MAX_MS.
//
// Between holing out and the end of the hole (the "Ending in..." wait) the
// player may walk around (user, 2026-11-03): freeAvatarForNow() hands the legs
// back inside the run and holdAvatarForRun() takes them again at the hole's
// end. A fence keeps that walk inside the scene's main block, because a player
// outside it cannot be brought back for the next hole (movePlayerTo is ignored
// there): a step past it is undone with a teleport to the last place inside.
import { InputModifier, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

const RUN_LOCK_MAX_MS = 180000
// Scene-local metres of the 3x3 parcel block the courses and the lobby sit in,
// whose real borders are 0 and 48. The margin used to be 1 m, which at running
// speed is about a fifth of a second: less than one scene tick while a course
// is loading, so a player could be past the border before the fence sampled
// again, and once outside the fence's own movePlayerTo is refused like every
// other (components/scene-bounds.ts explains why). The wall is the real
// defence now; this stays as the backstop for the moment before it is up.
const FENCE_MIN = 3
const FENCE_MAX = 45
let lockedForRun = false
let activeCameras = 0
let lastReleaseAt = 0
let watchdogAdded = false
let freeForNow = false
let lastInside: Vector3 | null = null
let fenceAdded = false

const inside = (p: { x: number; z: number }) => p.x >= FENCE_MIN && p.x <= FENCE_MAX && p.z >= FENCE_MIN && p.z <= FENCE_MAX

const fence = () => {
  if (!freeForNow) return
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  if (inside(t.position)) {
    lastInside = Vector3.create(t.position.x, t.position.y, t.position.z)
    return
  }
  const back = lastInside || Vector3.create(24, t.position.y, 24)
  console.log('[avatar-lock] at the edge of the scene, back to', JSON.stringify(back))
  movePlayerTo({ newRelativePosition: back }).catch((err) => console.log('[avatar-lock] movePlayerTo failed', err))
}

// The hole is over for this player but the run goes on: the legs come back
// until holdAvatarForRun(), within the fence.
export const freeAvatarForNow = () => {
  if (!lockedForRun || activeCameras) return
  freeForNow = true
  // Seed it with where the player is standing right now (on the ball, at the
  // hole). Starting from null meant that a player whose very first sample was
  // already outside got yanked to the middle of the scene, at the ball's
  // height, instead of back to where they were a step earlier.
  const standing = Transform.getOrNull(engine.PlayerEntity)
  lastInside = standing && inside(standing.position)
    ? Vector3.create(standing.position.x, standing.position.y, standing.position.z)
    : null
  InputModifier.deleteFrom(engine.PlayerEntity)
  if (!fenceAdded) {
    fenceAdded = true
    engine.addSystem(fence)
  }
}

// The hole has ended (the fade to the results): still inside the run, so the
// legs are locked again until the next hole's camera, or unlockAvatar().
export const holdAvatarForRun = () => {
  freeForNow = false
  if (!lockedForRun) return
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })
}

export const lockAvatarForRun = () => {
  lockedForRun = true
  if (watchdogAdded) return
  watchdogAdded = true
  engine.addSystem(() => {
    if (lockedForRun && !activeCameras && Date.now() - lastReleaseAt > RUN_LOCK_MAX_MS) {
      console.log('[avatar-lock] run lock timed out, freeing the avatar')
      unlockAvatar()
    }
  })
}

export const unlockAvatar = () => {
  lockedForRun = false
  freeForNow = false
  if (!activeCameras) InputModifier.deleteFrom(engine.PlayerEntity)
}

// An aim camera is up: the avatar stays where it is until releaseAvatar().
export const holdAvatar = () => {
  freeForNow = false
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })
  activeCameras++
}

// The hole is over for this camera. Inside a Season run the legs stay locked
// until unlockAvatar().
export const releaseAvatar = () => {
  activeCameras--
  lastReleaseAt = Date.now()
  if (!lockedForRun && !activeCameras) InputModifier.deleteFrom(engine.PlayerEntity)
}
