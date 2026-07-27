// SDK7 port of SDK6 scene/src/components/lobby/golfclub-screen/button-handler.ts
//
// SDK6 trick: the button sprites are PlaneShapes, which were unreliable pointer
// targets, so each one got an invisible-ish BoxShape child slightly in front of
// it that actually receives the click. `enable(value)` toggled that box's
// visible + isPointerBlocker together.
//
// SDK7 equivalent: a box with a CL_POINTER MeshCollider, and enable() toggles
// VisibilityComponent + registers/removes the pointer handler (in SDK7 an entity
// keeps receiving clicks while a handler is registered, even when invisible, so
// removing it is what actually disables the button).
import {
  ColliderLayer,
  Entity,
  InputAction,
  MeshCollider,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export type HandlerOptions = { hoverText?: string }

// The board passes its whole state object; the attribute buttons pass their own
// (which has no `loading` field at all, so their clicks are never blocked —
// same as SDK6).
export function createHandlerFrom(
  parent: Entity,
  state: { loading?: boolean; [key: string]: any },
  callback: () => void,
  options?: HandlerOptions
) {
  const handler = engine.addEntity()
  Transform.create(handler, {
    // The board's front (camera) side is -Z — that's why SDK6 offsets its button
    // sprites to z=-0.01. SDK6 wrote z:+0.1 here, but its parent planes carried a
    // negative Z scale, so the box actually landed at -0.1, i.e. in FRONT of the
    // artwork. With positive scales in SDK7 we have to write the -0.1 ourselves;
    // leaving it at +0.1 put every click target behind the board face, where the
    // full-screen E/F box swallowed the raycast and no button responded.
    parent,
    position: Vector3.create(0, 0, -0.1),
    scale: Vector3.create(1, 1, 0.25)
  })
  // Collider only, no MeshRenderer. SDK6 gave this box a BoxShape tinted cyan at
  // 40% alpha and toggled its `visible` in enable() — but because SDK6's sprite
  // planes had a negative Z scale, the box ended up BEHIND the artwork and was
  // never actually seen. With positive scales in SDK7 it would sit in front and
  // tint every button cyan, so drop the visual entirely: SDK7 pointer events only
  // need a CL_POINTER collider.
  MeshCollider.setBox(handler, ColliderLayer.CL_POINTER)

  let enabled = false

  return {
    enable: (value: boolean) => {
      const next = !!value
      if (next === enabled) return
      enabled = next
      if (next) {
        pointerEventsSystem.onPointerDown(
          { entity: handler, opts: { button: InputAction.IA_POINTER, hoverText: options?.hoverText } },
          () => {
            if (state.loading) return
            callback()
          }
        )
      } else {
        pointerEventsSystem.removeOnPointerDown(handler)
      }
    },
    dispose: () => {
      if (enabled) pointerEventsSystem.removeOnPointerDown(handler)
      engine.removeEntity(handler)
    },
    getEntity: () => handler
  }
}
