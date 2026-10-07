// Experimental control scheme.
//
// The shipped scheme is SDK6's: step 1 aims with E/F, step 2 sets power with
// E/F, click shoots. It works on mobile through the HUD buttons, but the player
// still has to walk the avatar after every shot.
//
// CAMERA_AIM_MODE collapses that into one step, Golf With Your Friends style: a
// camera circles the ball for the whole hole, the player turns it, and the shot
// leaves the way it looks. The avatar is hidden and kept still with
// InputModifier. Flip it to compare the two schemes.
export const CAMERA_AIM_MODE = true

// Orbit camera (golfplay/src/components/orbit-camera.ts).
// Metres from the ball, and degrees above the ground: where it starts and how
// far the player can tilt it.
export const ORBIT_DISTANCE = 4.5
export const ORBIT_PITCH = 24
export const ORBIT_PITCH_MIN = 8
export const ORBIT_PITCH_MAX = 75
// Degrees per pixel of pointer movement.
export const ORBIT_MOUSE_SENSITIVITY = 0.25
// Degrees per second with A/D, or the joystick on mobile.
export const ORBIT_KEY_SPEED = 90
// How fast the camera catches up with the ball.
export const ORBIT_FOLLOW_SMOOTH = 8
