import { engine, Entity, Transform, GltfContainer, Animator } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getGLTFShape } from '../../services/resource-repo'

type Vec3 = Vector3.MutableVector3
type CheckpointOptions = {
  position: Vec3
  visible: boolean
  initialState?: any
}

const CheckpointFactory = ({ baseResourceUrl }: { baseResourceUrl: string }) => {
  const shape = getGLTFShape(baseResourceUrl + 'models/checkpoint_b.gltf')

  const createCheckpoint = (parent: Entity, { position, visible }: CheckpointOptions) => {
    const entity = engine.addEntity()
    Transform.create(entity, {
      parent: visible ? parent : undefined,
      scale: Vector3.create(0.5, 0.5, 0.5),
      position
    })

    const animated = engine.addEntity()
    Transform.create(animated, { parent: entity })
    GltfContainer.create(animated, { src: shape.src })
    Animator.create(animated, {
      states: [
        {
          clip: 'Armature.001Action',
          playing: true,
          loop: true
        }
      ]
    })

    return {
      show: () => {
        const t = Transform.getMutable(entity)
        t.parent = parent
      },
      hide: () => {
        engine.removeEntity(entity)
        engine.removeEntity(animated)
      },
      moveTo: (newPosition: Vec3) => {
        const t = Transform.getMutableOrNull(entity)
        if (t) t.position = newPosition
      },
      dispose: () => {
        engine.removeEntity(entity)
        engine.removeEntity(animated)
      }
    }
  }
  return { createCheckpoint }
}

export { CheckpointFactory }
