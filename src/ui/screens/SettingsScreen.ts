import { getLanguage, t, type Language, type TranslationKey } from '@/i18n/i18n';
import { LocalStore, type Settings } from '@/storage/LocalStore';
import { $, hide, html, show } from '../dom';

type Toggle = 'sound' | 'music' | 'vibration';
const TOGGLES: Toggle[] = ['sound', 'music', 'vibration'];
const LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

/** Botones de sonido / música / vibración enlazados a LocalStore (se reutilizan en pausa). */
export function settingsToggles(): HTMLElement {
  const el = html(/* html */ `
    <div class="toggles">
      ${TOGGLES.map((k) => `
        <button class="toggle" data-toggle="${k}" aria-pressed="true">
          <span>${t(`settings.${k}` as TranslationKey)}</span><b></b>
        </button>`).join('')}
    </div>
  `);
  const sync = (s: Settings) =>
    el.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) => {
      const on = s[btn.dataset.toggle as Toggle];
      btn.setAttribute('aria-pressed', String(on));
      $(btn, 'b').textContent = t(on ? 'settings.on' : 'settings.off');
    });
  el.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle as Toggle;
      LocalStore.updateSettings({ [key]: !LocalStore.settings[key] } as Partial<Settings>);
    }),
  );
  LocalStore.onSettingsChange(sync);
  sync(LocalStore.settings);
  return el;
}

/** Ajustes: sonido, música, vibración e idioma. */
export class SettingsScreen {
  readonly el: HTMLElement;

  constructor(onClose: () => void) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card">
          <h2>${t('settings.title')}</h2>
          <div data-ref="toggles"></div>
          <p class="field-label">${t('settings.language')}</p>
          <div class="segmented">
            ${LANGUAGES.map((l) => `<button data-lang="${l.code}" aria-pressed="${l.code === getLanguage()}">${l.label}</button>`).join('')}
          </div>
          <button class="btn btn--primary" data-action="close">${t('settings.close')}</button>
        </div>
      </section>
    `);
    $(this.el, '[data-ref="toggles"]').replaceWith(settingsToggles());
    $(this.el, '[data-action="close"]').addEventListener('click', onClose);
    this.el.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang as Language;
        if (lang === getLanguage()) return;
        LocalStore.updateSettings({ language: lang });
        // Recargar es lo más simple y fiable para retraducir toda la UI
        window.location.reload();
      }),
    );
  }

  open(): void {
    show(this.el);
  }

  close(): void {
    hide(this.el);
  }
}
