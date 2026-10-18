export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
export const DEFAULT_QUALITY: QualityLevel = 'medium';

export interface QualityPreset {
  /** Cap on devicePixelRatio. Biggest single GPU-cost lever on hi-DPI laptops. */
  readonly maxPixelRatio: number;
  /** MSAA. Fixed at renderer creation; changing it requires a reload. */
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Half-extent (m) of the player-following shadow frustum. */
  readonly shadowExtent: number;
  /** Camera far plane / fog end (m). Chunks stream inside this radius. */
  readonly drawDistance: number;
  /** Fraction of drawDistance where fog starts. */
  readonly fogStart: number;
  /** Hard cap on simultaneously simulated debris bodies. */
  readonly debrisCap: number;
  readonly postProcessing: boolean;
  /** Small props (cars, trees, containers) exist within this radius (m). */
  readonly propRadius: number;
  /** Model cars are drawn within this radius (m). */
  readonly carDrawDistance: number;
  /** Trees, house roofs and code-built cars cast shadows (doubles their vertex cost). */
  readonly smallShadows: boolean;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: {
    maxPixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 1024,
    shadowExtent: 220,
    drawDistance: 1400,
    fogStart: 0.3,
    debrisCap: 60,
    postProcessing: false,
    propRadius: 500,
    carDrawDistance: 220,
    smallShadows: false,
  },
  medium: {
    maxPixelRatio: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowExtent: 300,
    drawDistance: 2200,
    fogStart: 0.35,
    debrisCap: 150,
    postProcessing: true,
    propRadius: 800,
    carDrawDistance: 320,
    smallShadows: true,
  },
  high: {
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 4096,
    shadowExtent: 400,
    drawDistance: 3200,
    fogStart: 0.4,
    debrisCap: 300,
    postProcessing: true,
    propRadius: 1000,
    carDrawDistance: 450,
    smallShadows: true,
  },
};

/** Automatic step-down when the frame budget is missed (never steps up). */
export const AUTO_QUALITY = {
  /** 30 FPS cap → 33 ms frames; allow some slack before calling a frame slow. */
  budgetMs: 42,
  windowSeconds: 4,
  overBudgetFraction: 0.35,
  settleSeconds: 5,
};

export const isQualityLevel = (v: unknown): v is QualityLevel =>
  typeof v === 'string' && (QUALITY_LEVELS as readonly string[]).includes(v);

/** No player-facing setting: default preset, overridable with `?quality=` for testing. */
export function resolveQualityLevel(urlParam: string | null): QualityLevel {
  return isQualityLevel(urlParam) ? urlParam : DEFAULT_QUALITY;
}
