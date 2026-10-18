import type { Language } from '@/i18n/i18n';

/**
 * Datos que se guardan en el dispositivo: ajustes y récord local (para
 * invitados). El récord "oficial" vivirá en Supabase desde la Fase 5.
 * localStorage puede fallar (modo privado, cuotas): todo va en try/catch y el
 * juego funciona igual aunque no se pueda guardar.
 */
export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  language: Language;
}

export interface LocalData {
  version: 1;
  bestScore: number;
  bestDistance: number;
  totalRuns: number;
  battlesWon: number;
  battlesLost: number;
  settings: Settings;
}

const KEY = 'dinomau:v1';

const DEFAULTS: LocalData = {
  version: 1,
  bestScore: 0,
  bestDistance: 0,
  totalRuns: 0,
  battlesWon: 0,
  battlesLost: 0,
  settings: { sound: true, music: true, vibration: true, language: 'es' },
};

function load(): LocalData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<LocalData>;
    return { ...DEFAULTS, ...parsed, settings: { ...DEFAULTS.settings, ...parsed.settings } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let data = load();
const listeners = new Set<(s: Settings) => void>();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* sin almacenamiento disponible: se mantiene en memoria */
  }
}

export const LocalStore = {
  get settings(): Readonly<Settings> {
    return data.settings;
  },

  updateSettings(patch: Partial<Settings>): void {
    data.settings = { ...data.settings, ...patch };
    save();
    listeners.forEach((l) => l(data.settings));
  },

  onSettingsChange(listener: (s: Settings) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  get bestScore(): number {
    return data.bestScore;
  },

  /** Registra una partida y devuelve si es nuevo récord. */
  recordRun(score: number, distance: number): boolean {
    const isRecord = score > data.bestScore;
    data.totalRuns += 1;
    if (isRecord) data.bestScore = score;
    data.bestDistance = Math.max(data.bestDistance, distance);
    save();
    return isRecord;
  },

  get battlesWon(): number {
    return data.battlesWon;
  },

  recordBattle(won: boolean): void {
    if (won) data.battlesWon += 1;
    else data.battlesLost += 1;
    save();
  },

  /** Solo para tests. */
  _reset(): void {
    data = structuredClone(DEFAULTS);
  },
};
