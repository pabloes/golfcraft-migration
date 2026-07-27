import { engine, Entity, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

export const createVisualExplosiveHandler = (
  parent: Entity,
  { position, scale }: { position: Vector3.MutableVector3; scale: { x: number } }
) => {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position,
    scale: Vector3.create(scale.x, scale.x, scale.x)
  })

  const center = engine.addEntity()
  Transform.create(center, {
    parent: entity,
    scale: Vector3.create(0.1, 0.1, 0.1)
  })

  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(1, 1, 1, 0.3)
  })

  return {
    dispose: () => {
      engine.removeEntity(entity)
      engine.removeEntity(center)
    }
  }
}
