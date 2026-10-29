/**
 * Wallet login and wallet linking (docs/contracts/login.md): the web API
 * issues a message, the wallet signs it (EIP-191 personal_sign), the API
 * answers the account's PlayFab CustomId. Desktop uses the injected provider
 * (MetaMask and friends); phones and Telegram use WalletConnect.
 */
import { playerState, refreshPlayerState } from '../bridge/index.js';
import { loginWithCustomId } from '../bridge/playfab.js';
import { config } from '../config.js';
import { completeLogin } from './account.js';
import { fetchDecentralandName } from './display-name.js';
import { forgetGuestId, getSession, saveStoredLogin } from './session.js';
import type { Session } from './session.js';

export type WalletKind = 'injected' | 'walletconnect';

export const hasInjectedWallet = (): boolean => typeof window !== 'undefined' && !!window.ethereum;
export const hasWalletConnect = (): boolean => !!config.walletConnectProjectId;

export interface ProgressSummary {
  xp: number;
  tierSub: number;
  currentMission: number;
  games: number;
}

export type LinkWalletResult =
  | { status: 'linked' }
  | { status: 'switched'; session: Session }
  | { status: 'conflict'; wallet: ProgressSummary; current: ProgressSummary };

let walletConnectProvider: Eip1193Provider | null = null;

async function getProvider(kind: WalletKind): Promise<Eip1193Provider> {
  if (kind === 'injected') {
    if (!window.ethereum) throw new Error('No browser wallet found. Install MetaMask or use WalletConnect.');
    return window.ethereum;
  }
  if (!walletConnectProvider) {
    // Loaded on demand: the WalletConnect modal is a large dependency that
    // only phones and Telegram need.
    const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
    const provider = await EthereumProvider.init({
      projectId: config.walletConnectProjectId,
      chains: [1],
      optionalChains: [137],
      showQrModal: true,
      metadata: {
        name: 'GolfCraft',
        description: 'GolfCraft minigolf',
        url: 'https://golfcraftgame.com',
        icons: ['https://golfcraftgame.com/favicon.ico'],
      },
    });
    walletConnectProvider = provider as unknown as Eip1193Provider;
  }
  return walletConnectProvider;
}

async function requestAddress(provider: Eip1193Provider): Promise<string> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[] | undefined;
  const address = accounts?.[0];
  if (!address) throw new Error('No wallet account selected');
  return address.toLowerCase();
}

// personal_sign takes the message as hex-encoded UTF-8; the server recovers
// the signer from the same plain text.
const toHex = (text: string): string =>
  `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')}`;

async function signChallenge(kind: WalletKind): Promise<{ address: string; message: string; signature: string }> {
  const provider = await getProvider(kind);
  const address = await requestAddress(provider);
  const nonceRes = await fetch(`${config.apiUrl}/api/login-wallet/nonce?address=${address}`);
  if (!nonceRes.ok) throw new Error('Could not start the wallet login, try again');
  const { message } = (await nonceRes.json()) as { message: string };
  const signature = (await provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string;
  return { address, message, signature };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function loginWithWallet(kind: WalletKind): Promise<Session> {
  const { address, message, signature } = await signChallenge(kind);
  const res = await fetch(`${config.apiUrl}/api/login-wallet`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ address, message, signature }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'The wallet signature was not accepted' : 'Wallet login failed, try again');
  const { CustomId } = (await res.json()) as { CustomId: string };
  const login = await loginWithCustomId(CustomId, true);
  const displayName = await fetchDecentralandName(address);
  return completeLogin(login, { method: 'wallet', address, customId: CustomId, displayName });
}

/**
 * Adds a wallet to the logged-in account. When the wallet already has an
 * account, the player continues as that account (the current one is left
 * behind); if both have progress the caller shows the conflict first and
 * retries with `abandonCurrent`.
 */
export async function linkWallet(kind: WalletKind, abandonCurrent = false): Promise<LinkWalletResult> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  const { address, message, signature } = await signChallenge(kind);
  const res = await fetch(`${config.apiUrl}/api/link-wallet`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ sessionTicket: session.sessionTicket, address, message, signature, abandonCurrent }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    linked?: boolean;
    CustomId?: string;
    wallet?: ProgressSummary;
    current?: ProgressSummary;
  };
  if (res.status === 409 && body.error === 'both-have-progress' && body.wallet && body.current) {
    return { status: 'conflict', wallet: body.wallet, current: body.current };
  }
  if (!res.ok) throw new Error(res.status === 401 ? 'The wallet signature was not accepted' : 'Could not link the wallet, try again');

  if (body.linked) {
    session.address = address;
    playerState.address = address;
    saveStoredLogin({
      method: session.method,
      customId: session.customId ?? undefined,
      address,
      email: session.email ?? undefined,
      displayName: session.displayName,
    });
    await refreshPlayerState();
    return { status: 'linked' };
  }
  if (!body.CustomId) throw new Error('Could not link the wallet, try again');
  // The wallet account wins: this device opens it from now on.
  if (session.method === 'guest') forgetGuestId();
  const login = await loginWithCustomId(body.CustomId, false);
  const displayName = await fetchDecentralandName(address);
  const switched = await completeLogin(login, { method: 'wallet', address, customId: body.CustomId, displayName });
  return { status: 'switched', session: switched };
}
