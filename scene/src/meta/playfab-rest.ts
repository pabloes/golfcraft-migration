// Minimal PlayFab Client REST API wrapper. The SDK6 client used the heavy
// playfab-sdk package; in the SDK7 scene runtime we hit the HTTPS endpoints
// directly. Only the calls needed for mission-1 login are implemented.
//
// PlayFab Title: BEAFE
//   Base URL: https://BEAFE.playfabapi.com
//   LoginWithCustomID:        POST /Client/LoginWithCustomID
//   GetPlayerStatistics:      POST /Client/GetPlayerStatistics (X-Authorization)
//   UpdatePlayerStatistics:   POST /Client/UpdatePlayerStatistics (X-Authorization)

const TITLE_ID = 'BEAFE'
const PLAYFAB_BASE = `https://${TITLE_ID}.playfabapi.com`

type PlayFabResponse<T> = {
  code: number
  status: string
  data: T
}

export type LoginResult = {
  SessionTicket: string
  PlayFabId: string
  NewlyCreated: boolean
  // SDK6 loginAndInitialize read these two off the login to decide whether the
  // account still needs `initializePlayer` and the UserData.address write.
  InfoResultPayload?: {
    UserReadOnlyData?: { [key: string]: { Value: string } }
    UserData?: { [key: string]: { Value: string } }
  }
}

export async function loginWithCustomID(customId: string, createAccount = true): Promise<LoginResult> {
  const response = await fetch(`${PLAYFAB_BASE}/Client/LoginWithCustomID`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      TitleId: TITLE_ID,
      CustomId: customId,
      CreateAccount: createAccount,
      InfoRequestParameters: { GetUserReadOnlyData: true, GetUserData: true }
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`PlayFab login failed (${response.status}): ${text}`)
  }
  const json = (await response.json()) as PlayFabResponse<LoginResult>
  if (json.code !== 200) {
    throw new Error(`PlayFab login error: ${JSON.stringify(json)}`)
  }
  return json.data
}

export async function getPlayerStatistic(
  sessionTicket: string,
  statisticNames: string[]
): Promise<{ [name: string]: number }> {
  const response = await fetch(`${PLAYFAB_BASE}/Client/GetPlayerStatistics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': sessionTicket
    },
    body: JSON.stringify({ StatisticNames: statisticNames })
  })
  if (!response.ok) {
    throw new Error(`PlayFab GetPlayerStatistics failed (${response.status})`)
  }
  const json = (await response.json()) as PlayFabResponse<{
    Statistics: Array<{ StatisticName: string; Value: number }>
  }>
  const out: { [name: string]: number } = {}
  for (const s of json.data.Statistics || []) {
    out[s.StatisticName] = s.Value
  }
  return out
}

// Returns inventory + virtual currency + statistics in one round-trip, same
// call SDK6 used in refreshUserData() via PF.GetPlayerCombinedInfo.
export type CombinedInfo = {
  Inventory: Array<{
    ItemId: string
    ItemClass?: string
    ItemInstanceId?: string
    RemainingUses?: number
    CustomData?: { [k: string]: string }
  }>
  VirtualCurrency: { [code: string]: number }
  Statistics: Array<{ StatisticName: string; Value: number }>
  UserReadOnlyData: { [key: string]: { Value: string } }
}

export async function getPlayerCombinedInfo(sessionTicket: string): Promise<CombinedInfo> {
  const response = await fetch(`${PLAYFAB_BASE}/Client/GetPlayerCombinedInfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': sessionTicket
    },
    body: JSON.stringify({
      InfoRequestParameters: {
        GetUserInventory: true,
        GetUserVirtualCurrency: true,
        GetUserReadOnlyData: true,
        GetPlayerStatistics: true
      }
    })
  })
  if (!response.ok) {
    throw new Error(`PlayFab GetPlayerCombinedInfo failed (${response.status})`)
  }
  const json = (await response.json()) as PlayFabResponse<{
    InfoResultPayload: {
      UserInventory?: any[]
      UserVirtualCurrency?: { [k: string]: number }
      PlayerStatistics?: Array<{ StatisticName: string; Value: number }>
      UserReadOnlyData?: { [k: string]: { Value: string } }
    }
  }>
  const p = json.data?.InfoResultPayload || {}
  return {
    Inventory: p.UserInventory || [],
    VirtualCurrency: p.UserVirtualCurrency || {},
    Statistics: p.PlayerStatistics || [],
    UserReadOnlyData: p.UserReadOnlyData || {}
  }
}

// SDK6 called cloudscript handlers through `ExecuteCloudScript` from
// lib/playfab/_playfab. The golfclub board needs `upgradeGolfclub` (spends
// IR/ST/WD and bumps the item's attribute_* CustomData) and
// `selectGolfClubTokenId` (writes activeGolfClubTokenId to UserReadOnlyData).
// The handlers are already deployed on the live title, so we only need the
// Client REST entry point. Cloudscript errors surface in the 200 body (as
// `Error`/`FunctionResult` fields), NOT as an HTTP error — check both.
export async function executeCloudScript(
  sessionTicket: string,
  functionName: string,
  functionParameter: any
): Promise<any> {
  const response = await fetch(`${PLAYFAB_BASE}/Client/ExecuteCloudScript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': sessionTicket
    },
    body: JSON.stringify({
      FunctionName: functionName,
      FunctionParameter: functionParameter,
      GeneratePlayStreamEvent: true
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`PlayFab ExecuteCloudScript ${functionName} failed (${response.status}): ${text}`)
  }
  const json = (await response.json()) as PlayFabResponse<{
    FunctionResult?: any
    Error?: { Error: string; Message: string; StackTrace?: string }
    Logs?: Array<{ Level: string; Message: string }>
  }>
  const result = json.data || {}
  if (result.Error) {
    throw new Error(
      `Cloudscript ${functionName} error: ${result.Error.Error} ${result.Error.Message}`
    )
  }
  return result.FunctionResult
}

// A Client call that only needs a success/failure: PlayFab answers errors
// with a non-200 HTTP status AND a JSON body ({errorCode, errorMessage}).
async function clientPost(sessionTicket: string, path: string, body: any): Promise<void> {
  const response = await fetch(`${PLAYFAB_BASE}/Client/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': sessionTicket
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`PlayFab ${path} failed (${response.status}): ${text}`)
  }
}

// SDK6 connectPlayer fired this after every login so the PlayFab profile
// carries the explorer's display name (3-25 characters).
export const updateUserTitleDisplayName = (sessionTicket: string, displayName: string) =>
  clientPost(sessionTicket, 'UpdateUserTitleDisplayName', { DisplayName: displayName })

// SDK6 xLoginWithCustomID wrote UserData.address once per account.
export const updateUserData = (sessionTicket: string, data: { [key: string]: string }) =>
  clientPost(sessionTicket, 'UpdateUserData', { Data: data })
