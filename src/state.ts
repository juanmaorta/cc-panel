import { basename } from 'node:path';
import { effectiveLimits } from './limits.ts';
import type { Heartbeat, HubEvent, Session, SessionStatus, Store, View } from './types.ts';

/** Tools that block on the user even when no permission prompt is involved. */
const BLOCKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const BLOCKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog']);

const URGENCY: Record<SessionStatus, number> = {
  waiting: 0,
  error: 1,
  done: 2,
  working: 3,
  idle: 4,
  ended: 5,
};

export function emptyStore(): Store {
  return { sessions: {}, hosts: {} };
}

export function sessionKey(host: string, sessionId: string): string {
  return `${host}/${sessionId}`;
}

interface Transition {
  status: SessionStatus;
  detail?: string;
}

/** null = the event says nothing about status (it still counts as activity). */
function transition(ev: HubEvent): Transition | null {
  switch (ev.event) {
    case 'SessionStart':
      return { status: 'idle' };
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return { status: 'working' };
    case 'PreToolUse':
      return ev.toolName && BLOCKING_TOOLS.has(ev.toolName)
        ? { status: 'waiting', detail: ev.toolName === 'ExitPlanMode' ? 'plan' : 'question' }
        : { status: 'working' };
    case 'PermissionRequest':
      return { status: 'waiting', detail: `permission: ${ev.toolName ?? 'unknown'}` };
    case 'Notification':
      return ev.notificationType && BLOCKING_NOTIFICATIONS.has(ev.notificationType)
        ? { status: 'waiting', detail: ev.notificationType }
        : null;
    case 'Stop':
      return { status: 'done' };
    case 'StopFailure':
      return { status: 'error' };
    case 'SessionEnd':
      return { status: 'ended' };
    case 'Interrupt':
      return { status: 'idle' };
  }
}

function touchHost(store: Store, host: string, ts: number): Store['hosts'] {
  const prev = store.hosts[host];
  if (prev && prev.lastSeenAt >= ts) return store.hosts;
  return { ...store.hosts, [host]: { ...prev, host, lastSeenAt: ts } };
}

/** A relay poll proves both the host and its cmux relay are alive. */
export function applyRelaySeen(store: Store, host: string, ts: number): Store {
  const hosts = touchHost(store, host, ts);
  const h = hosts[host]!;
  if ((h.relaySeenAt ?? 0) >= ts) return { ...store, hosts };
  return { ...store, hosts: { ...hosts, [host]: { ...h, relaySeenAt: ts } } };
}

export function applyEvent(store: Store, ev: HubEvent): Store {
  const key = sessionKey(ev.host, ev.sessionId);
  const prev = store.sessions[key];
  const hosts = touchHost(store, ev.host, ev.ts);

  // Hooks run as separate processes and can race; never let an older event win.
  if (prev && ev.ts < prev.lastEventAt) return { ...store, hosts };

  const t = transition(ev);
  const status = t?.status ?? prev?.status ?? 'idle';
  const next: Session = {
    host: ev.host,
    sessionId: ev.sessionId,
    cwd: ev.cwd,
    status,
    firstSeenAt: prev?.firstSeenAt ?? ev.ts,
    since: prev && prev.status === status ? prev.since : ev.ts,
    lastEventAt: ev.ts,
  };
  const detail = t ? t.detail : prev?.detail;
  if (detail !== undefined) next.detail = detail;
  const name = ev.name ?? prev?.name;
  if (name) next.name = name;
  const agent = ev.agent ?? prev?.agent;
  if (agent) next.agent = agent;
  // Codex hooks run in its daemon, so any cmux tab they carry is the daemon's, not the session's.
  const cmux = agent === 'codex' ? undefined : (ev.cmux ?? prev?.cmux);
  if (cmux) next.cmux = cmux;

  return { ...store, sessions: { ...store.sessions, [key]: next }, hosts };
}

export function applyHeartbeat(store: Store, hb: Heartbeat): Store {
  const next: Store = { ...store, hosts: touchHost(store, hb.host, hb.ts) };
  // Limits are per account, not per host: the freshest observation wins.
  if (hb.limits && (!store.limits || hb.limits.observedAt > store.limits.observedAt)) next.limits = hb.limits;
  return next;
}

export interface ViewOptions {
  hostTtlMs: number;
  sessionWindowMs: number;
  /** How long after its last poll a relay still counts as connected. */
  relayTtlMs?: number;
  /**
   * Codex 0.163 has no SessionEnd: a Codex session that is done/idle and silent for this
   * long is hidden (it comes back with its next event). Waiting ones always stay.
   */
  codexQuietMs?: number;
}

const DEFAULT_CODEX_QUIET_MS = 30 * 60_000;

const DEFAULT_RELAY_TTL_MS = 60_000;

export function buildView(store: Store, now: number, opts: ViewOptions): View {
  const online = (host: string) => {
    const h = store.hosts[host];
    return h !== undefined && now - h.lastSeenAt <= opts.hostTtlMs;
  };

  const relayTtl = opts.relayTtlMs ?? DEFAULT_RELAY_TTL_MS;
  const relay = (host: string) => {
    const seen = store.hosts[host]?.relaySeenAt;
    return seen !== undefined && now - seen <= relayTtl;
  };

  const hosts = Object.values(store.hosts)
    .map((h) => ({ ...h, online: online(h.host), relay: relay(h.host) }))
    .sort((a, b) => a.host.localeCompare(b.host));

  const sessions = Object.values(store.sessions)
    .filter((s) => s.status !== 'ended' && now - s.lastEventAt <= opts.sessionWindowMs)
    .filter(
      (s) =>
        s.agent !== 'codex' ||
        !(s.status === 'done' || s.status === 'idle') ||
        now - s.lastEventAt <= (opts.codexQuietMs ?? DEFAULT_CODEX_QUIET_MS),
    )
    .map((s) => ({
      ...s,
      project: basename(s.cwd) || s.cwd,
      hostOnline: online(s.host),
      canFocus: s.cmux !== undefined && s.agent !== 'codex' && online(s.host) && relay(s.host),
    }))
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || b.lastEventAt - a.lastEventAt);

  return { generatedAt: now, hosts, sessions, limits: store.limits ? effectiveLimits(store.limits, now) : null };
}

export function prune(store: Store, now: number, retentionMs: number): Store {
  const sessions = Object.fromEntries(
    Object.entries(store.sessions).filter(([, s]) => now - s.lastEventAt <= retentionMs),
  );
  const hosts = Object.fromEntries(Object.entries(store.hosts).filter(([, h]) => now - h.lastSeenAt <= retentionMs));
  return { ...store, sessions, hosts };
}
