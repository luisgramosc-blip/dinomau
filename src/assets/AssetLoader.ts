import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSET_MANIFEST } from '@/config/assets.manifest';
import type { DinoDefinition } from '@/config/dinos.config';
import type { ObstacleType } from '@/config/obstacles.config';
import type { PowerUpType } from '@/config/powerups.config';
import type { RivalDefinition } from '@/config/rivals.config';
import { GltfDinoVisual, PlaceholderDinoVisual, type DinoVisual } from './DinoVisual';
import { createDinoPlaceholder } from './placeholders/dinoPlaceholder';
import { createCoinMesh, createObstacleMesh, createPowerUpMesh } from './placeholders/obstaclePlaceholders';

/**
 * Punto único de acceso a modelos. Si el manifiesto tiene una ruta GLB se usa
 * el modelo real; si no (o si falla la carga), el placeholder geométrico.
 */
export class AssetLoader {
  private readonly gltf = new GLTFLoader();
  private readonly cache = new Map<string, GLTF>();

  /** Precarga todos los GLB declarados en el manifiesto. Nunca lanza error. */
  async preload(onProgress?: (ratio: number) => void): Promise<void> {
    const paths = [
      ...Object.values(ASSET_MANIFEST.dinos),
      ...Object.values(ASSET_MANIFEST.obstacles),
      ...Object.values(ASSET_MANIFEST.collectibles),
      ...Object.values(ASSET_MANIFEST.rivals),
    ].filter((p): p is string => !!p);

    let done = 0;
    await Promise.all(
      paths.map(async (path) => {
        try {
          this.cache.set(path, await this.gltf.loadAsync(`${import.meta.env.BASE_URL}${path}`));
        } catch (err) {
          console.warn(`[assets] No se pudo cargar ${path}, se usará el placeholder`, err);
        }
        onProgress?.(++done / paths.length);
      }),
    );
    if (paths.length === 0) onProgress?.(1);
  }

  createDino(def: DinoDefinition): DinoVisual {
    const path = ASSET_MANIFEST.dinos[def.id];
    const model = path ? this.cache.get(path) : undefined;
    if (model) return new GltfDinoVisual(cloneSkinned(model.scene), model.animations);
    return new PlaceholderDinoVisual(createDinoPlaceholder(def));
  }

  /** Rival de batalla: usa `ASSET_MANIFEST.rivals[id]` si existe; si no, un placeholder con su aspecto. */
  createRival(rival: RivalDefinition): DinoVisual {
    const path = ASSET_MANIFEST.rivals[rival.id];
    const model = path ? this.cache.get(path) : undefined;
    if (model) return new GltfDinoVisual(cloneSkinned(model.scene), model.animations);
    // El placeholder solo necesita el aspecto; el resto de campos no se usa
    const pseudo = { id: rival.id, name: rival.name, look: rival.look } as unknown as DinoDefinition;
    return new PlaceholderDinoVisual(createDinoPlaceholder(pseudo));
  }

  createObstacle(type: ObstacleType): THREE.Object3D {
    const path = ASSET_MANIFEST.obstacles[type];
    const model = path ? this.cache.get(path) : undefined;
    if (!model) return createObstacleMesh(type);

    if (type === 'pterodactyl' || type === 'geyser') {
      // Se conserva el esqueleto animable del placeholder y solo se cambia la malla
      const rig = createObstacleMesh(type);
      const slot = type === 'pterodactyl' ? rig.getObjectByName('flier')! : rig.children[0];
      const real = model.scene.clone();
      if (type === 'pterodactyl') {
        slot.clear();
        slot.add(real);
      } else {
        rig.remove(slot);
        rig.add(real);
      }
      return rig;
    }
    return model.scene.clone();
  }

  createCoin(radius: number): THREE.Object3D {
    const path = ASSET_MANIFEST.collectibles.coin;
    const model = path ? this.cache.get(path) : undefined;
    return model ? model.scene.clone() : createCoinMesh(radius);
  }

  createPowerUp(type: PowerUpType): THREE.Object3D {
    const path = ASSET_MANIFEST.collectibles[type];
    const model = path ? this.cache.get(path) : undefined;
    const object = createPowerUpMesh(type);
    if (model) {
      // Mantiene el halo y reemplaza el objeto interior
      object.remove(object.children[0]);
      object.add(model.scene.clone());
      object.children.reverse();
    }
    return object;
  }
}
