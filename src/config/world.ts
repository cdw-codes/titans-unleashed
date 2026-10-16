/** World layout constants shared by streaming, generation and debug views. */
export interface WorldConfig {
  /** Edge length (m) of one streamed city chunk. */
  readonly chunkSize: number;
  /** Half-size (m) of the physics ground slab. */
  readonly groundHalfSize: number;
}

export const WORLD: WorldConfig = {
  chunkSize: 200,
  groundHalfSize: 20000,
};
