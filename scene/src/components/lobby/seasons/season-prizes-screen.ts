// SDK7 port of the season prizes screen — SDK6 built it inline in
// lobby-training.ts:68-100 (the createLinkBoard call with
// images/seasons-screen.png) plus StockUpdateSystem at :492.
//
// It is the "PRIZES BY RANK" board to the left of the season play panel: one
// flat image, with 20 text labels laid over it in a 5x4 grid, one per wearable
// tier. Each label says how many are left, or how many Fashion Tickets you get
// instead once that wearable is out of stock.
import {
  Entity,
  Material,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getTexture } from '../../../../golfplay/services/resource-repo'
import { getSeasonRewardsStock } from './season-rewards-bridge'

// SDK6 lobby-training.ts:68 — local to the lobby root, so world (12.5, ..., 45.5).
const BOARD_POSITION = Vector3.create(-11.5, 2, 21.5)
// SDK6 passed scale (4*1, 2.7*1.5, 1) and then multiplied by (-1,-1,-1) to flip
// the PlaneShape. In SDK7 a negative scale mirrors the texture instead of
// flipping the face, so keep it positive (CLAUDE.md §11).
const BOARD_SCALE = Vector3.create(4, 2.7 * 1.5, 1)
const PLANE_OFFSET = Vector3.create(0, 2.3, 0)

const LABEL_COUNT = 20
const REFRESH_SECONDS = 60

export const createSeasonPrizesScreen = (parent: Entity) => {
  const owned: Entity[] = []
  const labels: Entity[] = []
  // Declared before addSystem: the system runs on the next frame and reads it
  // (CLAUDE.md §6 #7).
  let elapsed = REFRESH_SECONDS // SDK6 starts "overdue" so it fetches immediately.
  let disposed = false

  const root = engine.addEntity()
  owned.push(root)
  Transform.create(root, { parent, position: BOARD_POSITION, rotation: Quaternion.Identity() })

  // The artwork. SDK6 used a BasicMaterial (unlit) — SDK7's setBasicMaterial is
  // the direct equivalent, and it sidesteps the emissive blow-out that bit the
  // golfclub board.
  const plane = engine.addEntity()
  owned.push(plane)
  Transform.create(plane, { parent: root, position: PLANE_OFFSET, scale: BOARD_SCALE })
  MeshRenderer.setPlane(plane)
  Material.setBasicMaterial(plane, {
    texture: Material.Texture.Common({ src: getTexture('images/seasons-screen.png').src })
  })

  // 20 labels in a 5-wide, 4-tall grid. Offsets are verbatim from SDK6, which
  // parents them to the lobby root (not to the board), hence BOARD_POSITION +
  // offset here expressed relative to `root`.
  for (let n = 0; n < LABEL_COUNT; n++) {
    const column = n % 5
    const row = Math.floor(n / 5)
    const label = engine.addEntity()
    owned.push(label)
    labels.push(label)
    Transform.create(label, {
      parent: root,
      position: Vector3.create(-1.85 + column * 0.457, 1.93 - row * 0.47, -0.01),
      scale: Vector3.create(0.5, 0.5, 0.5)
    })
    TextShape.create(label, {
      text: '',
      fontSize: 1,
      textAlign: TextAlignMode.TAM_TOP_LEFT,
      textColor: { r: 1, g: 1, b: 1, a: 1 },
      // SDK6 gave these a blue drop shadow so they stay readable on the artwork.
      outlineColor: { r: 0, g: 0, b: 1 },
      outlineWidth: 0.2
    })
  }

  const stockSystem = (dt: number) => {
    if (disposed) return
    elapsed += dt
    if (elapsed < REFRESH_SECONDS) return
    elapsed = 0
    refreshStock()
  }
  engine.addSystem(stockSystem)

  return {
    refresh: refreshStock,
    dispose: () => {
      disposed = true
      engine.removeSystem(stockSystem)
      for (const e of owned) {
        try {
          engine.removeEntity(e)
        } catch (_) {}
      }
      owned.length = 0
      labels.length = 0
    }
  }

  async function refreshStock() {
    const response = await getSeasonRewardsStock()
    const wearables = response?.result?.wearables
    if (!wearables?.length) return
    for (let n = 0; n < labels.length && n < wearables.length; n++) {
      const stock = (wearables[n].maxStock || 0) - (wearables[n].claimed || 0)
      const ft = wearables[n].fashionTickets
      const text = TextShape.getMutableOrNull(labels[n])
      if (!text) continue
      // SDK6: once a wearable runs out you get Fashion Tickets instead, and the
      // label shows how many.
      text.text = stock > 0 ? `\n${stock} left` : `\n${stock} left (${ft} FT)`
    }
  }
}
