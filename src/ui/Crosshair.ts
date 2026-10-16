/** Screen-center reticle marking where the beam will aim (beam itself arrives in M4). */
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
}
