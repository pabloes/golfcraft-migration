import { engine, Entity, Transform, GltfContainer, AudioSource } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import buildingPositions from './building-positions'

// SDK6 building.ts had panel/elevator buttons + collectables + analytics.
// This SDK7 version just spawns the visual building: main shell + every sub
// model defined in building-positions.ts (fountains, vegetation, billboards,
// flag, etc.). Panels/elevator/analytics are not migrated yet.

let building_entity: Entity | null = null
const childEntities: Entity[] = []

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

  return building_entity
}

export const destroyBuilding = () => {
  if (building_entity) {
    engine.removeEntity(building_entity)
    building_entity = null
  }
  childEntities.forEach((e) => engine.removeEntity(e))
  childEntities.length = 0
}

export const getBuilding = () => building_entity
