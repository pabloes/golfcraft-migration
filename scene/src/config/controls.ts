// Experimental control scheme.
//
// The shipped scheme is SDK6's: step 1 aims with E/F, step 2 sets power with
// E/F, click shoots. It works on mobile through the HUD buttons, but the player
// still has to walk the avatar after every shot.
//
// The camera scheme collapses that into one step, Golf With Your Friends
// style: a camera circles the ball for the whole hole, the player turns it, and
// the shot leaves the way it looks. The avatar is hidden and kept still with
// InputModifier. Which scheme a player gets is a per-account option now
// (services/game-options.ts: isCameraAimMode(), 'new' by default, 'legacy' for
// SDK6's two-step control), read when each hole's client is created.

// Phones only (platform.ts isMobile). The mobile explorer does not update
// PrimaryPointerInfo during a touch drag while a VirtualCamera is active, so
// the orbit camera could only be turned with the panel's < > arrows there.
// With this on, a phone gets golfplay/src/components/anchor-camera.ts instead:
// the hidden avatar is teleported onto the ball at every turn, kept still, and
// the explorer's own third-person camera (turned by the native touch drag) is
// the aim, plus the arrows' fine offset. Desktop keeps the orbit camera.
export const MOBILE_ANCHOR_CAMERA = true

// Orbit camera (golfplay/src/components/orbit-camera.ts).
// Metres from the ball (W/S zoom between MIN and MAX), and degrees above the
// ground (the mouse tilts between MIN and MAX): where each starts.
export const ORBIT_DISTANCE = 4.5
export const ORBIT_DISTANCE_MIN = 1.5
export const ORBIT_DISTANCE_MAX = 12
export const ORBIT_PITCH = 24
export const ORBIT_PITCH_MIN = 8
export const ORBIT_PITCH_MAX = 75
// Degrees per pixel of pointer movement.
export const ORBIT_MOUSE_SENSITIVITY = 0.25
// Degrees per second with A/D, or the joystick on mobile.
export const ORBIT_KEY_SPEED = 90
// Metres per second with W/S, or the joystick on mobile.
export const ORBIT_ZOOM_SPEED = 5
// How fast the camera catches up with the ball.
export const ORBIT_FOLLOW_SMOOTH = 8
