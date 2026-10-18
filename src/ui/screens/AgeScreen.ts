import { ageGroupFromBirthYear, birthYearOptions, type AgeGroup } from '@/age/AgeGate';
import { t } from '@/i18n/i18n';
import { $, html } from '../dom';

/**
 * Pregunta de edad de la primera vez. Es neutra a propósito: no dice qué
 * cambia según la respuesta ni sugiere ningún año, para no empujar a mentir.
 */
export function askAgeGroup(root: HTMLElement = document.body): Promise<AgeGroup> {
  return new Promise((resolve) => {
    const el = html(/* html */ `
      <section class="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
        <div class="card age-gate__card">
          <h1 class="logo age-gate__logo">dino<span>Mau</span></h1>
          <h2 id="age-title">${t('age.title')}</h2>
          <label class="field" for="age-year">
            ${t('age.question')}
            <select id="age-year" data-ref="year">
              <option value="" selected disabled>${t('age.select')}</option>
              ${birthYearOptions().map((y) => `<option value="${y}">${y}</option>`).join('')}
            </select>
          </label>
          <button class="btn btn--primary" data-action="ok" disabled>${t('age.continue')}</button>
          <p class="age-gate__note">${t('age.note')}</p>
        </div>
      </section>
    `);
    const select = $<HTMLSelectElement>(el, '[data-ref="year"]');
    const ok = $<HTMLButtonElement>(el, '[data-action="ok"]');
    select.addEventListener('change', () => (ok.disabled = !select.value));
    ok.addEventListener('click', () => {
      if (!select.value) return;
      el.remove();
      resolve(ageGroupFromBirthYear(Number(select.value)));
    });
    root.append(el);
  });
}
