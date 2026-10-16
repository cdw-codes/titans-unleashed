/** Military threat level: five stars, top right, with heat progress toward the next star. */
export class ThreatHud {
  private readonly el: HTMLDivElement;
  private readonly stars: HTMLSpanElement[] = [];
  private readonly bar: HTMLDivElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'threat-hud';
    this.el.innerHTML = `<span class="hud-label">MILITARY THREAT</span><div class="threat-stars"></div><div class="threat-track"><div class="threat-fill"></div></div>`;
    const row = this.el.querySelector('.threat-stars')!;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      row.appendChild(s);
      this.stars.push(s);
    }
    this.bar = this.el.querySelector('.threat-fill')!;
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  update(level: number, progress: number, suppressed: boolean): void {
    const key = `${level}|${Math.round(progress * 50)}|${suppressed}`;
    if (key === this.last) return;
    this.last = key;
    this.stars.forEach((s, i) => s.classList.toggle('on', i < level));
    this.bar.style.transform = `scaleX(${level >= 5 ? 1 : Math.max(0, Math.min(1, progress))})`;
    this.el.classList.toggle('suppressed', suppressed);
  }
}
