/**
 * Mantiene la pantalla encendida mientras se juega (Screen Wake Lock API).
 * Si el navegador no lo soporta, no hace nada.
 */
type WakeLockSentinel = { release(): Promise<void>; released: boolean };

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export async function keepScreenOn(): Promise<void> {
  wanted = true;
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock;
  if (!wl || (sentinel && !sentinel.released) || document.hidden) return;
  try {
    sentinel = await wl.request('screen');
  } catch {
    /* sin permiso (p. ej. batería baja): no pasa nada */
  }
}

export function allowScreenOff(): void {
  wanted = false;
  void sentinel?.release().catch(() => {});
  sentinel = null;
}

// El sistema libera el bloqueo al cambiar de app: se recupera al volver
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wanted) void keepScreenOn();
});
