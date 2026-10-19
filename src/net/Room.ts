import Peer, { type DataConnection } from 'peerjs';
import { makeRoomCode, MAX_PLAYERS, PEER_PREFIX, readMessage, type Message, type PlayerInfo, type WorldInfo } from './protocol';

export interface Hello {
  name: string;
  titan: PlayerInfo['titan'];
  color: number;
}

type Listener = (m: Message) => void;

/** A peer silent this long is gone (PeerJS doesn't always report a closed tab). */
const TIMEOUT_MS = 12000;
const PING_MS = 2000;

/**
 * A versus room over PeerJS (public signaling, WebRTC data channels). The host's
 * browser is the hub: it assigns player ids, welcomes joiners with the world and
 * the destroyed buildings, and relays every message to the other players,
 * stamping the real sender id so nobody can speak for someone else.
 */
export class Room {
  readonly players = new Map<number, PlayerInfo>();
  private readonly listeners: Listener[] = [];
  private readonly conns = new Map<number, DataConnection>();
  private hostConn: DataConnection | null = null;
  private nextId = 1;
  private readonly lastSeen = new Map<DataConnection, number>();
  private readonly pinger: ReturnType<typeof setInterval>;
  private closed = false;
  onClosed: ((reason: string) => void) | null = null;

  private constructor(
    private readonly peer: Peer,
    readonly code: string,
    readonly isHost: boolean,
    public myId: number,
    readonly world: WorldInfo,
  ) {
    this.pinger = setInterval(() => this.heartbeat(), PING_MS);
  }

  private heartbeat(): void {
    const now = Date.now();
    for (const [c, t] of this.lastSeen) {
      if (now - t > TIMEOUT_MS) {
        this.lastSeen.delete(c);
        c.close();
        if (c === this.hostConn) this.close('The host stopped answering');
      }
    }
    this.send({ t: 'ping' });
  }

  private seen(c: DataConnection): void {
    this.lastSeen.set(c, Date.now());
  }

  private close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.onClosed?.(reason);
  }

  /** Open a room for others to join; the host is player 0. */
  static async host(world: WorldInfo, me: Hello, destroyed: () => [number, number, number][]): Promise<Room> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeRoomCode();
      const peer = new Peer(PEER_PREFIX + code);
      const ok = await new Promise<boolean>((resolve, reject) => {
        peer.on('open', () => resolve(true));
        peer.on('error', (e) => (e.type === 'unavailable-id' ? resolve(false) : reject(new Error(`Could not open a room (${e.type})`))));
      });
      if (!ok) {
        peer.destroy();
        continue;
      }
      const room = new Room(peer, code, true, 0, world);
      room.players.set(0, { id: 0, name: me.name, titan: me.titan, color: me.color, kos: 0 });
      peer.on('connection', (conn) => room.accept(conn, destroyed));
      return room;
    }
    throw new Error('Could not find a free room code, try again');
  }

  /** Join a room by code: resolves once the host has welcomed us (world, players, destroyed). */
  static join(code: string, me: Hello, timeoutMs = 15000): Promise<{ room: Room; destroyed: [number, number, number][] }> {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      const fail = (msg: string) => {
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('The room did not answer'), timeoutMs);
      peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'No room with that code' : `Connection failed (${e.type})`));
      peer.on('open', () => {
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
        conn.on('open', () => conn.send({ t: 'hello', ...me } satisfies Message));
        let room: Room | null = null;
        conn.on('data', (data) => {
          const m = readMessage(data);
          if (!m) return;
          if (!room) {
            if (m.t === 'full') return fail('That room is full');
            if (m.t !== 'welcome') return;
            clearTimeout(timer);
            room = new Room(peer, code, false, m.id, m.world);
            room.hostConn = conn;
            room.seen(conn);
            for (const p of m.players) room.players.set(p.id, p);
            resolve({ room, destroyed: m.destroyed });
            return;
          }
          room.seen(conn);
          if (m.t !== 'ping') room.receive(m);
        });
        conn.on('close', () => room?.close('The host left'));
      });
    });
  }

  onMessage(cb: Listener): void {
    this.listeners.push(cb);
  }

  /** Send to everyone else (clients send to the host, which relays). */
  send(m: Message): void {
    if (this.isHost) for (const c of this.conns.values()) c.send(m);
    else this.hostConn?.send(m);
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** Invite link for this room (same page, with ?room=CODE). */
  get link(): string {
    const q = new URLSearchParams(location.search);
    q.delete('map');
    q.delete('seed');
    q.set('room', this.code);
    return `${location.origin}${location.pathname}?${q}`;
  }

  leave(): void {
    this.closed = true;
    clearInterval(this.pinger);
    for (const c of this.conns.values()) c.close();
    this.hostConn?.close();
    this.peer.destroy();
  }

  // ---------------------------------------------------------------- host side

  private accept(conn: DataConnection, destroyed: () => [number, number, number][]): void {
    let id = -1;
    conn.on('data', (data) => {
      const m = readMessage(data);
      if (!m) return;
      this.seen(conn);
      if (m.t === 'ping') return;
      if (id < 0) {
        if (m.t !== 'hello') return;
        if (this.players.size >= MAX_PLAYERS) {
          conn.send({ t: 'full' } satisfies Message);
          setTimeout(() => conn.close(), 500);
          return;
        }
        id = this.nextId++;
        const player: PlayerInfo = { id, name: m.name.slice(0, 20), titan: m.titan, color: m.color, kos: 0 };
        this.players.set(id, player);
        this.conns.set(id, conn);
        conn.send({ t: 'welcome', id, world: this.world, players: [...this.players.values()], destroyed: destroyed() } satisfies Message);
        this.relay({ t: 'joined', player }, id);
        this.emit({ t: 'joined', player });
        return;
      }
      // Stamp the real sender: a client can only speak for itself.
      if ('id' in m) (m as { id: number }).id = id;
      if (m.t === 'hello' || m.t === 'welcome' || m.t === 'joined' || m.t === 'left' || m.t === 'full') return;
      this.relay(m, id);
      this.receive(m);
    });
    conn.on('close', () => {
      this.lastSeen.delete(conn);
      if (id < 0 || !this.conns.has(id)) return;
      this.conns.delete(id);
      this.players.delete(id);
      const left: Message = { t: 'left', id };
      this.relay(left, id);
      this.emit(left);
    });
  }

  private relay(m: Message, except: number): void {
    for (const [pid, c] of this.conns) if (pid !== except) c.send(m);
  }

  // ---------------------------------------------------------------- both

  private receive(m: Message): void {
    if (m.t === 'joined') this.players.set(m.player.id, m.player);
    if (m.t === 'left') this.players.delete(m.id);
    if (m.t === 'look') {
      const p = this.players.get(m.id);
      if (p) Object.assign(p, { titan: m.titan, color: m.color });
    }
    if (m.t === 'ko') {
      const p = this.players.get(m.by);
      if (p) p.kos++;
    }
    this.emit(m);
  }

  private emit(m: Message): void {
    for (const l of this.listeners) l(m);
  }

  /** Our own KO credit and look changes are mirrored locally too. */
  noteLocal(m: Message): void {
    if (m.t === 'ko' || m.t === 'look') this.receive(m);
  }
}
