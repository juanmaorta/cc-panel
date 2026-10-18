import type { SessionStatus, SessionView, View } from '../types.ts';

export type Expression = 'idle' | 'working' | 'waiting' | 'done' | 'error' | 'dead';
export type Tier = 0 | 1 | 2 | 3 | 4;
export type Flash = 'pain' | 'pickup';

export interface Face {
  expression: Expression;
  tier: Tier;
}

export interface ArmsSlot {
  slot: number;
  host: string | null;
  online: boolean;
}

export interface BarState {
  ammo: number;
  /** % of the 5h window left; null when unknown. */
  health: number | null;
  /** % of the weekly window left; null when unknown. */
  armor: number | null;
  face: Face;
  arms: ArmsSlot[];
  keys: { red: boolean; yellow: boolean; blue: boolean };
  tally: { waiting: number; done: number; working: number; idle: number };
}

const ARMS_SLOTS = 6;
const PRIORITY: Exclude<SessionStatus, 'ended'>[] = ['waiting', 'error', 'done', 'working', 'idle'];

export function healthTier(health: number | null): Tier {
  if (health === null || health >= 80) return 0;
  if (health >= 60) return 1;
  if (health >= 40) return 2;
  if (health >= 20) return 3;
  return 4;
}

const left = (usedPct: number | undefined) => (usedPct === undefined ? null : Math.round(100 - usedPct));

/** Sessions on an offline host keep their last status but must not drive alerts. */
const live = (v: View) => v.sessions.filter((x) => x.hostOnline);

export function sessionFace(s: SessionView, tier: Tier): Face {
  if (!s.hostOnline || s.status === 'ended') return { expression: 'idle', tier };
  return { expression: s.status, tier };
}

export function barState(v: View): BarState {
  const health = left(v.limits?.fiveHour?.usedPct);
  const armor = left(v.limits?.sevenDay?.usedPct);
  const tier = healthTier(health);
  const sessions = live(v);
  const has = (st: SessionStatus) => sessions.some((x) => x.status === st);
  const count = (st: SessionStatus) => sessions.filter((x) => x.status === st).length;

  const worst = PRIORITY.find(has) ?? 'idle';
  const face: Face = health === 0 ? { expression: 'dead', tier: 4 } : { expression: worst, tier };

  const arms = Array.from({ length: ARMS_SLOTS }, (_, i) => {
    const h = v.hosts[i];
    return { slot: i + 1, host: h?.host ?? null, online: h?.online ?? false };
  });

  return {
    ammo: v.sessions.length,
    health,
    armor,
    face,
    arms,
    keys: { red: has('waiting') || has('error'), yellow: has('done'), blue: has('working') },
    tally: { waiting: count('waiting') + count('error'), done: count('done'), working: count('working'), idle: count('idle') },
  };
}

export function flashFor(prev: View | null, next: View): Flash | null {
  if (!prev) return null;
  const before = new Map(prev.sessions.map((x) => [`${x.host}/${x.sessionId}`, x.status]));
  let flash: Flash | null = null;
  for (const x of live(next)) {
    const was = before.get(`${x.host}/${x.sessionId}`);
    if (was === x.status) continue;
    if (x.status === 'waiting' || x.status === 'error') return 'pain';
    if (x.status === 'done') flash = 'pickup';
  }
  return flash;
}
