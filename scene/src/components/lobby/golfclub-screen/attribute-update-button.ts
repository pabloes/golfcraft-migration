// SDK7 port of SDK6 scene/src/components/lobby/golfclub-screen/attribute-update-button.ts
// The little "+" next to each attribute row (power / control / aim). Two visual
// states: idle (clickable) and active (this attribute is the one selected for
// the pending upgrade, so its own click target is disabled).
import { Entity, Transform, VisibilityComponent, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { createHandlerFrom } from './button-handler'
import { setSpritePlane, setSpriteMaterial } from './sprite-material'

const IDLE = 'images/attribute-plus-idle.png'
const ACTIVE = 'images/attribute-plus-active.png'

export const createAttributeUpdateButton = (
  parent: Entity,
  { position, value }: { position: Vector3.MutableVector3; value?: boolean }
) => {
  const callbacks: { onClick: (() => void) | null } = { onClick: null }
  const state: { value?: boolean; visible: boolean } = { value, visible: true }

  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale: Vector3.create(0.2, 0.2, 0.2) })
  setSpritePlane(entity, IDLE)

  const handler = createHandlerFrom(
    entity,
    state,
    () => {
      callbacks.onClick && callbacks.onClick()
    },
    { hoverText: 'Upgrade' }
  )

  updateViewFromState()

  function updateViewFromState() {
    if (state.value) {
      handler.enable(false)
      setSpriteMaterial(entity, ACTIVE)
    } else {
      handler.enable(state.visible)
      setSpriteMaterial(entity, IDLE)
    }
    VisibilityComponent.createOrReplace(entity, { visible: state.visible })
  }

  return {
    onClick: (fn: () => void) => {
      callbacks.onClick = fn
    },
    setState: (newState: { visible?: boolean; value?: boolean }) => {
      Object.assign(state, newState)
      updateViewFromState()
    },
    dispose: () => {
      handler.dispose()
      engine.removeEntity(entity)
    }
  }
}
