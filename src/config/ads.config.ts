/**
 * Anuncios: dónde salen, cada cuánto y qué dan.
 *
 * Los límites que dan monedas (x2 y regalo diario) los aplica SIEMPRE el
 * servidor con `game_config.ads` (ver supabase/migrations/*_ads.sql); aquí
 * están repetidos para mostrar la UI correcta. Si cambias uno, cambia el otro
 * (tests/unit/ConfigSync.test.ts lo comprueba).
 *
 * Proveedor (variable VITE_ADS_PROVIDER):
 *   - 'mock'    anuncio de prueba propio (por defecto mientras no haya AdSense)
 *   - 'adsense' Google AdSense para juegos (H5 Games Ads), necesita VITE_ADSENSE_CLIENT
 *   - 'none'    sin anuncios: los botones de anuncio no aparecen
 */
export type AdProviderName = 'mock' | 'adsense' | 'none';

export const ADS_CONFIG = {
  /** Revivir tras chocar viendo un anuncio. */
  revive: {
    enabled: true,
    maxPerRun: 1,
    /** Segundos para decidir antes de que la partida termine sola. */
    offerSeconds: 6,
    /** No se ofrece en partidas muy cortas (metros). */
    minDistance: 150,
    /** Invulnerabilidad al volver (parpadea). */
    invulnerableSeconds: 2.5,
    /** Se quitan los obstáculos de los próximos metros para no volver a ciegas. */
    clearAheadMeters: 45,
  },

  /** Duplicar las monedas de la partida en el fin de partida. */
  doubleCoins: {
    enabled: true,
    /** Por debajo de esto no merece la pena ofrecerlo. */
    minCoins: 20,
    dailyLimit: 5,
    /** Tope de monedas extra por anuncio. */
    maxBonus: 2000,
    /** Minutos tras terminar la partida durante los que se puede duplicar. */
    windowMinutes: 15,
  },

  /** Regalo diario: monedas gratis por anuncio desde el menú. */
  dailyGift: {
    enabled: true,
    coins: 150,
    dailyLimit: 3,
  },

  /** Anuncio de pantalla completa entre partidas (sin recompensa). */
  interstitial: {
    enabled: true,
    /** Las primeras partidas de cada visita nunca llevan anuncio. */
    graceRuns: 2,
    /** Como mucho uno cada N partidas… */
    everyNRuns: 3,
    /** …y nunca dos con menos de estos segundos entre medias. */
    minIntervalSeconds: 180,
    /** Tras un anuncio con recompensa se espera esto antes del siguiente. */
    afterRewardedSeconds: 90,
  },

  /** Anuncio de prueba (proveedor 'mock'). */
  mock: {
    rewardedSeconds: 5,
    interstitialSeconds: 3,
  },
} as const;

/** Lugares donde se muestra un anuncio con recompensa. */
export type RewardedPlacement = 'revive' | 'double_coins' | 'daily_gift';
/** Lugares donde puede salir un anuncio entre partidas. */
export type InterstitialPlacement = 'retry' | 'menu';
/** Recompensas que dan monedas (las valida el servidor). */
export type AdRewardKind = 'double' | 'gift';

const env = import.meta.env;
export const ADSENSE_CLIENT = (env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || '';

/** Proveedor elegido: el de VITE_ADS_PROVIDER, o AdSense si hay cliente, o el de prueba. */
export function resolveAdProvider(
  requested = (env.VITE_ADS_PROVIDER as string | undefined)?.trim(),
  client = ADSENSE_CLIENT,
): AdProviderName {
  if (requested === 'none' || requested === 'mock') return requested;
  if (requested === 'adsense') return client ? 'adsense' : 'mock';
  return client ? 'adsense' : 'mock';
}
