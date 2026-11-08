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

// The play floor (scene-bounds.ts) faintly visible while this is being
// watched. Set to false once it is confirmed, and it goes back to being an
// invisible collider.
export const SHOW_PLAY_FLOOR = true

// The height of the play floor, fixed and just above zero (user, 2026-11-07:
// "no lo habíamos puesto cerca del suelo? … ponlo a y 0.1").
//
// It used to be measured: the player landed on the course, the scene watched
// until their feet stopped moving and put the sheet exactly there. That read
// high — the course's own floor parts sit at y 0 across every local definition
// — so the sheet ended up well above the ground, visible under nobody's feet.
// A fixed height near zero is where the ground actually is.
export const PLAY_FLOOR_Y = 0.1
