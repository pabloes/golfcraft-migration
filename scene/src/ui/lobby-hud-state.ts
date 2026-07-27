// Minimal lobby HUD state. SDK6's lobby-ui.ts (508 lines) drove a full
// UICanvas+UIImage panel sourced from images/ui-spritesheet.png with sprite
// icons for every material. This first pass surfaces just the numeric
// counters; sprite icons can be added later by cropping the atlas via uvs.

export type LobbyResources = {
  GC: number    // Golf Coins (PlayFab virtual currency)
  FT: number    // Fashion Tickets (PlayFab virtual currency)
  PT: number    // Points (PlayFab virtual currency)
  DM: number    // Diamonds (PlayFab virtual currency)
  WD: number    // Wood (PlayFab Material inventory)
  ST: number    // Stone (PlayFab Material inventory)
  IR: number    // Iron (PlayFab Material inventory)
  GD: number    // Gold (PlayFab Material inventory)
  EN: number    // Energy — one is spent per season run (PlayFab virtual currency)
  xp: number
  level: number     // currentLevel from getLevelInfo(xp) — NOT a PlayFab stat
  levelPct: number  // progressPercentage within the current level (0-100)
  // Blockchain (Arbitrum subgraph) materials — separate from PlayFab balance.
  DMChain: number
  Planks: number
  StoneBlocks: number
  IronBars: number
  GoldBars: number
  // Active golf club (resolved from activeGolfClubTokenId; NFT clubs → 5/5/5).
  golfclub: { id: number; name: string; power: number; control: number; aim: number } | null
  bonus: number        // TrainingBonus % = Σ golfclub bonuses + min(wearables,50) + trainingBoost
  farmingBonus: number // pickaxe bonus — SDK6 never computes it (vestigial 0)
  // Track if we ever populated the resources so the HUD can show "-" instead
  // of "0" when the request never returned data.
  loaded: boolean
}

export const lobbyHudState: { visible: boolean; resources: LobbyResources } = {
  visible: false,
  resources: {
    GC: 0,
    FT: 0,
    PT: 0,
    DM: 0,
    WD: 0,
    ST: 0,
    IR: 0,
    GD: 0,
    EN: 0,
    xp: 0,
    level: 1,
    levelPct: 0,
    DMChain: 0,
    Planks: 0,
    StoneBlocks: 0,
    IronBars: 0,
    GoldBars: 0,
    golfclub: null,
    bonus: 0,
    farmingBonus: 0,
    loaded: false
  }
}

// Render helper: show "-" while resources haven't loaded yet, otherwise the
// real number (zeros included). Matches the user's preference to distinguish
// "missing/unknown" from "zero".
export const renderCount = (value: number, loaded: boolean): string => {
  if (!loaded) return '-'
  return String(value)
}

export const showLobbyHud = () => {
  lobbyHudState.visible = true
}

export const hideLobbyHud = () => {
  lobbyHudState.visible = false
}

export const updateLobbyResources = (patch: Partial<LobbyResources>) => {
  Object.assign(lobbyHudState.resources, patch)
}
