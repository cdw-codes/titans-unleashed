import { chunkKey } from './chunkMath';

/**
 * Remembers which generated structures are destroyed, by chunk and index,
 * so streaming a chunk out and back in keeps the city wrecked.
 */
export class DestructionState {
  private readonly destroyed = new Map<string, Set<number>>();

  markDestroyed(cx: number, cz: number, index: number): void {
    const key = chunkKey(cx, cz);
    let set = this.destroyed.get(key);
    if (!set) this.destroyed.set(key, (set = new Set()));
    set.add(index);
  }

  isDestroyed(cx: number, cz: number, index: number): boolean {
    return this.destroyed.get(chunkKey(cx, cz))?.has(index) ?? false;
  }

  countIn(cx: number, cz: number): number {
    return this.destroyed.get(chunkKey(cx, cz))?.size ?? 0;
  }
}
