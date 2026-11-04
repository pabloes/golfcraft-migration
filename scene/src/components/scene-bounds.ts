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
// under it. In Genesis City the terrain catches the fall; in a World there is
// no terrain and the lobby's own ground meshes are excluded, so a player falls
// out of the World and the explorer returns them to Genesis City. A collider
// below the scene catches them instead.
//
// Only while a hole is on: in the lobby the player may walk wherever the scene
// allows, and the building reaches the block's edge.
import { ColliderLayer, Entity, MeshCollider, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'

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
// Below every course part (the lowest sit near y 0) and below the terrain.
const FLOOR_Y = -6
const FLOOR_THICKNESS = 2

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
  console.log('[scene-bounds] wall down')
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

export const startSceneBounds = () => {
  if (systemAdded) return
  systemAdded = true
  engine.addSystem(boundsSystem)
}
