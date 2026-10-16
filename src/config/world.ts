/** World layout constants shared by streaming, generation and debug views. */
export interface WorldConfig {
  /** Edge length (m) of one streamed city chunk. */
  readonly chunkSize: number;
  /**
   * Half-size (m) of the physics ground slab, which recenters under the player.
   * Keep it a few km: much larger slabs lose precision and the KCC sinks/stalls.
   */
  readonly groundHalfSize: number;
}

export const WORLD: WorldConfig = {
  chunkSize: 256, // = 2 city blocks + 2 streets (see config/city.ts)
  groundHalfSize: 4000, // rivals spawn ~2.3 km out; KCC tested stable up to 8 km
};
