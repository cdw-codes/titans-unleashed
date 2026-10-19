import { RIVALS, type RivalId } from '../../config/rivals';
import type { TitanSpec } from '../titan/TitanSpec';
import { THORNMAW_DESIGN, VESPERION_DESIGN, type TitanDesign } from '../titan/designs';
import { TITAN_BODY } from '../../config/titan';
import { bodyFor } from '../titan/profiles';
import { ROSTER } from '../titan/roster';

const DESIGNS: Record<RivalId, TitanDesign> = { thornmaw: THORNMAW_DESIGN, vesperion: VESPERION_DESIGN };

export function rivalSpec(id: RivalId): TitanSpec {
  const r = RIVALS[id];
  // Rivals are roster specimens: same size and weight, their own AI-tuned movement and moves.
  const profile = ROSTER.find((t) => t.rival === id)?.profile;
  const body = profile ? bodyFor(TITAN_BODY, profile, DESIGNS[id].bulk) : r.body;
  return { name: r.name, body, movement: r.movement, gait: r.gait, combat: r.combat, design: DESIGNS[id], weight: profile?.weight };
}

/** Rivals don't spend energy: their beams are limited by cooldowns instead. */
export const UNLIMITED_ENERGY = { energy: Number.POSITIVE_INFINITY, spend: () => true };
