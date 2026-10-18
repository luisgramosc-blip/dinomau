import { ABILITY_ICONS, DINOS } from '@/config/dinos.config';
import { formatNumber, t } from '@/i18n/i18n';
import type { LeaderboardPeriod, LeaderboardService } from '@/services/LeaderboardService';
import { $, escapeHtml, hide, html, show } from '../dom';

/** Ranking global y semanal, con la posición del jugador al pie. */
export class LeaderboardScreen {
  readonly el: HTMLElement;
  private period: LeaderboardPeriod = 'all';
  private requestId = 0;

  constructor(
    private readonly service: LeaderboardService | null,
    private readonly session: () => { userId: string | null; hasUsername: boolean },
    onBack: () => void,
  ) {
    this.el = html(/* html */ `
      <section class="screen screen--ranking hidden">
        <header class="shop__top">
          <button class="icon-btn" data-action="back" aria-label="${t('shop.back')}">←</button>
          <h2 class="shop__title">🏆 ${t('ranking.title')}</h2>
          <span style="width:44px"></span>
        </header>
        <div class="card ranking">
          <div class="segmented" role="tablist">
            <button data-period="all" aria-pressed="true">${t('ranking.all')}</button>
            <button data-period="weekly" aria-pressed="false">${t('ranking.weekly')}</button>
          </div>
          <ol class="ranking__list" data-ref="list"></ol>
          <p class="ranking__me" data-ref="me"></p>
        </div>
      </section>
    `);
    $(this.el, '[data-action="back"]').addEventListener('click', onBack);
    this.el.querySelectorAll<HTMLButtonElement>('[data-period]').forEach((b) =>
      b.addEventListener('click', () => {
        this.period = b.dataset.period as LeaderboardPeriod;
        this.el.querySelectorAll('[data-period]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        void this.load();
      }),
    );
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    show(this.el);
    void this.load();
  }

  close(): void {
    hide(this.el);
  }

  private async load(): Promise<void> {
    const list = $(this.el, '[data-ref="list"]');
    const me = $(this.el, '[data-ref="me"]');
    if (!this.service) {
      list.innerHTML = `<li class="ranking__empty">${escapeHtml(t('ranking.offline'))}</li>`;
      me.textContent = '';
      return;
    }
    const id = ++this.requestId;
    list.innerHTML = `<li class="ranking__empty">${escapeHtml(t('loading'))}</li>`;
    const { userId, hasUsername } = this.session();
    try {
      const [rows, mine] = await Promise.all([
        this.service.top(this.period),
        userId ? this.service.myRank(this.period) : Promise.resolve(null),
      ]);
      if (id !== this.requestId) return; // llegó otra pestaña antes
      list.innerHTML = rows.length
        ? rows.map((r) => {
            const dino = DINOS.find((d) => d.id === r.dinoId);
            const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;
            return `<li class="ranking__row${r.userId === userId ? ' ranking__row--me' : ''}">
              <span class="ranking__pos">${medal}</span>
              <span class="ranking__name">${escapeHtml(r.username)}</span>
              <span class="ranking__dino" title="${escapeHtml(dino?.name ?? '')}">${dino ? ABILITY_ICONS[dino.ability] : ''}</span>
              <b>${formatNumber(r.score)}</b>
            </li>`;
          }).join('')
        : `<li class="ranking__empty">${escapeHtml(t('ranking.empty'))}</li>`;
      me.textContent = !userId
        ? t('ranking.guest')
        : !hasUsername
          ? t('ranking.meNoName')
          : mine
            ? t('ranking.me', { rank: mine.rank, score: formatNumber(mine.score) })
            : t('ranking.meNone');
    } catch {
      if (id !== this.requestId) return;
      list.innerHTML = `<li class="ranking__empty">${escapeHtml(t('ranking.error'))}</li>`;
      me.textContent = '';
    }
  }
}
