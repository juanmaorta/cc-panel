import type { LimitWindow, SessionStatus, View } from '../types.ts';
import type { CatMode } from './neko-logic.ts';

/** beep = something needs you (invert the screen); blink = something finished (blink the menu bar). */
export type Flash = 'beep' | 'blink';

export interface LimitState {
  usedPct: number;
  resetsIn: string;
}

export interface MenuState {
  hosts: { host: string; online: boolean; relay: boolean }[];
  fiveHour: LimitState | null;
  sevenDay: LimitState | null;
  tally: { waiting: number; done: number; working: number; idle: number };
  /** The menu bar cat: the most urgent live state at a glance. */
  mood: CatMode;
}

const MOODS: [SessionStatus, CatMode][] = [
  ['waiting', 'alert'],
  ['error', 'scratch'],
  ['done', 'wash'],
  ['working', 'run'],
];

const MIN = 60_000;

export function untilReset(resetsAt: number, now: number): string {
  const ms = resetsAt - now;
  if (ms <= 0) return 'ya';
  const m = Math.ceil(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)}d`;
}

const limit = (w: LimitWindow | undefined, now: number): LimitState | null =>
  w ? { usedPct: Math.round(w.usedPct), resetsIn: untilReset(w.resetsAt, now) } : null;

/** Sessions on an offline host keep their last status but must not raise alerts. */
const live = (v: View) => v.sessions.filter((s) => s.hostOnline);

export function menuState(v: View): MenuState {
  const sessions = live(v);
  const count = (...st: SessionStatus[]) => sessions.filter((s) => st.includes(s.status)).length;
  return {
    hosts: v.hosts.map((h) => ({ host: h.host, online: h.online, relay: h.relay })),
    fiveHour: limit(v.limits?.fiveHour, v.generatedAt),
    sevenDay: limit(v.limits?.sevenDay, v.generatedAt),
    tally: { waiting: count('waiting', 'error'), done: count('done'), working: count('working'), idle: count('idle') },
    mood: MOODS.find(([st]) => count(st) > 0)?.[1] ?? 'sleep',
  };
}

export function flashFor(prev: View | null, next: View): Flash | null {
  if (!prev) return null;
  const before = new Map(prev.sessions.map((s) => [`${s.host}/${s.sessionId}`, s.status]));
  let flash: Flash | null = null;
  for (const s of live(next)) {
    if (before.get(`${s.host}/${s.sessionId}`) === s.status) continue;
    if (s.status === 'waiting' || s.status === 'error') return 'beep';
    if (s.status === 'done') flash = 'blink';
  }
  return flash;
}
