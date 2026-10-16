/** "Click to play" / paused screen shown whenever the pointer isn't locked. */
export class PauseOverlay {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, onClick: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'pause-overlay';
    this.el.innerHTML = `
      <div class="pause-card">
        <h1>KAIJU RAMPAGE</h1>
        <p class="pause-cta">Click to play</p>
        <p class="pause-hint">WASD move · Shift sprint · Mouse look · Esc pause · F1 debug</p>
      </div>`;
    this.el.addEventListener('click', onClick);
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }
}
