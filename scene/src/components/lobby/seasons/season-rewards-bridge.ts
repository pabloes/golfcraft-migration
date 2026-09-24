// Single gate for every season REWARD call that can move real assets.
//
// Why this file exists: SDK6's `seasons/season-menu.ts` hardcodes
// `https://golfcraftgame.com/bridge/...` for the reward claim, the action poll
// and the stock query — and it fires `claimRewards()` after EVERY season run,
// unprompted. Unlike `npc-storymode.ts` it does NOT respect USE_REMOTE_SERVER,
// so porting it verbatim would make a LOCAL dev build silently call PRODUCTION
// and mint real wearables on Polygon mainnet.
//
// Pointing these at the local onchain-queue instead is NOT a fix either: that
// service is configured against polygon-mainnet (see its PROVIDER_URL), so it
// mints for real too — that's how the mission-6 emote was actually minted.
//
// Therefore: in local dev the claim path is DISABLED (logs and no-ops, no
// network call at all). Only a remote build (USE_REMOTE_SERVER) talks to the
// bridge. Everything season-related that could grant an asset must go through
// this module — do not call the bridge directly from anywhere else.
// @ts-ignore - common/constants has @ts-nocheck
import { USE_REMOTE_SERVER } from '../../../../../common/constants'

const BRIDGE_BASE = 'https://golfcraftgame.com/bridge'
// The same onchain-queue service, run locally (see CLAUDE.md §10). Only used for
// the read-only stock query.
const LOCAL_BRIDGE_BASE = 'http://localhost:8111/bridge'

// One obvious switch. Local dev => no reward traffic whatsoever.
export const SEASON_REWARDS_ENABLED: boolean = !!USE_REMOTE_SERVER

export type SeasonClaimResult = {
  ok?: boolean
  actionID?: string
  sends_wearable?: boolean
  wearable?: any
  error?: string
} | null

export async function claimSeasonReward(params: {
  PlayFabId: string
  displayName: string
}): Promise<SeasonClaimResult> {
  if (!SEASON_REWARDS_ENABLED) {
    console.log('[season] claim-season-reward SKIPPED (local dev — would mint a real wearable)', params.PlayFabId)
    return null
  }
  try {
    const response = await fetch(`${BRIDGE_BASE}/claim-season-reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayFabId: params.PlayFabId, displayName: params.displayName })
    })
    return (await response.json()) as SeasonClaimResult
  } catch (err) {
    console.log('[season] claim-season-reward failed', err)
    return null
  }
}

// SDK6 polled this every 15s from TransactionStatusSystem: state 1 = pending,
// 2 = success, 0 = error.
export async function getSeasonActionStatus(actionId: string): Promise<any | null> {
  if (!SEASON_REWARDS_ENABLED) return null
  try {
    return await fetch(`${BRIDGE_BASE}/action/${actionId}`).then((r) => r.json())
  } catch (err) {
    console.log('[season] action status failed', err)
    return null
  }
}

// Feeds the 20 "N left" stock labels on the season prizes screen.
//
// Unlike the two calls above this one is READ-ONLY — it just reports stock — so
// it is safe to serve locally, and the local onchain-queue exposes the very same
// route. Pointing it there gives real numbers in dev without weakening anything:
// claiming stays disabled, so no wearable can be minted.
export async function getSeasonRewardsStock(): Promise<any | null> {
  const base = SEASON_REWARDS_ENABLED ? BRIDGE_BASE : LOCAL_BRIDGE_BASE
  try {
    return await fetch(`${base}/season-rewards`).then((r) => r.json())
  } catch (err) {
    // The local queue is optional (dev-up doesn't start it), so a failure here
    // just leaves the labels blank.
    console.log('[season] season-rewards stock unavailable', err)
    return null
  }
}
