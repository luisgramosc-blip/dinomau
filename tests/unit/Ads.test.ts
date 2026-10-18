import { describe, expect, it } from 'vitest';
import { AdPacer } from '@/ads/AdPacer';
import type { AdProvider, RewardedOutcome } from '@/ads/AdProvider';
import { NoAdProvider } from '@/ads/AdProvider';
import { AdService } from '@/ads/AdService';
import { ADS_CONFIG, resolveAdProvider } from '@/config/ads.config';
import { events } from '@/core/EventBus';
import { LocalAdRewards, canOfferDouble, doubleBonus } from '@/services/AdRewardService';
import { LocalEconomyService } from '@/services/EconomyService';

const RULES = { enabled: true, graceRuns: 2, everyNRuns: 3, minIntervalSeconds: 180, afterRewardedSeconds: 90 };
const MIN = 60_000;

describe('AdPacer (anuncios entre partidas)', () => {
  it('nunca en las primeras partidas de la visita', () => {
    const p = new AdPacer(RULES);
    p.runFinished();
    p.runFinished();
    expect(p.shouldShowInterstitial(10 * MIN)).toBe(false);
    p.runFinished();
    expect(p.shouldShowInterstitial(10 * MIN)).toBe(true);
  });

  it('como mucho uno cada N partidas y con tiempo mínimo entre anuncios', () => {
    const p = new AdPacer(RULES);
    for (let i = 0; i < 3; i++) p.runFinished();
    p.interstitialShown(10 * MIN);
    for (let i = 0; i < 2; i++) p.runFinished();
    expect(p.shouldShowInterstitial(20 * MIN)).toBe(false); // solo 2 partidas
    p.runFinished();
    expect(p.shouldShowInterstitial(10 * MIN + 2 * MIN)).toBe(false); // menos de 3 minutos
    expect(p.shouldShowInterstitial(10 * MIN + 3 * MIN)).toBe(true);
  });

  it('respiro tras un anuncio con recompensa', () => {
    const p = new AdPacer(RULES);
    for (let i = 0; i < 3; i++) p.runFinished();
    p.rewardedShown(10 * MIN);
    expect(p.shouldShowInterstitial(10 * MIN + 60_000)).toBe(false);
    expect(p.shouldShowInterstitial(10 * MIN + 90_000)).toBe(true);
  });

  it('desactivado no muestra nada', () => {
    const p = new AdPacer({ ...RULES, enabled: false });
    for (let i = 0; i < 10; i++) p.runFinished();
    expect(p.shouldShowInterstitial(60 * MIN)).toBe(false);
  });
});

class FakeProvider implements AdProvider {
  readonly name = 'fake';
  rewarded: RewardedOutcome = 'rewarded';
  interstitials = 0;
  async init() {}
  async showRewarded() {
    return this.rewarded;
  }
  async showInterstitial() {
    this.interstitials++;
    return true;
  }
}

describe('AdService', () => {
  it('silencia el juego mientras dura el anuncio', async () => {
    const seen: string[] = [];
    const off = [events.on('ad:start', () => seen.push('start')), events.on('ad:end', () => seen.push('end'))];
    const ads = new AdService(new FakeProvider());
    expect(await ads.showRewarded('revive')).toBe('rewarded');
    expect(seen).toEqual(['start', 'end']);
    off.forEach((f) => f());
  });

  it('si la red falla, el anuncio cuenta como no disponible', async () => {
    const broken = new FakeProvider();
    broken.showRewarded = async () => {
      throw new Error('sdk caído');
    };
    expect(await new AdService(broken).showRewarded('daily_gift')).toBe('unavailable');
  });

  it('sin anuncios (none) no se ofrece revivir', () => {
    expect(new AdService(new NoAdProvider()).canOfferRevive(0, 5000)).toBe(false);
  });

  it('revivir: una vez por partida y no en partidas muy cortas', () => {
    const ads = new AdService(new FakeProvider());
    const { minDistance, maxPerRun } = ADS_CONFIG.revive;
    expect(ads.canOfferRevive(0, minDistance)).toBe(true);
    expect(ads.canOfferRevive(0, minDistance - 1)).toBe(false);
    expect(ads.canOfferRevive(maxPerRun, 5000)).toBe(false);
  });

  it('entre partidas solo cuando el ritmo lo permite', async () => {
    const provider = new FakeProvider();
    let now = 0;
    const ads = new AdService(provider, new AdPacer(RULES), () => now);
    for (let i = 0; i < 3; i++) ads.runFinished();
    now = 10 * MIN;
    await ads.maybeShowInterstitial('retry');
    await ads.maybeShowInterstitial('retry');
    expect(provider.interstitials).toBe(1);
  });

  it('elige proveedor según las variables de entorno', () => {
    expect(resolveAdProvider(undefined, '')).toBe('mock');
    expect(resolveAdProvider(undefined, 'ca-pub-1')).toBe('adsense');
    expect(resolveAdProvider('adsense', '')).toBe('mock'); // sin cliente no hay AdSense
    expect(resolveAdProvider('none', 'ca-pub-1')).toBe('none');
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('recompensas por anuncio (modo local)', () => {
  it('regalo diario con tope por día UTC', async () => {
    let now = new Date('2026-10-18T10:00:00Z');
    const economy = new LocalEconomyService(memoryStorage());
    const rewards = new LocalAdRewards(economy, memoryStorage(), () => now);
    const { coins, dailyLimit } = ADS_CONFIG.dailyGift;
    for (let i = 0; i < dailyLimit; i++) expect((await rewards.claimGift()).ok).toBe(true);
    expect(await rewards.claimGift()).toEqual({ ok: false, error: 'LIMIT_REACHED' });
    expect(economy.snapshot.coins).toBe(coins * dailyLimit);
    // Día nuevo (UTC): se renueva
    now = new Date('2026-10-19T00:00:01Z');
    expect(rewards.remaining('gift')).toBe(dailyLimit);
  });

  it('duplicar: con mínimo y con tope de monedas extra', async () => {
    const economy = new LocalEconomyService(memoryStorage());
    const rewards = new LocalAdRewards(economy, memoryStorage());
    const { minCoins, maxBonus } = ADS_CONFIG.doubleCoins;
    expect(canOfferDouble(minCoins - 1)).toBe(false);
    expect(await rewards.claimDouble(null, minCoins - 1)).toEqual({ ok: false, error: 'NOT_ELIGIBLE' });
    expect(doubleBonus(maxBonus * 3)).toBe(maxBonus);
    const res = await rewards.claimDouble(null, 300);
    expect(res).toEqual({ ok: true, bonus: 300, coins: 300 });
  });

  it('los usos se recuerdan al recargar el mismo día', async () => {
    const storage = memoryStorage();
    const now = () => new Date('2026-10-18T10:00:00Z');
    const economy = new LocalEconomyService(memoryStorage());
    await new LocalAdRewards(economy, storage, now).claimGift();
    expect(new LocalAdRewards(economy, storage, now).remaining('gift')).toBe(ADS_CONFIG.dailyGift.dailyLimit - 1);
  });
});
