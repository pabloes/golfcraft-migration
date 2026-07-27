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
  if (sounds[name]) throw new Error('sound already registered ' + name)
  const entity = engine.addEntity()
  const src = `${baseUrl || ''}sounds/${name}.mp3`
  sounds[name] = { src, entity }
}

export { reproduceAvatarSound, registerSound }
