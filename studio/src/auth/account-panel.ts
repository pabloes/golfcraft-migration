/**
 * The account panel: who is logged in, the "save your progress" prompt for
 * accounts with no wallet, email or Google, the link flows (including the
 * both-have-progress choice of docs/contracts/login.md) and logout.
 */
import * as ENGINE from '@gnsx/genesys.js';

import { playerState, subscribePlayerState } from '../bridge/index.js';
import { logout } from './account.js';
import { addEmailToAccount, describeAuthError } from './email.js';
import { isGoogleAvailable, linkGoogleToAccount, renderGoogleButton } from './google.js';
import type { Session } from './session.js';
import { hasInjectedWallet, hasWalletConnect, linkWallet } from './wallet.js';
import type { ProgressSummary, WalletKind } from './wallet.js';

export interface AccountPanelOptions extends ENGINE.BaseUIComponentOptions {
  onLogout: () => void;
  /** the player continued as the wallet account that already existed */
  onSwitched?: (session: Session) => void;
}

const METHOD_LABEL: Record<string, string> = { wallet: 'Wallet', guest: 'Guest', email: 'Email', google: 'Google' };

export class AccountPanel extends ENGINE.BaseUIComponent<AccountPanelOptions> {
  public static metadata: ENGINE.UIComponentMetadata = {
    displayName: 'GolfCraft Account',
    category: 'menu',
    summary: 'Logged-in player, progress-saving prompt and account links.',
    useCases: ['account', 'profile', 'logout'],
    optionsType: 'AccountPanelOptions',
    assetPaths: {
      template: '@project/assets/ui/templates/account-panel.html',
      styles: '@project/assets/ui/styles/account-panel.css',
    },
  };

  private nameElement: HTMLElement | null = null;
  private lineElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private conflictText: HTMLElement | null = null;
  private sections: Record<'save' | 'actions' | 'email' | 'conflict', HTMLElement | null> = {
    save: null, actions: null, email: null, conflict: null,
  };
  private buttons = new Map<string, ENGINE.Button>();
  private inputs = new Map<string, ENGINE.Input>();
  private unsubscribe: (() => void) | null = null;
  private busy = false;
  private pendingWalletKind: WalletKind = 'injected';

  protected override getAssetPaths() {
    return {
      templatePath: AccountPanel.metadata.assetPaths.template,
      stylesPath: AccountPanel.metadata.assetPaths.styles,
    };
  }

  protected override getDefaultOptions(): Required<AccountPanelOptions> {
    return {
      position: 'top-right',
      visible: true,
      customClasses: [],
      customStyles: {},
      onLogout: () => undefined,
      onSwitched: () => undefined,
    };
  }

  protected override getInitialData(): Record<string, string> {
    return {
      saveText: 'Save your progress: this guest account lives in this browser only. Add a wallet, an email or Google to keep it.',
    };
  }

  protected override cacheElements(): void {
    if (!this.layout) return;
    this.nameElement = this.layout.querySelector('[data-name]');
    this.lineElement = this.layout.querySelector('[data-line]');
    this.statusElement = this.layout.querySelector('[data-status]');
    this.conflictText = this.layout.querySelector('[data-conflict-text]');
    for (const key of ['save', 'actions', 'email', 'conflict'] as const) {
      this.sections[key] = this.layout.querySelector(`[data-section="${key}"]`);
    }
  }

  private slot(name: string): HTMLElement | null {
    return this.layout?.querySelector(`[data-slot="${name}"]`) ?? null;
  }

  protected override async onInitialize(): Promise<void> {
    if (hasInjectedWallet()) {
      await this.button('link-wallet', { label: 'Link wallet', variant: 'primary', size: 'small' }, () => this.startLinkWallet('injected'));
    }
    if (hasWalletConnect()) {
      await this.button('link-walletconnect', {
        label: hasInjectedWallet() ? 'Link with WalletConnect' : 'Link wallet',
        variant: hasInjectedWallet() ? 'secondary' : 'primary',
        size: 'small',
      }, () => this.startLinkWallet('walletconnect'));
    }
    await this.button('add-email', { label: 'Add email and password', variant: 'secondary', size: 'small' }, () => this.showEmailForm(true));
    const googleSlot = this.slot('add-google');
    if (googleSlot && isGoogleAvailable()) {
      renderGoogleButton(googleSlot, (token) => void this.runTask(async () => {
        await linkGoogleToAccount(token);
        this.setStatus('Google added to your account.');
      })).catch((err) => this.setStatus(describeAuthError(err), true));
    }
    await this.button('logout', { label: 'Log out', variant: 'ghost', size: 'small' }, () => {
      logout();
      this.options.onLogout();
    });

    await this.input('email-address', { label: 'Email', placeholder: 'you@example.com', type: 'email' });
    await this.input('email-password', { label: 'Password', placeholder: '6 to 100 characters', type: 'password' });
    await this.button('email-submit', { label: 'Save', variant: 'primary', size: 'small' }, () => void this.submitEmail());
    await this.button('email-cancel', { label: 'Cancel', variant: 'ghost', size: 'small' }, () => this.showEmailForm(false));

    await this.button('conflict-continue', { label: 'Continue with the wallet', variant: 'primary', size: 'small' }, () => {
      this.showConflict(null);
      void this.runLink(this.pendingWalletKind, true);
    });
    await this.button('conflict-cancel', { label: 'Not now', variant: 'ghost', size: 'small' }, () => this.showConflict(null));

    this.unsubscribe = subscribePlayerState(() => this.render());
    this.render();
  }

