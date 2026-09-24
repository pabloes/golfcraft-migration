// State for SDK6's "waiting for players" screen (season-game-countdown.ts).
// SDK6 built it from a UIContainerRect with 4 UIImages fed by AvatarTexture,
// a title, a player list and a cancel button. In SDK7 the avatars come from
// uiBackground's avatarTexture, so we only need the userIds here.

export type SeasonWaitPlayer = { userId: string; displayName: string }

export type SeasonWaitState = {
  visible: boolean
  title: string
  // Revealed one by one as SDK6's countdown ticks 8 -> 7 -> 6.
  players: SeasonWaitPlayer[]
  // "Anonymous confession: ..." ticker along the bottom.
  sub: string
  onCancel: (() => void) | null
  // The two below only exist for "play ranked with friends" (season-party.ts):
  // a line under the title ("Starts in 42s") and the host's START button.
  info: string
  onStart: (() => void) | null
}

export const seasonWaitState: SeasonWaitState = {
  visible: false,
  title: '',
  players: [],
  sub: '',
  onCancel: null,
  info: '',
  onStart: null
}
