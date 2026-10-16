import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Encounter UI: banner messages, rival boss bar, off-screen compass marker
 * and the lock-on reticle.
 */
export class EncounterHud {
  private readonly banner: HTMLDivElement;
  private readonly boss: HTMLDivElement;
  private readonly bossName: HTMLSpanElement;
  private readonly bossTitle: HTMLSpanElement;
  private readonly bossFill: HTMLDivElement;
  private readonly compass: HTMLDivElement;
  private readonly compassLabel: HTMLSpanElement;
  private readonly reticle: HTMLDivElement;
  private bannerTimer = 0;

  constructor(parent: HTMLElement) {
    const el = (cls: string, html = '') => {
      const d = document.createElement('div');
      d.className = cls;
      d.innerHTML = html;
      parent.appendChild(d);
      return d;
    };
    this.banner = el('enc-banner');
    this.boss = el('enc-boss', '<div class="enc-boss-head"><span class="enc-boss-name"></span><span class="enc-boss-title"></span></div><div class="enc-boss-track"><div class="enc-boss-fill"></div></div>');
    this.bossName = this.boss.querySelector('.enc-boss-name')!;
    this.bossTitle = this.boss.querySelector('.enc-boss-title')!;
    this.bossFill = this.boss.querySelector('.enc-boss-fill')!;
    this.compass = el('enc-compass', '<div class="enc-compass-arrow"></div><span class="enc-compass-label"></span>');
    this.compassLabel = this.compass.querySelector('.enc-compass-label')!;
    this.reticle = el('enc-reticle');
    this.hideAll();
  }

  hideAll(): void {
    this.banner.classList.remove('show');
    this.boss.style.display = 'none';
    this.compass.style.display = 'none';
    this.reticle.style.display = 'none';
  }

  /** Big centered message; `tone` picks the color. */
  showBanner(text: string, tone: 'warning' | 'arrival' | 'victory' | 'defeat', seconds = 3.5): void {
    this.banner.textContent = text;
    this.banner.className = `enc-banner show ${tone}`;
    this.bannerTimer = seconds;
  }

  setBoss(name: string | null, title = ''): void {
    this.boss.style.display = name ? '' : 'none';
    if (name) {
      this.bossName.textContent = name;
      this.bossTitle.textContent = title;
    }
  }

  update(dt: number, s: {
    bossHealth: number;
    /** World position the compass points at (rival or its approach direction), or null. */
    compassTarget: { x: number; z: number } | null;
    compassText: string;
    lockTarget: { x: number; y: number; z: number } | null;
    camera: THREE.PerspectiveCamera;
    cameraYaw: number;
  }): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    this.bossFill.style.transform = `scaleX(${Math.max(0, s.bossHealth).toFixed(3)})`;

    // Compass: shown when the target is off-screen; arrow around the screen center.
    if (s.compassTarget) {
      _v.set(s.compassTarget.x, 60, s.compassTarget.z).project(s.camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.9;
      this.compass.style.display = onScreen ? 'none' : '';
      if (!onScreen) {
        const cam = s.camera.position;
        const worldAngle = Math.atan2(s.compassTarget.x - cam.x, s.compassTarget.z - cam.z);
        // Camera looks along cameraYaw + PI; relative angle 0 = straight ahead (top of screen).
        const rel = worldAngle - (s.cameraYaw + Math.PI);
        const r = Math.min(window.innerWidth, window.innerHeight) * 0.38;
        const x = window.innerWidth / 2 - Math.sin(rel) * r;
        const y = window.innerHeight / 2 - Math.cos(rel) * r;
        this.compass.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        (this.compass.firstElementChild as HTMLElement).style.transform = `rotate(${-rel}rad)`;
        this.compassLabel.textContent = s.compassText;
      }
    } else {
      this.compass.style.display = 'none';
    }

    if (s.lockTarget) {
      _v.set(s.lockTarget.x, s.lockTarget.y, s.lockTarget.z).project(s.camera);
      if (_v.z < 1) {
        this.reticle.style.display = '';
        this.reticle.style.transform = `translate(${((_v.x + 1) / 2) * window.innerWidth}px, ${((1 - _v.y) / 2) * window.innerHeight}px) translate(-50%, -50%)`;
      } else {
        this.reticle.style.display = 'none';
      }
    } else {
      this.reticle.style.display = 'none';
    }
  }
}
