// The shot's touch controls on the mobile explorer (ui/mobile-shoot-controls.tsx).
// There any touch is IA_POINTER, i.e. a shot, so on mobile the shoot control
// ignores the raw pointer and takes aim, power and the shot from here instead.
// The buttons write this state; the shoot control and the orbit camera read it
// every frame, the same way they poll the keys.

// One press of an aim or pitch arrow: when the scene saw it (Date.now()) and
// which way. A new object per press, so the orbit camera can tell presses apart.
export type ArrowPress = { at: number; dir: -1 | 1 }

export const mobileShootState: {
  visible: boolean
  power: number
  // -1 / 0 / 1 while an aim arrow, a pitch arrow or a power button is held.
  aimHold: -1 | 0 | 1
  pitchHold: -1 | 0 | 1
  powerHold: -1 | 0 | 1
  // The last press of the aim / pitch arrows. The orbit camera turns one small
  // step per press, even when its release arrived in the same tick, and only
  // speeds up while that press is still held (aimHold / pitchHold).
  aimPress: ArrowPress | null
  pitchPress: ArrowPress | null
  // -1 (in) / 0 / 1 (out) while a zoom button is held; the orbit camera reads
  // it like W / S.
  zoomHold: -1 | 0 | 1
  // Set by the orbit camera while it is active, which is when zoom works.
  zoomable: boolean
  // Set by the orbit camera while it is active: the ^ v arrows tilt it. The
  // anchor camera (phones, MOBILE_ANCHOR_CAMERA) has no tilt of its own, the
  // explorer's camera is dragged, so the arrows stay hidden.
  pitchable: boolean
  // Set by the shoot control while a shot can be taken.
  shoot: (() => void) | null
  // Set by the golfplay clients while the player is in a hole: leaves the room,
  // which ends the hole for this player the same way a server kick does.
  quit: (() => void) | null
  quitConfirm: boolean
} = {
  visible: false,
  power: 0,
  aimHold: 0,
  pitchHold: 0,
  powerHold: 0,
  aimPress: null,
  pitchPress: null,
  zoomHold: 0,
  zoomable: false,
  pitchable: false,
  shoot: null,
  quit: null,
  quitConfirm: false
}
