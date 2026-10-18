import RAPIER from '@dimforge/rapier3d-compat';
import { SIM } from '../config/sim';

/** Collision group bits. Colliders without explicit groups interact with everything. */
export const GROUP = { GROUND: 1 << 0, STRUCTURE: 1 << 1, TITAN: 1 << 2, DEBRIS: 1 << 3 } as const;
export const ALL_GROUPS = 0xffff;
/** Rapier InteractionGroups: membership bits in the high 16, filter bits in the low 16. */
export const collisionGroups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

/** Thin wrapper over the Rapier world. Stepped only from the fixed-timestep loop. */
export class PhysicsSystem {
  readonly world: RAPIER.World;

  private constructor(dt: number) {
    this.world = new RAPIER.World({ x: 0, y: SIM.gravity, z: 0 });
    this.world.timestep = dt;
  }

  static async create(dt: number): Promise<PhysicsSystem> {
    await RAPIER.init();
    return new PhysicsSystem(dt);
  }

  step(): void {
    this.world.step();
  }

  /** Debug stats; iterates all bodies, so only call when the debug overlay is on. */
  countBodies(): { total: number; active: number } {
    let active = 0;
    this.world.bodies.forEach((b) => {
      if (b.isDynamic() && !b.isSleeping()) active++;
    });
    return { total: this.world.bodies.len(), active };
  }
}
