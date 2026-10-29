/**
 * Colyseus client and the join options every room expects. The server
 * identifies the player by `clientInfo.sessionTicket` (server/rooms/
 * session-auth.ts) and keys records by the verified wallet or, without one,
 * the PlayFabId; `user` mirrors what the Decentraland scene sends.
 */
import { Client } from 'colyseus.js';

import { config } from '../config.js';
import { playerState } from './player-state.js';

let client: Client | null = null;

export function getColyseusClient(): Client {
  if (!client) client = new Client(config.wsUrl);
  return client;
}

export interface JoinUser {
  userId: string;
  publicKey?: string;
  displayName: string;
  hasConnectedWeb3: boolean;
  avatar: undefined;
}

export function getJoinOptions(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const user: JoinUser = {
    userId: playerState.address ?? playerState.PlayFabId,
    publicKey: playerState.address ?? undefined,
    displayName: playerState.displayName,
    hasConnectedWeb3: !!playerState.address,
    avatar: undefined,
  };
  return {
    user,
    userId: user.userId,
    PlayFabId: playerState.PlayFabId,
    clientInfo: { sessionTicket: playerState.sessionTicket },
    ...extra,
  };
}
