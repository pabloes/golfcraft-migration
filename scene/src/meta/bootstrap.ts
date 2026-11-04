import { engine } from '@dcl/sdk/ecs'
import { getUserData } from '~system/UserIdentity'
import { getRealm } from '~system/Runtime'
import { signedFetch } from '~system/SignedFetch'
import * as Colyseus from 'colyseus.js'

import {
  WS_HOST,
  USE_REMOTE_SERVER,
  MATERIALS_CONTRACT,
  GOLF_CLUB_BONUSES,
  GOLFCLUB_CONTRACT,
  POLYGON_RPC
} from '../../../common/constants'
import { getLevelInfo } from '../../../common/utils'
import {
  loginWithCustomID,
  getPlayerCombinedInfo,
  getTitleData,
  executeCloudScript,
  updateUserData,
  updateUserTitleDisplayName,
  isNameNotAvailable,
  CombinedInfo,
  LoginResult
} from './playfab-rest'
import { decorateRemotePhysicParts } from '../../golfplay/physics/course-element-loader'
import { updateLobbyResources, lobbyHudState } from '../ui/lobby-hud-state'
import { globalStore } from '../services/globalStore/globalStore'
import { explorerTag } from '../services/platform'
import { applyGameOptionsFromUserData } from '../services/game-options'

// PlayFab session ticket from the last login, kept so refreshUserData() can
// re-fetch player data (resources + current_mission) after a mission — the
// server bumps current_mission / rewards on completion. Mirrors SDK6
// services/userData.ts:refreshUserData, which the storymode NPC calls onFinish.
let sessionTicket: string | null = null
// Lowercase wallet of a web3 player ('' for guests), for the NFT golf clubs.
let nftWallet = ''

// The golfclub board calls cloudscript handlers (upgradeGolfclub /
// selectGolfClubTokenId), which need the same ticket.
export const getSessionTicket = () => sessionTicket
// The signed-in player's PlayFabId (empty until login), for the leaderboard.
export const getPlayFabId = () => playFabIdForMissions

export async function refreshUserData(): Promise<void> {
  if (!sessionTicket) return
  try {
    const combined = await getPlayerCombinedInfo(sessionTicket)
    await applyCombinedInfoToHud(combined)
  } catch (err) {
    console.log('[bootstrap] refreshUserData failed:', err)
  }
  await fetchDailyMissions()
}

// SDK6 meta.ts fetched this at boot and userData.ts on every refresh, always
// from production; ours follows USE_REMOTE_SERVER like the other web API
// calls. Non-fatal: the panel just shows nothing until it arrives.
let playFabIdForMissions = ''
// Also called when the lobby dialog opens DAILY MISSIONS, since progress
// moves while playing.
export async function fetchDailyMissions(): Promise<void> {
  if (!playFabIdForMissions) return
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  try {
    const data = await fetch(`${base}/api/get-daily-missions/${playFabIdForMissions}`).then((r) => r.json())
    if (data?.state?.missions) {
      lobbyHudState.dailyMissions = {
        state: { missions: data.state.missions, date: data.state.date },
        dailyMissionIndex: Number(data.dailyMissionIndex || 0),
        dailyMissionStep: Number(data.dailyMissionStep || 0)
      }
    }
  } catch (err) {
    console.log('[bootstrap] get-daily-missions failed:', err)
  }
}

export type BootstrapResult = {
  colyseus: Colyseus.Client
  PlayFabId: string
  user: {
    userId: string
    publicKey?: string
    hasConnectedWeb3: boolean
    displayName: string
  }
  realm: string
  clientInfo: { sessionTicket: string }
}

let bootstrapped: BootstrapResult | null = null
let bootstrapPromise: Promise<BootstrapResult> | null = null

