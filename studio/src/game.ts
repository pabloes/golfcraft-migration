/**
 * GolfCraft Studio client entry point.
 *
 * Phase 0: the game mode only runs the spikes in src/spike/ (shared code,
 * one converted course part, backend reachability). Phase 1 replaces them.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { AccountPanel, startAuth } from './auth/index.js';
import { loadConfig, loadGameWindow } from './bridge/index.js';
import { config } from './config.js';
import { checkColyseus, checkWebApi } from './spike/backend-check.js';
import { runSharedCheck } from './spike/shared-check.js';
import { SpikeOverlay } from './spike/spike-overlay.js';

@ENGINE.GameClass()
class MyGameMode extends ENGINE.GameMode {
  private overlay: SpikeOverlay | null = null;
  private accountPanel: AccountPanel | null = null;

  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.GameModeOptions): void {
    super.initialize({
      ...options,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }
    const world = this.getWorld();
    if (!world) {
      return true;
    }

    // One course part converted by scripts/convert-parts.mjs. Course physics
    // runs in cannon, so the node carries no Rapier body.
    world.add(ENGINE.ModelMeshNode.create({
      isRoot: true,
      modelUrl: '@project/assets/parts/smart-door.glb',
      position: new THREE.Vector3(0, 0, 0),
      physicsOptions: { ...ENGINE.PrimitiveNode.DEFAULT_PHYSICS_OPTIONS, enabled: false },
    }));

    // The phase 0 spike overlay stays available behind a flag while the
    // modules of phase 1 land: localStorage golfcraft:spike = 1.
    if (world.gameContainer && readFlag('golfcraft:spike')) {
      this.overlay = new SpikeOverlay(world.gameContainer);
      void this.runSpike(this.overlay);
    }
    void this.runAuth(world.uiManager);
    return true;
  }

  public override endPlay(): boolean {
    if (!super.endPlay()) {
      return false;
    }
    this.overlay?.dispose();
    this.overlay = null;
    this.accountPanel?.destroy();
    this.accountPanel = null;
    return true;
  }

  // Login first (docs/contracts/login.md), then the player's data; the menu
  // module takes over from here.
  private async runAuth(ui: ENGINE.UIManager): Promise<void> {
    try {
      const session = await startAuth(ui);
      console.log('[golfcraft] logged in as', session.method, session.PlayFabId);
      await Promise.all([loadConfig(), loadGameWindow()]).catch((err) => console.log('[golfcraft] bootstrap data failed', err));
      this.accountPanel = new AccountPanel(ui, {
        onLogout: () => {
          this.accountPanel?.destroy();
          this.accountPanel = null;
          void this.runAuth(ui);
        },
      });
      await this.accountPanel.initialize();
    } catch (err) {
      console.log('[golfcraft] auth failed', err);
    }
  }

  private async runSpike(overlay: SpikeOverlay): Promise<void> {
    overlay.line('endpoints', `${config.apiUrl} ${config.wsUrl}${config.isLocal ? ' (local)' : ''}`);
    try {
      overlay.line('shared code', runSharedCheck());
    } catch (err) {
      overlay.line('shared code', `FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
    overlay.line('GET /api/config', await checkWebApi());
    overlay.line('colyseus ping room', await checkColyseus());
  }
}

function readFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

class MyGame extends ENGINE.BaseGameLoop {
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    defaultGameModeClass: MyGameMode,
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}
