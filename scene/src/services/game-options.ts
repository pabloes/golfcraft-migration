// Per-player game options, kept in PlayFab UserData so they follow the
// account (user, 2026-11-04). Today there is one: the control scheme.
//
//   'new'    (default) the camera aims: the orbit camera (mouse / A D turn,
//            W S zoom, E F power, click shoots), which follows the ball.
//   'legacy' SDK6's scheme, for players used to it: the avatar walks to the
//            ball, step 1 turns the aim with E / F and a click sets it, step 2
//            sets the power with E / F and a click shoots; the camera is the
//            player's own and stays with the avatar.
//
// ⚠ DESKTOP ONLY (user, 2026-11-04). A phone has no keyboard and its touch
// panel is built around the anchor camera, so phones always get 'new' whatever
// the account says, and the options screen is not offered there.
//
// The scheme is read when a hole's client is created (golfplay-client*.ts,
// shoot-control, hide-avatars, the controls help), so a change applies from
// the next hole. bootstrap.ts applies the stored value at login.
import { updateUserData } from '../meta/playfab-rest'
import { getSessionTicket } from '../meta/bootstrap'
import { isMobile } from './platform'

export type ControlScheme = 'new' | 'legacy'

const USER_DATA_KEY = 'controls'
const AUDIO_DATA_KEY = 'audio'

// Volumes, 0 to 1, kept on the account like the control scheme (user,
// 2026-11-05). The map music was louder than it should be and the lobby
// stream louder still, because a VideoPlayer with no volume of its own plays
// at 1.0 while the music was at 0.5.
export const DEFAULT_MUSIC_VOLUME = 0.25
export const DEFAULT_STREAM_VOLUME = 0.5
export const VOLUME_STEP = 0.1

export const gameOptions: {
  controls: ControlScheme
  musicVolume: number
  streamVolume: number
  // One switch for everything the scene plays, so it can be silenced from the
  // HUD without losing the two levels behind it.
  muted: boolean
  // A PlayFab write in flight (the options screen disables its buttons).
  saving: boolean
  // The last save failed: shown on the options screen until the next try.
  saveError: boolean
} = {
  controls: 'new',
  musicVolume: DEFAULT_MUSIC_VOLUME,
  streamVolume: DEFAULT_STREAM_VOLUME,
  muted: false,
  saving: false,
  saveError: false
}

// What each source should be playing at right now. Everything that makes
// sound reads these, and applies them while it plays rather than only when it
// starts, so a change is heard at once.
export const musicVolume = () => (gameOptions.muted ? 0 : gameOptions.musicVolume)
export const streamVolume = () => (gameOptions.muted ? 0 : gameOptions.streamVolume)

// The camera aims (orbit camera on desktop, anchor camera on phones); false is
// the legacy two-step control, which only desktop can choose.
export const isCameraAimMode = () => isMobile() || gameOptions.controls !== 'legacy'

const parseScheme = (value: unknown): ControlScheme | null =>
  value === 'legacy' || value === 'new' ? value : null

const clampVolume = (value: unknown, fallback: number) => {
  const n = Number(value)
  if (!isFinite(n)) return fallback
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

// From the login's InfoResultPayload.UserData (or any UserData record).
export function applyGameOptionsFromUserData(userData: any): void {
  const scheme = parseScheme(userData?.[USER_DATA_KEY]?.Value)
  if (scheme) gameOptions.controls = scheme
  console.log('[options] controls:', gameOptions.controls, scheme ? '(from the account)' : '(default)')
  // The volumes travel as one JSON key, so adding another later costs no
  // extra PlayFab write and no extra key.
  const raw = userData?.[AUDIO_DATA_KEY]?.Value
  if (!raw) return
  try {
    const audio = JSON.parse(String(raw))
    gameOptions.musicVolume = clampVolume(audio.music, DEFAULT_MUSIC_VOLUME)
    gameOptions.streamVolume = clampVolume(audio.stream, DEFAULT_STREAM_VOLUME)
    gameOptions.muted = audio.muted === true
    console.log('[options] audio:', JSON.stringify({ music: gameOptions.musicVolume, stream: gameOptions.streamVolume, muted: gameOptions.muted }))
  } catch (err) {
    console.log('[options] audio settings unreadable, using the defaults:', err)
  }
}

// Change a volume (or the mute) and keep it on the account. Applied locally
// at once whatever PlayFab answers, like the control scheme: nobody should be
// stuck at a volume they can hear is wrong because a write failed.
export async function saveAudioOptions(change: { music?: number; stream?: number; muted?: boolean }): Promise<void> {
  if (change.music !== undefined) gameOptions.musicVolume = clampVolume(change.music, gameOptions.musicVolume)
  if (change.stream !== undefined) gameOptions.streamVolume = clampVolume(change.stream, gameOptions.streamVolume)
  if (change.muted !== undefined) gameOptions.muted = change.muted
  const payload = JSON.stringify({ music: gameOptions.musicVolume, stream: gameOptions.streamVolume, muted: gameOptions.muted })
  try {
    const ticket = getSessionTicket()
    if (!ticket) throw new Error('no PlayFab session')
    await updateUserData(ticket, { [AUDIO_DATA_KEY]: payload })
  } catch (err) {
    console.log('[options] audio NOT saved:', err)
  }
}

export const toggleMute = () => {
  void saveAudioOptions({ muted: !gameOptions.muted })
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
