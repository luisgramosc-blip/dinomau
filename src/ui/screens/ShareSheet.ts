import type { AssetLoader } from '@/assets/AssetLoader';
import type { DinoDefinition } from '@/config/dinos.config';
import { REFERRAL_CONFIG } from '@/config/referral.config';
import { formatNumber, t } from '@/i18n/i18n';
import { renderDinoPortrait } from '@/share/DinoPortrait';
import { browserShareEnv, canShareImage, copyText, shareStory, socialLinks, STORY_FILENAME, type ShareEnv } from '@/share/ShareService';
import { renderStoryBlob } from '@/share/StoryImage';
import { $, hide, html, show } from '../dom';

export interface ShareRun {
  score: number;
  distance: number;
  coins: number;
  isRecord: boolean;
  dino: DinoDefinition;
}

export interface ShareDeps {
  assets: AssetLoader;
  /** Link a mostrar: el de referido si hay cuenta; si no, la web del juego. */
  getLink(): { url: string; isReferral: boolean };
  toast(text: string, ms?: number): void;
  env?: ShareEnv;
}

/** Hoja "Compartir": genera la imagen de historia y ofrece las opciones. */
export class ShareSheet {
  readonly el: HTMLElement;
  private blob?: Blob;
  private previewUrl?: string;
  private text = '';
  private url = '';
  private readonly env: ShareEnv;
  private generation = 0;

  constructor(private readonly deps: ShareDeps) {
    this.env = deps.env ?? browserShareEnv();
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card share">
          <h2>${t('share.title')}</h2>
          <div class="share__preview">
            <img data-ref="img" alt="" />
            <p class="share__loading" data-ref="loading">${t('share.generating')}</p>
          </div>
          <button class="btn btn--primary" data-action="native">📤 ${t('share.native')}</button>
          <p class="share__hint" data-ref="hint">${t('share.nativeHint')}</p>
          <div class="share__row">
            <button class="btn btn--whatsapp" data-action="whatsapp">${t('share.whatsapp')}</button>
            <button class="btn btn--facebook" data-action="facebook">${t('share.facebook')}</button>
            <button class="btn btn--x" data-action="x">${t('share.x')}</button>
          </div>
          <div class="share__row">
            <button class="btn btn--ghost" data-action="download">📥 ${t('share.download')}</button>
            <button class="btn btn--ghost" data-action="copy">📋 ${t('share.copyText')}</button>
          </div>
          <button class="btn btn--ghost" data-action="close">${t('share.close')}</button>
        </div>
      </section>
    `);
    const on = (a: string, fn: () => void) => $(this.el, `[data-action="${a}"]`).addEventListener('click', fn);
    on('close', () => this.close());
    on('native', () => void this.native());
    on('download', () => this.blob && this.env.download(this.blob, STORY_FILENAME));
    on('copy', async () => {
      if (await copyText(this.env, `${this.text} ${this.url}`)) this.deps.toast(t('share.copied'));
    });
    on('whatsapp', () => this.env.open(socialLinks(this.text, this.url).whatsapp));
    on('facebook', () => this.env.open(socialLinks(this.text, this.url).facebook));
    on('x', () => this.env.open(socialLinks(this.text, this.url).x));
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  async open(run: ShareRun): Promise<void> {
    const gen = ++this.generation;
    show(this.el);
    this.setReady(false);
    const { url, isReferral } = this.deps.getLink();
    const bonus = formatNumber(REFERRAL_CONFIG.welcomeBonus);
    this.url = url;
    this.text = t(isReferral ? 'share.textReferral' : 'share.text', {
      score: formatNumber(run.score), dino: run.dino.name, bonus,
    });

    try {
      const portrait = renderDinoPortrait(this.deps.assets, run.dino);
      const blob = await renderStoryBlob({
        ...run,
        dinoName: run.dino.name,
        link: url,
        portrait,
        formatNumber,
        texts: {
          newRecord: t('story.newRecord'),
          score: t('story.score'),
          coins: t('story.coins'),
          meters: t('story.meters'),
          challenge: t('story.challenge'),
          linkCta: isReferral ? t('story.linkCta', { bonus }) : t('story.linkCtaGuest'),
        },
      });
      if (gen !== this.generation) return; // se cerró o se abrió otra
      this.blob = blob;
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = URL.createObjectURL(blob);
      $<HTMLImageElement>(this.el, '[data-ref="img"]').src = this.previewUrl;
      this.setReady(true);
    } catch (err) {
      console.error(err);
      this.deps.toast(t('share.error'));
    }
  }

  close(): void {
    this.generation++;
    hide(this.el);
  }

  private setReady(ready: boolean): void {
    const loading = $(this.el, '[data-ref="loading"]');
    const img = $(this.el, '[data-ref="img"]');
    if (ready) {
      hide(loading);
      show(img);
    } else {
      show(loading);
      hide(img);
    }
    this.el.querySelectorAll<HTMLButtonElement>('[data-action="native"], [data-action="download"]').forEach((b) => (b.disabled = !ready));
    // Sin Web Share de archivos, el botón principal hace "descargar + copiar"
    const hint = $(this.el, '[data-ref="hint"]');
    if (ready && this.blob && !canShareImage(this.env, this.blob)) hide(hint);
    else show(hint);
  }

  private async native(): Promise<void> {
    if (!this.blob) return;
    const outcome = await shareStory(this.env, this.blob, this.text, this.url);
    if (outcome === 'downloaded') this.deps.toast(t('share.downloaded'), 3500);
  }
}
