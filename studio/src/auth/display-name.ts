/**
 * Display names (docs/contracts/login.md): a wallet shows its Decentraland
 * name when the catalyst knows it, else a short address.
 */
import { config } from '../config.js';

export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

export async function fetchDecentralandName(address: string): Promise<string> {
  try {
    const res = await fetch(`${config.catalystUrl}/lambdas/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [address] }),
    });
    const profiles = (await res.json()) as Array<{ avatars?: Array<{ name?: string }> }>;
    const name = profiles?.[0]?.avatars?.[0]?.name;
    if (typeof name === 'string' && name.trim().length >= 3) return name.trim();
  } catch (err) {
    console.log('[auth] catalyst profile unavailable', err);
  }
  return shortAddress(address);
}

/** PlayFab accepts 3 to 25 characters. */
export function clampDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, 25);
  return trimmed.length >= 3 ? trimmed : '';
}