// SDK6 connectPlayfab.xLoginWithCustomID resolves the player's PlayFab
// CustomId via /api/get-login-id on the web API. When that fails for a web3
// player this THROWS instead of falling back to the wallet as CustomId: the
// fallback silently landed on an empty account (storymode back at mission 1,
// no Season panel, rewards going nowhere), which is worse than not loading the
// game at all. main() turns the error into a dialog and skips the lobby. The route reads the wallet
// from the x-identity-auth-chain-0 header, looks up the existing PlayFab
// account via GetPlayFabIDsFromGenericIDs(ServiceName:"address") and returns
// that account's opaque CustomId (NOT the wallet). Logging in with the raw
// wallet as CustomId instead lands on a DIFFERENT account, so the player's
// real resources/statistics/golfclubs don't appear. SDK6 hardcoded the host:
// remote -> https://golfcraftgame.com, local -> http://localhost:2569 (the web
// API; NOT the Colyseus server on 2567 that SERVER_HTTP_URL points to).
//
// SDK7 twist: ~system/SignedFetch rejects http:// URLs ("URL scheme must be
// `https`"). Production hits https://golfcraftgame.com, so signedFetch works
// there. For the local http web API we can't use signedFetch — but the route
// only needs the wallet in x-identity-auth-chain-0, and its signature check
// (runChecks) is gated behind process.env.PROD, which is unset in local dev.
// So we hand-build that header and use a plain fetch (which allows http).
//
// Both visit calls carry the explorer ("<agent>/<platform>", see
// services/platform.ts) so golfcraftgame.com/stats can count visitors per
// explorer; it is waited for at most 2 s and left out when unknown.
async function resolvePlayFabCustomId(userId: string, hasConnectedWeb3: boolean): Promise<string> {
  const explorer = await explorerTag()
  if (!hasConnectedWeb3) {
    // Guest player: no signed identity to send, use the userId directly so we
    // get a stable anonymous account.
    recordGuestVisit(userId, explorer)
    return userId
  }
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  const url = `${base}/api/get-login-id`
  try {
    let bodyText: string
    if (USE_REMOTE_SERVER) {
      const response = await signedFetch({
        url,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', ...explorerHeader(explorer) } }
      })
      if (!response.ok) {
        console.log('[bootstrap] /api/get-login-id non-OK', response.status, response.body)
        throw new Error(`get-login-id answered ${response.status}: ${describeLoginError(response.body)}`)
      }
      bodyText = response.body
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The route does JSON.parse(header).payload.toLowerCase() to get the
          // wallet. Match the auth-chain entry-0 shape so it parses cleanly.
          'x-identity-auth-chain-0': JSON.stringify({ type: 'SIGNER', payload: userId, signature: '' }),
          ...explorerHeader(explorer)
        }
      })
      if (!response.ok) {
        console.log('[bootstrap] /api/get-login-id non-OK', response.status)
        throw new Error(`get-login-id answered ${response.status}`)
      }
      bodyText = await response.text()
    }
    const data = JSON.parse(bodyText)
    if (data?.CustomId) {
      console.log('[bootstrap] resolved CustomId from /api/get-login-id')
      return data.CustomId
    }
    throw new Error('get-login-id returned no CustomId')
  } catch (err: any) {
    console.log('[bootstrap] /api/get-login-id failed:', err)
    throw new Error(`Could not resolve your GolfCraft account (${err?.message || err})`)
  }
}

// golfcraftgame.com/stats counts wallet visits in /api/get-login-id, which
// guests never call, so a guest's visit is reported here. Same transport as
// get-login-id (signed in production, hand-built header locally); a failure
// only costs one visit in the stats, so nothing waits for it.
function recordGuestVisit(userId: string, explorer: string) {
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  const url = `${base}/api/record-visit`
  const body = JSON.stringify(explorer ? { explorer } : {})
  const request: Promise<unknown> = USE_REMOTE_SERVER
    ? signedFetch({ url, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } })
    : fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-identity-auth-chain-0': JSON.stringify({ type: 'SIGNER', payload: userId, signature: '' })
        },
        body
      })
  request.catch((err: any) => console.log('[bootstrap] record-visit failed:', err))
}

// The stats header for the visit calls; nothing when the explorer is unknown
function explorerHeader(explorer: string): { [key: string]: string } {
  return explorer ? { 'x-golfcraft-explorer': explorer } : {}
}

// The route answers {"valid":false,"error":"..."} when its checks fail; show
// that text rather than the raw JSON.
function describeLoginError(body: string): string {
  try {
    const parsed = JSON.parse(body)
    if (parsed?.error) return String(parsed.error)
  } catch (_) {}
  return body
}

