import type { LimitWindow, Limits } from './types.ts';

function window(raw: unknown): LimitWindow | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null) return null;
  const { used_percentage: used, resets_at: resets } = raw as Record<string, unknown>;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof resets !== 'number' || !Number.isFinite(resets)) return null;
  return { usedPct: Math.min(100, Math.max(0, used)), resetsAt: resets * 1000 };
}

/** Claude Code statusline stdin → limits. resets_at arrives in epoch seconds. */
export function parseStatusline(raw: unknown, observedAt: number): Limits | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rl = (raw as Record<string, unknown>).rate_limits;
  if (typeof rl !== 'object' || rl === null) return null;
  const r = rl as Record<string, unknown>;
  const fiveHour = window(r.five_hour);
  const sevenDay = window(r.seven_day);
  if (fiveHour === null || sevenDay === null) return null;
  if (!fiveHour && !sevenDay) return null;

  const out: Limits = { observedAt };
  if (fiveHour) out.fiveHour = fiveHour;
  if (sevenDay) out.sevenDay = sevenDay;
  return out;
}

const reset = (w: LimitWindow, now: number): LimitWindow => (now >= w.resetsAt ? { ...w, usedPct: 0 } : w);

/** A window whose reset time has passed is unused, even if nobody has observed it since. */
export function effectiveLimits(l: Limits, now: number): Limits {
  const out: Limits = { observedAt: l.observedAt };
  if (l.fiveHour) out.fiveHour = reset(l.fiveHour, now);
  if (l.sevenDay) out.sevenDay = reset(l.sevenDay, now);
  return out;
}
