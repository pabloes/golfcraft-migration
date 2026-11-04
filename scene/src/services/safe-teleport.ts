// movePlayerTo, but you can tell whether it happened.
//
// The explorer's own implementation (traced in @dcl/explorer, CLAUDE.md §6
// #46) refuses the call when the TARGET is not on a listed parcel or when the
// PLAYER'S CURRENT parcel is not either, and every branch returns {}. So the
// promise resolves exactly the same whether the player moved or not, which is
// how an end-of-hole teleport could silently leave people stranded for weeks.
//
// The only way to know is to look afterwards: teleport, give the explorer a
// few frames, read the player transform back and see whether it is anywhere
// near where we asked.
import { Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../../common/utils'

// The scene's real standing area: the 3x3 block, plus the tenth parcel
// (48,-46) as a strip at negative z. Half-open, 48 is already the next parcel.
const BLOCK = 48
const LOBE_X = [16, 32]
const LOBE_Z = [-16, 0]

export const insideScene = (p: { x: number; z: number }) =>
  (p.x >= 0 && p.x < BLOCK && p.z >= 0 && p.z < BLOCK) ||
  (p.x >= LOBE_X[0] && p.x < LOBE_X[1] && p.z >= LOBE_Z[0] && p.z < LOBE_Z[1])

const SETTLE_MS = 350
const NEAR = 4

// Returns whether the player ended up near the target. Never throws.
export async function teleportVerified(
  target: Vector3,
  cameraTarget?: Vector3,
  tries = 3
): Promise<boolean> {
  if (!insideScene(target)) {
    console.log('[teleport] target outside the scene, refusing to ask:', JSON.stringify(target))
    return false
  }
  for (let attempt = 1; attempt <= tries; attempt++) {
    const before = Transform.getOrNull(engine.PlayerEntity)
    // Gate (2) of the explorer: a player who is already out cannot be moved,
    // so say so rather than pretending the call did something.
    if (before && !insideScene(before.position)) {
      console.log('[teleport] the player is outside the scene, the explorer will refuse this')
    }
    try {
      await movePlayerTo({ newRelativePosition: target, cameraTarget })
    } catch (err) {
      console.log('[teleport] movePlayerTo threw', err)
    }
    await sleep(SETTLE_MS)
    const after = Transform.getOrNull(engine.PlayerEntity)
    if (!after) return false
    const dx = after.position.x - target.x
    const dz = after.position.z - target.z
    if (Math.sqrt(dx * dx + dz * dz) <= NEAR) return true
    console.log(`[teleport] attempt ${attempt} did not land, player at`, JSON.stringify(after.position))
  }
  return false
}
