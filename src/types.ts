export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error' | 'ended';

/** What a reporter sends to the hub. Deliberately minimal: no prompts, no tool I/O. */
export interface HubEvent {
  host: string;
  sessionId: string;
  event: HookEventName;
  cwd: string;
  ts: number;
  notificationType?: string;
  toolName?: string;
}

export interface LimitWindow {
  /** 0-100 */
  usedPct: number;
  /** epoch ms */
  resetsAt: number;
}

/** Account-wide usage limits, as last seen by any host's statusline. */
export interface Limits {
  observedAt: number;
  fiveHour?: LimitWindow;
  sevenDay?: LimitWindow;
}

export interface Heartbeat {
  host: string;
  ts: number;
  limits?: Limits;
}

export interface Session {
  host: string;
  sessionId: string;
  cwd: string;
  status: SessionStatus;
  /** When the hub first heard of this session. Stable; drives seat assignment. */
  firstSeenAt: number;
  /** When the current status was entered. */
  since: number;
  lastEventAt: number;
  detail?: string;
}

export interface HostRecord {
  host: string;
  lastSeenAt: number;
}

export interface Store {
  sessions: Record<string, Session>;
  hosts: Record<string, HostRecord>;
  limits?: Limits;
}

export interface SessionView extends Session {
  project: string;
  hostOnline: boolean;
}

export interface HostView extends HostRecord {
  online: boolean;
}

export interface View {
  generatedAt: number;
  hosts: HostView[];
  sessions: SessionView[];
  limits: Limits | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
