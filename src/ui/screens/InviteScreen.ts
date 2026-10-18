import { REFERRAL_CONFIG } from '@/config/referral.config';
import { formatNumber, t } from '@/i18n/i18n';
import { ReferralService } from '@/services/ReferralService';
import { $, hide, html, show } from '../dom';

/**
 * "Invitar amigos": link personal, copiar, WhatsApp, compartir nativo y
 * contador de referidos.
 */
export class InviteScreen {
  readonly el: HTMLElement;
  private link = '';

  constructor(
    private readonly service: ReferralService | null,
    private readonly getCode: () => string | null,
    private readonly toast: (text: string) => void,
    onBack: () => void,
  ) {
    this.el = html(/* html */ `
      <section class="screen screen--invite hidden">
        <header class="shop__top">
          <button class="icon-btn" data-action="back" aria-label="${t('shop.back')}">←</button>
          <h2 class="shop__title">👥 ${t('invite.title')}</h2>
          <span style="width:44px"></span>
        </header>
        <div class="card invite">
          <p class="invite__pitch">${t('invite.pitch', {
            welcome: formatNumber(REFERRAL_CONFIG.welcomeBonus),
            inviter: formatNumber(REFERRAL_CONFIG.inviterBonus),
          })}</p>
          <div data-ref="content">
            <p class="field-label">${t('invite.yourLink')}</p>
            <div class="invite__link">
              <input data-ref="link" readonly />
              <button class="btn btn--primary" data-action="copy">${t('invite.copy')}</button>
            </div>
            <button class="btn btn--whatsapp" data-action="whatsapp">💬 ${t('invite.whatsapp')}</button>
            <button class="btn btn--ghost hidden" data-action="share">📤 ${t('invite.share')}</button>
            <dl class="stats invite__stats">
              <div><dt>${t('invite.invited')}</dt><dd data-ref="invited">–</dd></div>
              <div><dt>${t('invite.played')}</dt><dd data-ref="played">–</dd></div>
              <div><dt>${t('invite.earned')}</dt><dd data-ref="earned">–</dd></div>
            </dl>
          </div>
          <p class="invite__notice hidden" data-ref="notice"></p>
        </div>
      </section>
    `);
    $(this.el, '[data-action="back"]').addEventListener('click', onBack);
    $(this.el, '[data-action="copy"]').addEventListener('click', () => void this.copy());
    $(this.el, '[data-action="whatsapp"]').addEventListener('click', () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(this.message())}`, '_blank', 'noopener');
    });
    $(this.el, '[data-action="share"]').addEventListener('click', () => {
      void navigator.share?.({ title: 'dinoMau', text: this.message(), url: this.link }).catch(() => {});
    });
    if (typeof navigator.share === 'function') show($(this.el, '[data-action="share"]'));
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    show(this.el);
    const code = this.getCode();
    const content = $(this.el, '[data-ref="content"]');
    const notice = $(this.el, '[data-ref="notice"]');
    if (!this.service || !code) {
      hide(content);
      notice.textContent = t(this.service ? 'invite.guest' : 'invite.offline');
      show(notice);
      return;
    }
    show(content);
    hide(notice);
    this.link = ReferralService.linkFor(code);
    $<HTMLInputElement>(this.el, '[data-ref="link"]').value = this.link;
    void this.loadStats();
  }

  close(): void {
    hide(this.el);
  }

  private message(): string {
    return t('invite.message', { welcome: formatNumber(REFERRAL_CONFIG.welcomeBonus), link: this.link });
  }

  private async copy(): Promise<void> {
    const input = $<HTMLInputElement>(this.el, '[data-ref="link"]');
    try {
      await navigator.clipboard.writeText(this.link);
    } catch {
      // Navegadores sin API de portapapeles (o sin permiso): selección clásica
      input.select();
      document.execCommand?.('copy');
    }
    this.toast(t('invite.copied'));
  }

  private async loadStats(): Promise<void> {
    if (!this.service) return;
    try {
      const s = await this.service.stats();
      $(this.el, '[data-ref="invited"]').textContent = formatNumber(s.invited);
      $(this.el, '[data-ref="played"]').textContent = formatNumber(s.played);
      $(this.el, '[data-ref="earned"]').textContent = formatNumber(s.earned);
    } catch {
      /* se quedan los guiones */
    }
  }
}
