// Stub of the SDK6 globalStore. The real version tracks user data + game
// state across the whole scene with a Proxy-backed pub/sub.
//
// For the mission-1 milestone we only need the read paths used by
// npc-storymode + golfplay-client to not crash:
//   - game.getState() -> { playing, starting, courseAuthor, courseName, courseIsSeason, courseId }
//   - userData.getState() -> { statistic_current_mission, golfclubs, activeGolfClubTokenId, statistics_paella_wearable }
//   - userData.onChange(cb, key) -> noop unsubscribe
//
// Real PlayFab-backed implementation is task #16.

type AnyStore = {
  getState: () => any
  setState: (value: any) => void
  onChange: (cb: (event: { newValue: any; oldValue: any; prop: string }) => void, key?: string) => () => void
}

const makeStore = (initial: any): AnyStore => {
  const state = { ...initial }
  return {
    getState: () => state,
    setState: (value: any) => Object.assign(state, value),
    onChange: () => () => {}
  }
}

export const globalStore = {
  game: makeStore({
    playing: false,
    starting: false,
    finished: false,
    courseAuthor: null,
    courseName: null,
    courseIsSeason: false,
    courseId: null,
    introScreen: true,
    // Set by main() when bootstrap fails (no PlayFab account, no backend...):
    // the error dialog shows and the lobby + HUD never load.
    bootError: null as string | null,
    bootErrorDismissed: false
  }),
  userData: makeStore({
    statistic_current_mission: 1,
    statistic_paella_wearable: 0,
    golfclubs: [
      {
        ItemId: 'golfclub-1',
        CustomData: {
          attribute_power: '0',
          attribute_control: '0',
          attribute_aim: '0',
          tokenId: null
        }
      }
    ],
    activeGolfClubTokenId: null
  })
}
