import type { View } from '../types.ts';

/** Online hosts with cmux sessions you cannot jump to yet: their relay is not running. */
export function hostsNeedingRelay(v: View): string[] {
  const hosts = v.sessions.filter((s) => s.cmux && s.hostOnline && !s.canFocus).map((s) => s.host);
  return [...new Set(hosts)];
}
