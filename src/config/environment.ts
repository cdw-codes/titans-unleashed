/** Look of the world: sky, sun, fog, ground. Colors are sRGB hex. */
export interface EnvironmentConfig {
  readonly skyZenith: number;
  readonly skyHorizon: number;
  /** Fog color; keep equal to skyHorizon so the streaming edge dissolves into the sky. */
  readonly fogColor: number;
  /** Sun elevation/azimuth in degrees. Low sun = long shadows = stronger sense of height. */
  readonly sunElevation: number;
  readonly sunAzimuth: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly exposure: number;
  readonly waterColor: number;
  /** Cloud cover 0..1 and how fast the clouds drift. */
  readonly cloudCover: number;
  readonly cloudSpeed: number;
  /** Distant mountain silhouettes: near and far ring colors and peak heights (m). */
  readonly mountainNear: number;
  readonly mountainFar: number;
  readonly mountainHeight: number;
}

export const ENVIRONMENT: EnvironmentConfig = {
  skyZenith: 0x7da3d6,
  skyHorizon: 0xd6dbe6,
  fogColor: 0xc8d1df,
  sunElevation: 30,
  sunAzimuth: 55,
  sunColor: 0xffe2b8,
  sunIntensity: 3.2,
  hemiSky: 0xc2d4ee,
  hemiGround: 0x8c7b58,
  hemiIntensity: 0.8,
  exposure: 1.0,
  waterColor: 0x5f8ea6,
  cloudCover: 0.45,
  cloudSpeed: 0.004,
  mountainNear: 0x8d93b3,
  mountainFar: 0xaab0cc,
  mountainHeight: 520,
};
