/**
 * Downloaded models (public/models, built by `npm run assets`). Any missing file
 * falls back to the code-built geometry, so the game always runs.
 */
export interface ModelConfig {
  readonly cars: string;
  readonly tanks: readonly {
    readonly file: string;
    /** Rotation (rad) about Y so the barrel faces +Z. */
    readonly yawOffset: number;
    /** Rotation (rad) about X for files authored Z-up. */
    readonly pitchOffset: number;
  }[];
}

export const MODELS: ModelConfig = {
  cars: 'models/cars.glb',
  tanks: [
    { file: 'models/tank-a.glb', yawOffset: 0, pitchOffset: 0 },
  ],
};
