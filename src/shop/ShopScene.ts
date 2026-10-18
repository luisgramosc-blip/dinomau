import * as THREE from 'three';
import { DINOS, type DinoId } from '@/config/dinos.config';
import type { AssetLoader } from '@/assets/AssetLoader';
import type { DinoVisual } from '@/assets/DinoVisual';
import { GEO, mergeColoredParts, vertexColorMat } from '@/assets/placeholders/geometryUtils';
import type { Renderable, Updatable } from '@/core/Game';
import { blobShadowMat, PALETTE } from '@/engine/materials';
import type { Renderer } from '@/engine/Renderer';

const AUTO_SPIN = 0.6;
const ENTER_TIME = 0.35;

/**
 * Vista 3D de la tienda: el dino seleccionado gira sobre un pedestal de roca.
 * Se puede arrastrar para girarlo a mano. Los modelos se crean la primera vez
 * que se ven y se reutilizan.
 */
export class ShopScene implements Updatable, Renderable {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private readonly turntable = new THREE.Group();
  private readonly visuals = new Map<DinoId, DinoVisual>();
  private current?: DinoVisual;
  private currentId?: DinoId;
  private enterTimer = ENTER_TIME;
  private enterDir = 1;
  private dragging = false;
  private lastX = 0;
  private spinVelocity = AUTO_SPIN;
  private locked = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly assets: AssetLoader,
    dragTarget: HTMLElement,
  ) {
    this.scene.background = new THREE.Color(0x2b1a0e);
    this.scene.fog = new THREE.Fog(0x2b1a0e, 9, 22);
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a2a1a, 1.7));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.2);
    key.position.set(3, 6, 4);
    const rim = new THREE.DirectionalLight(0x7cc242, 1.4);
    rim.position.set(-4, 3, -4);
    this.scene.add(key, rim);

    this.buildStage();
    this.scene.add(this.turntable);
    renderer.onResize((w, h) => this.resize(w, h));
    this.bindDrag(dragTarget);
  }

  private buildStage(): void {
    const pedestal = mergeColoredParts([
      { geometry: GEO.cyl8, color: PALETTE.rockDark, position: [0, -0.3, 0], scale: [1.7, 0.6, 1.7] },
      { geometry: GEO.cyl8, color: PALETTE.rock, position: [0, 0.02, 0], scale: [1.55, 0.08, 1.55] },
      { geometry: GEO.cyl8, color: PALETTE.grass, position: [0, 0.07, 0], scale: [1.35, 0.04, 1.35] },
    ]);
    this.turntable.add(new THREE.Mesh(pedestal, vertexColorMat()));

    // Decoración fija alrededor (no gira)
    const decor = mergeColoredParts([
      { geometry: GEO.cone4, color: PALETTE.leafDark, position: [-2.4, 0.6, -1.5], rotation: [0, 0, 0.3], scale: [0.35, 1.6, 0.1] },
      { geometry: GEO.cone4, color: PALETTE.leaf, position: [-2.1, 0.5, -1.2], rotation: [0, 0, -0.4], scale: [0.3, 1.3, 0.1] },
      { geometry: GEO.cone4, color: PALETTE.leafDark, position: [2.3, 0.6, -1.4], rotation: [0, 0, -0.3], scale: [0.35, 1.6, 0.1] },
      { geometry: GEO.dodeca, color: PALETTE.rock, position: [2.0, 0.1, 0.6], scale: [0.4, 0.3, 0.4] },
      { geometry: GEO.dodeca, color: PALETTE.rockDark, position: [-1.9, 0.05, 0.8], scale: 0.3 },
      { geometry: GEO.circle, color: 0x3d2a1a, position: [0, -0.6, 0], rotation: [-Math.PI / 2, 0, 0], scale: [9, 9, 1] },
    ]);
    this.scene.add(new THREE.Mesh(decor, vertexColorMat()));

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), blobShadowMat());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.1;
    this.turntable.add(shadow);
  }

  private resize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // En vertical se aleja la cámara para que el dino quepa encima del panel inferior
    const portrait = aspect < 1;
    // En horizontal ancho el panel va a la derecha (ver .screen--shop en CSS)
    const sidePanel = aspect >= 1.2 && width >= 800;
    this.camera.fov = portrait ? 46 : 36;
    this.camera.position.set(0, portrait ? 2.4 : 2.2, portrait ? 8.8 : 7.6);
    // Mirar por debajo del pedestal sube al dino en pantalla, por encima del panel inferior
    this.camera.lookAt(0, portrait ? -1.05 : 0.5, 0);
    if (sidePanel) {
      // Desplaza el encuadre para que el dino quede centrado en el hueco izquierdo
      this.camera.setViewOffset(width, height, width * 0.2, 0, width, height);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  private bindDrag(target: HTMLElement): void {
    target.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.turntable.rotation.y += dx * 0.012;
      this.spinVelocity = dx * 0.4;
    });
    const end = () => (this.dragging = false);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  /** Muestra un dino. `direction` indica de qué lado entra (1 = derecha). */
  show(id: DinoId, direction = 1, locked = false): void {
    if (this.current) this.turntable.remove(this.current.root);
    let visual = this.visuals.get(id);
    if (!visual) {
      visual = this.assets.createDino(DINOS.find((d) => d.id === id)!);
      this.visuals.set(id, visual);
    }
    visual.root.position.set(0, 0.09, 0);
    visual.root.rotation.set(0, 0, 0);
    visual.setState('idle');
    this.turntable.add(visual.root);
    this.current = visual;
    this.currentId = id;
    this.locked = locked;
    this.enterTimer = 0;
    this.enterDir = direction;
  }

  /** Actualiza el estado bloqueado del dino mostrado (p. ej. tras comprarlo). */
  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  get shownId(): DinoId | undefined {
    return this.currentId;
  }

  update(dt: number): void {
    if (!this.dragging) {
      // Inercia del arrastre que vuelve suavemente al giro automático
      this.spinVelocity += (AUTO_SPIN - this.spinVelocity) * Math.min(1, dt * 2);
      this.turntable.rotation.y += this.spinVelocity * dt;
    }
    if (this.current) {
      this.current.update(dt, 1);
      if (this.enterTimer < ENTER_TIME) {
        this.enterTimer = Math.min(ENTER_TIME, this.enterTimer + dt);
        const t = this.enterTimer / ENTER_TIME;
        const ease = 1 - Math.pow(1 - t, 3);
        // Entra deslizándose y con un pequeño rebote
        this.current.root.position.x = (1 - ease) * 2.5 * this.enterDir;
        this.current.root.position.y = 0.09 + Math.sin(t * Math.PI) * 0.3;
      }
      // Bloqueado: tamaño algo menor para reforzar el estado
      const targetScale = this.locked ? 0.92 : 1;
      this.turntable.scale.setScalar(this.turntable.scale.x + (targetScale - this.turntable.scale.x) * Math.min(1, dt * 8));
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
