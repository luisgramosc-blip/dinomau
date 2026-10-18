import { t } from '@/i18n/i18n';
import { html } from '../dom';

/**
 * Móvil en horizontal: el juego está pensado en vertical, así que se cubre la
 * pantalla con un aviso. La misma condición está en main.css (.rotate-notice).
 */
export const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)';

export function createRotateNotice(): HTMLElement {
  return html(/* html */ `
    <div class="rotate-notice" role="alert">
      <div class="rotate-notice__phone" aria-hidden="true">📱</div>
      <h2>${t('rotate.title')}</h2>
      <p>${t('rotate.text')}</p>
    </div>
  `);
}
