/**
 * Catálogo de dinosaurios.
 *
 * ⚠️ Los PRECIOS que valen son los de la tabla `public.dinos` del servidor; este
 * archivo es el espejo para el cliente (UI, modelos, colores placeholder).
 * Si cambias un precio aquí, cámbialo también en una migración.
 */

export type DinoId =
  | 'compsognathus'
  | 'gallimimus'
  | 'parasaurolophus'
  | 'velociraptor'
  | 'stegosaurus'
  | 'triceratops'
  | 'ankylosaurus'
  | 'spinosaurus'
  | 'tyrannosaurus';

export type DinoAbility =
  | 'none'
  | 'fast_runner'
  | 'stun_roar'
  | 'double_jump'
  | 'plate_shield'
  | 'rock_breaker'
  | 'tail_club'
  | 'swimmer'
  | 'apex_power';

/** Rasgos de la silueta placeholder (se ignoran cuando hay GLB real). */
export interface DinoPlaceholderLook {
  body: number;
  belly: number;
  accent: number;
  /** Escala global del modelo. */
  scale: number;
  /** Piezas extra para que cada placeholder se distinga. */
  features: Array<'crest' | 'plates' | 'horns' | 'club' | 'sail' | 'bigHead' | 'longNeck'>;
}

export interface DinoDefinition {
  id: DinoId;
  /** Clave i18n del nombre (dinos.<id>.name) */
  name: string;
  price: number;
  /** 1–10 */
  speed: number;
  /** 1–10 */
  agility: number;
  /** 1–100 */
  battlePower: number;
  ability: DinoAbility;
  look: DinoPlaceholderLook;
}

export const DINOS: readonly DinoDefinition[] = [
  {
    id: 'compsognathus', name: 'Compsognathus', price: 0,
    speed: 3, agility: 6, battlePower: 8, ability: 'none',
    look: { body: 0x7cc242, belly: 0xd8f0a0, accent: 0x3f7a1f, scale: 0.8, features: [] },
  },
  {
    id: 'gallimimus', name: 'Gallimimus', price: 2000,
    speed: 7, agility: 6, battlePower: 14, ability: 'fast_runner',
    look: { body: 0xd9a441, belly: 0xf5e2b0, accent: 0x8a5a1c, scale: 0.95, features: ['longNeck'] },
  },
  {
    id: 'parasaurolophus', name: 'Parasaurolophus', price: 5000,
    speed: 5, agility: 5, battlePower: 22, ability: 'stun_roar',
    look: { body: 0x4fa3a5, belly: 0xc9ece6, accent: 0xe0603a, scale: 1.05, features: ['crest'] },
  },
  {
    id: 'velociraptor', name: 'Velociraptor', price: 10000,
    speed: 7, agility: 9, battlePower: 35, ability: 'double_jump',
    look: { body: 0x9b6a3c, belly: 0xe8c99a, accent: 0x3b2614, scale: 0.95, features: [] },
  },
  {
    id: 'stegosaurus', name: 'Stegosaurus', price: 20000,
    speed: 4, agility: 4, battlePower: 48, ability: 'plate_shield',
    look: { body: 0x6f8f3a, belly: 0xd4dca0, accent: 0xe07b2a, scale: 1.1, features: ['plates'] },
  },
  {
    id: 'triceratops', name: 'Triceratops', price: 35000,
    speed: 5, agility: 4, battlePower: 60, ability: 'rock_breaker',
    look: { body: 0x8a6fb0, belly: 0xe2d6ef, accent: 0xf2e6c8, scale: 1.1, features: ['horns'] },
  },
  {
    id: 'ankylosaurus', name: 'Ankylosaurus', price: 50000,
    speed: 4, agility: 3, battlePower: 72, ability: 'tail_club',
    look: { body: 0x7d6a55, belly: 0xcbbfa8, accent: 0x4a3c2c, scale: 1.1, features: ['club', 'plates'] },
  },
  {
    id: 'spinosaurus', name: 'Spinosaurus', price: 75000,
    speed: 6, agility: 6, battlePower: 85, ability: 'swimmer',
    look: { body: 0x3e7ab8, belly: 0xbfdcf2, accent: 0xd94a3a, scale: 1.15, features: ['sail'] },
  },
  {
    id: 'tyrannosaurus', name: 'Tyrannosaurus Rex', price: 120000,
    speed: 6, agility: 5, battlePower: 100, ability: 'apex_power',
    look: { body: 0xb5442e, belly: 0xf0c9a0, accent: 0x4a1a10, scale: 1.2, features: ['bigHead'] },
  },
];

export const STARTER_DINO: DinoId = 'compsognathus';

export function getDino(id: DinoId): DinoDefinition {
  const dino = DINOS.find((d) => d.id === id);
  if (!dino) throw new Error(`Dino desconocido: ${id}`);
  return dino;
}

// --- Efecto de las estadísticas en el runner ----------------------------------

/**
 * Cómo afectan las estadísticas al runner (el poder de batalla se usa en la
 * Fase 4). Ajusta aquí el balance sin tocar la lógica.
 */
export const STAT_EFFECTS = {
  /** +5 % de puntaje por cada punto de velocidad por encima de 3. */
  scorePerSpeedPoint: 0.05,
  /** Cada punto de agilidad acorta un 4 % el cambio de carril y el rodar (base: agilidad 5). */
  agilityPerPoint: 0.04,
} as const;

export interface DinoModifiers {
  scoreMultiplier: number;
  /** Multiplicador sobre el tiempo de cambio de carril y de rodar (< 1 = más ágil). */
  agilityFactor: number;
}

export function dinoModifiers(dino: DinoDefinition): DinoModifiers {
  return {
    scoreMultiplier: 1 + Math.max(0, dino.speed - 3) * STAT_EFFECTS.scorePerSpeedPoint,
    agilityFactor: 1 - (dino.agility - 5) * STAT_EFFECTS.agilityPerPoint,
  };
}

/** Parámetros de las habilidades especiales. */
export const ABILITY_CONFIG = {
  fast_runner: { sprintDistance: 250, speedMultiplier: 1.6 },
  stun_roar: { range: 28, cooldown: 5 },
  double_jump: { extraJumps: 1, secondJumpHeight: 1.4 },
  plate_shield: { hitsPerRun: 1, graceTime: 1.2 },
  rock_breaker: { breaks: ['rock'] as const },
  swimmer: { dip: 0.45 },
} as const;

/** Icono de cada habilidad para la UI (hasta tener iconos reales). */
export const ABILITY_ICONS: Record<DinoAbility, string> = {
  none: '🌱',
  fast_runner: '💨',
  stun_roar: '📣',
  double_jump: '⏫',
  plate_shield: '🛡️',
  rock_breaker: '💥',
  tail_club: '🔨',
  swimmer: '🌊',
  apex_power: '👑',
};
