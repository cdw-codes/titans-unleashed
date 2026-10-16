/** Hands out reusable integer slots (e.g. instance indices). Freed slots are reused first. */
export class SlotAllocator {
  private readonly freeList: number[] = [];
  private _highWater = 0;
  private _used = 0;

  /** One past the highest slot ever handed out (instance draw count). */
  get highWater(): number {
    return this._highWater;
  }

  get used(): number {
    return this._used;
  }

  alloc(): number {
    this._used++;
    return this.freeList.length > 0 ? this.freeList.pop()! : this._highWater++;
  }

  free(slot: number): void {
    if (slot < 0 || slot >= this._highWater) throw new Error(`Bad slot ${slot}`);
    this._used--;
    if (slot === this._highWater - 1) {
      this._highWater--;
      // Shrink past trailing free slots so the draw count stays tight.
      let i: number;
      while ((i = this.freeList.indexOf(this._highWater - 1)) !== -1) {
        this.freeList.splice(i, 1);
        this._highWater--;
      }
    } else {
      this.freeList.push(slot);
    }
  }
}
