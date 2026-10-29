/**
 * What every login does after PlayFab answered, as the Decentraland scene's
 * bootstrap.ts:initializePlayerAccount: run `initializePlayer` on a new or
 * never-initialised account, write UserData.address for wallets, set the
 * display name, count the visit, remember the login and load the player.
 */
import { config } from '../config.js';
import { applyCombinedInfo, getPlayerCombinedInfo, playerState, resetPlayerState } from '../bridge/index.js';
import { executeCloudScript, updateUserData, updateUserTitleDisplayName } from '../bridge/playfab.js';
import type { LoginResult } from '../bridge/playfab.js';
import type { LoginMethod } from '../bridge/player-state.js';
import { clampDisplayName } from './display-name.js';
import { clearStoredLogin, saveStoredLogin, setSession } from './session.js';
import type { Session } from './session.js';

export interface CompleteLoginOptions {
  method: LoginMethod;
  address?: string | null;
  customId?: string | null;
  email?: string | null;
  /** used when the account has no title display name yet (always for wallets, like the scene) */
  displayName: string;
}

export async function completeLogin(login: LoginResult, opts: CompleteLoginOptions): Promise<Session> {
  const payload = login.InfoResultPayload ?? {};
  const address = opts.address ?? null;

  if (login.NewlyCreated || !payload.UserReadOnlyData?.initialized?.Value) {
    // The cloudscript links `user.publicKey` as the "address" generic ID and
    // grants golfclub-1. Only wallets go under that service name: other
    // logins pass the PlayFabId (docs/contracts/login.md "Methods").
    try {
      await executeCloudScript(login.SessionTicket, 'initializePlayer', { user: { publicKey: address ?? login.PlayFabId } });
    } catch (err) {
      console.log('[auth] initializePlayer failed', err);
    }
  }
  if (address && !payload.UserData?.address?.Value) {
    try {
      await updateUserData(login.SessionTicket, { address });
    } catch (err) {
      console.log('[auth] UpdateUserData address failed', err);
    }
  }

  const existingName = payload.AccountInfo?.TitleInfo?.DisplayName ?? '';
  const wantedName = clampDisplayName(opts.displayName);
  const displayName = opts.method === 'wallet' && wantedName ? wantedName : existingName || wantedName;
  if (displayName && displayName !== existingName) {
    try {
      await updateUserTitleDisplayName(login.SessionTicket, displayName);
    } catch (err) {
      console.log('[auth] UpdateUserTitleDisplayName failed', err);
    }
  }

  if (opts.method !== 'wallet') {
    // wallet logins are counted by /api/login-wallet; the others report themselves
    void fetch(`${config.apiUrl}/api/record-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionTicket: login.SessionTicket }),
    }).catch(() => undefined);
  }

  const session: Session = {
    method: opts.method,
    PlayFabId: login.PlayFabId,
    sessionTicket: login.SessionTicket,
    displayName: displayName || existingName,
    address,
    customId: opts.customId ?? null,
    email: opts.email ?? null,
    newlyCreated: login.NewlyCreated,
  };
  setSession(session);
  saveStoredLogin({
    method: opts.method,
    customId: opts.customId ?? undefined,
    address: address ?? undefined,
    email: opts.email ?? undefined,
    displayName: session.displayName,
  });

  playerState.PlayFabId = session.PlayFabId;
  playerState.sessionTicket = session.sessionTicket;
  playerState.method = session.method;
  playerState.displayName = session.displayName;
  playerState.address = address;
  try {
    applyCombinedInfo(await getPlayerCombinedInfo(session.sessionTicket));
  } catch (err) {
    console.log('[auth] GetPlayerCombinedInfo failed', err);
  }
  return session;
}

export function logout(): void {
  setSession(null);
  clearStoredLogin();
  resetPlayerState();
}
