export interface EvolutionChoice {
  id: string;
  name: string;
  description: string;
  /** e.g. "2 / 3" owned after picking. */
  stack: string;
}

/** "Evolve" screen after a rival falls: pick 1 of 3 upgrades (click or keys 1-3). */
export class EvolutionOverlay {
  private readonly el: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private onPick: ((id: string) => void) | null = null;
  private choices: EvolutionChoice[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'evo-overlay hidden';
    this.el.innerHTML = `<div class="evo-panel"><h1>EVOLVE</h1><p class="pause-hint">Choose one · keys 1–3</p><div class="evo-cards"></div></div>`;
    this.cards = this.el.querySelector('.evo-cards')!;
    parent.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      const c = this.choices[n];
      if (c) this.pick(c.id);
    });
  }

  get isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  show(choices: EvolutionChoice[], onPick: (id: string) => void): void {
    this.choices = choices;
    this.onPick = onPick;
    this.cards.replaceChildren(
      ...choices.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'evo-card';
        b.innerHTML = `<span class="evo-key">${i + 1}</span><span class="evo-name"></span><span class="evo-desc"></span><span class="evo-stack"></span>`;
        b.querySelector('.evo-name')!.textContent = c.name;
        b.querySelector('.evo-desc')!.textContent = c.description;
        b.querySelector('.evo-stack')!.textContent = c.stack;
        b.addEventListener('click', () => this.pick(c.id));
        return b;
      }),
    );
    this.el.classList.remove('hidden');
  }

  private pick(id: string): void {
    this.el.classList.add('hidden');
    const cb = this.onPick;
    this.onPick = null;
    cb?.(id);
  }
}
