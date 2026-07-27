// SDK6 cached primitives (Texture, GLTFShape, AudioClip) don't exist in SDK7
// where components take plain config objects. We keep the function names so
// callers don't have to change everywhere, and return SDK7-compatible configs.

type TextureSrc = string | { url: string; alias: string }

const gltfShapes: { [src: string]: { src: string } } = {}
const audioClips: { [src: string]: { audioClipUrl: string } } = {}
const textures: { [key: string]: { src: string } } = {}

export const getTexture = (src: TextureSrc, ..._options: any[]) => {
  if (typeof src === 'string') {
    return textures[src] || (textures[src] = { src })
  }
  const { url, alias } = src
  return textures[alias] || (textures[alias] = { src: url })
}

export const getGLTFShape = (src: string) =>
  gltfShapes[src] || (gltfShapes[src] = { src })

export const getAudioClip = (src: string) =>
  audioClips[src] || (audioClips[src] = { audioClipUrl: src })
