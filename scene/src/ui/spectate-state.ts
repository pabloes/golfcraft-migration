// What the HUD shows while watching somebody else's game
// (components/lobby/spectator-client.ts). Same pattern as the other HUD
// modules: a mutable object the gameplay writes and the UI reads each render.
export const spectateState = {
  visible: false,
  // who is being watched, as the live-games listing named them
  label: '',
  hole: 1,
  shots: 0,
  onLeave: null as (() => void) | null
}
