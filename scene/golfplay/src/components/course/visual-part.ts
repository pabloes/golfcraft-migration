import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  TextShape,
  MeshRenderer,
  Material,
  Animator,
  AudioSource,
  VisibilityComponent,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import ExpressionStorage from '../../../../../lib/expression-storage/_expression-storage'
import { getGLTFShape, getTexture } from '../../../services/resource-repo'

const { getVariablesFromExpression, evaluateExpression } = ExpressionStorage

type Vec3 = Vector3.MutableVector3
type Quat = Quaternion.MutableQuaternion

export type PartOptions = {
  id: string
  position: Vec3
  rotation?: Quat
  scale?: Vec3
  type: string
  subtype: string
  animation: any
  runtime: {
    storage?: string
    read?: string
  }
  expressions: any
  partDefinition: any
}

const ANIMATION = {
  IDLE: '0. Idle',
  ACTION: '1. Explosion'
}

// SDK6 had @Component("MovingPartComponent") for tagging. SDK7 equivalent
// is a flag component, declared once and re-used across entities.
export const MovingPartComponent = engine.defineComponent('MovingPartComponent', {})

// Model parts collide on this layer only (no physics, no pointer), so the
// camera can find the ones standing between it and the ball
// (camera-occlusion.ts). Each registers how to hide itself for that reason.
export const OCCLUSION_LAYER = ColliderLayer.CL_CUSTOM1
export const occludableParts = new Map<Entity, (occluded: boolean) => void>()

const reactiveSwitch = (entity: Entity, partDefinition: any) => {
  const baseUrl: string = (engine as any)['__COURSE_MODELS_BASE__'] || ''
  const soundEntity = engine.addEntity()
  Transform.create(soundEntity, { parent: entity })

  Animator.create(entity, {
    states: [
      { clip: '0. switch_false', playing: true, loop: false },
      { clip: '1. switch_true', playing: false, loop: false }
    ]
  })

  return (state: any) => {
    const value = !!state[partDefinition.expressions.runtime.storage]
    const animator = Animator.getMutableOrNull(entity)
    if (animator) {
      for (const s of animator.states) s.playing = false
      const target = animator.states.find((s) => s.clip === (value ? '1. switch_true' : '0. switch_false'))
      if (target) target.playing = true
    }
    const file = value ? 'sounds/lvl_switch_off.mp3' : 'sounds/lvl_switch_off.mp3'
    AudioSource.createOrReplace(soundEntity, {
      audioClipUrl: baseUrl + file,
      playing: true,
      loop: false,
      volume: 1
    })
  }
}

