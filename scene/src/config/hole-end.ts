// What happens in the seconds around the end of a hole (2026-11-05).
//
// unity-explorer's InterpolateCharacterSystem does this every frame, for the
// collider the player is standing on:
//
//   characterController.transform.position =
//       platformComponent.CurrentPlatform.TransformPoint(LastAvatarRelativePosition)
//
// No bounds check, no "is this the current scene" check: it is the moving
// platform rule, and the course the player stands on is a platform like any
// other. Taking the course away under their feet can therefore carry them
// anywhere, which is what players describe as being teleported out of the
// scene when a hole ends. Nothing in our code can do that: every movePlayerTo
// in the explorer goes through IsPositionValid, which refuses a parcel that is
// not the scene's.
//
// So the golfplay clients raise a platform of ours under the player
// (scene-bounds.ts: holdGroundUnderPlayer) and only remove the course this
// long afterwards, by which time the explorer has made that platform the one
// the player is standing on.
export const COURSE_REMOVE_DELAY_MS = 400

// Temporarily false to watch what really happens between holes (user,
// 2026-11-05): the end of a hole is normally hidden behind a black fade, so
// nobody has ever seen the moment the player is moved. Put it back to true
// once the cause is settled.
export const FADE_BETWEEN_HOLES = false
