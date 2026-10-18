import * as THREE from 'three';
import type { AssetLoader } from '@/assets/AssetLoader';
import type { DinoDefinition } from '@/config/dinos.config';

/**
 * Renderiza un dino en pose de carrera sobre fondo transparente para usarlo
 * en la imagen de historias. Usa un WebGLRenderer propio y temporal (no toca
 * el del juego) y lo libera al terminar.
 */
export function renderDinoPortrait(assets: AssetLoader, dino: DinoDefinition, size = 900): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a8a3a, 1.8));
  const key = new THREE.DirectionalLight(0xffe0b0, 2.2);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xffb13b, 1.5);
  rim.position.set(-4, 3, -3);
  scene.add(key, rim);

  const visual = assets.createDino(dino);
  // Vista de 3/4 mirando hacia la cámara, en mitad de una zancada
  visual.root.rotation.y = Math.PI * 0.78;
  visual.setState('run');
  visual.update(0.37, 1);
  scene.add(visual.root);

  // Encuadre automático según el tamaño real del modelo
  const box = new THREE.Box3().setFromObject(visual.root);
  const center = box.getCenter(new THREE.Vector3());
  const height = box.getSize(new THREE.Vector3()).length();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * 0.95;
  camera.position.set(center.x + distance * 0.25, center.y + distance * 0.18, center.z + distance);
  camera.lookAt(center);

  renderer.render(scene, camera);

  // Copia a un canvas 2D normal antes de liberar el contexto WebGL
  const out = document.createElement('canvas');
  out.width = out.height = size;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
