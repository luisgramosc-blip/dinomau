import es from './es.json';
import en from './en.json';

/**
 * Traducciones mínimas sin dependencias. Español por defecto; para un idioma
 * nuevo añade su JSON aquí con las mismas claves que es.json.
 */
export type Language = 'es' | 'en';
type Dictionary = typeof es;
export type TranslationKey = keyof Dictionary;

const DICTIONARIES: Record<Language, Dictionary> = { es, en };

let current: Language = 'es';

export function setLanguage(lang: Language): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function getLanguage(): Language {
  return current;
}

/** Traduce una clave. Los parámetros se sustituyen en `{nombre}`. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text: string = DICTIONARIES[current][key] ?? DICTIONARIES.es[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

const formatters = new Map<Language, Intl.NumberFormat>();

/**
 * Formatea números según el idioma (2.000 / 2,000). Se fuerza la agrupación
 * porque es-ES por defecto no separa los números de 4 cifras ("2000").
 */
export function formatNumber(n: number): string {
  let f = formatters.get(current);
  if (!f) {
    f = new Intl.NumberFormat(current === 'es' ? 'es-ES' : 'en-US', {
      useGrouping: 'always',
    } as unknown as Intl.NumberFormatOptions);
    formatters.set(current, f);
  }
  return f.format(n);
}
