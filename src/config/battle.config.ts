/**
 * Reglas de las batallas.
 *
 * La parte ECONÓMICA (umbral, multiplicador, penalización, objetivo y tope) es
 * espejo de `game_config.battle` en Supabase: el servidor recalcula el efecto
 * en monedas con SUS valores al cerrar la partida. La parte de JUEGO (QTE,
 * daño) solo vive en el cliente.
 */
export const BATTLE_CONFIG = {
  // --- Economía (mantener igual que en el servidor) ---------------------------
  /** Cada cuántas monedas RECOGIDAS en pista se lanza una batalla. */
  coinThreshold: 500,
  /** Multiplicador al ganar. */
  winMultiplier: 2,
  /** Monedas que se pierden al perder. */
  lossPenalty: 100,
  /** 'run' = multiplica las monedas de la partida; 'total' = el saldo total. */
  multiplyTarget: 'run' as 'run' | 'total',
  /** Ganancia máxima por batalla (protege la economía). */
  maxGainPerBattle: 5000,

  // --- Minijuego ---------------------------------------------------------------
  /** Duración del minijuego en segundos [mín, máx]. */
  durationRange: [15, 20] as const,
  /** Presentación "¡Batalla!" antes de empezar (no cuenta en la duración). */
  introTime: 2.2,
  /** Tiempo mostrando victoria/derrota antes de poder continuar. */
  outroTime: 1.6,
  /** Cuenta regresiva al volver al runner. */
  resumeCountdown: 3,
  /** Metros por delante que se limpian de obstáculos al volver. */
  clearAheadOnResume: 45,

  /** Vida de cada luchador. */
  maxHp: 100,
  /** Fase de ataque: duración y daño base por toque (con poderes iguales). */
  attack: { duration: 2.6, tapDamage: 2.4, maxTapsPerSecond: 12 },
  /** Fase de defensa: número de ataques del rival y su ritmo. */
  defend: {
    attacksPerPhase: [2, 3] as const,
    /** Tiempo de aviso (anillo que se cierra) para el rival más débil y el más fuerte. */
    telegraph: { easy: 1.05, hard: 0.62 },
    gapBetweenAttacks: 0.35,
    /** Ventanas de acierto alrededor del impacto (s). */
    perfectWindow: 0.13,
    goodWindow: 0.28,
    /** Daño recibido (con poderes iguales) y contraataque al esquivar perfecto. */
    missDamage: 16,
    goodDamage: 4,
    /** Incluso esquivando perfecto, un rival más fuerte roza (se divide por el factor de poder). */
    perfectChip: 3,
    perfectCounter: 6,
  },
  /** El cociente de poderes se eleva a este exponente: 0 = solo habilidad, 1 = solo poder. */
  powerInfluence: 0.8,
  /** Límites del cociente de poderes para que ninguna batalla sea imposible. */
  powerRatioClamp: [0.2, 3] as const,
  /** Bonus de habilidades de batalla. */
  abilities: {
    tail_club: { counterMultiplier: 2 },
    apex_power: { tapMultiplier: 1.25 },
  },
};

export type BattleConfig = typeof BATTLE_CONFIG;
