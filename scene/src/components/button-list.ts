// SDK7 port of SDK6 scene/src/components/button-list.ts
// The elevator panels in the middle of the building: a vertical stack of
// buttons, one per floor, that teleport the player. The button for the floor
// you are standing on is disabled and its label is yellow.
import {
  ColliderLayer,
  Entity,
  GltfContainer,
  InputAction,
  MeshCollider,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

export type ButtonDefinition = {
  label: string
  action: () => void
  hoverText?: string
}

export type ButtonListOptions = {
  activeIndex?: number
  buttonDefinitions: ButtonDefinition[]
  buttonModel: string
  position: Vector3.MutableVector3
  rotation?: Quaternion.MutableQuaternion
}

export const createButtonList = (
  parent: Entity,
  { activeIndex = 0, buttonDefinitions, buttonModel, position, rotation }: ButtonListOptions
) => {
  const owned: Entity[] = []

  const entity = engine.addEntity()
  owned.push(entity)
  Transform.create(entity, { parent, position, rotation: rotation || Quaternion.Identity() })

  buttonDefinitions.forEach((definition, index) => {
    createButton(entity, {
      position: Vector3.create(0, -index * 0.8, 0),
      label: definition.label,
      action: definition.action,
      disabled: index === activeIndex,
      hoverText: definition.hoverText || definition.label
    })
  })

  return {
    dispose: () => {
      for (const e of owned) {
        try {
          engine.removeEntity(e)
        } catch (_) {}
      }
      owned.length = 0
    }
  }

  function createButton(
    listEntity: Entity,
    {
      disabled,
      position: buttonPosition,
      label,
      action,
      hoverText
    }: { disabled: boolean; position: Vector3.MutableVector3; label: string; action: () => void; hoverText: string }
  ) {
    const button = engine.addEntity()
    owned.push(button)
    Transform.create(button, { parent: listEntity, position: buttonPosition })
    GltfContainer.create(button, { src: buttonModel })

    // SDK6 put an alpha-0 BoxShape in front to catch the click. In SDK7 a
    // CL_POINTER collider is enough — no renderer, no material.
    const handler = engine.addEntity()
    owned.push(handler)
    Transform.create(handler, { parent: button, scale: Vector3.create(2.2, 0.8, 0.22) })
    MeshCollider.setBox(handler, ColliderLayer.CL_POINTER)

    if (!disabled) {
      pointerEventsSystem.onPointerDown(
        { entity: handler, opts: { button: InputAction.IA_POINTER, hoverText } },
        action
      )
    }

    const labelEntity = engine.addEntity()
    owned.push(labelEntity)
    Transform.create(labelEntity, { parent: button, scale: Vector3.create(0.5, 0.5, 0.5) })
    TextShape.create(labelEntity, {
      text: label,
      // The floor you are on is highlighted instead of being clickable.
      textColor: disabled
        ? { r: 1, g: 1, b: 0, a: 1 }
        : { r: 1, g: 1, b: 1, a: 1 },
      fontSize: label.indexOf('\n') !== -1 ? 4 : 5
    })
  }
}
