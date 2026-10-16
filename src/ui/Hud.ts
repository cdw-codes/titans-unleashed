/** In-game HUD: destruction score and energy bar. Health joins in M4. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly score: HTMLSpanElement;
  private readonly energyFill: HTMLDivElement;
  private shownScore = -1;
  private shownEnergy = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-score"><span class="hud-label">DESTRUCTION</span><span class="hud-score-value">0</span></div>
      <div class="hud-bar"><span class="hud-label">ENERGY</span><div class="hud-bar-track"><div class="hud-bar-fill energy"></div></div></div>`;
    parent.appendChild(this.root);
    this.score = this.root.querySelector('.hud-score-value')!;
    this.energyFill = this.root.querySelector('.hud-bar-fill.energy')!;
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  update(score: number, energyFraction: number): void {
    if (score !== this.shownScore) {
      this.shownScore = score;
      this.score.textContent = score.toLocaleString();
    }
    const e = Math.round(energyFraction * 1000) / 1000;
    if (e !== this.shownEnergy) {
      this.shownEnergy = e;
      this.energyFill.style.transform = `scaleX(${e})`;
    }
  }
}
