import { LocalStore } from '@/storage/LocalStore';

/** Vibración corta si el dispositivo lo permite y el jugador no la desactivó. */
export function vibrate(pattern: number | number[]): void {
  if (!LocalStore.settings.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari no soporta vibración */
  }
}
