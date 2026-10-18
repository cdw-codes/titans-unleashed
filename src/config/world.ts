/** World layout constants shared by streaming, generation and debug views. */
export interface WorldConfig {
  /** Edge length (m) of one streamed chunk (city blocks and terrain tiles). */
  readonly chunkSize: number;
}

export const WORLD: WorldConfig = {
  chunkSize: 256, // = 2 city blocks + 2 streets (see config/city.ts)
};