// Map PlayFab data into the lobby HUD state. SDK6 production code in
// scene/src/services/userData.ts kept ALL resources (GC, FT, PT, DM, WD,
// ST, IR, GD) in UserVirtualCurrency — the only Inventory items used were
// Golfclubs, TrainingBoost and Chests. `mapInventoryMaterials` was commented
// out in SDK6, so we don't read materials from Inventory either.
//
// XP/level: SDK6 stores xp in UserReadOnlyData.xp (the increaseXp cloudscript
// writes it there via UpdateUserReadOnlyData; refreshUserData spreads it into
// the store with destructureDataValues). There is NO `level` statistic — the
// lobby player panel computes level + progress from xp via getLevelInfo().
// current_mission/tier-sub etc. live in PlayerStatistics (logged for context).
async function applyCombinedInfoToHud(info: CombinedInfo) {
  const vc = info.VirtualCurrency || {}
  const stats = info.Statistics.reduce(
    (acc: Record<string, number>, s) => ((acc[s.StatisticName] = s.Value), acc),
    {}
  )
  // Mission progression: the storymode NPC reads current_mission from the store
  // to decide which mission dialog to show and which mission-N to request. The
  // server bumps the PlayFab `current_mission` statistic when a mission is
  // completed; mirror that into the store so the NPC reflects the real mission
  // on (re)load. (SDK6 did this in refreshUserData via destructureDataValues.)
  globalStore.userData.setState({
    statistic_current_mission: stats.current_mission || 1,
    // The season panel reads these to render your rank and progress.
    'statistic_tier-sub': stats['tier-sub'] || 0,
    'statistic_tier-sub-max': stats['tier-sub-max'] || 0
  })
  console.log('[bootstrap] current_mission =', stats.current_mission || 1)
  const xp = Number(info.UserReadOnlyData?.xp?.Value || 0)
  const { currentLevel, progressPercentage } = getLevelInfo(xp)
  console.log(
    '[bootstrap] PlayFab data:',
    'VC=', JSON.stringify(vc),
    'xp=', xp,
    'level=', currentLevel,
    'stats=', JSON.stringify(stats),
    'inventoryLen=', info.Inventory?.length,
    'readOnlyKeys=', Object.keys(info.UserReadOnlyData || {}).length
  )
  updateLobbyResources({
    GC: vc.GC || 0,
    FT: vc.FT || 0,
    PT: vc.PT || 0,
    DM: vc.DM || 0,
    WD: vc.WD || 0,
    ST: vc.ST || 0,
    IR: vc.IR || 0,
    GD: vc.GD || 0,
    EN: vc.EN || 0,
    xp,
    level: currentLevel,
    levelPct: progressPercentage,
    loaded: true
  })
  console.log('[bootstrap] HUD resources populated from PlayFab')

  // --- Golf club panel + bonus ---
  const inventory = info.Inventory || []
  const invGolfclubs = inventory.filter((i) => i.ItemClass === 'Golfclub')
  const hasTrainingBoost = inventory.some((i) => i.ItemClass === 'TrainingBoost')
  const activeTokenId = info.UserReadOnlyData?.activeGolfClubTokenId?.Value || ''
  const wearablesBonus = Number(info.UserReadOnlyData?.wearablesBonus?.Value || 0)

  // Active club model, as SDK6 getGolfclubIdFromTokenId: from the player's own
  // clubs (inventory + the wallet's NFT clubs) by tokenId. The CocoBay promo is
  // not a real token, and the contract answers 0 (Star trail) for it, so it
  // maps to its own model; anything else asks the contract. SDK6 defaults to
  // the basic club (id 1) when the token can't be resolved.
  const nftGolfclubs = await fetchNftGolfclubs(nftWallet, invGolfclubs)
  const listed = activeTokenId
    ? [...invGolfclubs, ...nftGolfclubs].find((i) => String(i.CustomData?.tokenId ?? '') === String(activeTokenId))
    : undefined
  let model: number | null = listed
    ? Number(listed.ItemId.replace('golfclub-', ''))
    : activeTokenId === COCOBAY_PROMO.tokenId
      ? COCOBAY_PROMO.golfclubId
      : await resolveActiveGolfclubModel(activeTokenId)
  if (model === null || isNaN(model)) model = 1

  // Attributes: SDK6 controller assumes maxed (5/5/5) for any NFT club (id != 1);
  // the basic club (id 1) shows its real inventory attributes.
  let power = 5
  let control = 5
  let aim = 5
  if (model === 1) {
    const gc1 = invGolfclubs.find((i) => i.ItemId === 'golfclub-1')
    power = Number(gc1?.CustomData?.attribute_power || 0)
    control = Number(gc1?.CustomData?.attribute_control || 0)
    aim = Number(gc1?.CustomData?.attribute_aim || 0)
  }

  const ownedModels = [...invGolfclubs, ...nftGolfclubs].map((i) => Number(i.ItemId.replace('golfclub-', '')))
  const bonus = computeTrainingBonus([...ownedModels, model], wearablesBonus, hasTrainingBoost)

  console.log(
    '[bootstrap] golfclub:',
    'activeToken=', activeTokenId,
    'model=', model,
    'name=', GOLF_CLUB_NAMES[model] || 'GOLF CLUB',
    'attrs=', `${power}/${control}/${aim}`,
    'bonus=', bonus
  )
  updateLobbyResources({
    golfclub: { id: model, name: GOLF_CLUB_NAMES[model] || 'GOLF CLUB', power, control, aim },
    bonus
  })

  // Publish the inventory clubs + the wallet's NFT clubs + active token into
  // the store, mirroring SDK6 services/userData.ts:95 (`golfclubs:
  // [...filterInventoryGolfclubs(UserInventory), ...getNFTGolfClubs(address)]`
  // + `activeGolfClubTokenId` from UserReadOnlyData). The golfclub board and
  // the WORKSHOP read this to build their collection, and the mission and
  // Season clients pick the club they start with by its CustomData.tokenId.
  // NFT clubs are NOT in the PlayFab inventory: without them a holder saw only
  // the basic club + CocoBay promo and played with the basic club's stats.
  globalStore.userData.setState({
    golfclubs: [...invGolfclubs, ...nftGolfclubs],
    activeGolfClubTokenId: activeTokenId || null
  })
}

