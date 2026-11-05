// An invisible wall around the playable block while a hole is on, plus a floor
// under everything (2026-11-04).
//
// Why a wall and not a teleport. The explorer refuses movePlayerTo when the
// PLAYER'S CURRENT parcel is outside scene.parcels, and the call resolves
// successfully anyway, so the scene cannot even tell it was refused. That is
// the whole of the end-of-hole bug players reported: a wander out during the
// seconds the screen is black, and then nothing could ever bring them back,
// silently. Chasing the avatar with teleports loses that race by construction;
// not letting it reach the border does not.
//
// The floor is for the other half of the report, landing in Genesis Plaza. A
// hole ends with the avatar standing on the course and the course is disposed
// under it. Nothing catches the fall: a deployed scene draws its own ground,
// the lobby's is destroyed while a hole is on, and the course has just gone.
// The explorer then recovers the falling player somewhere it considers solid,
// which is another parcel, and from outside the scene nothing can bring them
// back (movePlayerTo is refused there). That is what players describe as
// "being teleported away when the hole ends": no teleport of ours runs in that
// path at all.
//
// Two defences, because the explorer reacts to a fall faster than a floor six
// metres down can catch it (user, 2026-11-05):
//   - a platform created right under the player's feet BEFORE the course is
//     disposed, so there is no fall to react to;
//   - the catch floor, now just below the lowest course part (y -1.25 across
//     the 233 local definitions) rather than at -6, as the backstop.
//
// Only while a hole is on: in the lobby the player may walk wherever the scene
// allows, and the building reaches the block's edge.
import {
  ColliderLayer,
  Entity,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { SHOW_PLAY_FLOOR } from '../config/hole-end'

// The 3x3 parcel block, in scene-local metres. (The scene's tenth parcel,
// 48,-46, is a strip at negative z with nothing in it: the wall keeps players
// out of it, which is what we want while a hole is on.)
const BLOCK = 48
// The walls' inner faces. Course parts reach x/z 47.59 across every local
// course definition, so 47.5 can overlap a part by a few centimetres at the
// very worst hole; the alternative, leaving the last half metre open, is the
// gap the player walks through.
const MARGIN = 0.5
const THICKNESS = 0.5
// Tall enough that nobody jumps it, deep enough that it starts below any
// ground the player can stand on.
const WALL_BOTTOM = -4
const WALL_TOP = 14
// Just below the lowest course part (y -1.25 in level27), so the fall it
// catches is about a metre and a half. At -6 the explorer had already decided
// the player had fallen out of the world and moved them to another parcel.
const FLOOR_THICKNESS = 2
const FLOOR_Y = -1.5 - FLOOR_THICKNESS / 2
// The platform held under the player's feet while the course is gone.
//
// Its top goes a couple of centimetres ABOVE the feet, not below, and that is
// the whole point. unity-explorer's InterpolateCharacterSystem sets the
// player's position every frame to `platform.TransformPoint(relativePosition)`
// of the collider they are standing on, with no bounds check and no "is this
// my scene" check: whatever that collider does, the player does. So a course
// taken away under the feet can carry the player with it, which is how people
// end up on another parcel with no teleport of ours having run. Lifting them
// 2 cm onto a collider of ours makes US the platform before the course goes.
const PAD_SIZE = 8
const PAD_THICKNESS = 1
const PAD_LIFT = 0.02

let parts: Entity[] = []
let up = false
let systemAdded = false

const box = (position: Vector3, scale: Vector3): Entity => {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale, rotation: Quaternion.Identity() })
  // No MeshRenderer: a MeshCollider on its own is an invisible collider.
  // CL_PHYSICS is what stops the avatar; CL_POINTER is left off so the wall
  // never eats a click meant for the course or a button behind it.
  MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
  return entity
}

const raise = () => {
  if (up) return
  up = true
  const height = WALL_TOP - WALL_BOTTOM
  const midY = WALL_BOTTOM + height / 2
  const span = BLOCK + THICKNESS * 2
  const low = MARGIN - THICKNESS / 2
  const high = BLOCK - MARGIN + THICKNESS / 2
  parts = [
    // the four sides of the block
    box(Vector3.create(low, midY, BLOCK / 2), Vector3.create(THICKNESS, height, span)),
    box(Vector3.create(high, midY, BLOCK / 2), Vector3.create(THICKNESS, height, span)),
    box(Vector3.create(BLOCK / 2, midY, low), Vector3.create(span, height, THICKNESS)),
    box(Vector3.create(BLOCK / 2, midY, high), Vector3.create(span, height, THICKNESS)),
    // and the catch floor
    box(Vector3.create(BLOCK / 2, FLOOR_Y, BLOCK / 2), Vector3.create(BLOCK, FLOOR_THICKNESS, BLOCK))
  ]
  console.log('[scene-bounds] wall up')
}

const drop = () => {
  if (!up) return
  up = false
  parts.forEach((entity) => engine.removeEntity(entity))
  parts = []
  releaseGroundUnderPlayer()
  clearPlayFloor()
  console.log('[scene-bounds] wall down')
}

// Ground under the player's feet, for the moment a course is disposed under
// them. Whoever is about to take the floor away calls this BEFORE taking it,
// and leaves a few frames (COURSE_REMOVE_DELAY_MS in the golfplay clients)
// for the explorer to notice the new platform: it is the collider the player
// is standing on at the moment the course goes that decides where they end up.
// Removed when the walls come down, once the player is back in the lobby and
// the building's own ground is there again.
let pad: Entity | null = null

