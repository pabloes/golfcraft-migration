/**
 * Backend endpoints for the Studio client. Production by default.
 *
 * The local backend (web API on 2569, Colyseus on 2567) is selected by either:
 * - VITE_GOLFCRAFT_LOCAL=1 at build time. Only the Vite dev server honours it:
 *   the Studio bundles game.ts with esbuild in CJS format, where `import.meta`
 *   is empty, so in the editor and in published games this is always unset.
 * - localStorage `golfcraft:local` = '1' at runtime, for Play-In-Editor.
 * A published (https) page can only reach the production https/wss endpoints.
 */

function readLocalStorage(key: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

const LOCAL = import.meta.env?.VITE_GOLFCRAFT_LOCAL === '1' || readLocalStorage('golfcraft:local') === '1';

// Third-party ids for the login (docs/contracts/login.md, task 1.11). Empty
// hides that login method. Each one can be overridden from localStorage for
// a test build: `golfcraft:googleClientId`, `golfcraft:walletConnectProjectId`.
const GOOGLE_CLIENT_ID = '';
const WALLETCONNECT_PROJECT_ID = '';

export interface GolfcraftConfig {
  /** Web API origin, without `/api` (e.g. `https://golfcraftgame.com`). */
  apiUrl: string;
  /** Colyseus endpoint (colyseus.js derives the matchmaking http origin from it). */
  wsUrl: string;
  isLocal: boolean;
  /** The GolfCraft PlayFab title (same as the Decentraland scene). */
  playFabTitleId: string;
  /** Decentraland catalyst, for the display name of a wallet login. */
  catalystUrl: string;
  /** Google Identity Services web client id; empty = no Google login. */
  googleClientId: string;
  /** WalletConnect Cloud project id; empty = injected wallets only. */
  walletConnectProjectId: string;
}

const endpoints = LOCAL
  ? { apiUrl: 'http://localhost:2569', wsUrl: 'ws://localhost:2567', isLocal: true }
  : { apiUrl: 'https://golfcraftgame.com', wsUrl: 'wss://ws.golfcraftgame.com', isLocal: false };

export const config: GolfcraftConfig = {
  ...endpoints,
  playFabTitleId: 'BEAFE',
  catalystUrl: 'https://peer-lb.decentraland.org',
  googleClientId: readLocalStorage('golfcraft:googleClientId') || GOOGLE_CLIENT_ID,
  walletConnectProjectId: readLocalStorage('golfcraft:walletConnectProjectId') || WALLETCONNECT_PROJECT_ID,
};
