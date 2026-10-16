import { RIVALS, type RivalId } from '../../config/rivals';
import type { KaijuSpec } from '../kaiju/KaijuSpec';
import { THORNMAW_DESIGN, VESPERION_DESIGN, type KaijuDesign } from '../kaiju/designs';

const DESIGNS: Record<RivalId, KaijuDesign> = { thornmaw: THORNMAW_DESIGN, vesperion: VESPERION_DESIGN };

export function rivalSpec(id: RivalId): KaijuSpec {
  const r = RIVALS[id];
  return { name: r.name, body: r.body, movement: r.movement, gait: r.gait, combat: r.combat, design: DESIGNS[id] };
}

/** Rivals don't spend energy: their beams are limited by cooldowns instead. */
export const UNLIMITED_ENERGY = { energy: Number.POSITIVE_INFINITY, spend: () => true };