// On-chain materials. SDK6's material-balance.ts asked its subgraph for the
// wallet's balances; both that subgraph and our Studio one are gone, so we
// call the ERC1155's balanceOfBatch(wallet x8, ids 0..7) directly. The
// id-to-name map mirrors SDK6 materialStoreNames.
const MATERIAL_STORE_NAMES: Record<string, string> = {
  '0': 'FTChain',
  '1': 'FT500Chain',
  '2': 'DMChain',
  '3': 'DM100Chain',
  '4': 'Planks',
  '5': 'StoneBlocks',
  '6': 'IronBars',
  '7': 'GoldBars'
}

async function fetchBlockchainMaterials(address: string): Promise<Record<string, number>> {
  const ids = Object.keys(MATERIAL_STORE_NAMES)
  const n = (x: number) => word(x.toString(16))
  // balanceOfBatch(address[],uint256[]): two offsets, then each array as length + items
  const data =
    '0x4e1273f4' + n(64) + n(64 + 32 * (ids.length + 1)) +
    n(ids.length) + ids.map(() => word(address)).join('') +
    n(ids.length) + ids.map((id) => n(Number(id))).join('')
  const response = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: MATERIALS_CONTRACT, data }, 'latest'] })
  })
  if (!response.ok) throw new Error(`rpc ${response.status}`)
  const json = await response.json()
  // returns uint256[]: offset, length, then one word per id
  const hex = String(json?.result || '').replace(/^0x/, '')
  if (hex.length < 128 + 64 * ids.length) throw new Error(`balanceOfBatch failed: ${JSON.stringify(json?.error || json)}`)
  const out: Record<string, number> = {}
  ids.forEach((id, i) => {
    out[MATERIAL_STORE_NAMES[id]] = parseInt(hex.slice(128 + 64 * i, 192 + 64 * i), 16) || 0
  })
  return out
}

