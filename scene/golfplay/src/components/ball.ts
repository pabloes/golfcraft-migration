import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  MeshRenderer,
  Material,
  AudioSource,
  TextShape,
  Billboard,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { getGLTFShape } from '../../services/resource-repo'

type Vec3 = Vector3.MutableVector3
type Quat = Quaternion.MutableQuaternion

const COLOR_MAP: { [k: string]: Color4 } = {
  RED: Color4.create(1, 0, 0, 1),
  GREEN: Color4.create(0, 1, 0, 1),
  BLUE: Color4.create(0, 0, 1, 1),
  YELLOW: Color4.create(1, 1, 0, 1)
}

const VisualBallFactory = ({ baseResourceUrl }: { baseResourceUrl: string }) => {
  const ballGltf = getGLTFShape(baseResourceUrl + 'models/ball.gltf')

  type CreateOpts = {
    position: Vec3
    dummy?: boolean
    displayName?: string
    id?: any
    _scale?: Vec3
    _color?: Color4
    collectionId?: number
  }

  const createVisualBall = (
    parent: Entity,
    { position, dummy, displayName, id, _scale, _color, collectionId }: CreateOpts
  ) => {
    const ball = engine.addEntity()
    Transform.create(ball, {
      parent,
      position,
      rotation: Quaternion.Identity()
    })

    const ballVisible = engine.addEntity()
    const scale = _scale || Vector3.create(0.09, 0.09, 0.09)
    let ballVisibleGltf: Entity | null = null

    if (!dummy) {
      Transform.create(ballVisible, { parent: ball, scale })
      MeshRenderer.setSphere(ballVisible)
      if (_color) {
        Material.setPbrMaterial(ballVisible, { albedoColor: _color })
      } else {
        Material.setPbrMaterial(ballVisible, {
          albedoColor: Color4.create(1, 0, 1, 1),
          emissiveColor: Color3.create(1, 0, 1),
          emissiveIntensity: 0.6
        })
      }
      if (!displayName) {
        ballVisibleGltf = engine.addEntity()
        Transform.create(ballVisibleGltf, { parent: ball })
        GltfContainer.create(ballVisibleGltf, { src: ballGltf.src })
      }
    } else {
      Transform.create(ballVisible, { parent: ball, scale: Vector3.create(0.2, 0.2, 0.2) })
      MeshRenderer.setBox(ballVisible)
      Material.setPbrMaterial(ballVisible, { albedoColor: Color4.create(1, 1, 1, 0.3) })
    }

    let nameEntity: Entity | null = null
    if (displayName && !dummy) {
      nameEntity = engine.addEntity()
      Transform.create(nameEntity, {
        parent,
        position: Vector3.create(position.x, position.y + 0.2, position.z),
        scale
      })
      TextShape.create(nameEntity, { text: displayName })
      Billboard.create(nameEntity, {})
    }

    // Audio: one entity per recurring sound effect, reusing the SDK6 sample paths.
    const sndBase = engine.addEntity()
    const sndWood = engine.addEntity()
    const sndShoot1 = engine.addEntity()
    const sndShoot2 = engine.addEntity()
    const sndEffect = engine.addEntity()
    Transform.create(sndBase, { parent: ball })
    Transform.create(sndWood, { parent: ball })
    Transform.create(sndShoot1, { parent: ball })
    Transform.create(sndShoot2, { parent: ball })
    Transform.create(sndEffect, { parent: ball })

    const url = (path: string) => baseResourceUrl + path

    // SDK6 hid the ball by removing it, which took its children along. SDK7
    // removeEntity does not cascade (CLAUDE.md §6 #11), so removing only `ball`
    // left the sphere, the model and the sounds at the scene origin. Hiding is
    // now a visibility switch, and dispose() removes every entity.
    const setVisible = (visible: boolean) => {
      for (const e of [ballVisible, ballVisibleGltf, nameEntity]) {
        if (e !== null) VisibilityComponent.createOrReplace(e, { visible })
      }
    }

    const playOnce = (entity: Entity, audioClipUrl: string, volume: number) => {
      AudioSource.createOrReplace(entity, {
        audioClipUrl,
        playing: true,
        loop: false,
        volume
      })
    }

    const woodFile = url('sounds/wood.mp3')
    const collBaseLightFile = url('sounds/Ball/ball_coll_base_light.mp3')
    const collWallEgyptLightFile = url('sounds/Ball/lvl_ball_coll_wall_egypt_light_01.mp3')
    const shoot1File = url('sounds/Club/lvl_club_hit_light.mp3')
    const shoot2File = url('sounds/Club/lvl_club_hit_medium.mp3')
    const holeFile = url('sounds/hole.mp3')
    const sandFile = url('sounds/sand.mp3')
    const windFile = url('sounds/wind.mp3')
    const bumperFile = url('sounds/bumper.mp3')

    return {
      id,
      changeColor: (color: string) => {
        const c = COLOR_MAP[color]
        if (c) Material.setPbrMaterial(ballVisible, { albedoColor: c })
      },
      getPosition: (): Vec3 => {
        const t = Transform.getOrNull(ball)
        return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : Vector3.Zero()
      },
      setPosition: (newPos: Vec3, rotation?: Quat) => {
        const t = Transform.getMutableOrNull(ball)
        if (!t) return
        t.position = Vector3.create(newPos.x, newPos.y, newPos.z)
        if (rotation) t.rotation = rotation
        if (nameEntity) {
          const tn = Transform.getMutableOrNull(nameEntity)
          if (tn) tn.position = Vector3.create(newPos.x, newPos.y + 0.2, newPos.z)
        }
      },
      getEntity: () => ball,
      reproduceSound: (soundName: string, volume: number = 1) => {
        if (soundName === 'wood') {
          if (collectionId === 0) {
            playOnce(sndWood, collWallEgyptLightFile, volume)
          } else {
            playOnce(sndWood, woodFile, volume)
          }
          playOnce(sndBase, collBaseLightFile, 1)
        } else if (soundName === 'shoot1') {
          playOnce(sndShoot1, shoot1File, 1)
        } else if (soundName === 'shoot2') {
          playOnce(sndShoot2, shoot2File, 1)
        } else if (soundName === 'hole') {
          playOnce(sndEffect, holeFile, volume)
        } else if (soundName === 'sand') {
          playOnce(sndEffect, sandFile, volume)
        } else if (soundName === 'wind' || soundName === 'direction_area') {
          playOnce(sndEffect, windFile, volume)
        } else if (soundName === 'bumper') {
          playOnce(sndEffect, bumperFile, volume)
        }
      },
      dispose: () => {
        engine.removeEntity(ball)
        engine.removeEntity(ballVisible)
        if (ballVisibleGltf) engine.removeEntity(ballVisibleGltf)
        engine.removeEntity(sndBase)
        engine.removeEntity(sndWood)
        engine.removeEntity(sndShoot1)
        engine.removeEntity(sndShoot2)
        engine.removeEntity(sndEffect)
        if (nameEntity) engine.removeEntity(nameEntity)
      },
      show: () => setVisible(true),
      hide: () => setVisible(false)
    }
  }

  return { createVisualBall }
}

export { VisualBallFactory }
