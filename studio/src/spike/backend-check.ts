/**
 * Phase 0 spike (remove in phase 1): checks the Studio page can reach the
 * GolfCraft web API and the Colyseus server. Only the harmless `ping` room
 * (server/rooms/Ping-Room.ts: answers "ping" with "pong", no state, no
 * PlayFab) is joined; never a gameplay room.
 */
import { Client } from 'colyseus.js';

import { config } from '../config';

export async function checkWebApi(): Promise<string> {
  const started = performance.now();
  try {
    const res = await fetch(`${config.apiUrl}/api/config`);
    const body: unknown = await res.json();
    const keys = body && typeof body === 'object' ? Object.keys(body).length : 0;
    return `OK ${res.status} in ${Math.round(performance.now() - started)} ms, ${keys} keys`;
  } catch (err) {
    return `FAILED ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function checkColyseus(): Promise<string> {
  const started = performance.now();
  try {
    const room = await new Client(config.wsUrl).joinOrCreate('ping');
    const joinedMs = Math.round(performance.now() - started);
    const pong = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 1000);
      room.onMessage('pong', () => {
        clearTimeout(timer);
        resolve(true);
      });
      room.send('ping');
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await room.leave();
    return `OK joined in ${joinedMs} ms, pong=${pong}, left`;
  } catch (err) {
    return `FAILED ${err instanceof Error ? err.message : String(err)}`;
  }
}
