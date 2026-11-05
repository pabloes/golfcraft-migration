// Music per map, streamed from outside the scene (user, 2026-11-05).
//
// Why a stream and not files in the scene. Four minutes of stereo music is
// about 3 MB, and every player downloads everything the scene ships, so seven
// maps of it would be ~17 MB on top of the models. AudioSource cannot help:
// unity-explorer resolves its audioClipUrl with sceneData.TryGetContentUrl,
// which only looks inside the deployed scene, so an http URL there never
// loads. AudioStream is the one component that takes a URL
// (CreateMediaPlayerSystem.CreateAudioStream hands it straight to the media
// player), and it is what this uses.
//
// What AudioStream does NOT have is a loop flag, or an event when a track
// ends. That is fine here, because the user asked for long tracks that may
// play once ("con 4 o 6 minutos va bien"), and because the catalogue carries
// each track's length: when it runs out, the next one is picked. So the music
// goes on without looping anything.
//
// Hosting: MUSIC_BASE. The web service already serves `*/static` from
// web/client/dist/static, and `*/music` from web/public/music (added for
// this), so dropping the files there is enough. Any other host works; it only
// has to answer CORS and be https.
import { engine, AudioStream, Transform, Entity } from '@dcl/sdk/ecs'

// ---------------------------------------------------------------------------
// The catalogue. `seconds` is the track's own length, used only to know when
// to move on to the next one, so it does not have to be exact: a couple of
// seconds short and the next track starts on a tail nobody is listening to.
//
// Every track here is from Fesliyan Studios (fesliyanstudios.com), the same
// library the two Egypt tracks already in the game come from. Upload the mp3s
// under these names and nothing else has to change.
type Track = { file: string; seconds: number }

export type MapKey = 'default' | 'egypt' | 'space' | 'mountain' | 'cocobay' | 'urban' | 'jungle'

const CATALOG: Record<MapKey, Track[]> = {
  // The neon course everybody starts on.
  default: [
    { file: 'default_silly_feet.mp3', seconds: 184 },
    { file: 'default_lost_in_dance.mp3', seconds: 171 },
    { file: 'default_retro_platforming.mp3', seconds: 130 }
  ],
  // Desert Trek and Arabic Heat, which the game already used: the full cuts
  // this time, not the 60 second one that was bundled.
  egypt: [
    { file: 'egypt_desert_trek.mp3', seconds: 126 },
    { file: 'egypt_arabic_heat.mp3', seconds: 127 }
  ],
  space: [
    { file: 'space_beyond_the_stars.mp3', seconds: 213 },
    { file: 'space_galaxys_endless_expanse.mp3', seconds: 203 },
    { file: 'space_quantum_leap.mp3', seconds: 191 }
  ],
  mountain: [
    { file: 'mountain_in_the_light.mp3', seconds: 276 },
    { file: 'mountain_tranquility.mp3', seconds: 259 },
    { file: 'mountain_deep_meditation.mp3', seconds: 258 }
  ],
  cocobay: [
    { file: 'cocobay_on_paradise_island.mp3', seconds: 247 },
    { file: 'cocobay_beachside_liqueur.mp3', seconds: 221 },
    { file: 'cocobay_rasta_dreads.mp3', seconds: 215 }
  ],
  urban: [
    { file: 'urban_milan_nightlife.mp3', seconds: 212 },
    { file: 'urban_tokyo_lofi.mp3', seconds: 199 },
    { file: 'urban_done_with_work.mp3', seconds: 197 }
  ],
  // Fesliyan has no jungle or tribal section: their Ethnic category is five
  // tracks and the only tribal one lasts 94 seconds. Empty on purpose until
  // there is something worth putting here, which means Suno rather than their
  // catalogue. It is NOT a rare case to leave to chance: 49 of the 372 Ranked
  // courses are jungle, so it falls back to Cocobay's tropical tracks, which
  // are at least the right continent, rather than to the retro arcade default.
  jungle: []
}

// Where the files live. Changing the host is a one-line change here; the file
// names above stay the same.
const MUSIC_BASE = 'https://golfcraftgame.com/music/'

const VOLUME = 0.5
// A breath between tracks, and enough slack that a track whose real length is
// a second or two over its catalogue entry is not cut off.
const GAP_MS = 3000

// ---------------------------------------------------------------------------
// Which map a course belongs to: its collectionId, the same key SDK6's
// MUSIC_BY_COLLECTION used, carried to the client inside the course definition
// (common/course-definitions/course-definition-repository.ts).
//
// NOT the skybox part, which was the first guess here and was wrong: of the
// 238 local course definitions 224 use the `skybox1` model whatever collection
// they belong to, so everything would have ended up on the default list. The
// collections, counted in the database: 0 EGYPT 60 courses, 1 SPACE 195,
// 2 URBAN 181, 3 JUNGLE 69, 4 MOUNTAIN 77, 5 COCOBAY 62, and 193 with none.
// Of the 372 Ranked courses, URBAN and SPACE are the two biggest.
const COLLECTION_TO_MAP: Record<string, MapKey> = {
  '0': 'egypt',
  '1': 'space',
  '2': 'urban',
  '3': 'jungle',
  '4': 'mountain',
  '5': 'cocobay'
}

