import { engine, Entity, AudioSource } from '@dcl/sdk/ecs'

type SoundEntry = { src: string; entity: Entity }
const sounds: { [name: string]: SoundEntry } = {}

const reproduceAvatarSound = (name: string) => {
  const sound = sounds[name]
  if (!sound) throw new Error('not registered sound ' + name)
  const src = AudioSource.getMutableOrNull(sound.entity)
  if (src) {
    src.playing = true
  } else {
    AudioSource.create(sound.entity, { audioClipUrl: sound.src, playing: true, loop: false, volume: 1 })
  }
}

const registerSound = (name: string, baseUrl?: string) => {
  // Idempotent on purpose. Both gameplay clients (storymode and season) register
  // the same 'checkpoint'/'voxter'/'hole' sounds, each behind its own module
  // flag, so whichever runs second used to throw and take the caller down with
  // it — that aborted spawnLobby and left the lobby with no NPC. SDK6's own
  // scene/sound/avatar-sound.ts had already softened this to a warn+return.
  if (sounds[name]) {
    console.log('[sound] already registered, skipping:', name)
    return
  }
  const entity = engine.addEntity()
  const src = `${baseUrl || ''}sounds/${name}.mp3`
  sounds[name] = { src, entity }
}

export { reproduceAvatarSound, registerSound }
