/**
 * Google login through Google Identity Services: the Sign in with Google
 * button hands an ID token, PlayFab's OpenID Connect connection "google"
 * validates it (docs/contracts/login.md). Needs config.googleClientId.
 */
import { notifyPlayerState, playerState } from '../bridge/index.js';
import { linkGoogle, loginWithGoogle } from '../bridge/playfab.js';
import { config } from '../config.js';
import { completeLogin } from './account.js';
import { getSession } from './session.js';
import type { Session } from './session.js';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export const isGoogleAvailable = (): boolean => !!config.googleClientId;

const gsi = (): typeof google.accounts.id | undefined =>
  (globalThis as { google?: { accounts?: { id?: typeof google.accounts.id } } }).google?.accounts?.id;

let loading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (gsi()) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error('Google sign-in could not be loaded'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** Draws Google's own button into `parent`; `onToken` gets the ID token. */
export async function renderGoogleButton(parent: HTMLElement, onToken: (idToken: string) => void): Promise<void> {
  await loadGsi();
  const api = gsi();
  if (!api) throw new Error('Google sign-in could not be loaded');
  api.initialize({
    client_id: config.googleClientId,
    callback: (response) => onToken(response.credential),
    cancel_on_tap_outside: true,
  });
  api.renderButton(parent, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 300 });
}

/** The name inside the ID token (its payload is plain base64url JSON). */
export function googleNameFromToken(idToken: string): string {
  try {
    const payload = idToken.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { name?: string; given_name?: string; email?: string };
    return claims.name || claims.given_name || claims.email?.split('@')[0] || '';
  } catch {
    return '';
  }
}

export async function loginWithGoogleToken(idToken: string): Promise<Session> {
  const login = await loginWithGoogle(idToken);
  return completeLogin(login, { method: 'google', displayName: googleNameFromToken(idToken) });
}

export async function linkGoogleToAccount(idToken: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  await linkGoogle(session.sessionTicket, idToken);
  playerState.hasGoogle = true;
  notifyPlayerState();
}

export function forgetGoogleAutoSelect(): void {
  gsi()?.disableAutoSelect();
}
