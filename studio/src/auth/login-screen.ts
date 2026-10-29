/**
 * The login screen: wallet (injected / WalletConnect), Google, email and
 * guest, composed from the engine's Button and Input widgets inside a
 * project template (assets/ui/templates/login-screen.html).
 */
import * as ENGINE from '@gnsx/genesys.js';

import { describeAuthError, loginWithEmailPassword, recoverPassword, registerWithEmailPassword } from './email.js';
import { isGoogleAvailable, loginWithGoogleToken, renderGoogleButton } from './google.js';
import { loginAsGuest } from './guest.js';
import type { Session, StoredLogin } from './session.js';
import { hasInjectedWallet, hasWalletConnect, loginWithWallet } from './wallet.js';

export interface LoginScreenOptions extends ENGINE.BaseUIComponentOptions {
  /** the login the browser remembers, to prefill and greet */
  remembered: StoredLogin | null;
  onLoggedIn: (session: Session) => void;
}

type EmailMode = 'login' | 'register' | 'recover';

export class LoginScreen extends ENGINE.BaseUIComponent<LoginScreenOptions> {
  public static metadata: ENGINE.UIComponentMetadata = {
    displayName: 'GolfCraft Login',
    category: 'menu',
    summary: 'Sign in with a wallet, Google, email or as a guest.',
    useCases: ['login', 'sign in'],
    optionsType: 'LoginScreenOptions',
    assetPaths: {
      template: '@project/assets/ui/templates/login-screen.html',
      styles: '@project/assets/ui/styles/login-screen.css',
    },
  };

  private sections: Record<'methods' | 'email', HTMLElement | null> = { methods: null, email: null };
  private statusElement: HTMLElement | null = null;
  private subtitleElement: HTMLElement | null = null;
  private buttons = new Map<string, ENGINE.Button>();
  private inputs = new Map<string, ENGINE.Input>();
  private emailMode: EmailMode = 'login';
  private busy = false;

  protected override getAssetPaths() {
    return {
      templatePath: LoginScreen.metadata.assetPaths.template,
      stylesPath: LoginScreen.metadata.assetPaths.styles,
    };
  }

  protected override getDefaultOptions(): Required<LoginScreenOptions> {
    return {
      position: 'none',
      visible: true,
      customClasses: [],
      customStyles: {},
      remembered: null,
      onLoggedIn: () => undefined,
    };
  }

  protected override getInitialData(): Record<string, string> {
    return {
      title: 'GolfCraft',
      subtitle: 'Sign in to play',
      note: 'One account for every way in: add a wallet, an email or Google later to keep your progress.',
    };
  }

  protected override cacheElements(): void {
    if (!this.layout) return;
    this.sections.methods = this.layout.querySelector('[data-section="methods"]');
    this.sections.email = this.layout.querySelector('[data-section="email"]');
    this.statusElement = this.layout.querySelector('[data-status]');
    this.subtitleElement = this.layout.querySelector('[data-subtitle]');
  }

  private slot(name: string): HTMLElement | null {
    return this.layout?.querySelector(`[data-slot="${name}"]`) ?? null;
  }

  protected override async onInitialize(): Promise<void> {
    const { remembered } = this.options;

    if (hasInjectedWallet()) {
      await this.button('wallet', { label: 'Connect wallet', variant: 'primary', size: 'large' }, () => this.run(() => loginWithWallet('injected')));
    }
    if (hasWalletConnect()) {
      await this.button('walletconnect', {
        label: hasInjectedWallet() ? 'WalletConnect' : 'Connect wallet',
        variant: hasInjectedWallet() ? 'secondary' : 'primary',
        size: 'large',
      }, () => this.run(() => loginWithWallet('walletconnect')));
    }
    const googleSlot = this.slot('google');
    if (googleSlot && isGoogleAvailable()) {
      renderGoogleButton(googleSlot, (token) => this.run(() => loginWithGoogleToken(token)))
        .catch((err) => this.setStatus(describeAuthError(err), true));
    }
    await this.button('email', { label: 'Email and password', variant: 'secondary', size: 'large' }, () => this.showEmail('login'));
    await this.button('guest', { label: 'Play as guest', variant: 'outline', size: 'large' }, () => this.run(() => loginAsGuest()));

    await this.input('email-name', { label: 'Player name', placeholder: '3 to 25 characters', type: 'text' });
    await this.input('email-address', { label: 'Email', placeholder: 'you@example.com', type: 'email' });
    await this.input('email-password', { label: 'Password', placeholder: '6 to 100 characters', type: 'password' });
    await this.button('email-submit', { label: 'Sign in', variant: 'primary', size: 'medium' }, () => this.submitEmail());
    await this.button('email-back', { label: 'Back', variant: 'ghost', size: 'medium' }, () => this.showMethods());

    this.layout?.querySelector('[data-action="toggle-register"]')?.addEventListener('click', () => {
      this.showEmail(this.emailMode === 'register' ? 'login' : 'register');
    });
    this.layout?.querySelector('[data-action="recover"]')?.addEventListener('click', () => this.showEmail('recover'));

    if (remembered?.displayName && this.subtitleElement) {
      this.subtitleElement.textContent = `Welcome back, ${remembered.displayName}`;
    }
    if (remembered?.method === 'email') {
      this.inputs.get('email-address')?.setValue(remembered.email ?? '');
      this.showEmail('login');
    }
  }

