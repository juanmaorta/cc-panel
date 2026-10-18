import { HOOK_EVENTS, type CmuxRef, type Heartbeat, type HookEventName, type HubEvent, type LimitWindow, type Limits, type Result } from './types.ts';

const HOST_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_CWD = 1024;
const MAX_TAG = 64;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function optTag(o: Obj, key: string): Result<string | undefined> {
  const v = o[key];
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== 'string' || v.length > MAX_TAG) return { ok: false, error: `invalid ${key}` };
  return { ok: true, value: v };
}

const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function parseCmux(v: unknown): Result<CmuxRef> {
  if (!isObj(v) || !isUuid(v.workspace) || !isUuid(v.surface)) return { ok: false, error: 'invalid cmux' };
  return { ok: true, value: { workspace: v.workspace, surface: v.surface } };
}

export function isHost(v: unknown): v is string {
  return typeof v === 'string' && HOST_RE.test(v);
}

export function parseEvent(body: unknown): Result<HubEvent> {
  if (!isObj(body)) return { ok: false, error: 'body must be an object' };
  const { host, sessionId, event, cwd, ts } = body;
  if (!isHost(host)) return { ok: false, error: 'invalid host' };
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return { ok: false, error: 'invalid sessionId' };
  if (typeof event !== 'string' || !(HOOK_EVENTS as readonly string[]).includes(event)) {
    return { ok: false, error: 'invalid event' };
  }
  if (typeof cwd !== 'string' || cwd.length > MAX_CWD) return { ok: false, error: 'invalid cwd' };
  if (!isTs(ts)) return { ok: false, error: 'invalid ts' };

  const toolName = optTag(body, 'toolName');
  if (!toolName.ok) return toolName;
  const notificationType = optTag(body, 'notificationType');
  if (!notificationType.ok) return notificationType;

  const value: HubEvent = { host, sessionId, event: event as HookEventName, cwd, ts };
  if (toolName.value !== undefined) value.toolName = toolName.value;
  if (notificationType.value !== undefined) value.notificationType = notificationType.value;
  if (body.cmux !== undefined) {
    const cmux = parseCmux(body.cmux);
    if (!cmux.ok) return cmux;
    value.cmux = cmux.value;
  }
  return { ok: true, value };
}

function parseWindow(v: unknown): LimitWindow | null {
  if (!isObj(v)) return null;
  const { usedPct, resetsAt } = v;
  if (typeof usedPct !== 'number' || !(usedPct >= 0 && usedPct <= 100) || !isTs(resetsAt)) return null;
  return { usedPct, resetsAt };
}

function parseLimits(v: unknown): Result<Limits> {
  if (!isObj(v) || !isTs(v.observedAt)) return { ok: false, error: 'invalid limits' };
  const out: Limits = { observedAt: v.observedAt };
  for (const key of ['fiveHour', 'sevenDay'] as const) {
    if (v[key] === undefined) continue;
    const w = parseWindow(v[key]);
    if (!w) return { ok: false, error: `invalid limits.${key}` };
    out[key] = w;
  }
  return { ok: true, value: out };
}

export function parseHeartbeat(body: unknown): Result<Heartbeat> {
  if (!isObj(body)) return { ok: false, error: 'body must be an object' };
  if (!isHost(body.host)) return { ok: false, error: 'invalid host' };
  if (!isTs(body.ts)) return { ok: false, error: 'invalid ts' };
  const value: Heartbeat = { host: body.host, ts: body.ts };
  if (body.limits !== undefined) {
    const limits = parseLimits(body.limits);
    if (!limits.ok) return limits;
    value.limits = limits.value;
  }
  return { ok: true, value };
}

export interface FocusRequest {
  host: string;
  sessionId: string;
}

export function parseFocusRequest(body: unknown): Result<FocusRequest> {
  if (!isObj(body)) return { ok: false, error: 'body must be an object' };
  if (!isHost(body.host)) return { ok: false, error: 'invalid host' };
  if (typeof body.sessionId !== 'string' || !SESSION_RE.test(body.sessionId)) return { ok: false, error: 'invalid sessionId' };
  return { ok: true, value: { host: body.host, sessionId: body.sessionId } };
}
