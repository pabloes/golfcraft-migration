import CANNON from 'cannon'
import { BALL_ANGULAR_DAMPING, BALL_FRICTION, BALL_LINEAR_DAMPING, BALL_MASS } from '../../../common/physics-config'
import { getMaterials } from './world'

type CollideHandler = ((e: any) => void) | null

const createPhysicBall = (
  world: CANNON.World,
  { id, position, onlyKinematic }: { id?: any; position: number[]; onlyKinematic?: boolean }
) => {
  const { ballPhysicsMaterial } = getMaterials()
  const callbacks: { onCollide: CollideHandler } = { onCollide: null }
  const _id = id

  const body = new CANNON.Body({
    mass: onlyKinematic ? 0 : BALL_MASS,
    position: new CANNON.Vec3(position[0], position[1], position[2]),
    shape: new CANNON.Sphere(0.1),
    type: onlyKinematic ? CANNON.Body.KINEMATIC : undefined
  } as any)

  body.material = ballPhysicsMaterial!
  body.material.friction = BALL_FRICTION
  body.linearDamping = BALL_LINEAR_DAMPING
  body.angularDamping = BALL_ANGULAR_DAMPING
  body.updateMassProperties()
  body.addEventListener('collide', collide)
  body.collisionFilterGroup = 2
  body.collisionFilterMask = 1

  world.addBody(body)

  function collide(e: any) {
    if (callbacks.onCollide) callbacks.onCollide(e)
  }

  return {
    id,
    getId: () => _id,
    body,
    applyImpulse: (impulse: CANNON.Vec3, point: CANNON.Vec3) => {
      body.applyImpulse(impulse, point)
    },
    sleep: () => {
      body.sleep()
    },
    wakeUp: () => body.wakeUp(),
    dispose: () => {
      body.removeEventListener('collide', collide)
      callbacks.onCollide = null
    },
    onCollide: (fn: (e: any) => void) => {
      callbacks.onCollide = fn
      return () => {
        callbacks.onCollide = null
      }
    }
  }
}

export { createPhysicBall }
