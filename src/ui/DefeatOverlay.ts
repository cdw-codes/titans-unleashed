/** Shown when the player kaiju is defeated. Respawn = full health in place (decision: no run reset). */
export class DefeatOverlay {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, onRespawn: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'defeat-overlay hidden';
    this.el.innerHTML = `
      <div class="pause-card">
        <h1>DEFEATED</h1>
        <button class="defeat-respawn" type="button">Respawn</button>
        <p class="pause-hint">or press Enter</p>
      </div>`;
    this.el.querySelector('button')!.addEventListener('click', onRespawn);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.isVisible) onRespawn();
    });
    parent.appendChild(this.el);
  }

  get isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  set visible(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }
}
