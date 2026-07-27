import { engine, Entity, Transform, GltfContainer, Animator } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { getGLTFShape } from '../../../services/resource-repo'

type Vec3 = Vector3.MutableVector3

const createGolfClub = (parent: Entity, { id }: { id: string | number }) => {
  const baseUrl = (engine as any)['__COURSE_MODELS_BASE__'] || ''
  const entity = engine.addEntity()
  const model = getGLTFShape(`${baseUrl}models/golfClub${id}.glb`)

  Transform.create(entity, {
    parent,
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  GltfContainer.create(entity, { src: model.src })
  Animator.create(entity, {
    states: [
      { clip: 'idle', playing: true, loop: true },
      { clip: 'shoot1', playing: false, loop: false }
    ]
  })

  return {
    setPosition: (position: Vec3) => {
      const t = Transform.getMutableOrNull(entity)
      if (t) t.position = position
    },
    hide: () => {
      engine.removeEntity(entity)
    },
    show: () => {
      // SDK6 toggled parent. In SDK7, dispose removes the entity; show is
      // a no-op for the migrated surface.
    },
    reproduceAnimation: (name: 'idle' | 'shoot1') => {
      const animator = Animator.getMutableOrNull(entity)
      if (!animator) return
      for (const state of animator.states) {
        state.playing = false
      }
      const target = animator.states.find((s) => s.clip === name)
      if (target) {
        target.playing = true
        target.loop = name === 'idle'
      }
    },
    dispose: () => {
      engine.removeEntity(entity)
    }
  }
}

export { createGolfClub }
