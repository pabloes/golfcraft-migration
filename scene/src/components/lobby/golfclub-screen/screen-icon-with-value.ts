// SDK7 port of SDK6 scene/src/components/lobby/golfclub-screen/screen-icon-with-value.ts
// The material-cost readout under the buttons: a material icon plus the amount
// the pending upgrade will spend (e.g. wood icon + "10").
import { Entity, Font, TextAlignMode, TextShape, Transform, VisibilityComponent, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { setSpritePlane, setSpriteMaterial } from './sprite-material'

export const createScreenIconWithValue = (
  parent: Entity,
  { position, src, value }: { position: Vector3.MutableVector3; src: string; value: number | string }
) => {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position })

  const icon = engine.addEntity()
  Transform.create(icon, { parent: entity, scale: Vector3.create(0.3, 0.3, 1) })
  setSpritePlane(icon, src)

  const description = engine.addEntity()
  Transform.create(description, { parent: entity, position: Vector3.create(0.3, 0.125, 0) })
  TextShape.create(description, {
    text: String(value),
    fontSize: 2,
    paddingLeft: 0.3,
    paddingTop: 0,
    textAlign: TextAlignMode.TAM_TOP_LEFT,
    textColor: { r: 1, g: 1, b: 0.7, a: 1 },
    font: Font.F_SANS_SERIF
  })

  const setVisible = (visible: boolean) => {
    VisibilityComponent.createOrReplace(icon, { visible })
    VisibilityComponent.createOrReplace(description, { visible })
  }

  return {
    updateValue: (next: number | string) => {
      const text = TextShape.getMutableOrNull(description)
      if (text) text.text = String(next)
    },
    show: () => setVisible(true),
    hide: () => setVisible(false),
    setIcon: (nextSrc: string) => setSpriteMaterial(icon, nextSrc),
    dispose: () => {
      for (const e of [entity, icon, description]) engine.removeEntity(e)
    }
  }
}
