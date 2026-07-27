// SDK6 hid the other players' avatars while the mini-game was running using
// a HiddenAvatars component / AvatarHide. SDK7 has no direct equivalent yet
// in this codebase; we stub these so callers do not break. Visible-avatars
// during gameplay isn't a correctness issue, just visual polish.

export const hideAvatars = () => {}
export const showAvatars = () => {}
