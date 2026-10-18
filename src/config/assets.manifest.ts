import type { DinoId } from './dinos.config';
import type { ObstacleType } from './obstacles.config';
import type { PowerUpType } from './powerups.config';

/**
 * Manifiesto de assets reales.
 *
 * Mientras un valor sea `null` el juego usa el placeholder geométrico. Para
 * usar un modelo real:
 *   1. Copia el .glb a public/assets/models/...
 *   2. Pon aquí su ruta (relativa a /public), p. ej. 'assets/models/dinos/velociraptor.glb'
 * No hace falta tocar nada más: AssetLoader lo precarga y lo sustituye.
 */
export const ASSET_MANIFEST: {
  dinos: Record<DinoId, string | null>;
  obstacles: Record<ObstacleType, string | null>;
  collectibles: { coin: string | null } & Record<PowerUpType, string | null>;
  /** Rivales de batalla por id (ver rivals.config.ts). Sin entrada = placeholder. */
  rivals: Record<string, string | null>;
} = {
  dinos: {
    compsognathus: null,
    gallimimus: null,
    parasaurolophus: null,
    velociraptor: null,
    stegosaurus: null,
    triceratops: null,
    ankylosaurus: null,
    spinosaurus: null,
    tyrannosaurus: null,
  },
  obstacles: {
    log: null,
    lowBranch: null,
    rock: null,
    tree: null,
    pterodactyl: null, // clips: 'fly'
    geyser: null, // la columna de vapor es procedural; el GLB solo sustituye la boca
    river: null,
  },
  collectibles: {
    coin: null,
    magnet: null,
    shield: null,
    multiplier: null,
    superJump: null,
  },
  rivals: {
    // p. ej. allosaurus: 'assets/models/rivals/allosaurus.glb',
  },
};
