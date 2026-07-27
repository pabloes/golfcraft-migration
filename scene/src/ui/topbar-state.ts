// Module-level shared state for the top bar HUD. The npc-storymode
// `intervalCheck` updates the timer here; the ReactEcs <TopBar /> reads it
// each render. SDK6 had a getTopBar() singleton + UICanvas/UIContainerStack;
// this replaces both ends with plain mutable state.

export const topbarState = {
  visible: false,
  ms: 0
}

export const showTopBar = (durationMs: number) => {
  topbarState.visible = true
  topbarState.ms = durationMs
}

export const hideTopBar = () => {
  topbarState.visible = false
}

export const updateTopBarTime = (ms: number) => {
  topbarState.ms = ms
}

export const formatTopBarTime = (ms: number): string => {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
