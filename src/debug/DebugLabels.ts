import * as THREE from 'three';

const _v = new THREE.Vector3();

/** World-anchored text labels (AI state, HP) drawn as pooled DOM nodes. Debug only. */
export class DebugLabels {
  private readonly root: HTMLDivElement;
  private readonly pool: HTMLDivElement[] = [];
  private used = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'debug-labels';
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  /** Call per frame for each label while debug is on. */
  draw(world: THREE.Vector3Like, text: string, camera: THREE.Camera): void {
    _v.set(world.x, world.y, world.z).project(camera);
    if (_v.z > 1) return;
    let el = this.pool[this.used];
    if (!el) {
      el = document.createElement('div');
      el.className = 'debug-label';
      this.root.appendChild(el);
      this.pool.push(el);
    }
    this.used++;
    el.style.display = '';
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(${((_v.x + 1) / 2) * window.innerWidth}px, ${((1 - _v.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
  }

  /** Hide labels not drawn this frame. */
  endFrame(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.style.display = 'none';
    this.used = 0;
  }
}
