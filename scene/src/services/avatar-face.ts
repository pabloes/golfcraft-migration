// A player's face picture, for the UI. The explorers render
// uiBackground.avatarTexture unevenly (the lobby dialog showed an empty box),
// so the face comes from the player's catalyst profile instead:
// avatars[0].avatar.snapshots.face256, a plain https PNG that works as a normal
// texture. One request per userId per session; until it lands, or when the
// player has no profile (guests), this returns null and callers keep their
// placeholder.
const faces: Record<string, string | null> = {}
const requested: Record<string, boolean> = {}

export const avatarFaceUrl = (userId?: string | null): string | null => {
  if (!userId) return null
  const id = userId.toLowerCase()
  if (id in faces) return faces[id]
  if (!/^0x[0-9a-f]{40}$/.test(id)) {
    faces[id] = null
    return null
  }
  if (!requested[id]) {
    requested[id] = true
    fetch(`https://peer.decentraland.org/lambdas/profiles/${id}`)
      .then((r) => r.json())
      .then((data: any) => {
        const face = data?.avatars?.[0]?.avatar?.snapshots?.face256
        faces[id] = face ? (String(face).startsWith('http') ? String(face) : `https://peer.decentraland.org/content/contents/${face}`) : null
      })
      .catch((err) => {
        console.log('[ui] avatar face unavailable', id, err)
        faces[id] = null
      })
  }
  return null
}
