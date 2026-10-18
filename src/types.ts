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

/** Where a session lives inside cmux (both UUIDs, from the hook's environment). */
export interface CmuxRef {
  workspace: string;
  surface: string;
}

/** What a cmux relay receives: which tab to bring to the front. */
export interface FocusCommand extends CmuxRef {
  project: string;
}

/** What a reporter sends to the hub. Deliberately minimal: no prompts, no tool I/O. */
export interface HubEvent {
  host: string;
  sessionId: string;
  event: HookEventName;
  cwd: string;
  ts: number;
  notificationType?: string;
  toolName?: string;
  cmux?: CmuxRef;
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
  cmux?: CmuxRef;
}

export interface HostRecord {
  host: string;
  lastSeenAt: number;
  /** Last time this host's cmux relay polled the hub. */
  relaySeenAt?: number;
}

export interface Store {
  sessions: Record<string, Session>;
  hosts: Record<string, HostRecord>;
  limits?: Limits;
}

export interface SessionView extends Session {
  project: string;
  hostOnline: boolean;
  /** A click can bring this session's cmux tab to the front. */
  canFocus: boolean;
}

export interface HostView extends HostRecord {
  online: boolean;
  relay: boolean;
}

export interface View {
  generatedAt: number;
  hosts: HostView[];
  sessions: SessionView[];
  limits: Limits | null;
  /** Shell command to start the cmux relay on the hub's machine, shown as a hint. */
  relayCommand?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
