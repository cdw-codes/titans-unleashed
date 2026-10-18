import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TitanModel } from './TitanModel';
import { PLAYER_SPEC } from './TitanSpec';
import type { TitanPoseInput } from './TitanModel';

const pose = (model: TitanModel, phase: number): void => {
  model.pose({
    phase, speedRatio: 1, stepping: true, sprinting: false, turnVelocity: 0, strideAngle: 0.35,
    time: 1, dt: 1 / 30, beamPitch: 0, action: { kind: 'walk', t: 0, side: 1, charge: 0 },
  } as TitanPoseInput);
};

const footY = (model: TitanModel, side: 'L' | 'R'): number => {
  model.object.updateMatrixWorld(true);
  const bone = model.mesh.skeleton.bones.find((b) => b.name === `foot${side}`)!;
  return bone.getWorldPosition(new THREE.Vector3()).y;
};

/** Two models posed identically; `plant` is applied to the second only. */
const pair = (phase: number, plant: (m: TitanModel) => void): [TitanModel, TitanModel] => {
  const a = new TitanModel(PLAYER_SPEC.design, PLAYER_SPEC.combat);
  const b = new TitanModel(PLAYER_SPEC.design, PLAYER_SPEC.combat);
  pose(a, phase);
  pose(b, phase);
  plant(b);
  return [a, b];
};

describe('foot planting', () => {
  it('raises and lowers each foot to the ground under it', () => {
    // Ground 4 units higher under the left foot (x > 0), 3 lower under the right.
    for (const phase of [0.1, 0.45, 0.8]) {
      const [flat, planted] = pair(phase, (m) => m.plantFeet((x) => (x > 0 ? 4 : -3), 0, 1));
      expect(footY(planted, 'L') - footY(flat, 'L')).toBeCloseTo(4, 1);
      expect(footY(planted, 'R') - footY(flat, 'R')).toBeCloseTo(-3, 1);
    }
  });

  it('does nothing at zero weight', () => {
    const [flat, planted] = pair(0.3, (m) => m.plantFeet(() => 5, 0.2, 0));
    expect(footY(planted, 'L')).toBeCloseTo(footY(flat, 'L'), 5);
  });
});
