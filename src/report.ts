import { closeSync, openSync, readSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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
  // Inside cmux, a Claude hook inherits which workspace/tab the session runs in. Codex hooks
  // run in the Codex daemon, whose env points at whatever tab started the daemon: unusable.
  const workspace = env.CMUX_WORKSPACE_ID;
  const surface = env.CMUX_SURFACE_ID;
  if (ev.agent !== 'codex' && isUuid(workspace) && isUuid(surface)) ev.cmux = { workspace, surface };
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

const INDEX_TAIL_BYTES = 2 * 1024 * 1024;

/** Tail of a file, so a long-lived index never costs more than a couple of MB per hook. */
function readTail(file: string, bytes: number): string {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Codex keeps thread titles in ~/.codex/session_index.jsonl; a rename appends a new line. */
export function readCodexThreadName(indexFile: string, sessionId: string): string | undefined {
  let text: string;
  try {
    text = readTail(indexFile, INDEX_TAIL_BYTES);
  } catch {
    return undefined;
  }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.includes(sessionId)) continue;
    try {
      const row = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
      if (row.id !== sessionId || typeof row.thread_name !== 'string') continue;
      const name = row.thread_name.trim().slice(0, MAX_NAME);
      if (name) return name;
    } catch {
      // a partial first line (tail) or a corrupt line: skip it
    }
  }
  return undefined;
}
