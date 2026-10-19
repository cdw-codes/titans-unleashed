/**
 * Multiplayer wire protocol (versus mode). JSON messages over a reliable PeerJS
 * data channel; the host relays every client message to the other clients.
 * Each player simulates its own titan; the attacker resolves its attacks and
 * sends `hit` to the victim, which applies it to its own titan (favours the
 * attacker under lag, like most casual P2P brawlers). The world (map + seed) and
 * destroyed buildings come from the host.
 */
import type { TitanId } from '../entities/titan/roster';

export const MAX_PLAYERS = 4;
/** PeerJS ids are global on the public server: prefix ours to avoid collisions. */
export const PEER_PREFIX = 'titans-unleashed-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

export interface WorldInfo {
  /** City map id, or null for the open world. */
  map: string | null;
  /** Open-world seed (null = classic layout or a city map). */
  seed: number | null;
}

export interface PlayerInfo {
  id: number;
  name: string;
  titan: TitanId;
  color: number;
  kos: number;
}

/** A titan's pose for remote players (sent ~20x per second). */
export interface TitanState {
  /** Position. */
  p: [number, number, number];
  /** Facing yaw. */
  y: number;
  /** Speed (m/s), sprinting. */
  v: number;
  r: boolean;
  /** Locomotion / action state and the action's time, side, charge and move. */
  st: string;
  a: [number, 1 | -1, number, string | null];
  /** Beam firing: origin and direction; null when not firing. */
  b: [number, number, number, number, number, number] | null;
  /** Health fraction (for name tags). */
  hp: number;
}

export type Message =
  | { t: 'hello'; name: string; titan: TitanId; color: number }
  | { t: 'welcome'; id: number; world: WorldInfo; players: PlayerInfo[]; destroyed: [number, number, number][] }
  | { t: 'full' }
  /** Keep-alive (sent on a timer, so it flows even while a tab is in the background). */
  | { t: 'ping' }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  | { t: 'look'; id: number; titan: TitanId; color: number }
  | { t: 's'; id: number; s: TitanState }
  /** An area attack (claw / tail / stomp / pulse) landed here: effects only. */
  | { t: 'atk'; id: number; move: string; x: number; z: number; yaw: number; r: number }
  /** The sender hit player `to`: damage, poise damage, stun seconds (roar). */
  | { t: 'hit'; id: number; to: number; d: number; p: number; st: number }
  | { t: 'roar'; id: number; x: number; z: number }
  /** A structure destroyed by the sender: chunk + index in the deterministic world. */
  | { t: 'des'; id: number; k: [number, number, number] }
  /** The sender's titan was defeated, credited to `by` (player id, or -1). */
  | { t: 'ko'; id: number; by: number };

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/** Normalize user input ("abc 12" → "ABC12"); null if it can't be a room code. */
export function parseRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Shape check for incoming data (peers are untrusted): returns the message or null. */
export function readMessage(data: unknown): Message | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  switch (m['t']) {
    case 'hello':
      return typeof m['name'] === 'string' && typeof m['titan'] === 'string' && num(m['color']) ? (m as Message) : null;
    case 'welcome':
      return num(m['id']) && Array.isArray(m['players']) && Array.isArray(m['destroyed']) && typeof m['world'] === 'object' ? (m as Message) : null;
    case 'full':
    case 'ping':
      return m as Message;
    case 'joined':
      return typeof m['player'] === 'object' && m['player'] !== null ? (m as Message) : null;
    case 'left':
      return num(m['id']) ? (m as Message) : null;
    case 'look':
      return num(m['id']) && typeof m['titan'] === 'string' && num(m['color']) ? (m as Message) : null;
    case 's': {
      const s = m['s'] as Record<string, unknown> | undefined;
      return num(m['id']) && s && Array.isArray(s['p']) && s['p'].length === 3 && (s['p'] as unknown[]).every(num) && num(s['y']) && num(s['v']) && typeof s['st'] === 'string' && Array.isArray(s['a']) && num(s['hp'])
        ? (m as Message)
        : null;
    }
    case 'atk':
      return num(m['id']) && typeof m['move'] === 'string' && num(m['x']) && num(m['z']) && num(m['yaw']) && num(m['r']) ? (m as Message) : null;
    case 'hit':
      // Clamp to sane values: a peer can't one-shot anyone with a forged hit.
      return num(m['id']) && num(m['to']) && num(m['d']) && num(m['p']) && num(m['st']) && (m['d'] as number) >= 0 && (m['d'] as number) <= 2000 && (m['st'] as number) <= 10
        ? (m as Message)
        : null;
    case 'roar':
      return num(m['id']) && num(m['x']) && num(m['z']) ? (m as Message) : null;
    case 'des': {
      const k = m['k'];
      return num(m['id']) && Array.isArray(k) && k.length === 3 && k.every(num) ? (m as Message) : null;
    }
    case 'ko':
      return num(m['id']) && num(m['by']) ? (m as Message) : null;
    default:
      return null;
  }
}
