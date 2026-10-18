import { describe, expect, it } from 'vitest';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';
import { formatNumber, setLanguage, t } from '@/i18n/i18n';

describe('i18n', () => {
  it('es.json y en.json tienen las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('sustituye parámetros', () => {
    expect(t('shop.missing', { value: 5 })).toBe('Te faltan 5 monedas');
  });

  it('agrupa miles también con 4 cifras', () => {
    globalThis.document ??= { documentElement: {} } as Document;
    setLanguage('es');
    expect(formatNumber(2000)).toBe('2.000');
    expect(formatNumber(120000)).toBe('120.000');
    setLanguage('en');
    expect(formatNumber(2000)).toBe('2,000');
    setLanguage('es');
  });
});
