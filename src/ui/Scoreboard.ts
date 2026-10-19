import type { RoomView } from './menus';

/** Versus scores, top right under the minimap: room code and KOs per player. */
export class Scoreboard {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'scoreboard';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.style.visibility = v ? '' : 'hidden';
  }

  update(room: RoomView | null): void {
    this.el.hidden = !room;
    if (!room) return;
    const rows = [...room.players].sort((a, b) => b.kos - a.kos || a.id - b.id);
    const head = document.createElement('p');
    head.className = 'scoreboard-head';
    head.textContent = `Room ${room.code} · KOs`;
    const list = document.createElement('ol');
    for (const p of rows) {
      const li = document.createElement('li');
      if (p.id === room.myId) li.className = 'me';
      const name = document.createElement('span');
      name.textContent = p.name;
      const kos = document.createElement('b');
      kos.textContent = String(p.kos);
      li.append(name, kos);
      list.appendChild(li);
    }
    this.el.replaceChildren(head, list);
  }
}
