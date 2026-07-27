// SDK7 port of SDK6 scene/src/components/lobby/golfclub-screen/screen-bar.ts
// The golfclub XP/level bar at the top of the board: a static frame sprite, a
// plain white quad scaled horizontally to show progress, and a "NN.NN%" label.
import { Entity, TextShape, Transform, engine, MeshRenderer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { setSpritePlane } from './sprite-material'

export const createScreenBar = (
  parent: Entity,
  { position, scale, value }: { position: Vector3.MutableVector3; scale?: Vector3.MutableVector3; value: number }
) => {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale: scale || Vector3.One() })

  const back = engine.addEntity()
  Transform.create(back, { parent: entity, position: Vector3.create(0.5, 0, 0) })
  setSpritePlane(back, 'images/golfclub-level-bar.png')

  // The fill quad has no material in SDK6 either -> default white.
  const barEntity = engine.addEntity()
  Transform.create(barEntity, {
    parent: entity,
    position: Vector3.create(value / 2, 0, 0),
    scale: Vector3.create(value, 1, 1)
  })
  MeshRenderer.setPlane(barEntity)

  // NOTE: SDK6 parents the percentage label to `parent`, NOT to the bar
  // container, so it escapes the container's (1.8, 0.15, 1) scale and renders
  // at normal size. Keep that.
  const progress = engine.addEntity()
  Transform.create(progress, {
    parent,
    position: Vector3.add(position, Vector3.create(1.7, 0.13, 0))
  })
  TextShape.create(progress, { text: `${(value * 100).toFixed(2)}%`, fontSize: 1 })

  const ownedEntities: Entity[] = [entity, back, barEntity, progress]

  return {
    setValue: (next: number) => {
      const text = TextShape.getMutableOrNull(progress)
      if (text) text.text = `${(next * 100).toFixed(2)}%`
      const t = Transform.getMutableOrNull(barEntity)
      if (t) {
        t.position = Vector3.create(next / 2, 0, 0)
        t.scale = Vector3.create(next, 1, 1)
      }
    },
    dispose: () => {
      for (const e of ownedEntities) engine.removeEntity(e)
    }
  }
}
