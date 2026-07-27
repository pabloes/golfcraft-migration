import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  MeshRenderer,
  Material,
  Animator,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Vector3, Color3 } from '@dcl/sdk/math'

const createVisualHole = (parent: Entity, { hole }: { hole: { position: number[] } }) => {
  const baseUrl: string = (engine as any)['__COURSE_MODELS_BASE__'] || ''

  const [x, y, z] = hole.position

  // Vertical light beam.
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position: Vector3.create(x, y + 5, z),
    scale: Vector3.create(0.01, 10, 0.01)
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    emissiveColor: Color3.Purple(),
    emissiveIntensity: 10
  })

  // Hole indicator gltf on the ground.
  const entityGltf = engine.addEntity()
  Transform.create(entityGltf, {
    parent,
    position: Vector3.create(x, y, z)
  })
  GltfContainer.create(entityGltf, { src: `${baseUrl}models/hole_indicator.gltf` })

  // Win animation gltf (hidden until reproduceHoleAction).
  const winEntity = engine.addEntity()
  Transform.create(winEntity, {
    parent,
    position: Vector3.create(x, y - 4.45 + 5, z)
  })
  GltfContainer.create(winEntity, { src: `${baseUrl}models/hole_win_basic.gltf` })
  VisibilityComponent.create(winEntity, { visible: false })
  Animator.create(winEntity, {
    states: [
      {
        clip: 'Animation',
        playing: false,
        loop: false
      }
    ]
  })

  return {
    reproduceHoleAction: () => {
      VisibilityComponent.createOrReplace(winEntity, { visible: true })
      const animator = Animator.getMutableOrNull(winEntity)
      if (animator) {
        const clip = animator.states.find((s) => s.clip === 'Animation')
        if (clip) {
          clip.playing = true
        }
      }
    },
    dispose: () => {
      engine.removeEntity(entity)
      engine.removeEntity(entityGltf)
      engine.removeEntity(winEntity)
    }
  }
}

export { createVisualHole }
