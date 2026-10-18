import { PENDING_REFERRAL_KEY, REFERRAL_CONFIG } from '@/config/referral.config';
import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import type { AuthResult, AuthService } from '@/services/AuthService';
import { $, hide, html, show } from '../dom';

type Mode = 'login' | 'signup';
export type AuthReason = 'default' | 'buy' | 'save' | 'referral';

/**
 * Entrar / crear cuenta: email + contraseña, Google, recuperar contraseña y
 * "seguir como invitado". `reason` explica por qué se pide (comprar, guardar…).
 */
export class AuthScreen {
  readonly el: HTMLElement;
  private mode: Mode = 'login';
  private busy = false;

  constructor(private readonly auth: AuthService) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <form class="card auth" novalidate>
          <h2 data-ref="title"></h2>
          <p class="auth__reason" data-ref="reason"></p>
          <button type="button" class="btn btn--google" data-action="google">
            <span class="g-logo">G</span> ${t('auth.google')}
          </button>
          <p class="auth__or"><span>${t('auth.or')}</span></p>
          <label class="field">
            <span>${t('auth.email')}</span>
            <input name="email" type="email" autocomplete="email" inputmode="email" required />
          </label>
          <label class="field">
            <span>${t('auth.password')}</span>
            <input name="password" type="password" minlength="8" required />
            <small data-ref="pw-hint">${t('auth.passwordHint')}</small>
          </label>
          <p class="auth__msg" data-ref="msg" role="alert"></p>
          <button type="submit" class="btn btn--primary" data-ref="submit"></button>
          <button type="button" class="link" data-action="toggle"></button>
          <button type="button" class="link" data-action="forgot">${t('auth.forgot')}</button>
          <button type="button" class="btn btn--ghost" data-action="close">${t('auth.guest')}</button>
        </form>
      </section>
    `);
    const form = $<HTMLFormElement>(this.el, 'form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    $(this.el, '[data-action="toggle"]').addEventListener('click', () => this.setMode(this.mode === 'login' ? 'signup' : 'login'));
    $(this.el, '[data-action="forgot"]').addEventListener('click', () => void this.forgot());
    $(this.el, '[data-action="google"]').addEventListener('click', () => void this.run(() => this.auth.signInWithGoogle()));
    $(this.el, '[data-action="close"]').addEventListener('click', () => this.close());
    // Teclas dentro del formulario no deben mover al dino
    form.addEventListener('keydown', (e) => e.stopPropagation());
    auth.onChange((user) => user && this.close());
  }

  open(reason: AuthReason = 'default', mode: Mode = 'login'): void {
    const key: TranslationKey =
      reason === 'buy' ? 'auth.whyBuy' : reason === 'save' ? 'auth.whySave' : reason === 'referral' ? 'auth.whyReferral' : 'auth.why';
    $(this.el, '[data-ref="reason"]').textContent = t(key, { value: formatNumber(REFERRAL_CONFIG.welcomeBonus) });
    this.message('');
    this.setMode(mode);
    show(this.el);
  }

  close(): void {
    hide(this.el);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    const login = mode === 'login';
    $(this.el, '[data-ref="title"]').textContent = t(login ? 'auth.titleLogin' : 'auth.titleSignup');
    $(this.el, '[data-ref="submit"]').textContent = t(login ? 'auth.login' : 'auth.signup');
    $(this.el, '[data-action="toggle"]').textContent = t(login ? 'auth.toSignup' : 'auth.toLogin');
    $<HTMLInputElement>(this.el, 'input[name="password"]').autocomplete = login ? 'current-password' : 'new-password';
    const hint = $(this.el, '[data-ref="pw-hint"]');
    const forgot = $(this.el, '[data-action="forgot"]');
    if (login) {
      hide(hint);
      show(forgot);
    } else {
      show(hint);
      hide(forgot);
    }
    this.message('');
  }

  private get email(): string {
    return $<HTMLInputElement>(this.el, 'input[name="email"]').value.trim();
  }

  private get password(): string {
    return $<HTMLInputElement>(this.el, 'input[name="password"]').value;
  }

  private async submit(): Promise<void> {
    const email = this.email;
    const password = this.password;
    if (!email.includes('@')) return this.message(t('auth.error.INVALID_EMAIL'), true);
    if (this.mode === 'signup' && password.length < 8) return this.message(t('auth.error.WEAK_PASSWORD'), true);
    await this.run(async () => {
      if (this.mode === 'login') return this.auth.signIn(email, password);
      const res = await this.auth.signUp(email, password, pendingReferralCode() ?? undefined);
      if (res.ok && res.needsConfirmation) {
        this.message(t('auth.checkEmail', { email }));
        this.setModeKeepMessage('login');
      }
      return res;
    });
  }

  private setModeKeepMessage(mode: Mode): void {
    const msg = $(this.el, '[data-ref="msg"]').textContent ?? '';
    this.setMode(mode);
    this.message(msg);
  }

  private async forgot(): Promise<void> {
    const email = this.email;
    if (!email.includes('@')) return this.message(t('auth.error.INVALID_EMAIL'), true);
    await this.run(async () => {
      const res = await this.auth.resetPassword(email);
      if (res.ok) this.message(t('auth.resetSent', { email }));
      return res;
    });
  }

  private async run(action: () => Promise<AuthResult>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.el.classList.add('is-busy');
    try {
      const res = await action();
      if (!res.ok) this.message(t(`auth.error.${res.error}` as TranslationKey), true);
    } finally {
      this.busy = false;
      this.el.classList.remove('is-busy');
    }
  }

  private message(text: string, error = false): void {
    const el = $(this.el, '[data-ref="msg"]');
    el.textContent = text;
    el.classList.toggle('auth__msg--error', error);
  }
}

/** Código de referido guardado al abrir un link /r/CODIGO (Fase 6). */
function pendingReferralCode(): string | null {
  try {
    return localStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return null;
  }
}