  private async button(slotName: string, options: ENGINE.ButtonOptions, onClick: () => void): Promise<void> {
    const slot = this.slot(slotName);
    if (!slot) return;
    this.buttons.set(slotName, await this.mountChild(ENGINE.Button, { ...options, onClick }, slot));
  }

  private async input(slotName: string, options: ENGINE.InputOptions): Promise<void> {
    const slot = this.slot(slotName);
    if (!slot) return;
    this.inputs.set(slotName, await this.mountChild(ENGINE.Input, options, slot));
  }

  /** Reflects the player: name, method, level, energy and which links are missing. */
  private render(): void {
    const s = playerState;
    if (this.nameElement) this.nameElement.textContent = s.displayName || '…';
    if (this.lineElement) {
      const method = s.method ? METHOD_LABEL[s.method] ?? s.method : '';
      this.lineElement.textContent = s.loaded ? `${method} · Lv. ${s.level} · ${s.resources.EN} energy` : method;
    }
    const unsaved = !s.address && !s.email && !s.hasGoogle;
    if (this.sections.save) this.sections.save.hidden = !unsaved;
    this.setSlotHidden('link-wallet', !!s.address);
    this.setSlotHidden('link-walletconnect', !!s.address);
    this.setSlotHidden('add-email', !!s.email);
    this.setSlotHidden('add-google', s.hasGoogle || !isGoogleAvailable());
  }

  private setSlotHidden(name: string, hidden: boolean): void {
    const slot = this.slot(name);
    if (slot) slot.hidden = hidden;
  }

  private showEmailForm(show: boolean): void {
    if (this.sections.email) this.sections.email.hidden = !show;
    if (this.sections.actions) this.sections.actions.hidden = show;
    this.setStatus('');
  }

  private async submitEmail(): Promise<void> {
    const email = this.inputs.get('email-address')?.getValue() ?? '';
    const password = this.inputs.get('email-password')?.getValue() ?? '';
    await this.runTask(async () => {
      await addEmailToAccount(email, password);
      this.showEmailForm(false);
      this.setStatus('Email added: you can sign in with it anywhere.');
    });
  }

  private startLinkWallet(kind: WalletKind): void {
    this.pendingWalletKind = kind;
    void this.runLink(kind, false);
  }

  private runLink(kind: WalletKind, abandonCurrent: boolean): Promise<void> {
    return this.runTask(async () => {
      const result = await linkWallet(kind, abandonCurrent);
      if (result.status === 'linked') {
        this.setStatus('Wallet linked: your progress is safe.');
      } else if (result.status === 'switched') {
        this.setStatus('Continuing with your wallet account.');
        this.options.onSwitched?.(result.session);
      } else {
        this.showConflict(result);
      }
    });
  }

  private showConflict(conflict: { wallet: ProgressSummary; current: ProgressSummary } | null): void {
    if (this.sections.conflict) this.sections.conflict.hidden = !conflict;
    if (this.sections.actions) this.sections.actions.hidden = !!conflict;
    if (conflict && this.conflictText) {
      const describe = (p: ProgressSummary) => `level ${levelOf(p.xp)}, rank points ${p.tierSub}, ${p.games} games`;
      this.conflictText.textContent =
        `Your wallet already has a GolfCraft account (${describe(conflict.wallet)}). `
        + `Continue with it? The progress of this account (${describe(conflict.current)}) stays behind.`;
    }
  }

  private async runTask(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.buttons.forEach((button) => button.setDisabled(true));
    this.setStatus('Working…');
    try {
      await task();
    } catch (err) {
      console.log('[auth] account action failed', err);
      this.setStatus(describeAuthError(err), true);
    } finally {
      this.busy = false;
      this.buttons.forEach((button) => button.setDisabled(false));
    }
  }

  private setStatus(text: string, error = false): void {
    if (!this.statusElement) return;
    this.statusElement.textContent = text;
    this.statusElement.setAttribute('data-error', error ? 'true' : 'false');
  }

  protected override onDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.buttons.clear();
    this.inputs.clear();
    this.nameElement = null;
    this.lineElement = null;
    this.statusElement = null;
    this.conflictText = null;
    this.sections = { save: null, actions: null, email: null, conflict: null };
  }
}

// common/utils getLevelInfo, inlined for the summary line: level = cbrt(xp/10)+1, capped at 80
function levelOf(xp: number): number {
  return Math.min(Math.floor(Math.cbrt(xp / 10)) + 1, 80);
}