// SDK6 services/connect/connectPlayfab.ts:196 fetches this during login: a
// flat {key: JSON.parse(value)} map from the web API's `config` table (admin-
// editable panel positions, currentSeasonCollectionId, etc). Stored on
// userData.config; season-menu.ts reads config.currentSeasonCollectionId to
// name the active season. Plain fetch (no signed identity needed) in SDK6, and
// the route is unauthenticated on our side too.
async function fetchConfig(): Promise<Record<string, any>> {
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  const response = await fetch(`${base}/api/config`)
  if (!response.ok) throw new Error(`/api/config ${response.status}`)
  return response.json()
}

// The "CocoBay x Golfcraft" promo club that SDK6 lobby-training.ts
// deserializeGolfclubs offers everyone: not an NFT, shown with the CocoBay model.
export const COCOBAY_PROMO = { tokenId: '999999', golfclubId: 9 }

// Golf club model id → display name (SDK6 golfclubCatalog / GOLF_CLUB_NAME).
// Models not listed (1, 4) fall back to the generic "GOLF CLUB".
export const GOLF_CLUB_NAMES: Record<number, string> = {
  0: 'Star trail',
  2: 'Star',
  3: 'Eye wide shot',
  5: 'Pink Star',
  6: 'Poti club by Tobik',
  7: 'Vampire bait',
  8: 'MC2 Golf club',
  9: 'CocoBay'
}

// Resolve an equipped NFT club's model via the Golfclub contract's
// getGolfclubId(uint256) (selector 0x1f56940f, returns uint16). SDK6 looked this
// up in the subgraph; the subgraph is gone, so we read the contract directly.
// Returns null on miss/failure (caller falls back to the basic club, id 1).
async function resolveActiveGolfclubModel(tokenId: string): Promise<number | null> {
  if (!tokenId) return null
  const idHex = Number(tokenId).toString(16).padStart(64, '0')
  const data = '0x1f56940f' + idHex
  try {
    const response = await fetch(POLYGON_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: GOLFCLUB_CONTRACT, data }, 'latest']
      })
    })
    const json = await response.json()
    if (!json?.result || json.result === '0x') return null
    return parseInt(json.result, 16)
  } catch (err) {
    console.log('[bootstrap] getGolfclubId RPC failed:', err)
    return null
  }
}

// SDK6 services/golfclubs.ts:getNFTGolfClubs listed the wallet's NFT clubs
// from the (now dead) subgraph as synthetic 5/5/5 items. We read the same from
// the Golfclub ERC721: balanceOf, then tokenOfOwnerByIndex and getGolfclubId
// per token. Tokens the inventory already carries are skipped. Guests have no
// wallet; any failure lists none.
const MAX_NFT_GOLFCLUBS = 100
const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')

// True when the chain read above failed for a player who does have a wallet,
// so the WORKSHOP can say so instead of just showing a short collection. The
// whole point: a holder of 9 clubs saw only the basic one and the CocoBay
// promo, and nothing on screen or in the log said why (2SC828R, 2026-11-04).
export let nftClubsReadFailed = false

const rpcCall = (body: unknown) =>
  fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((r) => r.json())

const callBody = (data: string, id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'eth_call',
  params: [{ to: GOLFCLUB_CONTRACT, data }, 'latest']
})

const decodeResult = (r: any): number => {
  if (!r?.result || r.result === '0x') throw new Error(`eth_call ${r?.id} failed ${JSON.stringify(r?.error ?? '')}`)
  return parseInt(r.result, 16)
}

// One eth_call per `data`. The whole step goes in a single JSON-RPC batch when
// the runtime and the endpoint allow it (one HTTP request), and otherwise one
// request per call. The batch is the ONLY place the scene sends an array body:
// every other chain read here (balanceOfBatch for the materials row,
// getGolfclubId for the equipped club) is a plain single call, so a runtime
// that does not pass an array through broke this read and nothing else.
async function golfclubCalls(datas: string[]): Promise<number[]> {
  try {
    const json = await rpcCall(datas.map((data, id) => callBody(data, id)))
    if (!Array.isArray(json)) throw new Error('RPC batch not supported')
    const out: number[] = []
    for (const r of json) out[r.id] = decodeResult(r)
    if (out.length !== datas.length || out.some((v) => v === undefined || isNaN(v))) {
      throw new Error('RPC batch answered short')
    }
    return out
  } catch (err) {
    console.log('[bootstrap] golfclub RPC batch failed, retrying one call at a time:', err)
    const out: number[] = []
    for (let i = 0; i < datas.length; i++) out[i] = decodeResult(await rpcCall(callBody(datas[i], 1)))
    return out
  }
}

