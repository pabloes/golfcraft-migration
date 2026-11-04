// Per-player game options, kept in PlayFab UserData so they follow the
// account (user, 2026-11-04). Today there is one: the control scheme.
//
//   'new'    (default) the camera aims: on desktop the orbit camera (mouse /
//            A D turn, W S zoom, E F power, click shoots), on phones the avatar
//            anchored on the ball (drag to aim, SHOOT). The camera follows the
//            ball.
//   'legacy' SDK6's scheme, for players used to it: the avatar walks to the
//            ball, step 1 turns the aim with E / F and a click sets it, step 2
//            sets the power with E / F and a click shoots; the camera is the
//            player's own and stays with the avatar.
//
// The scheme is read when a hole's client is created (golfplay-client*.ts,
// shoot-control, hide-avatars, the controls help), so a change applies from
// the next hole. bootstrap.ts applies the stored value at login.
import { updateUserData } from '../meta/playfab-rest'
import { getSessionTicket } from '../meta/bootstrap'

export type ControlScheme = 'new' | 'legacy'

const USER_DATA_KEY = 'controls'

export const gameOptions: {
  controls: ControlScheme
  // A PlayFab write in flight (the options screen disables its buttons).
  saving: boolean
  // The last save failed: shown on the options screen until the next try.
  saveError: boolean
} = {
  controls: 'new',
  saving: false,
  saveError: false
}

// The camera aims (orbit / anchor cameras); false is the legacy two-step control.
export const isCameraAimMode = () => gameOptions.controls !== 'legacy'

const parseScheme = (value: unknown): ControlScheme | null =>
  value === 'legacy' || value === 'new' ? value : null

// From the login's InfoResultPayload.UserData (or any UserData record).
export function applyGameOptionsFromUserData(userData: any): void {
  const scheme = parseScheme(userData?.[USER_DATA_KEY]?.Value)
  if (scheme) gameOptions.controls = scheme
  console.log('[options] controls:', gameOptions.controls, scheme ? '(from the account)' : '(default)')
}

// Choose a scheme and keep it on the account. The choice applies locally at
// once even if the write fails, so the player is never stuck with the other
// one; saveError tells the screen to say it was not kept.
export async function setControlScheme(scheme: ControlScheme): Promise<void> {
  if (gameOptions.saving) return
  gameOptions.controls = scheme
  gameOptions.saving = true
  gameOptions.saveError = false
  try {
    const ticket = getSessionTicket()
    if (!ticket) throw new Error('no PlayFab session')
    await updateUserData(ticket, { [USER_DATA_KEY]: scheme })
    console.log('[options] controls saved:', scheme)
  } catch (err) {
    gameOptions.saveError = true
    console.log('[options] controls NOT saved:', err)
  } finally {
    gameOptions.saving = false
  }
}
