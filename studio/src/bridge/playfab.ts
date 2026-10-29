/**
 * PlayFab Client REST, the same endpoints the Decentraland scene calls from
 * scene/src/meta/playfab-rest.ts, plus the logins and links of
 * docs/contracts/login.md (email, Google, AddUsernamePassword, LinkOpenIdConnect).
 *
 * PlayFab answers an error with a non-200 status AND a JSON body
 * ({errorCode, errorMessage, ...}); a cloudscript error comes back inside a
 * 200 body as `data.Error`. Both surface here as PlayFabError.
 */
import { config } from '../config.js';

const BASE = `https://${config.playFabTitleId}.playfabapi.com`;
export const GOOGLE_CONNECTION_ID = 'google';

export class PlayFabError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly errorCode: string,
    public readonly errorMessage: string,
  ) {
    super(`PlayFab ${path} ${status} ${errorCode}: ${errorMessage}`);
    this.name = 'PlayFabError';
  }
}

interface PlayFabResponse<T> {
  code: number;
  status: string;
  data: T;
}

export interface AccountInfo {
  PrivateInfo?: { Email?: string };
  OpenIdInfo?: Array<{ ConnectionId?: string; Subject?: string }>;
  CustomIdInfo?: { CustomId?: string };
  TitleInfo?: { DisplayName?: string; Created?: string };
}

export interface DataRecord {
  [key: string]: { Value?: string };
}

export interface LoginResult {
  SessionTicket: string;
  PlayFabId: string;
  NewlyCreated: boolean;
  InfoResultPayload?: {
    UserReadOnlyData?: DataRecord;
    UserData?: DataRecord;
    AccountInfo?: AccountInfo;
  };
}

export interface CombinedInfo {
  Inventory: Array<{ ItemId: string; ItemClass?: string; ItemInstanceId?: string; CustomData?: Record<string, string> }>;
  VirtualCurrency: Record<string, number>;
  Statistics: Array<{ StatisticName: string; Value: number }>;
  UserReadOnlyData: DataRecord;
  UserData: DataRecord;
  AccountInfo: AccountInfo;
}

// What every login asks back: enough to know whether the account is
// initialised, which wallet it carries and which identities it has.
const LOGIN_INFO = { GetUserReadOnlyData: true, GetUserData: true, GetUserAccountInfo: true };

async function post<T>(path: string, body: Record<string, unknown>, sessionTicket?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionTicket) headers['X-Authorization'] = sessionTicket;
  const response = await fetch(`${BASE}/Client/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  let json: Partial<PlayFabResponse<T>> & { errorCode?: number | string; error?: string; errorMessage?: string } = {};
  try {
    json = await response.json();
  } catch {
    // a non-JSON body: reported with the status below
  }
  if (!response.ok || json.code !== 200) {
    throw new PlayFabError(path, response.status, String(json.error ?? json.errorCode ?? 'Unknown'), json.errorMessage ?? response.statusText);
  }
  return json.data as T;
}

// --- logins (no ticket) ---

export function loginWithCustomId(customId: string, createAccount: boolean): Promise<LoginResult> {
  return post<LoginResult>('LoginWithCustomID', {
    TitleId: config.playFabTitleId,
    CustomId: customId,
    CreateAccount: createAccount,
    InfoRequestParameters: LOGIN_INFO,
  });
}

export function loginWithEmail(email: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('LoginWithEmailAddress', {
    TitleId: config.playFabTitleId,
    Email: email,
    Password: password,
    InfoRequestParameters: LOGIN_INFO,
  });
}

// RegisterPlayFabUser answers a RegisterPlayFabUserResult (no NewlyCreated):
// the account is new by definition.
export async function registerWithEmail(email: string, password: string, displayName: string): Promise<LoginResult> {
  const result = await post<Omit<LoginResult, 'NewlyCreated'>>('RegisterPlayFabUser', {
    TitleId: config.playFabTitleId,
    Email: email,
    Password: password,
    DisplayName: displayName,
    RequireBothUsernameAndEmail: false,
    InfoRequestParameters: LOGIN_INFO,
  });
  return { ...result, NewlyCreated: true };
}

export function sendAccountRecoveryEmail(email: string): Promise<void> {
  return post<void>('SendAccountRecoveryEmail', { TitleId: config.playFabTitleId, Email: email });
}

export function loginWithGoogle(idToken: string): Promise<LoginResult> {
  return post<LoginResult>('LoginWithOpenIdConnect', {
    TitleId: config.playFabTitleId,
    ConnectionId: GOOGLE_CONNECTION_ID,
    IdToken: idToken,
    CreateAccount: true,
    InfoRequestParameters: LOGIN_INFO,
  });
}

// --- links (on the current session) ---

export function addUsernamePassword(sessionTicket: string, username: string, email: string, password: string): Promise<void> {
  return post<void>('AddUsernamePassword', { Username: username, Email: email, Password: password }, sessionTicket);
}

export function linkGoogle(sessionTicket: string, idToken: string): Promise<void> {
  return post<void>('LinkOpenIdConnect', { ConnectionId: GOOGLE_CONNECTION_ID, IdToken: idToken }, sessionTicket);
}

// --- player data ---

export async function getPlayerCombinedInfo(sessionTicket: string): Promise<CombinedInfo> {
  const data = await post<{
    InfoResultPayload?: {
      UserInventory?: CombinedInfo['Inventory'];
      UserVirtualCurrency?: Record<string, number>;
      PlayerStatistics?: CombinedInfo['Statistics'];
      UserReadOnlyData?: DataRecord;
      UserData?: DataRecord;
      AccountInfo?: AccountInfo;
    };
  }>('GetPlayerCombinedInfo', {
    InfoRequestParameters: {
      GetUserInventory: true,
      GetUserVirtualCurrency: true,
      GetUserReadOnlyData: true,
      GetUserData: true,
      GetPlayerStatistics: true,
      GetUserAccountInfo: true,
    },
  }, sessionTicket);
  const p = data.InfoResultPayload ?? {};
  return {
    Inventory: p.UserInventory ?? [],
    VirtualCurrency: p.UserVirtualCurrency ?? {},
    Statistics: p.PlayerStatistics ?? [],
    UserReadOnlyData: p.UserReadOnlyData ?? {},
    UserData: p.UserData ?? {},
    AccountInfo: p.AccountInfo ?? {},
  };
}

export async function executeCloudScript(sessionTicket: string, functionName: string, functionParameter: unknown): Promise<unknown> {
  const result = await post<{
    FunctionResult?: unknown;
    Error?: { Error: string; Message: string };
  }>('ExecuteCloudScript', {
    FunctionName: functionName,
    FunctionParameter: functionParameter,
    GeneratePlayStreamEvent: true,
  }, sessionTicket);
  if (result.Error) {
    throw new PlayFabError(`ExecuteCloudScript/${functionName}`, 200, result.Error.Error, result.Error.Message);
  }
  return result.FunctionResult;
}

export function updateUserData(sessionTicket: string, data: Record<string, string>): Promise<void> {
  return post<void>('UpdateUserData', { Data: data }, sessionTicket);
}

export function updateUserTitleDisplayName(sessionTicket: string, displayName: string): Promise<void> {
  return post<void>('UpdateUserTitleDisplayName', { DisplayName: displayName }, sessionTicket);
}
