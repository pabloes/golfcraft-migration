import { engine, Entity, Transform, GltfContainer, VisibilityComponent } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

type Vec3 = Vector3.MutableVector3
type VisualZoneOptions = { position: Vec3; scale: Vec3 }

const VisualZoneFactory = ({ baseResourceUrl }: { baseResourceUrl: string }) => {
  const src = baseResourceUrl + 'models/zone.gltf'

  const createVisualZone = (parent: Entity, { position, scale }: VisualZoneOptions) => {
    const entity = engine.addEntity()
    Transform.create(entity, { parent, position, scale })
    GltfContainer.create(entity, { src })

    return {
      show: () => {
        VisibilityComponent.createOrReplace(entity, { visible: true })
      },
      hide: () => {
        VisibilityComponent.createOrReplace(entity, { visible: false })
      },
      moveTo: (newPosition: Vec3) => {
        const t = Transform.getMutableOrNull(entity)
        if (t) t.position = newPosition
      },
      dispose: () => {
        engine.removeEntity(entity)
      }
    }
  }
  return { createVisualZone }
}

export { VisualZoneFactory }
