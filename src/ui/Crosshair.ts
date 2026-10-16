/** Screen-center reticle marking where the beam will aim; shows beam charge. */
export class Crosshair {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'crosshair';
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  /** Beam charge 0..1 drawn as a ring filling around the reticle. */
  set charge(c: number) {
    const v = Math.round(c * 100) / 100;
    if (this.el.dataset['charge'] === String(v)) return;
    this.el.dataset['charge'] = String(v);
    this.el.style.setProperty('--charge', String(v));
    this.el.classList.toggle('charging', v > 0);
  }
}
