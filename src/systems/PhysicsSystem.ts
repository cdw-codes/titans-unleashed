import RAPIER from '@dimforge/rapier3d-compat';
import { SIM } from '../config/sim';

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
