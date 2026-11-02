// The giveaway poster on the lobby wall (services/giveaway.ts), on the spot of
// SDK6's season leaderboard at local (-11.5, 2, 21.5): the z = 21.5 wall held,
// left to right, the player statistics (-15), that leaderboard, the Season
// panel (-7, ours) and the training leaderboard (-5); only the Season panel was
// ported, so the spot is free. Rotation 0 faces the room like the Season panel
// (an SDK7 plane's front is -Z). Created once with the lobby, like the stream
// screens: it hides itself while a game runs and once the campaign is over, and
// a click opens the poster in the HUD.
import { ColliderLayer, Entity, InputAction, Material, MeshCollider, MeshRenderer, Transform, engine, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { globalStore } from '../../services/globalStore/globalStore'
import { GIVEAWAY, isGiveawayActive } from '../../services/giveaway'
import { giveawayUiState } from '../../ui/giveaway-state'

const POSITION = Vector3.create(-12, 2.4, 21.5)
const WIDTH = 3.2

export function createGiveawayBanner(parent: Entity) {
  const banner = engine.addEntity()
  Transform.create(banner, { parent, position: POSITION, scale: Vector3.create(WIDTH, WIDTH * GIVEAWAY.bannerRatio, 1) })
  // unlit: a poster, not a lit surface
  Material.setBasicMaterial(banner, { texture: Material.Texture.Common({ src: GIVEAWAY.banner }) })
  pointerEventsSystem.onPointerDown(
    { entity: banner, opts: { button: InputAction.IA_POINTER, hoverText: 'Wearables giveaway' } },
    () => {
      giveawayUiState.open = true
    }
  )

  let shown = false
  const show = (visible: boolean) => {
    shown = visible
    if (visible) {
      MeshRenderer.setPlane(banner)
      MeshCollider.setPlane(banner, ColliderLayer.CL_POINTER)
    } else {
      MeshRenderer.deleteFrom(banner)
      MeshCollider.deleteFrom(banner)
    }
  }

  let elapsed = 1
  engine.addSystem((dt) => {
    elapsed += dt
    if (elapsed < 1) return
    elapsed = 0
    const game = globalStore.game.getState()
    const visible = isGiveawayActive() && !(game.playing || game.editing)
    if (visible !== shown) show(visible)
  })
}