export const holdGroundUnderPlayer = () => {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  releaseGroundUnderPlayer()
  pad = box(
    Vector3.create(t.position.x, t.position.y + PAD_LIFT - PAD_THICKNESS / 2, t.position.z),
    Vector3.create(PAD_SIZE, PAD_THICKNESS, PAD_SIZE)
  )
  console.log('[scene-bounds] ground held under the player at', JSON.stringify(t.position))
}

export const releaseGroundUnderPlayer = () => {
  if (!pad) return
  engine.removeEntity(pad)
  pad = null
}

// The floor the player stands on while a hole is on (user, 2026-11-05): a
// sheet across the whole block, a couple of centimetres ABOVE the course's own
// surface, so the collider under their feet is always ours and never a piece
// of the course. That is the point: the explorer pins the player to whatever
// they stand on and carries them with it, so a course that is taken away can
// take the player to another parcel. If they never stand on the course, it
// cannot. It also means they can never fall: there is no hole in it.
//
// The height comes from the course itself (the ball's spawn y minus its
// radius), because courses sit at different heights. A hole with raised
// platforms still has them above this sheet, which is what the pad above is
// for: the dispose moment, wherever the player happens to be standing.
const PLAY_FLOOR_THICKNESS = 1
const PLAY_FLOOR_LIFT = 0.02
let playFloor: Entity | null = null

export const setPlayFloor = (surfaceY: number) => {
  clearPlayFloor()
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(BLOCK / 2, surfaceY + PLAY_FLOOR_LIFT - PLAY_FLOOR_THICKNESS / 2, BLOCK / 2),
    scale: Vector3.create(BLOCK, PLAY_FLOOR_THICKNESS, BLOCK),
    rotation: Quaternion.Identity()
  })
  MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
  if (SHOW_PLAY_FLOOR) {
    // Faintly visible on purpose while this is being watched: a floor nobody
    // can see is a floor nobody can tell is missing.
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, {
      albedoColor: Color4.create(0.35, 0.85, 1, 0.1),
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
      metallic: 0,
      roughness: 1
    })
  }
  playFloor = entity
  console.log('[scene-bounds] play floor at y', (surfaceY + PLAY_FLOOR_LIFT).toFixed(2))
}

export const clearPlayFloor = () => {
  if (!playFloor) return
  engine.removeEntity(playFloor)
  playFloor = null
}

// Measured, not guessed (user, 2026-11-05: "ponlo un poquito más abajo").
// A course's walkable height cannot be read from its definition: the parts sit
// at y 0 and their surface is inside the mesh, the `spawn` part is at y 10
// because the player is meant to DROP onto the course, and the ball's spawn is
// wherever the designer left it, often above the ground. So let the player
// land on the course, watch until their feet stop moving, and put the sheet
// exactly there. A hole with no landing (holes 2 to 4 of a run, where nobody
// is teleported any more) settles at once on the sheet already up, which keeps
// its height.
const SETTLE_SAMPLE_MS = 100
const SETTLE_TOLERANCE = 0.01
const SETTLE_TIMEOUT_MS = 5000
// Above the surface by a hair: enough that the sphere cast picks this and not
// the course, little enough that nobody is standing visibly in the air.
const SETTLE_LIFT = 0.01
// A settled height outside this is not a course: the player fell through to
// the catch floor, or is somewhere unexpected. Use the estimate instead.
const SETTLE_MIN_Y = -1
const SETTLE_MAX_Y = 25

export const fitPlayFloorToPlayer = (estimatedSurfaceY: number) => {
  const startedAt = Date.now()
  let lastY: number | null = null
  let lastSampleAt = 0
  const fit = () => {
    const now = Date.now()
    if (now - lastSampleAt < SETTLE_SAMPLE_MS) return
    lastSampleAt = now
    const t = Transform.getOrNull(engine.PlayerEntity)
    const y = t ? t.position.y : null
    const settled = y !== null && lastY !== null && Math.abs(y - lastY) < SETTLE_TOLERANCE
    const timedOut = now - startedAt > SETTLE_TIMEOUT_MS
    if (!settled && !timedOut) {
      lastY = y
      return
    }
    engine.removeSystem(fit)
    const usable = settled && y !== null && y > SETTLE_MIN_Y && y < SETTLE_MAX_Y
    setPlayFloor(usable ? (y as number) - PLAY_FLOOR_LIFT + SETTLE_LIFT : estimatedSurfaceY)
    console.log('[scene-bounds] play floor fitted to', usable ? 'the player at ' + (y as number).toFixed(2) : 'the course estimate')
  }
  engine.addSystem(fit)
}

// The hole clears `playing` before the lobby is back and before a falling
// avatar has landed, so the wall outlives the flag by a few seconds.
const GRACE_MS = 5000
let playingUntil = 0

// The store has no pub/sub, so a system watches it, as the other lobby pieces do.
const boundsSystem = () => {
  const game = globalStore.game.getState()
  if (game.playing || game.starting) playingUntil = Date.now() + GRACE_MS
  const wanted = Date.now() < playingUntil
  if (wanted === up) return
  if (wanted) raise()
  else drop()
}

// Keep them up past the moment `playing` is cleared. The end of a run clears
// it first and only then rebuilds the lobby, refreshes the player's data (up
// to 8 s) and teleports: the 5 s grace expired in the middle of that, with the
// player still standing on a course that no longer exists.
export const keepBounds = (ms: number) => {
  playingUntil = Math.max(playingUntil, Date.now() + ms)
}

// The player is back in the lobby, on the building's own ground.
export const releaseBounds = () => {
  playingUntil = 0
}

export const startSceneBounds = () => {
  if (systemAdded) return
  systemAdded = true
  engine.addSystem(boundsSystem)
}
