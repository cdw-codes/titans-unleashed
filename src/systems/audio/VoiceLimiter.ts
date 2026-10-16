/**
 * Decides which playing voice to steal when limits are hit. Pure bookkeeping:
 * the audio system owns the actual nodes. Per-sound and global caps; the
 * oldest voice is stolen first.
 */
export class VoiceLimiter<K extends string> {
  private readonly voices: { id: number; key: K; started: number }[] = [];
  private nextId = 1;

  constructor(private readonly maxVoices: number) {}

  get count(): number {
    return this.voices.length;
  }

  /** Register a new voice; returns its id and the ids that must be stopped to make room. */
  start(key: K, maxForKey: number, now: number): { id: number; steal: number[] } {
    const steal: number[] = [];
    const same = this.voices.filter((v) => v.key === key);
    while (same.length >= maxForKey) {
      const oldest = same.shift()!;
      steal.push(oldest.id);
      this.remove(oldest.id);
    }
    while (this.voices.length >= this.maxVoices) {
      const oldest = this.voices[0]!;
      steal.push(oldest.id);
      this.remove(oldest.id);
    }
    const id = this.nextId++;
    this.voices.push({ id, key, started: now });
    return { id, steal };
  }

  remove(id: number): void {
    const i = this.voices.findIndex((v) => v.id === id);
    if (i >= 0) this.voices.splice(i, 1);
  }
}
