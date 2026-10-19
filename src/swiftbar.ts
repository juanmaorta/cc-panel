import type { SessionStatus, SessionView, View } from './types.ts';
import { age, detailLabel } from './ui/labels.ts';
import { menuState } from './ui/menubar-logic.ts';
import { hostsNeedingRelay } from './ui/relay-hint.ts';

export interface MenuConfig {
  /** Absolute node binary: SwiftBar runs actions with a minimal PATH. */
  node: string;
  /** This plugin's entrypoint, re-invoked with `focus <host> <sessionId>`. */
  script: string;
  panelUrl: string;
  /** Base64 PNGs: `calm` is a template image (tinted by macOS), `alert` is drawn in red. */
  icons: { calm: string; alert: string };
}

/** macOS system red. */
const ALERT_COLOR = '#ff3b30';

const MARK: Record<SessionStatus, string> = { waiting: '⚠', error: '✕', done: '✓', working: '»', idle: 'z', ended: '·' };

/**
 * SwiftBar splits a line on `|` into text and parameters, and every line is an item.
 * Anything that comes from a session (titles, folders) must not be able to add either.
 */
export function clean(text: string): string {
  return text.replace(/\|/g, '¦').replace(/[\r\n]+/g, ' ').trim();
}

/** SwiftBar parameter values with spaces must be quoted. */
const param = (v: string) => (/\s/.test(v) ? `"${v.replace(/"/g, '')}"` : v);

function sessionLine(s: SessionView, now: number, cfg: MenuConfig): string {
  const parts = [
    s.name ?? s.project,
    s.agent === 'codex' ? 'codex' : undefined,
    detailLabel(s.detail),
    s.hostOnline ? undefined : 'offline',
    age(now - s.since),
  ].filter((p): p is string => Boolean(p));
  const text = clean(`${MARK[s.status]} ${parts.join(' · ')}`);
  if (!s.canFocus) return text;
  // Focus goes through the hub and the cmux relay, same path as clicking a tile.
  return `${text} | bash=${param(cfg.node)} param1=${param(cfg.script)} param2=focus param3=${s.host} param4=${s.sessionId} terminal=false refresh=true`;
}

export function swiftbarMenu(v: View, cfg: MenuConfig): string {
  const m = menuState(v);
  // The menu bar only answers "does anything need me?": calm otherwise, whatever else runs.
  const waiting = m.tally.waiting;
  const title = waiting > 0 ? `${waiting} | image=${cfg.icons.alert} color=${ALERT_COLOR}` : ` | templateImage=${cfg.icons.calm}`;
  const out = [title, '---'];

  if (v.sessions.length === 0) out.push('Sin sesiones en 24 h');
  for (const s of v.sessions) out.push(sessionLine(s, v.generatedAt, cfg));

  out.push('---');
  const limit = (label: string, l: typeof m.fiveHour) => (l ? `${label} ${l.usedPct}% · ${l.resetsIn}` : `${label} --`);
  out.push(`${limit('5H', m.fiveHour)}   ${limit('SEM', m.sevenDay)}`);
  out.push(clean(m.hosts.map((h) => `${h.host} ${h.online ? '●' : '○'}${h.relay ? ' ⌘' : ''}`).join('   ')));
  const missing = hostsNeedingRelay(v);
  if (missing.length > 0) out.push(clean(`Sin relay de cmux en ${missing.join(', ')}: ver panel`));
  out.push(`Abrir panel | href=${cfg.panelUrl}`);
  return out.join('\n');
}
