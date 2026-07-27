import { engine, Entity, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

export const createVisualMagnet = (
  parent: Entity,
  { position, radius }: { position: Vector3.MutableVector3; radius: number }
) => {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position,
    scale: Vector3.create(radius, radius, radius)
  })

  const center = engine.addEntity()
  Transform.create(center, {
    parent: entity,
    scale: Vector3.create(0.1, 0.1, 0.1)
  })
  MeshRenderer.setBox(center)
  Material.setPbrMaterial(center, {
    albedoColor: Color4.Red()
  })

  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(1, 1, 1, 0.1)
  })

  return {
    dispose: () => {
      engine.removeEntity(entity)
      engine.removeEntity(center)
    }
  }
}
