import type { DinoPlaceholderLook } from './dinos.config';

/**
 * Escalera de rivales. Cada batalla GANADA sube un escalón (cada vez un rival
 * más fuerte); al perder se repite el mismo. Pasado el último, el poder sigue
 * creciendo `POWER_GROWTH_AFTER_LADDER` por victoria.
 *
 * Tras cambiar poderes, revisa la tabla con `npm run balance`.
 */
export interface RivalDefinition {
  id: string;
  name: string;
  power: number;
  look: DinoPlaceholderLook;
}

export const RIVALS: readonly RivalDefinition[] = [
  { id: 'dilophosaurus', name: 'Dilophosaurus', power: 10,
    look: { body: 0x9fbf3a, belly: 0xf0e8a0, accent: 0xe8413c, scale: 0.85, features: ['crest'] } },
  { id: 'raptor_salvaje', name: 'Raptor salvaje', power: 18,
    look: { body: 0x6b7f4a, belly: 0xd8d0a0, accent: 0x2b1a0e, scale: 0.95, features: [] } },
  { id: 'carnotaurus', name: 'Carnotaurus', power: 28,
    look: { body: 0xb5652e, belly: 0xf0c9a0, accent: 0x3b2614, scale: 1.05, features: ['horns'] } },
  { id: 'baryonyx', name: 'Baryonyx', power: 38,
    look: { body: 0x4f7f8f, belly: 0xd0e6e6, accent: 0x2b3b40, scale: 1.05, features: ['longNeck'] } },
  { id: 'allosaurus', name: 'Allosaurus', power: 50,
    look: { body: 0x8f5a3a, belly: 0xe8c9a0, accent: 0xd94a3a, scale: 1.1, features: ['crest', 'bigHead'] } },
  { id: 'ceratosaurus', name: 'Ceratosaurus', power: 62,
    look: { body: 0x7a4a6a, belly: 0xe0c0d0, accent: 0xf2b134, scale: 1.1, features: ['horns', 'plates'] } },
  { id: 'carcharodontosaurus', name: 'Carcharodontosaurus', power: 76,
    look: { body: 0x5a5a6a, belly: 0xd0d0d8, accent: 0xb5442e, scale: 1.2, features: ['bigHead'] } },
  { id: 'giganotosaurus', name: 'Giganotosaurus', power: 90,
    look: { body: 0x6a3a2a, belly: 0xd8a080, accent: 0x1c1410, scale: 1.25, features: ['bigHead', 'plates'] } },
  { id: 'rey_volcan', name: 'Rey del Volcán', power: 105,
    look: { body: 0x2b1a0e, belly: 0xff6a1a, accent: 0xffb13b, scale: 1.3, features: ['bigHead', 'sail'] } },
];

/** Poder extra por cada batalla después de vencer la escalera completa. */
export const POWER_GROWTH_AFTER_LADDER = 8;
