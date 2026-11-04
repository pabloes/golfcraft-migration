// Watching a game that somebody else is playing (user request, 2026-11-04).
//
// It needs no new traffic: the game rooms already sync the ball's position and
// rotation, the course being played and the recorded opponents, so watching is
// reading that state and drawing it. The server side of it (which keeps a
// spectator from disturbing the match) is server/rooms/spectator.ts.
//
// Deliberately NOT a fork of golfplay-client-season.ts. A spectator has no
// physics, no shoot control, no aim camera, no rewards and no lifecycle of its
// own: it loads the course, moves a ball to where the room says it is, and
// gets out of the way. Everything the player's client does beyond that would
// be a liability here.
import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

import { createVisualCourse } from '../../../golfplay/src/components/course/course-visual-loader'
import { VisualBallFactory } from '../../../golfplay/src/components/ball'
import { getCourseDefinition } from '../../../../common/course-definitions/course-definition-repository'
// @ts-ignore - course-animations-migration has @ts-nocheck
import { migrateCourseDefinitionAnimations } from '../../../../common/course-animations-migration'
import MESSAGE from '../../../../server/rooms/mesages'
// @ts-ignore - common/utils has @ts-nocheck
import { sleep } from '../../../../common/utils'
import { globalStore } from '../../services/globalStore/globalStore'
import { fadeInOverlay, fadeOutOverlay } from '../ui/overlay'
import { showMessage } from './server-notification'
import { teleportVerified } from '../../services/safe-teleport'
import { spectateState } from '../../ui/spectate-state'
import { hideLobbyHud, showLobbyHud } from '../../ui/lobby-hud-state'

// The course is drawn where a played course is drawn, so the lobby's own
// geometry is where the player expects it.
const COURSE_OFFSET = 24
// Where the watcher stands: the same tee the player is put on, which is the
// one place guaranteed to see the hole.
const VIEW_HEIGHT = 2
// How long after the run is over we stay, in case the server does not drop us.
const OVER_GRACE_MS = 6000

type VisualBall = ReturnType<ReturnType<typeof VisualBallFactory>['createVisualBall']>

type Session = {
  room: any
  course: ReturnType<typeof createVisualCourse> | null
  balls: VisualBall[]
  factory: ReturnType<typeof VisualBallFactory>
  root: Entity | null
  disposed: boolean
  currentGame: number
}

let session: Session | null = null

const ballFactory = () => VisualBallFactory({ baseResourceUrl: (engine as any)['__COURSE_MODELS_BASE__'] || 'golfplay/' })

const courseName = (game: any) => game?.courseId || 'a hole'

async function loadCourse(sess: Session, courseId: string) {
  disposeCourse(sess)
  const definition: any = await getCourseDefinition({ courseId, type: 'season', subType: '1' } as any, fetch as any, true)
  if (sess.disposed || !definition) return
  const migrated = migrateCourseDefinitionAnimations(definition, [])
  sess.root = engine.addEntity()
  Transform.create(sess.root, { position: Vector3.create(COURSE_OFFSET, 0, COURSE_OFFSET) })
  sess.course = createVisualCourse(sess.root, { courseDefinition: migrated })

  const initial = migrated.parts.find((p: any) => p.type === 'initial_position')
  const [x, y, z] = initial?.position || [8, 1, 8]
  // Stand on the tee to watch, without locking anything: a spectator keeps
  // their legs and can walk around the hole.
  await teleportVerified(
    Vector3.create(x + COURSE_OFFSET, y + VIEW_HEIGHT, z + COURSE_OFFSET),
    Vector3.create(COURSE_OFFSET + 8, 1, COURSE_OFFSET + 8)
  )
}

function disposeCourse(sess: Session) {
  sess.balls.forEach((ball) => ball.dispose())
  sess.balls = []
  try {
    sess.course?.dispose?.()
  } catch (err) {
    console.log('[spectate] course dispose failed', err)
  }
  sess.course = null
  if (sess.root) {
    engine.removeEntity(sess.root)
    sess.root = null
  }
}

// One visual ball per thing the room is moving: the player's, each party
// member's, and each recorded opponent's. They are parented to the course's
// own root, so the positions the room sends are used as they come.
function syncBalls(sess: Session) {
  const state = sess.room?.state
  if (!state || !sess.root) return
  const positions: { x: number; y: number; z: number }[] = []
  if (state.players?.length) {
    state.players.forEach((p: any) => p?.position && positions.push(p.position))
  } else if (state.ball?.position) {
    positions.push(state.ball.position)
  }
  if (state.ghosts?.length) state.ghosts.forEach((g: any) => g?.position && positions.push(g.position))

  while (sess.balls.length < positions.length) {
    const position = positions[sess.balls.length]
    sess.balls.push(
      sess.factory.createVisualBall(sess.root, {
        position: Vector3.create(position.x, position.y, position.z),
        // the first one is the player being watched; the rest are the others
        dummy: sess.balls.length > 0
      })
    )
  }
  positions.forEach((position, i) => {
    sess.balls[i]?.setPosition(Vector3.create(position.x, position.y, position.z))
  })
}

