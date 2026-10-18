/**
 * Colisiones por cajas alineadas a los ejes (AABB). Con 3 carriles y
 * obstáculos rectangulares es suficiente, barato y predecible para el jugador.
 */
export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export function createAABB(): AABB {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
}

export function intersects(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}

/** Penetración en X y Z; sirve para distinguir choque frontal de lateral. */
export function overlap(a: AABB, b: AABB): { x: number; z: number } {
  return {
    x: Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
    z: Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
  };
}

/** Coloca en `out` la caja de un obstáculo centrado en (x, 0, z). */
export function setBox(
  out: AABB,
  x: number,
  z: number,
  box: { width: number; height: number; depth: number; baseY: number },
): AABB {
  out.minX = x - box.width / 2;
  out.maxX = x + box.width / 2;
  out.minY = box.baseY;
  out.maxY = box.baseY + box.height;
  out.minZ = z - box.depth / 2;
  out.maxZ = z + box.depth / 2;
  return out;
}
