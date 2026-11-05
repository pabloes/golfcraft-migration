// Where the player's avatar goes, and how (user, 2026-11-05).
//
// Players are ending up on other parcels when a hole ends, and the scene has
// no teleport that can do it: every movePlayerTo is either gated off for the
// aim camera, mobile only, or aimed inside the scene, and the explorer refuses
// an out-of-bounds target anyway. The avatar also unloads the scene when it
// leaves, which kills both room sockets in the same millisecond and costs the
// run, so by the time anything can be asked the evidence is gone.
//
// This samples the avatar and prints only what is unusual, so the console of
// whoever it happens to says which of the three it was:
//   - a fall: y goes under the course and keeps dropping;
//   - a jump: x/z move further in one sample than anyone can run;
//   - a walk out: x/z leave the block gradually (the walls did not hold).
// It also prints a line each second while a hole is on, which is the only way
// to see the last position before the scene unloads and the log ends.
import { Transform, engine } from '@dcl/sdk/ecs'

import { globalStore } from './globalStore/globalStore'

// Running speed is about 12 m/s, so more than this in a tick is not legwork.
const JUMP_M = 6
// Below the lowest course part (-1.25) and below the catch floor's top (-1.5).
const FALLEN_Y = -2
// The block's real borders.
const OUT_MARGIN = 0.1
const BLOCK = 48
const HEARTBEAT_MS = 1000

let last: { x: number; y: number; z: number } | null = null
let lastBeat = 0
let wasOut = false
let wasFallen = false
let started = false

const outside = (p: { x: number; z: number }) =>
  p.x < -OUT_MARGIN || p.x > BLOCK + OUT_MARGIN || p.z < -OUT_MARGIN || p.z > BLOCK + OUT_MARGIN

const at = (p: { x: number; y: number; z: number }) =>
  `${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}`

const watch = () => {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  const p = t.position
  const playing = globalStore.game.getState().playing

  if (last) {
    const moved = Math.abs(p.x - last.x) + Math.abs(p.z - last.z)
    if (moved > JUMP_M) console.log(`[where] JUMPED ${at(last)} -> ${at(p)} (${moved.toFixed(1)} m in one tick)`)
  }

  const out = outside(p)
  if (out && !wasOut) console.log(`[where] LEFT THE SCENE at ${at(p)}${playing ? ' while playing' : ''}`)
  if (!out && wasOut) console.log(`[where] back inside at ${at(p)}`)
  wasOut = out

  const fallen = p.y < FALLEN_Y
  if (fallen && !wasFallen) console.log(`[where] FELL THROUGH at ${at(p)}${playing ? ' while playing' : ''}`)
  if (!fallen && wasFallen) console.log(`[where] back on ground at ${at(p)}`)
  wasFallen = fallen

  // The heartbeat is the last thing printed before the scene unloads, so it is
  // what names the place the avatar was standing when it happened.
  if (playing && Date.now() - lastBeat > HEARTBEAT_MS) {
    lastBeat = Date.now()
    console.log(`[where] ${at(p)}`)
  }

  last = { x: p.x, y: p.y, z: p.z }
}

export const startPositionWatch = () => {
  if (started) return
  started = true
  engine.addSystem(watch)
}