function spectateSystem() {
  if (!session || session.disposed) return
  syncBalls(session)
  const state = session.room?.state
  if (!state) return
  spectateState.hole = Number(state.currentGame ?? 0) + 1
  spectateState.shots = Number(state.shoots ?? 0)
}

let systemAdded = false

// The course is drawn where the lobby building stands, so the building has to
// go while watching, exactly as it does while playing (SDK6 lobby.hide()).
// index.ts owns both, so it hands them over.
let hideLobby: (() => void) | null = null
let showLobby: (() => void) | null = null

export const setSpectatorLobbyHooks = (hide: () => void, show: () => void) => {
  hideLobby = hide
  showLobby = show
}

export async function startSpectating(colyseus: any, roomId: string, label: string): Promise<boolean> {
  if (session) await stopSpectating()
  if (!systemAdded) {
    systemAdded = true
    engine.addSystem(spectateSystem)
  }
  try {
    await fadeInOverlay(1)
    // The same state a hole puts the scene in: the building and the NPC go,
    // the lobby HUD goes, the stream screens quieten and the wall goes up.
    // Hiding only the building left the rest of the lobby standing inside the
    // course (report, 2026-11-04).
    globalStore.game.setState({ playing: true })
    hideLobbyHud()
    hideLobby?.()
    const room = await colyseus.joinById(roomId, { spectate: true })
    const sess: Session = { room, course: null, balls: [], factory: ballFactory(), root: null, disposed: false, currentGame: -1 }
    session = sess

    let courses: any[] = []
    room.onMessage(MESSAGE.GAME_DEFINITIONS, ({ gameDefinitions }: any) => {
      courses = gameDefinitions || []
    })
    room.onMessage('*', () => {})
    room.onLeave(() => {
      showMessage({ timeout: 4000, message: 'The game ended' })
      void stopSpectating()
    })
    // A room whose player has gone is disposed by the server, which drops us
    // too. This is the belt to that braces: if the run is over and nothing has
    // dropped us after a few seconds, leave on our own.
    let finishedAt = 0
    room.onStateChange(() => {
      const over = !!room.state?.finished
      if (!over) { finishedAt = 0; return }
      if (!finishedAt) finishedAt = Date.now()
      else if (Date.now() - finishedAt > OVER_GRACE_MS) void stopSpectating()
    })

    // The courses arrive right after the join; the room's currentGame says
    // which of them is being played.
    for (let wait = 0; wait < 40 && !courses.length && !sess.disposed; wait++) await sleep(250)
    if (sess.disposed) return false
    if (!courses.length) throw new Error('the room never sent its courses')

    const follow = async () => {
      const index = Number(room.state?.currentGame ?? 0)
      if (sess.disposed || index === sess.currentGame) return
      sess.currentGame = index
      const courseId = courses[index]?.courseId
      if (courseId) await loadCourse(sess, courseId)
    }
    await follow()
    room.onStateChange(() => void follow())

    spectateState.visible = true
    spectateState.label = label
    spectateState.hole = Number(room.state?.currentGame ?? 0) + 1
    spectateState.onLeave = () => void stopSpectating()
    globalStore.game.setState({ spectating: true })
    await fadeOutOverlay(1)
    console.log('[spectate] watching', roomId, courseName(courses[sess.currentGame]))
    return true
  } catch (err) {
    console.log('[spectate] could not watch', roomId, err)
    showMessage({ timeout: 4000, message: 'That game could not be watched' })
    await stopSpectating()
    await fadeOutOverlay(1)
    return false
  }
}

export async function stopSpectating(): Promise<void> {
  const sess = session
  session = null
  spectateState.visible = false
  spectateState.onLeave = null
  // playing goes false BEFORE the lobby is rebuilt, or createNpcTest bails out
  // and the scientist never comes back (the same trap as §6 #23 d).
  globalStore.game.setState({ spectating: false, playing: false })
  showLobbyHud()
  if (!sess || sess.disposed) {
    showLobby?.()
    return
  }
  sess.disposed = true
  disposeCourse(sess)
  try {
    await sess.room?.leave(true)
  } catch (err) {
    console.log('[spectate] leave failed', err)
  }
  // The lobby comes back, and the watcher with it.
  showLobby?.()
  await teleportVerified(Vector3.create(34, 3, 36), Vector3.create(28, 2, 31))
}

export const isSpectating = () => !!session && !session.disposed
