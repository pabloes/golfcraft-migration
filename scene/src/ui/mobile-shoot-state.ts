// The shot's touch controls on the mobile explorer (ui/mobile-shoot-controls.tsx).
// There any touch is IA_POINTER, i.e. a shot, so on mobile the shoot control
// ignores the raw pointer and takes aim, power and the shot from here instead.
// The buttons write this state; the shoot control and the orbit camera read it
// every frame, the same way they poll the keys.
export const mobileShootState: {
  visible: boolean
  power: number
  // -1 / 0 / 1 while an aim arrow or a power button is held.
  aimHold: -1 | 0 | 1
  powerHold: -1 | 0 | 1
  // Set by the shoot control while a shot can be taken.
  shoot: (() => void) | null
} = { visible: false, power: 0, aimHold: 0, powerHold: 0, shoot: null }
