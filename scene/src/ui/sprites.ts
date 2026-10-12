// UV crops out of images/ui-spritesheet.png (2048x2048), shared by the lobby
// HUD and the centre banners.
export const ATLAS = 2048

// Crop a sub-rectangle out of a spritesheet via uvs. ReactEcs renders the
// quad with the empirically-working corner order BL, TL, TR, BR (V=1 at the
// top of the atlas image, U increases left-to-right). The previous BR/TR/TL/BL
// order fixed the vertical flip but produced a horizontal mirror; swapping to
// BL/TL/TR/BR (same V semantics, opposite U traversal) renders correctly.
export const spriteUvs = (
  pixelLeft: number,
  pixelTop: number,
  pixelWidth: number,
  pixelHeight: number,
  atlasSize: number
): number[] => {
  const uL = pixelLeft / atlasSize
  const uR = (pixelLeft + pixelWidth) / atlasSize
  const vT = 1 - pixelTop / atlasSize
  const vB = 1 - (pixelTop + pixelHeight) / atlasSize
  return [uL, vB, uL, vT, uR, vT, uR, vB]
}
