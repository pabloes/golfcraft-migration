// SDK7 port of SDK6 scene/src/components/imageButton.ts
// A textured plane that can be clicked, optionally cropped out of a sprite atlas
// via `uvs`. Used by the season panel for the rank emblem and its two buttons.
//
// Two traps carried over from the golfclub board (CLAUDE.md §11):
//   - SDK6 flipped these planes with NEGATIVE scales; in SDK7 that mirrors the
//     texture instead of flipping the face, so callers pass positive scales.
//   - SDK7 needs a CL_POINTER collider for pointer events, and the collider must
//     sit on the camera side of the artwork (-Z here) to win the raycast.
import {
  ColliderLayer,
  Entity,
  InputAction,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  Transform,
  VisibilityComponent,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getTexture } from '../../golfplay/services/resource-repo'

export type ImageButtonOptions = {
  position: Vector3.MutableVector3
  rotation?: Quaternion.MutableQuaternion
  scale?: Vector3.MutableVector3
  imageSrc: string
  hoverText?: string
  withEmissive?: boolean
  emissiveColor?: Color3.MutableColor3
  emissiveIntensity?: number
  uvs?: number[]
}

export const createImageButton = (parent: Entity, opts: ImageButtonOptions) => {
  const {
    position,
    rotation,
    scale,
    imageSrc,
    hoverText,
    // SDK6 defaulted emissive on at intensity 3. bevy's emissive is far
    // stronger and blew the golfclub sprites out, so it stays off unless a
    // caller explicitly asks (see CLAUDE.md §11).
    withEmissive = false,
    emissiveColor = Color3.White(),
    emissiveIntensity = 1,
    uvs
  } = opts

  const callbacks: { onClick: (() => void) | null } = { onClick: null }
  const state = { visible: true, enabled: true }

  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position,
    rotation: rotation || Quaternion.Identity(),
    scale: scale || Vector3.One()
  })

  // uvs crop this plane out of a sprite atlas (season-badges.png).
  if (uvs) MeshRenderer.setPlane(entity, uvs)
  else MeshRenderer.setPlane(entity)

  const applyMaterial = (src: string) => {
    const texture = Material.Texture.Common({ src: getTexture(src).src })
    Material.setPbrMaterial(entity, {
      texture,
      ...(withEmissive
        ? { emissiveTexture: texture, emissiveColor, emissiveIntensity }
        : {}),
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
      roughness: 1,
      metallic: 0
    })
  }
  applyMaterial(imageSrc)

  // Click target: a thin box just in front of the artwork.
  const clickBox = engine.addEntity()
  Transform.create(clickBox, { parent: entity, position: Vector3.create(0, 0, -0.06), scale: Vector3.create(1, 1, 0.1) })
  MeshCollider.setBox(clickBox, ColliderLayer.CL_POINTER)

  let registered = false
  const register = () => {
    if (registered) return
    registered = true
    pointerEventsSystem.onPointerDown({ entity: clickBox, opts: { button: InputAction.IA_POINTER, hoverText } }, () => {
      if (!state.enabled || !state.visible) return
      callbacks.onClick && callbacks.onClick()
    })
  }
  const unregister = () => {
    if (!registered) return
    registered = false
    pointerEventsSystem.removeOnPointerDown(clickBox)
  }
  register()

  const setVisible = (visible: boolean) => {
    state.visible = visible
    VisibilityComponent.createOrReplace(entity, { visible })
    if (visible) register()
    else unregister()
  }

  return {
    show: () => setVisible(true),
    hide: () => setVisible(false),
    onClick: (fn: () => void) => {
      callbacks.onClick = fn
      return () => (callbacks.onClick = null)
    },
    enable: () => (state.enabled = true),
    disable: () => (state.enabled = false),
    // SDK6 exposed getShape() so callers could poke `.uvs` / `.visible`.
    setUvs: (nextUvs: number[]) => MeshRenderer.setPlane(entity, nextUvs),
    setImage: (src: string) => applyMaterial(src),
    getEntity: () => entity,
    dispose: () => {
      unregister()
      engine.removeEntity(clickBox)
      engine.removeEntity(entity)
    }
  }
}
