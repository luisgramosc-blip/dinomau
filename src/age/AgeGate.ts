/**
 * Edad del jugador (pregunta neutra del año de nacimiento, una sola vez).
 *
 * Los menores de 13 años juegan en "modo infantil": sin cuenta, sin ranking,
 * sin invitaciones ni compartir en redes, con el progreso solo en el
 * dispositivo y anuncios no personalizados. Así no se recogen datos
 * personales de menores (COPPA y leyes parecidas).
 *
 * La respuesta se guarda en el dispositivo y no se puede cambiar desde el
 * juego (para que un menor no pueda "volver a intentarlo" con otro año).
 */
export type AgeGroup = 'child' | 'teen';

/** Edad mínima para tener cuenta y anuncios personalizados. */
export const MIN_ACCOUNT_AGE = 13;
const KEY = 'dinomau:age:v1';

/**
 * Con solo el año no se sabe si ya cumplió años: ante la duda, modo infantil.
 * (Nacido hace exactamente 13 años puede tener todavía 12.)
 */
export function ageGroupFromBirthYear(birthYear: number, now = new Date()): AgeGroup {
  return now.getFullYear() - birthYear > MIN_ACCOUNT_AGE ? 'teen' : 'child';
}

/** Años que se ofrecen en la pregunta (del actual hacia atrás). */
export function birthYearOptions(now = new Date(), span = 100): number[] {
  const current = now.getFullYear();
  return Array.from({ length: span }, (_, i) => current - i);
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

export function loadAgeGroup(storage: Store = safeStorage()): AgeGroup | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const group = (JSON.parse(raw) as { group?: unknown }).group;
    return group === 'child' || group === 'teen' ? group : null;
  } catch {
    return null;
  }
}

export function saveAgeGroup(group: AgeGroup, storage: Store = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ group, at: new Date().toISOString() }));
  } catch {
    /* sin almacenamiento: se volverá a preguntar la próxima vez */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
