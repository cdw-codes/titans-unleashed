import { ACTION_LABELS, type Action, type Bindings } from '../config/input';
import { ACTIONS, codeLabel, SLOTS } from '../input/bindingsStore';

/**
 * Interactive key bindings list (pause menu): click a slot, then press a key or
 * mouse button. Esc cancels. Captures input before the game sees it.
 */
export class ControlsPanel {
  readonly el: HTMLDivElement;
  private capturing: { action: Action; slot: number; button: HTMLButtonElement } | null = null;

  constructor(
    private bindings: Bindings,
    private readonly onRebind: (action: Action, slot: number, code: string) => void,
    private readonly onReset: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'controls-panel';
    this.render();
    window.addEventListener('keydown', this.onKey, { capture: true });
    window.addEventListener('mousedown', this.onMouse, { capture: true });
    window.addEventListener('contextmenu', (e) => {
      if (this.capturing) e.preventDefault();
    }, { capture: true });
  }

  setBindings(b: Bindings): void {
    this.bindings = b;
    this.render();
  }

  private render(): void {
    const rows = ACTIONS.map((a) => {
      const slots = Array.from({ length: SLOTS }, (_, i) => {
        const code = this.bindings[a][i];
        return `<button type="button" class="bind-slot${code ? '' : ' empty'}" data-action="${a}" data-slot="${i}">${code ? codeLabel(code) : '—'}</button>`;
      }).join('');
      return `<div class="bind-row"><span class="bind-label">${ACTION_LABELS[a]}</span>${slots}</div>`;
    }).join('');
    this.el.innerHTML = `<h2 class="bind-title">Controls <small>click a key to change it · Esc cancels</small></h2>${rows}
      <button type="button" class="menu-secondary bind-reset">Reset to defaults</button>`;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.bind-slot')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startCapture(b.dataset['action'] as Action, Number(b.dataset['slot']), b);
      });
    }
    this.el.querySelector('.bind-reset')!.addEventListener('click', () => this.onReset());
  }

  private startCapture(action: Action, slot: number, button: HTMLButtonElement): void {
    this.cancel();
    button.textContent = 'Press…';
    button.classList.add('capturing');
    // Wait a tick so the click that started the capture isn't taken as the new binding.
    setTimeout(() => {
      this.capturing = { action, slot, button };
    }, 0);
  }

  private cancel(): void {
    if (!this.capturing) return;
    this.capturing = null;
    this.render();
  }

  private finish(code: string): void {
    const c = this.capturing;
    if (!c) return;
    this.capturing = null;
    this.onRebind(c.action, c.slot, code);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') this.cancel();
    else this.finish(e.code);
  };

  private readonly onMouse = (e: MouseEvent): void => {
    if (!this.capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.finish(`Mouse${e.button}`);
  };
}
