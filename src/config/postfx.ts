/** Post-processing. Only used on presets with postProcessing; bloom runs only while the beam glows. */
export interface PostFxConfig {
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  /** HDR luminance above which pixels bloom. >1 keeps the city out of it; only emissive FX exceed it. */
  readonly bloomThreshold: number;
  /** Bloom buffer resolution as a fraction of the canvas. */
  readonly bloomResolutionScale: number;
}

export const POSTFX: PostFxConfig = {
  bloomStrength: 0.75,
  bloomRadius: 0.35,
  bloomThreshold: 1,
  bloomResolutionScale: 0.5,
};
