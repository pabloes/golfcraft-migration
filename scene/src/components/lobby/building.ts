import { engine, Entity, Transform, GltfContainer, AudioSource } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import buildingPositions from './building-positions'
import { createButtonList } from '../button-list'

// SDK6 building.ts had panel/elevator buttons + collectables + analytics.
// This SDK7 version spawns the visual building (main shell + every sub model
// defined in building-positions.ts) plus the elevator panels that teleport
// between floors. Collectables and analytics are not migrated.

let building_entity: Entity | null = null
const childEntities: Entity[] = []
const buttonLists: { dispose: () => void }[] = []

const transformFromDict = (parent: Entity, dict: { position: number[]; rotation: number[]; scale: number[] }) => {
  const e = engine.addEntity()
  Transform.create(e, {
    parent,
    position: Vector3.create(dict.position[0], dict.position[1], dict.position[2]),
    rotation: Quaternion.create(dict.rotation[0], dict.rotation[1], dict.rotation[2], dict.rotation[3]),
    scale: Vector3.create(dict.scale[0], dict.scale[1], dict.scale[2])
  })
  return e
}

// SDK6 had a separate "collider" mesh; we use the same GLTF mesh and let SDK7
// derive colliders from the model. The base position matches SDK6.
const createCollider = (parent: Entity) => {
  const collider = engine.addEntity()
  Transform.create(collider, {
    parent,
    // Local-to-parent (16*1.5, 0.02, 16*1.5). With the scene root at (24,0,24)
    // this resolves to world (48, 0.02, 48), matching SDK6 behaviour.
    position: Vector3.create(16 * 1.5, 0.02, 16 * 1.5)
  })
  GltfContainer.create(collider, { src: 'models/building/entire_building_collider.gltf' })
  childEntities.push(collider)
}

export const createBuilding = (parent: Entity) => {
  if (building_entity) return building_entity

  createCollider(parent)

  building_entity = engine.addEntity()
  Transform.create(building_entity, {
    parent,
    // Local-to-parent (16*1.5, 0.02, 16*1.5). With the scene root at (24,0,24)
    // this resolves to world (48, 0.02, 48), matching SDK6 behaviour.
    position: Vector3.create(16 * 1.5, 0.02, 16 * 1.5)
  })
  GltfContainer.create(building_entity, { src: 'models/building/entire_building.gltf' })

  // Fountain audio (shared SDK6 had two locations).
  const fountainPositions = ['EmptyFountainSoundFloor4', 'EmptyFountainSoundLobby']
  fountainPositions.forEach((key) => {
    const dict = (buildingPositions as any)[key]
    if (!dict) return
    const e = transformFromDict(building_entity!, dict)
    AudioSource.create(e, {
      audioClipUrl: 'sound/japanese_fountain.mp3',
      playing: true,
      loop: true,
      volume: 0.15
    })
    childEntities.push(e)
  })

  // Every other sub-model defined in building-positions, with the same SDK6
  // exclusions: the entire_building (root), the colliders, and the four
  // alternate lands (egypt/urban/jungle/mountain).
  const excludedGltfs = new Set([
    'entire_building.gltf',
    'entire_building_collider.gltf',
    'land_egypt.gltf',
    'land_urban.gltf',
    'land_jungle.gltf',
    'land_mountain.gltf'
  ])

  const bp = buildingPositions as { [k: string]: any }
  Object.keys(bp).forEach((key) => {
    const def = bp[key]
    if (!def.gltf) return
    if (excludedGltfs.has(def.gltf)) return
    // Skip seasonal events the SDK6 code also gates: pride only in June, halloween/xmas/valencia time-windowed. We disable them all by default in this milestone.
    if (key.startsWith('event_pride')) return
    if (key.startsWith('event_halloween_')) return
    if (key.startsWith('event_xmas_')) return
    if (key.indexOf('valencia') !== -1) return

    const e = transformFromDict(building_entity!, def)
    GltfContainer.create(e, { src: `models/building/${def.gltf}` })
    childEntities.push(e)
  })

  createElevatorPanels(building_entity)

  return building_entity
}

// SDK6 building.ts:204-277. One elevator panel per floor, in the middle of the
// building, each listing all five floors. Destinations and the panel
// positions/rotations are verbatim from SDK6 (the latter come from the
// EmptyButtons* entries in building-positions).
const FLOOR_BUTTONS: { label: string; target: Vector3.MutableVector3; camera: Vector3.MutableVector3 }[] = [
  { label: 'Crafting', target: Vector3.create(17, 37, 20), camera: Vector3.create(15, 37, 16) },
  { label: 'Misc', target: Vector3.create(31, 30, 30), camera: Vector3.create(31, 30, 22) },
  { label: 'Fashion', target: Vector3.create(30, 18, 18), camera: Vector3.create(34, 18, 15) },
  { label: 'Tournaments', target: Vector3.create(31, 11, 34), camera: Vector3.create(12, 11, 28) },
  { label: 'Lobby / season', target: Vector3.create(18, 4, 34), camera: Vector3.create(14, 4, 43) }
]

// activeIndex marks the floor the panel itself is on, so that button is shown
// disabled/highlighted. SDK6 order: Lobby=4, Floor1=3, Floor2=2, Floor3=1, Floor4=0.
const PANELS: { key: string; activeIndex: number }[] = [
  { key: 'EmptyButtonsLobby', activeIndex: 4 },
  { key: 'EmptyButtonsFloor1', activeIndex: 3 },
  { key: 'EmptyButtonsFloor2', activeIndex: 2 },
  { key: 'EmptyButtonsFloor3', activeIndex: 1 },
  { key: 'EmptyButtonsFloor4', activeIndex: 0 }
]

function createElevatorPanels(parent: Entity) {
  const bp = buildingPositions as { [k: string]: any }
  const buttonDefinitions = FLOOR_BUTTONS.map((floor) => ({
    label: floor.label,
    action: () => {
      movePlayerTo({ newRelativePosition: floor.target, cameraTarget: floor.camera })
    }
  }))

  PANELS.forEach(({ key, activeIndex }) => {
    const def = bp[key]
    if (!def) {
      console.log('[building] missing elevator panel position:', key)
      return
    }
    const list = createButtonList(parent, {
      activeIndex,
      buttonDefinitions,
      buttonModel: 'models/building/button_elevator.gltf',
      position: Vector3.create(def.position[0], def.position[1], def.position[2]),
      rotation: Quaternion.create(def.rotation[0], def.rotation[1], def.rotation[2], def.rotation[3])
    })
    buttonLists.push(list)
  })
}

export const destroyBuilding = () => {
  if (building_entity) {
    engine.removeEntity(building_entity)
    building_entity = null
  }
  buttonLists.forEach((l) => l.dispose())
  buttonLists.length = 0
  childEntities.forEach((e) => engine.removeEntity(e))
  childEntities.length = 0
}

export const getBuilding = () => building_entity
