import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { createVisualPart, PartOptions as VisualPartOptions } from './visual-part'
import { createVisualHole } from './visual-hole'
import { createVisualMagnet } from './visual-magnet'
// @ts-ignore - sleep comes from the @ts-nocheck'd common/utils
import { sleep } from '../../../../../common/utils'

type RawPart = {
  id: string
  type: string
  subtype: string
  position: number[]
  rotation?: number[]
  scale?: number[]
  animation: any
  expressions?: any
  [key: string]: any
}

type CourseOptions = {
  courseDefinition: {
    parts: RawPart[]
    [key: string]: any
  }
  [key: string]: any
}

const buildPart = (entity: Entity, part: RawPart) =>
  createVisualPart(entity, {
    id: part.id,
    position: Vector3.create(part.position[0], part.position[1], part.position[2]),
    rotation: part.rotation
      ? Quaternion.create(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3])
      : undefined,
    scale: part.scale ? Vector3.create(part.scale[0], part.scale[1], part.scale[2]) : undefined,
    subtype: part.subtype,
    type: part.type,
    animation: part.animation,
    runtime: part.expressions?.runtime,
    expressions: part.expressions,
    partDefinition: part
  } as VisualPartOptions)

const renderableTypes = ['solid', 'wind', 'magnet', 'explosive', 'image', 'text', 'empty']

const createVisualCourse = (parent: Entity, { courseDefinition }: CourseOptions) => {
  let entity = engine.addEntity()
  Transform.create(entity, { parent })

  let solidParts: { [id: string]: any } = courseDefinition.parts
    .map((part: RawPart) => {
      const ok =
        renderableTypes.indexOf(part.type) !== -1 &&
        part?.expressions?.runtime?.hidden !== 'true' &&
        part?.expressions?.runtime?.ignored !== 'true'
      return ok && buildPart(entity, part)
    })
    .reduce((acc: { [id: string]: any }, current: any) => {
      if (current) acc[current.id] = current
      return acc
    }, {} as { [id: string]: any })

  const visualMagnets: ReturnType<typeof createVisualMagnet>[] = []
  const magnets = courseDefinition.parts.filter((p) => p.type === 'magnet')
  magnets.forEach((magnet) => {
    visualMagnets.push(
      createVisualMagnet(entity, {
        position: Vector3.create(magnet.position[0], magnet.position[1], magnet.position[2]),
        radius: magnet?.expressions?.physics?.radius || 2
      })
    )
  })

  const hole = courseDefinition.parts.find((p) => p.type === 'hole')
  let visualHole: ReturnType<typeof createVisualHole> | undefined
  if (hole) {
    visualHole = createVisualHole(entity, { hole })
  }

  return {
    dispose: () => {
      // SDK7 doesn't cascade engine.removeEntity to children. Walk every
      // owned part/magnet/hole and dispose explicitly so the course leaves
      // no orphan entities still rendering after the player completes the
      // hole.
      Object.values(solidParts).forEach((p: any) => {
        if (p && p.dispose) p.dispose()
        else if (p && p.getEntity) {
          try { engine.removeEntity(p.getEntity()) } catch (_) {}
        }
      })
      visualMagnets.forEach((m) => {
        if (m && m.dispose) m.dispose()
      })
      if (visualHole && visualHole.dispose) visualHole.dispose()
      try { engine.removeEntity(entity) } catch (_) {}
    },
    applyReactiveValue: (partId: string, state: any) => {
      if (!solidParts[partId]) {
        console.log('ERROR missing part', partId)
      }
      solidParts[partId] && solidParts[partId].react(state)
    },
    applyAllValues: (state: any) => {
      const partIds = courseDefinition.parts.reduce((acc: string[], partDefinition: RawPart) => {
        if (partDefinition.expressions?.runtime) acc.push(partDefinition.id)
        return acc
      }, [] as string[])
      partIds.forEach((partId: string) => solidParts[partId] && solidParts[partId].react(state))
    },
    getParts: () => solidParts,
    reproduceHoleAction: () => {
      if (visualHole) visualHole.reproduceHoleAction()
    },
    reset: async () => {
      Object.values(solidParts).forEach((s: any) => {
        if (s && s.getEntity) {
          engine.removeEntity(s.getEntity())
        }
      })
      engine.removeEntity(entity)
      entity = engine.addEntity()
      Transform.create(entity, { parent })
      solidParts = courseDefinition.parts
        .map((part: RawPart) => {
          const ok =
            renderableTypes.indexOf(part.type) !== -1 &&
            part?.expressions?.runtime?.hidden !== 'true' &&
            part?.expressions?.runtime?.ignored !== 'true'
          return ok && buildPart(entity, part)
        })
        .reduce((acc: { [id: string]: any }, current: any) => {
          if (current) acc[current.id] = current
          return acc
        }, {} as { [id: string]: any })
      await sleep(100)
    }
  }
}

export { createVisualCourse }
