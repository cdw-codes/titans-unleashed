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
  readonly groundColor: number;
  /** World size (m) of one ground texture tile. */
  readonly groundTile: number;
  readonly waterColor: number;
  /** Sea surface height (m). The kaiju wades; the seabed is the ground plane. */
  readonly waterLevel: number;
}

export const ENVIRONMENT: EnvironmentConfig = {
  skyZenith: 0x5b7fa6,
  skyHorizon: 0xc4cbcf,
  fogColor: 0xc4cbcf,
  sunElevation: 38,
  sunAzimuth: 60,
  sunColor: 0xffe7c4,
  sunIntensity: 2.6,
  hemiSky: 0xbcd3ec,
  hemiGround: 0x6b6458,
  hemiIntensity: 1.1,
  exposure: 1.0,
  groundColor: 0x8a8b84,
  groundTile: 128,
  waterColor: 0x2d5868,
  waterLevel: 6,
};
