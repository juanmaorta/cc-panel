import type { SessionStatus, SessionView, View } from '../types.ts';

export const MAX_ROOMS = 6; // same as ARMS slots
export const DESKS = 6;
export const SOFA = 3;

export type Pose = 'typing' | 'sleeping' | 'alert' | 'cheer' | 'smoke';

export interface Seating {
  desks: (SessionView | null)[];
  sofa: SessionView[];
  overflow: { count: number; urgent: number };
}

export interface Room {
  slot: number;
  host: string;
  online: boolean;
  seating: Seating;
}

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

const SKINS = ['#f2c8a0', '#e0a878', '#c68a5a', '#9a6440', '#6e4428'];
const HAIRS = ['#2a1a10', '#5a3418', '#a0642a', '#e0b84a', '#c83a1a', '#8a8a8a', '#3a3a8a', '#e86aa0'];
const SHIRTS = ['#d83a3a', '#3a6ad8', '#3aa85a', '#e0b030', '#8a4ad0', '#e07a2a', '#2ab0b0', '#f0f0f0', '#303030'];
const PANTS = ['#2a3a6a', '#3a3a3a', '#5a4030', '#2a5a3a', '#6a6a7a'];

const URGENT = (st: SessionStatus) => st === 'waiting' || st === 'error';

/** FNV-1a, 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T>(xs: readonly T[], n: number): T => xs[n % xs.length]!;

export function lookFor(sessionId: string): Look {
  const h = hashString(sessionId);
  return { skin: pick(SKINS, h), hair: pick(HAIRS, h >>> 5), shirt: pick(SHIRTS, h >>> 10), pants: pick(PANTS, h >>> 15) };
}

export function poseFor(s: SessionView): Pose {
  if (!s.hostOnline) return 'sleeping';
  switch (s.status) {
    case 'working':
      return 'typing';
    case 'waiting':
      return 'alert';
    case 'done':
      return 'cheer';
    case 'error':
      return 'smoke';
    case 'idle':
    case 'ended':
      return 'sleeping';
  }
}

const byAge = (a: SessionView, b: SessionView) => a.firstSeenAt - b.firstSeenAt || a.sessionId.localeCompare(b.sessionId);

/** Hash to a preferred desk, probe linearly. Older sessions claim first, so newcomers never evict them. */
function place(list: SessionView[], desks: (SessionView | null)[]): SessionView[] {
  const left: SessionView[] = [];
  for (const s of list) {
    const start = hashString(s.sessionId) % desks.length;
    let seated = false;
    for (let i = 0; i < desks.length; i++) {
      const at = (start + i) % desks.length;
      if (!desks[at]) {
        desks[at] = s;
        seated = true;
        break;
      }
    }
    if (!seated) left.push(s);
  }
  return left;
}

export function assignSeats(sessions: SessionView[], deskCount: number, sofaCount: number): Seating {
  const desks: (SessionView | null)[] = Array.from({ length: deskCount }, () => null);
  const sorted = [...sessions].sort(byAge);

  if (sorted.length <= deskCount) {
    place(sorted, desks);
    return { desks, sofa: [], overflow: { count: 0, urgent: 0 } };
  }

  // Scarce desks: whoever needs you first, then whoever is busy; idle ones go to the sofa.
  const urgent = sorted.filter((s) => URGENT(s.status));
  const busy = sorted.filter((s) => !URGENT(s.status) && s.status !== 'idle');
  const idle = sorted.filter((s) => s.status === 'idle');
  const leftActive = [...place(urgent, desks), ...place(busy, desks)];
  const leftIdle = place(idle, desks);
  const sofa = leftIdle.slice(0, sofaCount);
  const out = [...leftActive, ...leftIdle.slice(sofaCount)];
  return { desks, sofa, overflow: { count: out.length, urgent: out.filter((s) => URGENT(s.status)).length } };
}

export function buildRooms(v: View): Room[] {
  const hosts = new Map(v.hosts.map((h) => [h.host, h.online]));
  for (const s of v.sessions) if (!hosts.has(s.host)) hosts.set(s.host, s.hostOnline);
  return [...hosts.entries()].slice(0, MAX_ROOMS).map(([host, online], i) => ({
    slot: i + 1,
    host,
    online,
    seating: assignSeats(v.sessions.filter((s) => s.host === host), DESKS, SOFA),
  }));
}

/** The session behind the face's alarm: first live session that needs you (view is urgency-sorted). */
export function urgentKey(v: View): string | null {
  const s = v.sessions.find((x) => x.hostOnline && URGENT(x.status));
  return s ? `${s.host}/${s.sessionId}` : null;
}
