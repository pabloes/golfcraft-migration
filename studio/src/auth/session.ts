/**
 * The current login and what the browser remembers between visits
 * (docs/contracts/login.md "Client flow"). The stored CustomId is a
 * credential: never logged, never put in a URL.
 */
import type { LoginMethod } from '../bridge/player-state.js';

const STORE_KEY = 'golfcraft.auth';
const GUEST_KEY = 'golfcraft.guestId';
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

export interface StoredLogin {
  method: LoginMethod;
  /** wallet and guest logins reopen the account with it, silently */
  customId?: string;
  address?: string;
  email?: string;
  displayName?: string;
  savedAt: number;
}

export interface Session {
  method: LoginMethod;
  PlayFabId: string;
  sessionTicket: string;
  displayName: string;
  address: string | null;
  customId: string | null;
  email: string | null;
  newlyCreated: boolean;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadStoredLogin(): StoredLogin | null {
  const raw = storage()?.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredLogin;
    if (!stored.method || Date.now() - stored.savedAt > REMEMBER_MS) return null;
    return stored;
  } catch {
    return null;
  }
}

export function saveStoredLogin(login: Omit<StoredLogin, 'savedAt'>): void {
  storage()?.setItem(STORE_KEY, JSON.stringify({ ...login, savedAt: Date.now() }));
}

export function clearStoredLogin(): void {
  storage()?.removeItem(STORE_KEY);
}

/** The device account id: 32 random hex, created once per browser. */
export function getOrCreateGuestId(): string {
  const existing = storage()?.getItem(GUEST_KEY);
  if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  storage()?.setItem(GUEST_KEY, id);
  return id;
}

/** After the guest moved to a wallet account: the device id is not an account any more. */
export function forgetGuestId(): void {
  storage()?.removeItem(GUEST_KEY);
}

let current: Session | null = null;

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session | null): void {
  current = session;
}
