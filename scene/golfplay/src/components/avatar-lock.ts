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
import { InputModifier, engine } from '@dcl/sdk/ecs'

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
      console.log('[avatar-lock] run lock timed out, freeing the avatar')
      unlockAvatar()
    }
  })
}

export const unlockAvatar = () => {
  lockedForRun = false
  if (!activeCameras) InputModifier.deleteFrom(engine.PlayerEntity)
}

// An aim camera is up: the avatar stays where it is until releaseAvatar().
export const holdAvatar = () => {
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
