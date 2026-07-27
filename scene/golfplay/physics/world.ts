import CANNON from 'cannon'
import {
  CONTACT_BALL_GRASS_FRICTION,
  CONTACT_BALL_GRASS_RESTITUTION,
  CONTACT_BALL_WOOD_FRICTION,
  CONTACT_BALL_WOOD_RESTITUTION,
  CONTACT_BALL_DUMPER_RESTITUTION,
  CONTACT_BALL_DUMPER_FRICTION,
  WORLD_DEFAULT_FRICTION,
  WORLD_DEFAULT_RESTITUTION,
  WORLD_GRAVITY
} from '../../../common/physics-config'

type Materials = {
  woodPhysicsMaterial: CANNON.Material | null
  ballPhysicsMaterial: CANNON.Material | null
  grassPhysicsMaterial: CANNON.Material | null
  dumperPhysicsMaterial: CANNON.Material | null
}

const materials: Materials = {
  woodPhysicsMaterial: null,
  ballPhysicsMaterial: null,
  grassPhysicsMaterial: null,
  dumperPhysicsMaterial: null
}

const initializeMaterials = () => {
  materials.grassPhysicsMaterial = new CANNON.Material('grassMaterial')
  materials.woodPhysicsMaterial = new CANNON.Material('woodMaterial')
  materials.ballPhysicsMaterial = new CANNON.Material('ballMaterial')
  materials.dumperPhysicsMaterial = new CANNON.Material('dumperMaterial')
  return materials
}

const createPhysicsWorld = () => {
  const world = new CANNON.World()
  const { dumperPhysicsMaterial, grassPhysicsMaterial, ballPhysicsMaterial, woodPhysicsMaterial } = materials

  const ballGrassContactMaterial = new CANNON.ContactMaterial(grassPhysicsMaterial!, ballPhysicsMaterial!, {
    friction: CONTACT_BALL_GRASS_FRICTION,
    restitution: CONTACT_BALL_GRASS_RESTITUTION
  } as any)

  const ballWoodContactMaterial = new CANNON.ContactMaterial(woodPhysicsMaterial!, ballPhysicsMaterial!, {
    friction: CONTACT_BALL_WOOD_FRICTION,
    restitution: CONTACT_BALL_WOOD_RESTITUTION
  } as any)

  const ballDumperContactMaterial = new CANNON.ContactMaterial(dumperPhysicsMaterial!, ballPhysicsMaterial!, {
    friction: CONTACT_BALL_DUMPER_FRICTION,
    restitution: CONTACT_BALL_DUMPER_RESTITUTION
  } as any)

  world.gravity.set(0, WORLD_GRAVITY, 0)
  world.addContactMaterial(ballGrassContactMaterial)
  world.addContactMaterial(ballWoodContactMaterial)
  world.addContactMaterial(ballDumperContactMaterial)
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.defaultContactMaterial.friction = WORLD_DEFAULT_FRICTION
  world.defaultContactMaterial.restitution = WORLD_DEFAULT_RESTITUTION

  const dispose = () => {
    // CANNON has no removeContactMaterial; let GC handle once references drop.
  }

  return {
    world,
    dispose
  }
}

const getMaterials = () => materials

export { createPhysicsWorld, initializeMaterials, getMaterials }
