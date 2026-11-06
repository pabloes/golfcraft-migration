// SDK7 port of SDK6 scene/src/components/lobby/stream-screens/stream-screens.ts.
// Four screens playing PlayFab TitleData.streamURL (an HLS .m3u8, so the stream
// changes without a redeploy; an empty value means no screens at all). The
// first three are in the lobby and hide while a game is on; the fourth hangs
// 40 m up and stays visible over the courses. Clicking a screen pauses or
// resumes the video. Positions, sizes and rotations are SDK6's, in scene
// coordinates (SDK6 didn't parent them to the root).
//
// Additions: a stream that is not up (error, or never started) is reloaded
// every RETRY_MS and its screens hide meanwhile, so they appear by themselves
// when the streamer goes live; and the course music stays quiet only while the
// stream really plays (SDK6 muted it whenever streamURL was set, see map-music.ts).
import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  VideoPlayer,
  VideoState,
  ColliderLayer,
  InputAction,
  pointerEventsSystem,
  videoEventsSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { globalStore } from '../../../services/globalStore/globalStore'
import { musicOwnsAudio } from '../../../services/map-music'
import { streamVolume } from '../../../services/game-options'

const RETRY_MS = 30000
// the lobby screens; the rest stay visible while playing
const LOBBY_SCREENS = 3

// SDK6's yaw + 180: an SDK7 plane shows the video mirrored from the side SDK6
// pointed at the room (seen in the World, 2026-10-30), so each screen turns
// round to face it with its front.
const FACE_ROOM = 180
const SCREENS = [
  // Floor 0
  { position: Vector3.create(5, 3.9, 20), scale: Vector3.create(48 * 0.2, 27 * 0.2, 1), rotation: Quaternion.fromEulerDegrees(0, 90 - 10 + FACE_ROOM, 0) },
  // Floor 1
  { position: Vector3.create(13, 11, 15), scale: Vector3.create(48 * 0.1, 27 * 0.1, 1), rotation: Quaternion.fromEulerDegrees(0, -10 + FACE_ROOM, 0) },
  // Floor 3
  { position: Vector3.create(24, 26 + 4, 47.5), scale: Vector3.create(48 * 0.25, 27 * 0.25, 1), rotation: Quaternion.fromEulerDegrees(0, 180 + FACE_ROOM, 0) },
  // Above the courses
  { position: Vector3.create(9.5, 40, 9.5), scale: Vector3.create(48 * 0.3, 27 * 0.3, 1), rotation: Quaternion.fromEulerDegrees(0, 45 + FACE_ROOM, 0) }
]

let state: VideoState = VideoState.VS_NONE

export function createStreamScreens(streamURL: string | undefined) {
  if (!streamURL) return
  const player = engine.addEntity()
  // A VideoPlayer with no volume of its own plays at 1.0, which made the
  // lobby stream twice as loud as the map music (user, 2026-11-05). The level
  // comes from the account and is followed while it plays, so the HUD's mute
  // and the options are heard at once.
  VideoPlayer.create(player, { src: streamURL, playing: true, volume: streamVolume() })
  let appliedVolume = streamVolume()
  engine.addSystem(() => {
    // While a hole is on, its music owns the audio and the stream goes quiet
    // (the screen 40 m up keeps showing it). In the lobby there is no map
    // music, so the stream is heard at the player's level. This replaces the
    // old rule, where a stream the explorer said was playing silenced the
    // music — a VideoState the explorers do not agree on (user, 2026-11-06).
    const wanted = musicOwnsAudio() ? 0 : streamVolume()
    if (wanted === appliedVolume) return
    const video = VideoPlayer.getMutableOrNull(player)
    if (!video) return
    video.volume = wanted
    appliedVolume = wanted
  })

  const screens: Entity[] = SCREENS.map((transform) => {
    const screen = engine.addEntity()
    Transform.create(screen, transform)
    Material.setBasicMaterial(screen, { texture: Material.Texture.Video({ videoPlayerEntity: player }) })
    pointerEventsSystem.onPointerDown(
      { entity: screen, opts: { button: InputAction.IA_POINTER, showFeedback: false } },
      () => {
        const video = VideoPlayer.getMutable(player)
        video.playing = !video.playing
      }
    )
    return screen
  })
  const show = (screen: Entity, visible: boolean) => {
    if (visible) {
      MeshRenderer.setPlane(screen)
      // pointer only: the SDK6 plane had no physics collision either
      MeshCollider.setPlane(screen, ColliderLayer.CL_POINTER)
    } else {
      MeshRenderer.deleteFrom(screen)
      MeshCollider.deleteFrom(screen)
    }
  }
  screens.forEach((screen) => show(screen, true))

  let lastUp = Date.now()
  videoEventsSystem.registerVideoEventsEntity(player, (event) => {
    const playing = event.state === VideoState.VS_PLAYING
    if (playing !== (state === VideoState.VS_PLAYING)) {
      console.log('[stream]', playing ? 'playing' : 'stopped', streamURL)
    }
    if (event.state === VideoState.VS_ERROR && state !== VideoState.VS_ERROR) console.log('[stream] not available', streamURL)
    state = event.state
  })

  // SDK6 listened to globalStore.game "playing"/"editing"; our store has no
  // change events, so poll the flag. A stream the explorer reports as failed
  // (SRS answers 404 while nobody streams) hides every screen instead of
  // leaving black planes; an explorer that reports nothing keeps them, as SDK6.
  const shown = screens.map(() => true)
  engine.addSystem(() => {
    const game = globalStore.game.getState()
    const lobby = !(game.playing || game.editing)
    const streamUp = state !== VideoState.VS_ERROR
    screens.forEach((screen, index) => {
      const visible = streamUp && (lobby || index >= LOBBY_SCREENS)
      if (visible !== shown[index]) {
        shown[index] = visible
        show(screen, visible)
      }
    })
    const up =
      state === VideoState.VS_PLAYING ||
      state === VideoState.VS_PAUSED ||
      state === VideoState.VS_BUFFERING ||
      state === VideoState.VS_LOADING ||
      state === VideoState.VS_SEEKING
    if (up) lastUp = Date.now()
    else if (Date.now() - lastUp > RETRY_MS) {
      lastUp = Date.now()
      // a live HLS that was down when loaded stays in error: load it again,
      // with a new query so the explorer doesn't treat it as the same source
      const src = /^https?:/.test(streamURL) ? `${streamURL}${streamURL.includes('?') ? '&' : '?'}r=${Date.now()}` : streamURL
      VideoPlayer.createOrReplace(player, { src, playing: true, volume: streamVolume() })
    }
  })
}
