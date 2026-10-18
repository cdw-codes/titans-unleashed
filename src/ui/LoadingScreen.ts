/** Drives the loading overlay that index.html shows before any script runs. */
export class LoadingScreen {
  private readonly el = document.getElementById('loading');
  private readonly fill = this.el?.querySelector<HTMLElement>('.loading-fill') ?? null;
  private readonly label = this.el?.querySelector<HTMLElement>('.loading-label') ?? null;

  progress(fraction: number, label: string): void {
    if (this.fill) this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    if (this.label) this.label.textContent = `${label}…`;
  }

  fail(message: string): void {
    if (!this.el) return;
    this.el.classList.add('failed');
    if (this.label) this.label.textContent = message;
  }

  hide(): void {
    if (!this.el) return;
    this.el.classList.add('done');
    setTimeout(() => this.el?.remove(), 600);
  }
}