type OwnedClub = { tokenId: string; model: number }

// Preferred source: our own index (web/server/nft/), which follows the
// contract's Transfer events, so this is one plain GET against an endpoint we
// own instead of three RPC rounds against a public node. `ready` tells an
// empty answer ("this wallet owns none") from an index that is still seeding,
// and only a ready one is believed; anything else falls through to the chain.
async function fetchNftGolfclubsFromIndex(address: string): Promise<OwnedClub[] | null> {
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  try {
    const answer = await fetch(`${base}/api/nft-golfclubs?address=${address}`).then((r) => r.json())
    if (!answer?.ready || !Array.isArray(answer.clubs)) {
      console.log('[bootstrap] NFT club index not ready, reading the contract')
      return null
    }
    return answer.clubs
      .filter((c: any) => c && c.model !== null && c.model !== undefined)
      .map((c: any) => ({ tokenId: String(c.tokenId), model: Number(c.model) }))
  } catch (err) {
    console.log('[bootstrap] NFT club index unreachable, reading the contract:', err)
    return null
  }
}

async function fetchNftGolfclubsFromChain(address: string): Promise<OwnedClub[]> {
  const [balance] = await golfclubCalls(['0x70a08231' + word(address)])
  const count = Math.min(balance || 0, MAX_NFT_GOLFCLUBS)
  console.log('[bootstrap] NFT golf clubs on chain:', balance, 'for', address)
  if (!count) return []
  const indexes = Array.from({ length: count }, (_, i) => i)
  const tokenIds = await golfclubCalls(indexes.map((i) => '0x2f745c59' + word(address) + word(i.toString(16))))
  const models = await golfclubCalls(tokenIds.map((t) => '0x1f56940f' + word(t.toString(16))))
  return tokenIds.map((tokenId, i) => ({ tokenId: String(tokenId), model: models[i] }))
}

async function fetchNftGolfclubs(address: string, inventory: any[]): Promise<any[]> {
  nftClubsReadFailed = false
  if (!/^0x[0-9a-f]{40}$/.test(address)) return []
  try {
    const owned = (await fetchNftGolfclubsFromIndex(address)) ?? (await fetchNftGolfclubsFromChain(address))
    const known = new Set(inventory.map((i) => String(i.CustomData?.tokenId || '')))
    const clubs = owned
      .filter((c) => !known.has(c.tokenId))
      .map(({ tokenId, model }) => ({
        ItemId: `golfclub-${model}`,
        // The same class PlayFab gives the inventory clubs, so a reader that
        // filters by it sees the NFT ones too.
        ItemClass: 'Golfclub',
        DisplayName: GOLF_CLUB_NAMES[model] || 'GOLF CLUB',
        CustomData: { tokenId, attribute_aim: '5', attribute_power: '5', attribute_control: '5', xp: 9999999 }
      }))
    console.log('[bootstrap] NFT golf clubs:', clubs.map((c) => `${c.CustomData.tokenId}:${c.ItemId}`).join(' ') || 'none')
    return clubs
  } catch (err) {
    console.log('[bootstrap] NFT golf clubs read failed:', err)
    nftClubsReadFailed = true
    return []
  }
}

// Compute the lobby TrainingBonus %: SDK6 getBonusFromUserState = +100 per
// trainingBoost, + Σ GOLF_CLUB_BONUSES over the player's unique club models,
// + min(wearablesBonus, 50). Models = inventory clubs ∪ NFT clubs ∪ active.
function computeTrainingBonus(models: number[], wearablesBonus: number, hasTrainingBoost: boolean): number {
  let bonus = hasTrainingBoost ? 100 : 0
  const seen = new Set<number>()
  for (const m of models) {
    if (seen.has(m)) continue
    seen.add(m)
    const b = (GOLF_CLUB_BONUSES as Record<string, number>)[String(m)]
    if (b) bonus += b
  }
  if (wearablesBonus) bonus += Math.min(wearablesBonus, 50)
  return bonus
}

