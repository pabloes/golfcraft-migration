// State for the "waiting for players" screens (ui/season-screens.tsx):
// the solo Season join (season-game-countdown.ts) and the "play ranked with
// friends" room (seasons/season-party.ts). SDK6 built the solo one from a
// UIContainerRect with 4 UIImages fed by AvatarTexture; in SDK7 the avatars
// come from uiBackground's avatarTexture, so only the userIds travel here.

export type SeasonWaitPlayer = {
  userId: string
  displayName: string
  // Party room only.
  isHost?: boolean
  tierName?: string
  // false when the member is above the room's level and plays for fun.
  eligible?: boolean
}

export type SeasonWaitState = {
  visible: boolean
  mode: 'solo' | 'party'
  title: string
  // Solo: revealed one by one as the countdown ticks 8 -> 7 -> 6.
  players: SeasonWaitPlayer[]
  // Seconds until the round starts (solo countdown, party reaper).
  secondsLeft: number
  // Party: the level the room plays at (the lowest member's).
  roomTierName: string
  // "Anonymous confession: ..." ticker along the bottom.
  sub: string
  onCancel: (() => void) | null
  // Party: the caption under the title and the host's START button.
  info: string
  onStart: (() => void) | null
}

export const seasonWaitState: SeasonWaitState = {
  visible: false,
  mode: 'solo',
  title: '',
  players: [],
  secondsLeft: 0,
  roomTierName: '',
  sub: '',
  onCancel: null,
  info: '',
  onStart: null
}
