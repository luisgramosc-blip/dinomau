import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/game.config';

/**
 * Envoltorio del WebGLRenderer: pixel ratio limitado, resize y detección
 * básica de gama baja.
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  private resizeListeners: Array<(w: number, h: number) => void> = [];

  constructor(private readonly container: HTMLElement) {
    const lowEnd = isLowEndDevice();
    this.three = new THREE.WebGLRenderer({
      antialias: !lowEnd,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.three.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : GAME_CONFIG.render.maxPixelRatio),
    );
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.domElement.classList.add('game-canvas');
    container.appendChild(this.three.domElement);

    window.addEventListener('resize', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  /** Pixel ratio máximo que tiene sentido en este dispositivo. */
  get maxPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, GAME_CONFIG.render.maxPixelRatio);
  }

  get pixelRatio(): number {
    return this.three.getPixelRatio();
  }

  /** Cambia la resolución interna (calidad adaptativa). */
  setPixelRatio(ratio: number): void {
    this.three.setPixelRatio(ratio);
    this.handleResize();
  }

  onResize(listener: (w: number, h: number) => void): void {
    this.resizeListeners.push(listener);
    listener(this.width, this.height);
  }

  get width(): number {
    return this.container.clientWidth || window.innerWidth;
  }

  get height(): number {
    return this.container.clientHeight || window.innerHeight;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }

  private handleResize = (): void => {
    const w = this.width;
    const h = this.height;
    this.three.setSize(w, h, false);
    for (const l of this.resizeListeners) l(w, h);
  };
}

/** Heurística simple; la Fase 8 añade calidad adaptativa según FPS reales. */
function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  return cores <= 4 && memory <= 3;
}
