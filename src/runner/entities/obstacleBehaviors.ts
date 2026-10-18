import type * as THREE from 'three';
import { GEYSER_CYCLE, PTERODACTYL_FLIGHT, type ObstacleType } from '@/config/obstacles.config';
import type { Obstacle } from './Obstacle';

/**
 * Comportamientos de los obstáculos "vivos". Cada función recibe el
 * obstáculo, el tiempo de partida y su z actual, anima su malla y decide si
 * en este momento hace daño (`o.harmful`).
 *
 * Las piezas se buscan por nombre (flier, wingL, wingR, shadow, steam): un GLB
 * real puede incluirlas con esos nombres para recibir la misma animación.
 */
export type ObstacleBehavior = (o: Obstacle, time: number, z: number) => void;

const GEYSER_PERIOD = GEYSER_CYCLE.rest + GEYSER_CYCLE.warning + GEYSER_CYCLE.erupt;

function part(o: Obstacle, name: string): THREE.Object3D | undefined {
  // Caché simple en el propio objeto para no recorrer el árbol cada frame
  const cache = (o.object.userData.parts ??= {}) as Record<string, THREE.Object3D | undefined>;
  if (!(name in cache)) cache[name] = o.object.getObjectByName(name);
  return cache[name];
}

const pterodactyl: ObstacleBehavior = (o, time, z) => {
  const { startHeight, diveStartZ, diveEndZ } = PTERODACTYL_FLIGHT;
  const cruise = o.def.hitbox.baseY + o.def.hitbox.height / 2;
  // 0 = lejos y alto, 1 = ya en vuelo rasante
  const t = Math.min(1, Math.max(0, (z - diveStartZ) / (diveEndZ - diveStartZ)));
  const ease = t * t * (3 - 2 * t);
  const y = startHeight + (cruise - startHeight) * ease + Math.sin(time * 3 + o.d) * 0.08 * ease;

  const flier = part(o, 'flier');
  if (o.stunnedAt >= 0) {
    // Aturdido por un rugido: sale despedido hacia arriba girando y deja de ser peligroso
    const s = time - o.stunnedAt;
    if (flier) {
      flier.position.y = y + s * s * 14 + s * 4;
      flier.rotation.z = s * 9;
    }
    o.harmful = false;
    return;
  }
  if (flier) {
    flier.position.y = y;
    flier.rotation.z = 0;
    flier.rotation.x = (1 - ease) * 0.5 * Math.sin(Math.PI * t); // se inclina al picar
  }
  const flap = Math.sin(time * (ease > 0.9 ? 16 : 9) + o.d) * 0.65;
  const wingR = part(o, 'wingR');
  const wingL = part(o, 'wingL');
  if (wingR) wingR.rotation.z = flap;
  if (wingL) wingL.rotation.z = -flap;

  const shadow = part(o, 'shadow');
  if (shadow) shadow.scale.set(1.4 * (0.4 + 0.6 * ease), 0.7 * (0.4 + 0.6 * ease), 1);
  o.harmful = true;
};

const geyser: ObstacleBehavior = (o, time) => {
  // Desfase determinista por posición para que no erupcionen todos a la vez
  const phase = (time + o.d * 0.37) % GEYSER_PERIOD;
  const steam = part(o, 'steam');
  let height: number;

  if (phase < GEYSER_CYCLE.rest) {
    height = 0;
  } else if (phase < GEYSER_CYCLE.rest + GEYSER_CYCLE.warning) {
    // Aviso: burbujeo bajo que crece
    const w = (phase - GEYSER_CYCLE.rest) / GEYSER_CYCLE.warning;
    height = 0.12 + w * 0.12 + Math.sin(time * 40) * 0.03;
  } else {
    const e = (phase - GEYSER_CYCLE.rest - GEYSER_CYCLE.warning) / GEYSER_CYCLE.erupt;
    // Sube rápido, se mantiene y cae al final
    height = e < 0.15 ? e / 0.15 : e > 0.85 ? (1 - e) / 0.15 : 1;
  }

  if (steam) {
    steam.visible = height > 0.01;
    steam.scale.set(0.8 + height * 0.3, Math.max(height, 0.01), 0.8 + height * 0.3);
    steam.rotation.y = time * 2;
  }
  // Solo hace daño cuando la columna ya es alta
  o.harmful = height > 0.3;
};

export const OBSTACLE_BEHAVIORS: Partial<Record<ObstacleType, ObstacleBehavior>> = {
  pterodactyl,
  geyser,
};
