// SDK7-only helper (SDK6 had no equivalent file). Every sprite on the golfclub
// board built the same Material by hand: albedoTexture + alphaTexture +
// emissiveTexture all pointing at one PNG, emissiveColor yellow, intensity 3.
// That's 13 near-identical blocks in SDK6; here it's one call.
//
// Transparency: SDK6 passed the same PNG as `alphaTexture`, and legacy DCL used
// that texture's LUMINANCE as the alpha mask — which is how these black-
// background sprites cut out even though the files were RGB with no alpha
// channel. SDK7/bevy instead reads alphaTexture's real alpha channel, so an RGB
// PNG came out as an opaque black box. The luminance is now baked into the PNGs
// as a real alpha channel (see images/attributes.png et al), so we just need the
// texture's own alpha plus an explicit transparencyMode.
// Tint: SDK6 got the board's yellow look from `emissiveColor: Yellow` at
// intensity 3. bevy's emissive is far stronger than SDK6's, which blew these
// sprites out into a white/pink glow, so the yellow now lives in albedoColor and
// the emissive is gone. The PNG artwork itself is white, so the tint is what
// makes it yellow — dropping emissive without this would turn everything white.
import { Entity, Material, MaterialTransparencyMode, MeshRenderer } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

export const setSpriteMaterial = (entity: Entity, src: string) => {
  const texture = Material.Texture.Common({ src })
  Material.setPbrMaterial(entity, {
    texture,
    albedoColor: Color4.create(1, 1, 0, 1),
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    roughness: 1,
    metallic: 0
  })
}

// Convenience: the board's sprites are all textured planes.
export const setSpritePlane = (entity: Entity, src: string) => {
  MeshRenderer.setPlane(entity)
  setSpriteMaterial(entity, src)
}