const createVisualPart = (
  parent: Entity,
  {
    id,
    animation,
    type,
    subtype,
    position,
    rotation,
    scale,
    partDefinition,
    expressions
  }: PartOptions
) => {
  const baseUrl: string = (engine as any)['__COURSE_MODELS_BASE__'] || ''
  const entity = engine.addEntity()
  const rot = rotation || Quaternion.Identity()
  const scl = scale || Vector3.One()
  // Track every sub-entity we create so dispose() can remove them. SDK6
  // relied on setParent(null) + engine.removeEntity to cascade-clean
  // children; SDK7 does not cascade — orphaned children keep rendering.
  const ownedEntities: Entity[] = [entity]
  let shownByCourse = true
  let occluded = false

  if (animation) {
    MovingPartComponent.create(entity, {})
  }

  Transform.create(entity, { parent, position, rotation: rot, scale: scl })

  if (type === 'image') {
    const imagePart = engine.addEntity()
    const imageWidth = expressions?.image?.width !== undefined ? expressions.image.width : 4
    const imageHeight = expressions?.image?.height !== undefined ? expressions.image.height : 3
    Transform.create(imagePart, {
      parent: entity,
      scale: Vector3.create(-imageWidth, -imageHeight, -1)
    })
    MeshRenderer.setPlane(imagePart)
    const tex = getTexture(expressions?.image?.url || '')
    Material.setPbrMaterial(imagePart, {
      texture: Material.Texture.Common({ src: tex.src }),
      emissiveTexture: Material.Texture.Common({ src: tex.src }),
      emissiveIntensity: 0.5,
      roughness: 1
    })
    ownedEntities.push(imagePart)
  } else if (type === 'text') {
    const textPart = engine.addEntity()
    Transform.create(textPart, { parent: entity })
    TextShape.create(textPart, { text: expressions?.text?.value || '' })
    ownedEntities.push(textPart)
  } else {
    const shape = getGLTFShape(`${baseUrl}models/${subtype || type}.gltf`)
    GltfContainer.create(entity, { src: shape.src, visibleMeshesCollisionMask: OCCLUSION_LAYER })
    // Floors never block the view of the ball, they hold it: the camera ray
    // grazed the slab the ball sits on and hid the ground under the ball
    // (user, 2026-11-02), so they are not candidates for occlusion.
    if (!/floor/i.test(subtype || type)) {
      occludableParts.set(entity, (value) => {
        if (value === occluded) return
        occluded = value
        applyVisibility()
      })
    }
  }

  const listeningVariables: string[] = []
  if (partDefinition.expressions?.runtime?.ignored || partDefinition.expressions?.runtime?.hidden) {
    decorateVariableCollectionFromExpression(
      partDefinition.expressions.runtime.ignored || partDefinition.expressions.runtime.hidden
    )
  }

  const specificReactives: Array<(state: any) => void> = []
  if (subtype && subtype.indexOf('control_switch') !== -1) {
    specificReactives.push(reactiveSwitch(entity, partDefinition))
  }

  // Explosive parts get an IDLE/ACTION animator + dedicated audio entity.
  let explosiveAudio: Entity | null = null
  if (partDefinition.type === 'explosive' || partDefinition.subtype === 'explosive_mine') {
    Animator.createOrReplace(entity, {
      states: [
        { clip: ANIMATION.IDLE, playing: true, loop: true },
        { clip: ANIMATION.ACTION, playing: false, loop: false }
      ]
    })
    explosiveAudio = engine.addEntity()
    Transform.create(explosiveAudio, { parent: entity })
    AudioSource.create(explosiveAudio, {
      audioClipUrl: `${baseUrl}sounds/lvl_mine_explode.mp3`,
      playing: false,
      loop: false,
      volume: 1
    })
    ownedEntities.push(explosiveAudio)
  }

  // Reversible show/hide. SDK6 toggled visibility; the earlier port used
  // engine.removeEntity(entity) which is ONE-WAY (once removed, flipping the
  // switch back to visible could never restore it — the wall stayed gone
  // visually while physics correctly re-appeared). Toggle VisibilityComponent
  // on every owned entity (entity + text/image sub-parts) instead.
  // Two reasons hide a part: the course's own hide-condition and the camera
  // (while the part blocks the view of the ball); it shows when neither does.
  function applyVisibility() {
    const v = shownByCourse && !occluded
    for (const e of ownedEntities) VisibilityComponent.createOrReplace(e, { visible: v })
  }
  const setVisible = (v: boolean) => {
    shownByCourse = v
    applyVisibility()
  }

  const hiddenExpr: string | undefined =
    partDefinition.expressions?.runtime?.ignored || partDefinition.expressions?.runtime?.hidden

  const reactive = (state: any) => {
    // Evaluate the hide-condition on EVERY call (initial applyAllValues + each
    // change), NOT only when `state` already contains a listened variable —
    // otherwise a part that must START hidden (e.g. mission-5's "secret path",
    // hidden until both switches are on) stays visible because at first-apply
    // the switch vars may be absent/false. With an empty/default state the
    // condition still evaluates hidden=true (e.g. `!(s1 && s2)`), so it hides.
    if (hiddenExpr) {
      setVisible(!evaluateExpression(hiddenExpr, state))
    }
    specificReactives.forEach((r) => r(state))
  }

  const disposeAll = () => {
    occludableParts.delete(entity)
    for (const e of ownedEntities) {
      try {
        engine.removeEntity(e)
      } catch (_) {
        // Entity may already be gone (e.g. reactive hide path).
      }
    }
    ownedEntities.length = 0
  }

  return {
    id,
    react: reactive,
    reproduceAction: (_id: any) => {
      const animator = Animator.getMutableOrNull(entity)
      if (animator) {
        for (const s of animator.states) s.playing = false
        const action = animator.states.find((s) => s.clip === ANIMATION.ACTION)
        if (action) action.playing = true
      }
      if (explosiveAudio) {
        const src = AudioSource.getMutableOrNull(explosiveAudio)
        if (src) src.playing = true
      }
      // SDK6 used setTimeout to remove after 1s. SDK7 has setTimeout in
      // runtime; the original semantics are preserved.
      setTimeout(() => {
        disposeAll()
      }, 1000)
    },
    hide: () => {},
    dispose: disposeAll,
    getEntity: () => entity
  }

  function decorateVariableCollectionFromExpression(expression: string) {
    if (!expression) return
    const variableNames = getVariablesFromExpression(expression) || []
    variableNames.forEach((variableName) => {
      if (listeningVariables.indexOf(variableName) === -1) {
        listeningVariables.push(variableName)
      }
    })
  }
}

export { createVisualPart }