// The skybox model, for a course with no collection (tournaments, training and
// user-made maps: no Ranked course is in that group).
const SKYBOX_TO_MAP: { match: string; map: MapKey }[] = [
  { match: 'egypt', map: 'egypt' },
  { match: 'jungle', map: 'jungle' },
  { match: 'mountain', map: 'mountain' },
  { match: 'cocobay', map: 'cocobay' },
  { match: 'urban', map: 'urban' },
  { match: 'space', map: 'space' }
]

export const mapOfCourse = (courseDefinition: any): MapKey => {
  const collection = courseDefinition?.collectionId
  if (collection !== undefined && collection !== null) {
    const byCollection = COLLECTION_TO_MAP[String(collection)]
    if (byCollection) return byCollection
  }
  const parts = courseDefinition?.parts || []
  const skybox = parts.find((p: any) => typeof p?.subtype === 'string' && /skybox/i.test(p.subtype))
  const subtype = String(skybox?.subtype || '').toLowerCase()
  const hit = SKYBOX_TO_MAP.find((entry) => subtype.indexOf(entry.match) !== -1)
  return hit ? hit.map : 'default'
}

// ---------------------------------------------------------------------------
let musicEntity: Entity | null = null
let currentMap: MapKey | null = null
let lastFile = ''
let nextAt = 0
let systemAdded = false
let streamPlaying = false

// SDK6 skipped the music when a stream was set in TitleData, so the stream's
// own audio is what you hear. Here it follows the stream actually playing
// (stream-screens.ts) and stops the music if one starts mid-course.
//
// And gives it back when the stream stops, which it did not do at first: the
// music only ever started when a hole's course was built, so a stream running
// at that moment left the hole silent to its end even after somebody paused
// the screen (user, 2026-11-05). The map the player is on is remembered even
// while the stream has the audio, so there is something to go back to.
export const setStreamPlaying = (playing: boolean) => {
  if (playing === streamPlaying) return
  streamPlaying = playing
  if (playing) {
    silence()
    return
  }
  if (!currentMap) return
  const track = pick(currentMap)
  if (track) play(track)
}

// A map with no music of its own borrows from the nearest one that has some,
// rather than always falling to the retro default.
const FALLBACK: Partial<Record<MapKey, MapKey>> = { jungle: 'cocobay' }

const tracksFor = (map: MapKey): Track[] => {
  const own = CATALOG[map]
  if (own && own.length > 0) return own
  const borrowed = FALLBACK[map]
  const lent = borrowed ? CATALOG[borrowed] : undefined
  return lent && lent.length > 0 ? lent : CATALOG.default
}

const pick = (map: MapKey): Track | null => {
  const tracks = tracksFor(map)
  if (tracks.length === 0) return null
  // Never the same one twice in a row, unless there is only one.
  const choices = tracks.length > 1 ? tracks.filter((t) => t.file !== lastFile) : tracks
  return choices[Math.floor(Math.random() * choices.length)]
}

const play = (track: Track) => {
  if (musicEntity === null) {
    musicEntity = engine.addEntity()
    // No Transform on purpose: without one the explorer treats the stream as
    // global, which is what background music wants. A spatial stream would
    // fade with the distance to an entity nobody can see.
    Transform.createOrReplace(musicEntity, { parent: engine.PlayerEntity })
  }
  lastFile = track.file
  nextAt = Date.now() + track.seconds * 1000 + GAP_MS
  AudioStream.createOrReplace(musicEntity, {
    url: MUSIC_BASE + track.file,
    playing: true,
    volume: VOLUME
  })
  console.log('[music]', track.file, `(${track.seconds}s)`)
}

// AudioStream has no "finished" event, so the catalogue's length is what moves
// the music on. A few seconds either way are inaudible.
const musicSystem = () => {
  if (currentMap === null || nextAt === 0 || Date.now() < nextAt) return
  const track = pick(currentMap)
  if (track) play(track)
  else nextAt = 0
}

// Start (or keep) the music for a course. Called when a hole's course is
// built, by both golfplay clients, so Ranked has music for the first time.
export const startMapMusic = (courseDefinition: any) => {
  const map = mapOfCourse(courseDefinition)
  startMapMusicFor(map)
}

export const startMapMusicFor = (map: MapKey) => {
  // The next hole of the same map keeps the track that is playing: cutting a
  // track off at every hole would mean nobody ever hears one.
  const alreadyPlaying = currentMap === map && nextAt > Date.now()
  // Recorded even when the stream has the audio, so setStreamPlaying(false)
  // knows what to go back to.
  currentMap = map
  if (!systemAdded) {
    systemAdded = true
    engine.addSystem(musicSystem)
  }
  if (streamPlaying || alreadyPlaying) return
  const track = pick(map)
  if (track) play(track)
}

// Stop the sound, keep the map: the hole is still on.
const silence = () => {
  nextAt = 0
  if (musicEntity === null) return
  const stream = AudioStream.getMutableOrNull(musicEntity)
  if (stream) stream.playing = false
}

// The run is over: there is no map to go back to any more.
export const stopMapMusic = () => {
  currentMap = null
  silence()
}
