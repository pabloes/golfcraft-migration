// Map background music (SDK6 scene/src/services/map-music.ts). SDK6 attached an
// AudioSource to FIRST_PERSON_CAMERA so the looping track follows the player;
// here we parent the music entity to engine.PlayerEntity for the same effect.
import { engine, AudioSource, Transform, Entity } from '@dcl/sdk/ecs'

// SDK6 MUSIC_BY_COLLECTION[0] (egypt). Collection 1 (space) exists but mission-1
// is egypt. getMusicForCollection is called with 0.
const EGYPT_TRACKS = ['sound/map_egypt_1.mp3', 'sound/map_egypt_2.mp3']
let pick = 0
let musicEntity: Entity | null = null

export const getMusicForCollection = (_collectionId: number): string => {
  const track = EGYPT_TRACKS[pick % EGYPT_TRACKS.length]
  pick++
  return track
}

export const reproduceMapMusic = (track: string) => {
  if (musicEntity === null) {
    musicEntity = engine.addEntity()
    Transform.create(musicEntity, { parent: engine.PlayerEntity })
  }
  AudioSource.createOrReplace(musicEntity, {
    audioClipUrl: track,
    playing: true,
    loop: true,
    volume: 0.5
  })
}

export const stopMapMusic = () => {
  if (musicEntity !== null) {
    const src = AudioSource.getMutableOrNull(musicEntity)
    if (src) src.playing = false
  }
}