// SDK6 connectPlayfab.loginAndInitialize + connectPlayer, the part of the
// login that sets a player up. A freshly created account (or one that never
// got initialised) runs the `initializePlayer` cloudscript, which links the
// wallet as the "address" generic ID (what /api/get-login-id looks up, so the
// next login lands on the SAME account instead of creating another one),
// grants golfclub-1 and writes initialized/currentTrainingID to ReadOnlyData.
// Without it every login made a new empty account, the HUD had no club and
// the `completeMission` cloudscript threw (it bumps golfclub-1's xp before it
// writes current_mission), so missions never advanced. Then, as SDK6:
// UserData.address when missing and the explorer's display name every login.
// The generic ID is stored lowercase because that is how get-login-id looks
// it up; guests (no wallet) use their userId so each one stays unique.
async function initializePlayerAccount(
  login: LoginResult,
  user: { userId: string; publicKey?: string; displayName: string }
): Promise<void> {
  const payload = login.InfoResultPayload || {}
  const address = String(user.publicKey || user.userId).toLowerCase()
  // The account's game options (the control scheme), before any hole starts.
  applyGameOptionsFromUserData(payload.UserData)
  if (login.NewlyCreated || !payload.UserReadOnlyData?.initialized?.Value) {
    try {
      await executeCloudScript(login.SessionTicket, 'initializePlayer', { user: { publicKey: address } })
      console.log('[bootstrap] initializePlayer OK: account linked to', address)
    } catch (err) {
      console.log('[bootstrap] initializePlayer FAILED (account not linked, no golf club):', err)
    }
  }
  if (!payload.UserData?.address?.Value) {
    try {
      await updateUserData(login.SessionTicket, { address: user.publicKey || address })
    } catch (err) {
      console.log('[bootstrap] UpdateUserData address failed:', err)
    }
  }
  // PlayFab display names are unique in this title and Decentraland's are not
  // (an unclaimed name belongs to any wallet that picks it), so a taken name
  // left the account nameless (39CB55A781056A71 vs another "Kairos"). Then we
  // use Decentraland's own form for unclaimed names: name#<last 4 of wallet>.
  const currentName = payload.AccountInfo?.TitleInfo?.DisplayName || ''
  const displayName = String(user.displayName || '').slice(0, 25)
  if (displayName.length >= 3 && displayName !== currentName) {
    try {
      await updateUserTitleDisplayName(login.SessionTicket, displayName)
    } catch (err) {
      const suffixed = withWalletSuffix(displayName, address)
      if (!isNameNotAvailable(err) || suffixed === displayName) {
        console.log('[bootstrap] UpdateUserTitleDisplayName failed:', err)
      } else if (suffixed !== currentName) {
        try {
          await updateUserTitleDisplayName(login.SessionTicket, suffixed)
          console.log('[bootstrap] display name taken, using', suffixed)
        } catch (err2) {
          console.log('[bootstrap] UpdateUserTitleDisplayName failed:', err2)
        }
      }
    }
  }
}

const withWalletSuffix = (name: string, address: string) => {
  const suffix = `#${address.slice(-4)}`
  return name.endsWith(suffix) ? name : name.slice(0, 25 - suffix.length) + suffix
}

