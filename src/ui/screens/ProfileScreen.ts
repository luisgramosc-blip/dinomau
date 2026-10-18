import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import type { AuthService } from '@/services/AuthService';
import type { SupabaseEconomyService } from '@/services/SupabaseEconomyService';
import { $, escapeHtml, hide, html, show } from '../dom';

/** Perfil: nombre para el ranking, estadísticas y cerrar sesión. */
export class ProfileScreen {
  readonly el: HTMLElement;

  constructor(
    private readonly auth: AuthService,
    private readonly economy: SupabaseEconomyService,
    private readonly onSaved: (username: string) => void,
  ) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <form class="card profile" novalidate>
          <h2>${t('profile.title')}</h2>
          <p class="profile__email" data-ref="email"></p>
          <p class="auth__reason" data-ref="prompt">${t('profile.chooseName')}</p>
          <label class="field">
            <span>${t('profile.username')}</span>
            <input name="username" maxlength="20" autocomplete="nickname" spellcheck="false" />
            <small>${t('profile.usernameHint')}</small>
          </label>
          <p class="auth__msg" data-ref="msg" role="alert"></p>
          <button type="submit" class="btn btn--primary">${t('profile.save')}</button>
          <dl class="stats" data-ref="stats"></dl>
          <button type="button" class="btn btn--ghost" data-action="logout">${t('profile.logout')}</button>
          <button type="button" class="btn btn--ghost" data-action="close">${t('settings.close')}</button>
        </form>
      </section>
    `);
    const form = $<HTMLFormElement>(this.el, 'form');
    form.addEventListener('keydown', (e) => e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.save();
    });
    $(this.el, '[data-action="close"]').addEventListener('click', () => this.close());
    $(this.el, '[data-action="logout"]').addEventListener('click', async () => {
      await this.auth.signOut();
      this.close();
    });
  }

  open(): void {
    const p = this.economy.profile;
    $(this.el, '[data-ref="email"]').textContent = this.auth.user?.email ?? '';
    $<HTMLInputElement>(this.el, 'input[name="username"]').value = p?.username ?? '';
    const prompt = $(this.el, '[data-ref="prompt"]');
    if (p?.username) hide(prompt);
    else show(prompt);
    this.message('');
    const stats: Array<[TranslationKey, number]> = [
      ['profile.best', p?.bestScore ?? 0],
      ['profile.runs', p?.totalRuns ?? 0],
      ['profile.battles', p?.battlesWon ?? 0],
    ];
    $(this.el, '[data-ref="stats"]').innerHTML = stats
      .map(([k, v]) => `<div><dt>${escapeHtml(t(k))}</dt><dd>${formatNumber(v)}</dd></div>`).join('');
    show(this.el);
  }

  close(): void {
    hide(this.el);
  }

  private async save(): Promise<void> {
    const username = $<HTMLInputElement>(this.el, 'input[name="username"]').value.trim();
    const error = await this.economy.setUsername(username);
    if (error) return this.message(t(`profile.error.${error}` as TranslationKey), true);
    this.message(t('profile.saved'));
    hide($(this.el, '[data-ref="prompt"]'));
    this.onSaved(username);
  }

  private message(text: string, error = false): void {
    const el = $(this.el, '[data-ref="msg"]');
    el.textContent = text;
    el.classList.toggle('auth__msg--error', error);
  }
}
