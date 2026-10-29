/**
 * Email + password login, registration, recovery and the email link of an
 * existing account, all native PlayFab calls (docs/contracts/login.md).
 */
import { notifyPlayerState, playerState } from '../bridge/index.js';
import {
  addUsernamePassword,
  loginWithEmail,
  PlayFabError,
  registerWithEmail,
  sendAccountRecoveryEmail,
} from '../bridge/playfab.js';
import { completeLogin } from './account.js';
import { clampDisplayName } from './display-name.js';
import { getSession, saveStoredLogin } from './session.js';
import type { Session } from './session.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string {
  const trimmed = email.trim();
  if (!EMAIL_RE.test(trimmed)) throw new Error('Enter a valid email address');
  return trimmed;
}

export function validatePassword(password: string): string {
  if (password.length < 6 || password.length > 100) throw new Error('The password needs 6 to 100 characters');
  return password;
}

export async function loginWithEmailPassword(email: string, password: string): Promise<Session> {
  const login = await loginWithEmail(validateEmail(email), validatePassword(password));
  return completeLogin(login, { method: 'email', email: email.trim(), displayName: '' });
}

export async function registerWithEmailPassword(email: string, password: string, displayName: string): Promise<Session> {
  const name = clampDisplayName(displayName);
  if (!name) throw new Error('Pick a player name of 3 to 25 characters');
  const login = await registerWithEmail(validateEmail(email), validatePassword(password), name);
  return completeLogin(login, { method: 'email', email: email.trim(), displayName: name });
}

export function recoverPassword(email: string): Promise<void> {
  return sendAccountRecoveryEmail(validateEmail(email));
}

/** Adds email + password to the logged-in account (PlayFab also wants a username, never shown). */
export async function addEmailToAccount(email: string, password: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const username = `golfer_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const cleanEmail = validateEmail(email);
  await addUsernamePassword(session.sessionTicket, username, cleanEmail, validatePassword(password));
  session.email = cleanEmail;
  playerState.email = cleanEmail;
  notifyPlayerState();
  saveStoredLogin({
    method: session.method,
    customId: session.customId ?? undefined,
    address: session.address ?? undefined,
    email: cleanEmail,
    displayName: session.displayName,
  });
}

/** A message for the player; PlayFab's codes are not shown as they are. */
export function describeAuthError(err: unknown): string {
  if (err instanceof PlayFabError) {
    switch (err.errorCode) {
      case 'AccountNotFound':
        return 'No account with that email';
      case 'InvalidEmailOrPassword':
      case 'InvalidUsernameOrPassword':
      case 'InvalidPassword':
        return 'Wrong email or password';
      case 'EmailAddressNotAvailable':
        return 'That email already belongs to another account. Log in with it instead.';
      case 'UsernameNotAvailable':
        return 'Please try again';
      case 'InvalidParams':
        return 'Check the email and the password (6 to 100 characters)';
      case 'AccountAlreadyLinked':
      case 'LinkedAccountAlreadyClaimed':
      case 'LinkedIdentifierAlreadyClaimed':
        return 'That identity already belongs to another account. Log in with it instead.';
      default:
        return err.errorMessage || 'Something went wrong, try again';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong, try again';
}
