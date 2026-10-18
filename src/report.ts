import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HOOK_EVENTS, type Agent, type HookEventName, type HubEvent } from './types.ts';
import { MAX_NAME, isSessionId, isUuid } from './validate.ts';

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Hook stdin payload → hub event. Only allow-listed fields leave the machine:
 * prompts, tool inputs and outputs are never forwarded.
 */
export interface EventContext {
  /** The hook's environment: carries the cmux workspace/tab when running inside cmux. */
  env?: Record<string, string | undefined>;
  /** Session title, when known (Claude Code statusline). */
  name?: string | undefined;
  agent?: Agent;
}

export function toHubEvent(payload: unknown, host: string, now: number, ctx: EventContext = {}): HubEvent | null {
  const env = ctx.env ?? {};
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const event = str(p.hook_event_name);
  const sessionId = str(p.session_id);
  const cwd = str(p.cwd);
  if (!event || !sessionId || cwd === undefined) return null;
  if (!(HOOK_EVENTS as readonly string[]).includes(event)) return null;

  const ev: HubEvent = { host, sessionId, event: event as HookEventName, cwd, ts: now, agent: ctx.agent ?? 'claude' };
  const toolName = str(p.tool_name);
  const notificationType = str(p.notification_type);
  if (toolName !== undefined) ev.toolName = toolName;
  if (notificationType !== undefined) ev.notificationType = notificationType;
  // Inside cmux, the hook inherits which workspace/tab the session runs in.
  const workspace = env.CMUX_WORKSPACE_ID;
  const surface = env.CMUX_SURFACE_ID;
  if (isUuid(workspace) && isUuid(surface)) ev.cmux = { workspace, surface };
  if (ctx.name) ev.name = ctx.name;
  return ev;
}

/** Claude Code's session title, from a statusline capture. */
export function sessionNameFrom(capture: unknown): string | undefined {
  if (typeof capture !== 'object' || capture === null) return undefined;
  const raw = (capture as Record<string, unknown>).session_name;
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().slice(0, MAX_NAME);
  return name || undefined;
}

/**
 * The statusline writes one capture per session (<dir>/<session_id>.json); hooks do not
 * receive the title, so the reporter looks it up there.
 */
export function readSessionName(dir: string, sessionId: string): string | undefined {
  if (!isSessionId(sessionId)) return undefined;
  try {
    return sessionNameFrom(JSON.parse(readFileSync(join(dir, `${sessionId}.json`), 'utf8')));
  } catch {
    return undefined;
  }
}

/** Per-session captures outlive their sessions; drop the stale ones. */
export function pruneSessionCaptures(dir: string, now: number, maxAgeMs: number): void {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const path = join(dir, f);
    try {
      if (now - statSync(path).mtimeMs > maxAgeMs) rmSync(path, { force: true });
    } catch {
      // raced with the statusline rewriting it: fine
    }
  }
}

export async function post(hubUrl: string, token: string, path: string, body: unknown, timeoutMs: number): Promise<void> {
  const res = await fetch(new URL(path, hubUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`hub responded ${res.status}`);
}
