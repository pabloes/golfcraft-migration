import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  MeshRenderer,
  Material,
  MaterialTransparencyMode,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { createGolfClub } from './golf-club'
import { getGLTFShape } from '../../../services/resource-repo'
import { powerBarState } from '../../../../src/ui/shoot-hud-state'
// @ts-ignore - createState is plain TS, no SDK contact
import { createState } from '../../../../state'

type Vec3 = Vector3.MutableVector3
type Quat = Quaternion.MutableQuaternion
type CreateShootControlOptions = {
  position: Vec3
  rotation: Quat
  aimLength: number
  golfClubId: string | number
  hideGolfclub?: boolean
}

// SDK6 had a HUD power bar (UICanvas + UIContainerRect). In SDK7 this needs
// ReactEcs. For the first milestone the power bar is in-world only (the green
// rod that grows with power). HUD migration is deferred.

const createShootControlVisual = (
  parent: Entity,
  { position, rotation, aimLength, golfClubId, hideGolfclub }: CreateShootControlOptions
) => {
  const baseUrl = (engine as any)['__COURSE_MODELS_BASE__'] || ''
  const store = createState({ powerMode: false })
  const state = store.getState()

  const aimingPowerSrc = getGLTFShape(baseUrl + 'models/aiming_power.gltf').src
  const aimingRotationSrc = getGLTFShape(baseUrl + 'models/aiming_rotation.gltf').src

  // SDK6 power rod used images/shoot.png as both albedoTexture AND alphaTexture
  // (a partially-transparent striped texture). albedoColor tints it as power
  // ramps green->yellow->red. Re-applied on every recolour so the texture isn't
  // dropped (setPbrMaterial replaces the whole material).
  const shootTex = Material.Texture.Common({ src: baseUrl + 'images/shoot.png' })
  const powerMaterial = (color: ReturnType<typeof Color4.create>) => ({
    texture: shootTex,
    alphaTexture: shootTex,
    albedoColor: color,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    roughness: 1,
    metallic: 0
  })

  const MIN_SCALE = 0.3
  const scale100 = 4
  const maxAimLength = 10

  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, rotation })

  const rod = !hideGolfclub ? createGolfClub(entity, { id: golfClubId }) : null

  // Power rod (green): grows with power.
  const power = engine.addEntity()
  const scaleVec = Vector3.create(0.2, 0.01, scale100 / 2)
  Transform.create(power, {
    parent: entity,
    position: Vector3.create(0, 0, scaleVec.z / 2),
    scale: scaleVec
  })
  MeshRenderer.setBox(power)
  Material.setPbrMaterial(power, powerMaterial(Color4.create(0, 1, 0, 1)))

  // Aim rod (thin white line).
  const aim = engine.addEntity()
  Transform.create(aim, {
    parent: entity,
    position: Vector3.create(0, -0.01, (maxAimLength * aimLength) / 100 / 2),
    scale: Vector3.create(0.01, 0.01, (maxAimLength * aimLength) / 100)
  })
  MeshRenderer.setBox(aim)
  Material.setPbrMaterial(aim, {
    albedoColor: Color4.create(1, 1, 1, 0.3),
    roughness: 1,
    metallic: 0
  })

  // Aim mode indicators (the two GLTFs that swap on E/F mode).
  const aimingPower = engine.addEntity()
  Transform.create(aimingPower, { parent: entity })
  GltfContainer.create(aimingPower, { src: aimingPowerSrc })
  VisibilityComponent.create(aimingPower, { visible: false })

  const aimingRotation = engine.addEntity()
  Transform.create(aimingRotation, { parent: entity })
  GltfContainer.create(aimingRotation, { src: aimingRotationSrc })

  let visible = true

  const offStore = store.onChange(({ newValue, prop }: { newValue: any; prop: string }) => {
    if (prop === 'powerMode') {
      VisibilityComponent.createOrReplace(aimingPower, { visible: !!newValue && visible })
      VisibilityComponent.createOrReplace(aimingRotation, { visible: !newValue && visible })
    }
  })

  function setEntityVisibility(v: boolean) {
    visible = v
    VisibilityComponent.createOrReplace(power, { visible: v })
    VisibilityComponent.createOrReplace(aim, { visible: v })
    VisibilityComponent.createOrReplace(aimingPower, { visible: v && state.powerMode })
    VisibilityComponent.createOrReplace(aimingRotation, { visible: v && !state.powerMode })
    // Mirror SDK6: the HUD power bar follows the control's visibility.
    powerBarState.visible = v
  }

  return {
    setAngle: (ry: number) => {
      const t = Transform.getMutableOrNull(entity)
      if (t) t.rotation = Quaternion.fromEulerDegrees(0, ry, 0)
    },
    setPower: (value: number) => {
      const newZ = Math.min(MIN_SCALE + (value * scale100) / 100, scale100)
      const t = Transform.getMutableOrNull(power)
      if (t) {
        t.scale = Vector3.create(0.2, 0.01, newZ)
        t.position = Vector3.create(0, 0, newZ / 2)
      }
      if (value === 0) {
        Material.setPbrMaterial(power, powerMaterial(Color4.create(0, 0, 1, 1)))
      } else {
        const { r, g, b } = getColorForPercentage(value / 100)
        Material.setPbrMaterial(power, powerMaterial(Color4.create(r, g, b, 1)))
      }
      // Sync HUD power bar (SDK6 wrote into a UIContainerRect height/colour).
      powerBarState.power = value
    },
    dispose: () => {
      engine.removeEntity(entity)
      engine.removeEntity(power)
      engine.removeEntity(aim)
      engine.removeEntity(aimingPower)
      engine.removeEntity(aimingRotation)
      if (offStore) offStore()
      powerBarState.visible = false
    },
    hide: () => setEntityVisibility(false),
    show: () => setEntityVisibility(true),
    setPosition: (newPos: any) => {
      const t = Transform.getMutableOrNull(entity)
      if (t) t.position = Vector3.create(newPos.x, newPos.y, newPos.z)
    },
    getPosition: () => {
      const t = Transform.getOrNull(entity)
      return t ? t.position : Vector3.Zero()
    },
    getEntity: () => entity,
    shoot: () => {
      if (rod) rod.reproduceAnimation('shoot1')
    },
    idle: () => {
      if (rod) rod.reproduceAnimation('idle')
    },
    modeRotation: () => {
      state.powerMode = false
    },
    modePower: () => {
      state.powerMode = true
    }
  }
}

export { createShootControlVisual }

const percentColors = [
  { pct: 0, color: { r: 0, g: 255, b: 0 } },
  { pct: 0.5, color: { r: 255, g: 255, b: 0 } },
  { pct: 1, color: { r: 255, g: 0, b: 0 } }
]

function getColorForPercentage(pct: number) {
  let i = 1
  for (; i < percentColors.length - 1; i++) {
    if (pct < percentColors[i].pct) break
  }
  const lower = percentColors[i - 1]
  const upper = percentColors[i]
  const range = upper.pct - lower.pct
  const rangePct = (pct - lower.pct) / range
  const pctLower = 1 - rangePct
  const pctUpper = rangePct
  return {
    r: (lower.color.r * pctLower + upper.color.r * pctUpper) / 255,
    g: (lower.color.g * pctLower + upper.color.g * pctUpper) / 255,
    b: (lower.color.b * pctLower + upper.color.b * pctUpper) / 255
  }
}
