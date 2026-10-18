import { describe, expect, it } from 'vitest';
import { ageGroupFromBirthYear, birthYearOptions, loadAgeGroup, saveAgeGroup } from '@/age/AgeGate';

const NOW = new Date('2026-10-18T12:00:00Z');

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('pregunta de edad', () => {
  it('menores de 13 → modo infantil; ante la duda también', () => {
    expect(ageGroupFromBirthYear(2020, NOW)).toBe('child');
    // Nacido en 2013: puede tener 12 todavía → infantil
    expect(ageGroupFromBirthYear(2013, NOW)).toBe('child');
    // Nacido en 2012: tiene al menos 13
    expect(ageGroupFromBirthYear(2012, NOW)).toBe('teen');
    expect(ageGroupFromBirthYear(1980, NOW)).toBe('teen');
  });

  it('ofrece años del actual hacia atrás, sin sugerir ninguno', () => {
    const years = birthYearOptions(NOW);
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(100);
  });

  it('se recuerda en el dispositivo y no acepta valores raros', () => {
    const storage = memoryStorage();
    expect(loadAgeGroup(storage)).toBeNull();
    saveAgeGroup('child', storage);
    expect(loadAgeGroup(storage)).toBe('child');
    storage.setItem('dinomau:age:v1', '{"group":"admin"}');
    expect(loadAgeGroup(storage)).toBeNull();
    storage.setItem('dinomau:age:v1', 'no-es-json');
    expect(loadAgeGroup(storage)).toBeNull();
  });
});
