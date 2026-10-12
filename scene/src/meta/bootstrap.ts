import { engine } from '@dcl/sdk/ecs'
import { getUserData } from '~system/UserIdentity'
import { getRealm } from '~system/Runtime'
import { signedFetch } from '~system/SignedFetch'
import * as Colyseus from 'colyseus.js'

import {
  WS_HOST,
  USE_REMOTE_SERVER,
  MATERIALS_SUBGRAPH_URL,
  GOLF_CLUB_BONUSES,
  GOLFCLUB_CONTRACT,
  POLYGON_RPC
} from '../../../common/constants'
import { getLevelInfo } from '../../../common/utils'
import { loginWithCustomID, getPlayerCombinedInfo, CombinedInfo } from './playfab-rest'
import { decorateRemotePhysicParts } from '../../golfplay/physics/course-element-loader'
import { updateLobbyResources, lobbyHudState } from '../ui/lobby-hud-state'
import { globalStore } from '../services/globalStore/globalStore'

// PlayFab session ticket from the last login, kept so refreshUserData() can
// re-fetch player data (resources + current_mission) after a mission — the
// server bumps current_mission / rewards on completion. Mirrors SDK6
// services/userData.ts:refreshUserData, which the storymode NPC calls onFinish.
let sessionTicket: string | null = null

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
async function fetchDailyMissions(): Promise<void> {
  if (!playFabIdForMissions) return
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  try {
    const data = await fetch(`${base}/api/get-daily-missions/${playFabIdForMissions}`).then((r) => r.json())
    if (data?.state?.missions) {
      lobbyHudState.dailyMissions = {
        state: { missions: data.state.missions },
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
async function resolvePlayFabCustomId(userId: string, hasConnectedWeb3: boolean): Promise<string> {
  if (!hasConnectedWeb3) {
    // Guest player: no signed identity to send, use the userId directly so we
    // get a stable anonymous account.
    return userId
  }
  const base = USE_REMOTE_SERVER ? 'https://golfcraftgame.com' : 'http://localhost:2569'
  const url = `${base}/api/get-login-id`
  try {
    let bodyText: string
    if (USE_REMOTE_SERVER) {
      const response = await signedFetch({
        url,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' } }
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
          'x-identity-auth-chain-0': JSON.stringify({ type: 'SIGNER', payload: userId, signature: '' })
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

  // Active club model. NFT clubs aren't in the PlayFab inventory; SDK6 found
  // them via the subgraph. We read getGolfclubId(tokenId) from the contract;
  // SDK6 defaults to the basic club (id 1) when the token can't be resolved.
  let model = await resolveActiveGolfclubModel(activeTokenId)
  if (model === null) model = 1

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

  const invModels = invGolfclubs.map((i) => Number(i.ItemId.replace('golfclub-', '')))
  const bonus = computeTrainingBonus([...invModels, model], wearablesBonus, hasTrainingBoost)

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

  // Publish the real inventory clubs + active token into the store, mirroring
  // SDK6 services/userData.ts:95 (`golfclubs: [...filterInventoryGolfclubs(
  // UserInventory), ...getNFTGolfClubs(address)]` + `activeGolfClubTokenId`
  // from UserReadOnlyData). The golfclub board reads this to build its
  // collection, and npc-storymode picks the club it starts a mission with.
  // Deviation from SDK6: it kept ONLY `golfclub-1` from the inventory and
  // re-added the NFT clubs from the subgraph with synthetic 5/5/5 attributes.
  // That subgraph is dead (see CLAUDE.md), and our inventory already carries
  // the NFT-backed clubs with their real tokenId/attributes, so we pass every
  // Golfclub item straight through instead of dropping and re-synthesizing them.
  globalStore.userData.setState({
    golfclubs: invGolfclubs,
    activeGolfClubTokenId: activeTokenId || null
  })
}

// Blockchain (Arbitrum subgraph) materials fetch. SDK6's material-balance.ts
// hit a Graph endpoint with a wallet address and parsed materials per the
// store-name mapping below. The IDs come back as "<address>-<id>" and the
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
  const response = await fetch(MATERIALS_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ account(id:"${address}") { materials { id, balance } } }`,
      variables: null
    })
  })
  if (!response.ok) throw new Error(`subgraph ${response.status}`)
  const json = await response.json()
  const materials = json?.data?.account?.materials || []
  const out: Record<string, number> = {}
  for (const m of materials) {
    const id = String(m.id).replace(`${address}-`, '')
    const storeName = MATERIAL_STORE_NAMES[id]
    if (storeName) out[storeName] = Number(m.balance) || 0
  }
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

// Compute the lobby TrainingBonus %: SDK6 getBonusFromUserState = +100 per
// trainingBoost, + Σ GOLF_CLUB_BONUSES over the player's unique club models,
// + min(wearablesBonus, 50). (SDK6 sourced the NFT clubs from the subgraph; we
// use the PlayFab inventory clubs ∪ the active club model instead.)
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