export const bootstrap = async (): Promise<BootstrapResult> => {
  if (bootstrapped) return bootstrapped
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    const userResponse = await getUserData({})
    const userData = userResponse.data
    if (!userData) {
      throw new Error('No user data from ~system/UserIdentity')
    }
    const user = {
      userId: userData.userId,
      publicKey: userData.publicKey,
      hasConnectedWeb3: userData.hasConnectedWeb3,
      displayName: userData.displayName
    }
    console.log('[bootstrap] user:', user.userId, 'web3:', user.hasConnectedWeb3)
    nftWallet = user.hasConnectedWeb3 ? String(user.publicKey || user.userId).toLowerCase() : ''

    const realmResponse = await getRealm({})
    const realm = realmResponse.realmInfo?.realmName || 'localhost'
    console.log('[bootstrap] realm:', realm)

    // Resolve the player's existing PlayFab CustomId via the web API so we
    // log into the same account they had in SDK6, not a fresh one.
    const customId = await resolvePlayFabCustomId(user.userId, user.hasConnectedWeb3)
    const login = await loginWithCustomID(customId, true)
    sessionTicket = login.SessionTicket
    playFabIdForMissions = login.PlayFabId
    console.log('[bootstrap] PlayFab login OK:', login.PlayFabId, 'newly created:', login.NewlyCreated)
    // SDK6 kept the identity in the user store; several readers still take it
    // from there (the Season reward claim, the in-game "you" row). Without it
    // claim-season-reward got an empty body and no tier wearable was ever sent.
    globalStore.userData.setState({
      PlayFabId: login.PlayFabId,
      userId: user.userId,
      displayName: user.displayName
    })
    await initializePlayerAccount(login, user)
    // SDK6 read TitleData.streamURL (lobby.ts) for the video screens and to
    // keep the course music quiet during a stream. Non-fatal: no screens.
    try {
      const TitleData = await getTitleData(login.SessionTicket, ['streamURL'])
      globalStore.userData.setState({ TitleData })
      console.log('[bootstrap] streamURL:', TitleData.streamURL || 'none')
    } catch (err) {
      console.log('[bootstrap] GetTitleData failed:', err)
    }

    // Stash on engine so other modules (golfplay-client) can read the base
    // resource URL for golfplay GLBs/sounds. SDK6 meta.ts set this to
    // "golfplay/" because the models live at scene/golfplay/models/* and the
    // visual loaders prepend this base when building GltfContainer src urls.
    ;(engine as any)['__COURSE_MODELS_BASE__'] = 'golfplay/'

    const colyseus = new Colyseus.Client(WS_HOST)
    console.log('[bootstrap] Colyseus client created at', WS_HOST)

    // Populate the lobby HUD with the player's real PlayFab inventory and
    // virtual currency. Failure is non-fatal: the HUD stays in "-" state.
    try {
      const combined = await getPlayerCombinedInfo(login.SessionTicket)
      await applyCombinedInfoToHud(combined)
    } catch (err) {
      console.log('[bootstrap] GetPlayerCombinedInfo failed:', err)
    }

    await fetchDailyMissions()

    // Admin-editable config (currentSeasonCollectionId etc). Non-fatal:
    // season-menu.ts falls back to a sane default if this never arrives.
    try {
      const config = await fetchConfig()
      console.log('[bootstrap] config:', JSON.stringify(config))
      globalStore.userData.setState({ config })
    } catch (err) {
      console.log('[bootstrap] fetchConfig failed:', err)
    }

    // Fetch on-chain materials separately. Only meaningful for web3 users
    // whose wallet matches their PlayFab account; guest userIds are not
    // wallet addresses and would return empty.
    if (user.hasConnectedWeb3 && user.userId.startsWith('0x')) {
      try {
        const chainMaterials = await fetchBlockchainMaterials(user.userId.toLowerCase())
        console.log('[bootstrap] blockchain materials:', JSON.stringify(chainMaterials))
        updateLobbyResources({
          DMChain: chainMaterials.DMChain || 0,
          Planks: chainMaterials.Planks || 0,
          StoneBlocks: chainMaterials.StoneBlocks || 0,
          IronBars: chainMaterials.IronBars || 0,
          GoldBars: chainMaterials.GoldBars || 0
        })
      } catch (err) {
        console.log('[bootstrap] blockchain materials fetch failed:', err)
      }
    }

    // SDK6 meta.ts called this from the connection task; the parts list lives
    // in MySQL on the web service (port 2569) and includes egypt_floor +
    // friends that mission-1 references but aren't bundled in the client's
    // local cannonParts map. Without this, loadCoursePhysics fails with
    // "Missing part egypt_floor" once the mission starts.
    try {
      await decorateRemotePhysicParts(fetch)
      console.log('[bootstrap] remote physic parts loaded')
    } catch (err) {
      console.log('[bootstrap] decorateRemotePhysicParts failed:', err)
    }

    bootstrapped = {
      colyseus,
      PlayFabId: login.PlayFabId,
      user,
      realm,
      clientInfo: { sessionTicket: login.SessionTicket }
    }
    return bootstrapped
  })()

  return bootstrapPromise
}
