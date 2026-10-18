import { registerSW } from 'virtual:pwa-register';

/**
 * Integración PWA:
 * - Registra el service worker (juego disponible sin conexión).
 * - Avisa cuando hay una versión nueva; se aplica solo cuando el jugador lo pide.
 * - Gestiona la instalación: el aviso nativo en Android/Chrome y las
 *   instrucciones manuales en iPhone/iPad (Safari no tiene aviso de instalación).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | 'none';

export class PwaService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private updateSW?: (reload?: boolean) => Promise<void>;
  private readonly listeners = new Set<() => void>();
  needsUpdate = false;
  offlineReady = false;

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // lo mostramos nosotros con un botón
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.notify();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.notify();
    });
  }

  /** Registra el service worker (solo en producción). */
  register(): void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    this.updateSW = registerSW({
      onNeedRefresh: () => {
        this.needsUpdate = true;
        this.notify();
      },
      onOfflineReady: () => {
        this.offlineReady = true;
        this.notify();
      },
    });
  }

  /** Aplica la versión nueva (recarga la página). */
  async applyUpdate(): Promise<void> {
    await this.updateSW?.(true);
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  /** ¿Ya se está ejecutando como app instalada? */
  static get isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  static get isIOS(): boolean {
    const ua = navigator.userAgent;
    // iPadOS se presenta como Mac: se distingue por la pantalla táctil
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  }

  get installMode(): InstallMode {
    if (PwaService.isStandalone) return 'none';
    if (this.deferredPrompt) return 'prompt';
    if (PwaService.isIOS) return 'ios';
    return 'none';
  }

  /** Muestra el aviso nativo de instalación (Android / Chrome / Edge). */
  async promptInstall(): Promise<boolean> {
    const e = this.deferredPrompt;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.deferredPrompt = null;
    this.notify();
    return outcome === 'accepted';
  }
}