  private async button(slotName: string, options: ENGINE.ButtonOptions, onClick: () => void): Promise<void> {
    const slot = this.slot(slotName);
    if (!slot) return;
    const button = await this.mountChild(ENGINE.Button, { ...options, onClick }, slot);
    this.buttons.set(slotName, button);
  }

  private async input(slotName: string, options: ENGINE.InputOptions): Promise<void> {
    const slot = this.slot(slotName);
    if (!slot) return;
    const input = await this.mountChild(ENGINE.Input, options, slot);
    this.inputs.set(slotName, input);
  }

  private showMethods(): void {
    if (this.sections.methods) this.sections.methods.hidden = false;
    if (this.sections.email) this.sections.email.hidden = true;
    this.setStatus('');
  }

  private showEmail(mode: EmailMode): void {
    this.emailMode = mode;
    if (this.sections.methods) this.sections.methods.hidden = true;
    if (this.sections.email) this.sections.email.hidden = false;
    const nameSlot = this.slot('email-name');
    const passwordSlot = this.slot('email-password');
    if (nameSlot) nameSlot.hidden = mode !== 'register';
    if (passwordSlot) passwordSlot.hidden = mode === 'recover';
    const submit = this.buttons.get('email-submit');
    submit?.setLabel(mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset email');
    const toggle = this.layout?.querySelector('[data-action="toggle-register"]');
    if (toggle) toggle.textContent = mode === 'register' ? 'I already have an account' : 'Create an account';
    this.setStatus(mode === 'recover' ? 'We will email you a link to choose a new password.' : '');
  }

  private submitEmail(): void {
    const email = this.inputs.get('email-address')?.getValue() ?? '';
    const password = this.inputs.get('email-password')?.getValue() ?? '';
    const name = this.inputs.get('email-name')?.getValue() ?? '';
    if (this.emailMode === 'recover') {
      void this.runTask(async () => {
        await recoverPassword(email);
        this.setStatus('Check your inbox for the reset link.');
        this.showEmail('login');
      });
      return;
    }
    void this.run(() => (this.emailMode === 'register'
      ? registerWithEmailPassword(email, password, name)
      : loginWithEmailPassword(email, password)));
  }

  /** Runs a login; on success hands the session over. */
  private run(task: () => Promise<Session>): Promise<void> {
    return this.runTask(async () => {
      const session = await task();
      this.options.onLoggedIn(session);
    });
  }

  private async runTask(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setBusy(true);
    this.setStatus('Signing in…');
    try {
      await task();
    } catch (err) {
      console.log('[auth] login failed', err);
      this.setStatus(describeAuthError(err), true);
    } finally {
      this.busy = false;
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.buttons.forEach((button) => button.setDisabled(busy));
    this.inputs.forEach((input) => input.setDisabled(busy));
  }

  private setStatus(text: string, error = false): void {
    if (!this.statusElement) return;
    this.statusElement.textContent = text;
    this.statusElement.setAttribute('data-error', error ? 'true' : 'false');
  }

  protected override onDestroy(): void {
    this.buttons.clear();
    this.inputs.clear();
    this.sections = { methods: null, email: null };
    this.statusElement = null;
    this.subtitleElement = null;
  }
}
