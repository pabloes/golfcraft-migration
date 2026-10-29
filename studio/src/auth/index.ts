/**
 * Entry point of the auth module (docs/contracts/login.md, "Client flow"):
 * a remembered wallet or guest login reopens the account silently, anything
 * else goes through the login screen.
 */
import type * as ENGINE from '@gnsx/genesys.js';

import { loginWithCustomId } from '../bridge/playfab.js';
import { completeLogin, logout } from './account.js';
import { forgetGoogleAutoSelect } from './google.js';
import { LoginScreen } from './login-screen.js';
import { clearStoredLogin, getSession, loadStoredLogin } from './session.js';
import type { Session } from './session.js';

export { AccountPanel } from './account-panel.js';
export { LoginScreen } from './login-screen.js';
export { getSession } from './session.js';
export type { Session } from './session.js';

/** Resolves once the player is logged in. */
export async function startAuth(ui: ENGINE.UIManager): Promise<Session> {
  const existing = getSession();
  if (existing) return existing;

  const remembered = loadStoredLogin();
  if (remembered && (remembered.method === 'wallet' || remembered.method === 'guest') && remembered.customId) {
    try {
      const login = await loginWithCustomId(remembered.customId, false);
      return await completeLogin(login, {
        method: remembered.method,
        customId: remembered.customId,
        address: remembered.address ?? null,
        displayName: remembered.displayName ?? '',
      });
    } catch (err) {
      console.log('[auth] remembered login failed, asking again', err);
      clearStoredLogin();
    }
  }

  return new Promise<Session>((resolve) => {
    const screen = new LoginScreen(ui, {
      remembered,
      onLoggedIn: (session) => {
        screen.destroy();
        resolve(session);
      },
    });
    screen.initialize().catch((err) => console.log('[auth] login screen failed', err));
  });
}

export function endSession(): void {
  logout();
  forgetGoogleAutoSelect();
}
