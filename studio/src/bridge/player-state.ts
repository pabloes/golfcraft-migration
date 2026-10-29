/**
 * The logged-in player's data for the menu and the game: the module-level
 * state + subscribe pattern of the Decentraland scene (scene/src/ui/*-state.ts).
 * Resources follow scene/src/meta/bootstrap.ts:applyCombinedInfoToHud:
 * every currency lives in UserVirtualCurrency, xp in UserReadOnlyData.xp,
 * rank and mission in PlayerStatistics (CLAUDE.md §6 #14 and §6.5).
 */
import { getLevelInfo } from '../../../common/utils';
import { config } from '../config.js';
import { getPlayerCombinedInfo } from './playfab.js';
import type { CombinedInfo } from './playfab.js';

export type LoginMethod = 'wallet' | 'guest' | 'email' | 'google';

export interface PlayerResources {
  GC: number; FT: number; PT: number; DM: number;
  WD: number; ST: number; IR: number; GD: number;
  EN: number;
}

export interface GameWindowInfo {
  open: boolean;
  allowed: boolean;
  windowOpen: boolean;
  opensAt: number;
  closesAt: number;
  /** server clock minus the local one, for countdowns */
  offsetMs: number;
}

export interface PlayerState {
  /** PlayFab data arrived at least once (false = show "-", not zeros) */
  loaded: boolean;
  PlayFabId: string;
  sessionTicket: string;
  method: LoginMethod | null;
  displayName: string;
  /** the wallet linked to the account (lowercase), or null */
  address: string | null;
  email: string | null;
  hasGoogle: boolean;
  resources: PlayerResources;
  xp: number;
  level: number;
  levelPct: number;
  tierSub: number;
  tierSubMax: number;
  currentMission: number;
  /** the client-side reading of docs/contracts/login.md "progress" */
  hasProgress: boolean;
  config: Record<string, unknown> | null;
  gameWindow: GameWindowInfo | null;
}

const emptyResources = (): PlayerResources => ({ GC: 0, FT: 0, PT: 0, DM: 0, WD: 0, ST: 0, IR: 0, GD: 0, EN: 0 });

export const playerState: PlayerState = {
  loaded: false,
  PlayFabId: '',
  sessionTicket: '',
  method: null,
  displayName: '',
  address: null,
  email: null,
  hasGoogle: false,
  resources: emptyResources(),
  xp: 0,
  level: 1,
  levelPct: 0,
  tierSub: 0,
  tierSubMax: 0,
  currentMission: 1,
  hasProgress: false,
  config: null,
  gameWindow: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribePlayerState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyPlayerState(): void {
  listeners.forEach((listener) => listener());
}

/** Forgets the player (logout). */
export function resetPlayerState(): void {
  Object.assign(playerState, {
    loaded: false,
    PlayFabId: '',
    sessionTicket: '',
    method: null,
    displayName: '',
    address: null,
    email: null,
    hasGoogle: false,
    resources: emptyResources(),
    xp: 0,
    level: 1,
    levelPct: 0,
    tierSub: 0,
    tierSubMax: 0,
    currentMission: 1,
    hasProgress: false,
    gameWindow: null,
  });
  notifyPlayerState();
}

export function applyCombinedInfo(info: CombinedInfo): void {
  const vc = info.VirtualCurrency;
  const stats: Record<string, number> = {};
  for (const s of info.Statistics) stats[s.StatisticName] = s.Value;
  const xp = Number(info.UserReadOnlyData.xp?.Value ?? 0);
  const { currentLevel, progressPercentage } = getLevelInfo(xp) as { currentLevel: number; progressPercentage: number };
  const address = info.UserData.address?.Value ?? '';

  playerState.resources = {
    GC: vc.GC ?? 0, FT: vc.FT ?? 0, PT: vc.PT ?? 0, DM: vc.DM ?? 0,
    WD: vc.WD ?? 0, ST: vc.ST ?? 0, IR: vc.IR ?? 0, GD: vc.GD ?? 0,
    EN: vc.EN ?? 0,
  };
  playerState.xp = xp;
  playerState.level = currentLevel;
  playerState.levelPct = progressPercentage;
  playerState.tierSub = stats['tier-sub'] ?? 0;
  playerState.tierSubMax = stats['tier-sub-max'] ?? 0;
  playerState.currentMission = stats['current_mission'] ?? 1;
  playerState.hasProgress = xp > 0 || playerState.tierSub > 0 || playerState.currentMission > 1;
  // UserData.address is only written for wallet logins and links
  playerState.address = /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : null;
  playerState.email = info.AccountInfo.PrivateInfo?.Email ?? null;
  playerState.hasGoogle = (info.AccountInfo.OpenIdInfo ?? []).some((c) => c.ConnectionId === 'google');
  const titleName = info.AccountInfo.TitleInfo?.DisplayName;
  if (titleName) playerState.displayName = titleName;
  playerState.loaded = true;
  notifyPlayerState();
}

/** Re-reads the account (after a login, a link, a Season run...). */
export async function refreshPlayerState(): Promise<void> {
  if (!playerState.sessionTicket) return;
  applyCombinedInfo(await getPlayerCombinedInfo(playerState.sessionTicket));
}

export async function loadConfig(): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.apiUrl}/api/config`);
  const body = (await res.json()) as Record<string, unknown>;
  playerState.config = body;
  notifyPlayerState();
  return body;
}

/** The monthly game window for this player (CLAUDE.md §15). */
export async function loadGameWindow(): Promise<GameWindowInfo | null> {
  const address = playerState.address ?? playerState.PlayFabId;
  try {
    const res = await fetch(`${config.apiUrl}/api/game-window?address=${encodeURIComponent(address)}`);
    const body = (await res.json()) as Omit<GameWindowInfo, 'offsetMs'> & { now: number };
    playerState.gameWindow = { ...body, offsetMs: body.now - Date.now() };
  } catch (err) {
    console.log('[bridge] game window unavailable, assuming open', err);
    playerState.gameWindow = null;
  }
  notifyPlayerState();
  return playerState.gameWindow;
}
