/**
 * Guest login: a device account opened with a random CustomId kept in the
 * browser (docs/contracts/login.md). Lost with the browser storage, hence
 * the "save your progress" prompt in the account panel.
 */
import { loginWithCustomId } from '../bridge/playfab.js';
import { completeLogin } from './account.js';
import { getOrCreateGuestId } from './session.js';
import type { Session } from './session.js';

export async function loginAsGuest(): Promise<Session> {
  const id = getOrCreateGuestId();
  const login = await loginWithCustomId(id, true);
  return completeLogin(login, { method: 'guest', customId: id, address: null, displayName: `Golfer-${id.slice(0, 4)}` });
}
