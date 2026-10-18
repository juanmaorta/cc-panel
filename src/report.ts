import { HOOK_EVENTS, type HookEventName, type HubEvent } from './types.ts';
import { isUuid } from './validate.ts';

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Hook stdin payload → hub event. Only allow-listed fields leave the machine:
 * prompts, tool inputs and outputs are never forwarded.
 */
export function toHubEvent(
  payload: unknown,
  host: string,
  now: number,
  env: Record<string, string | undefined> = {},
): HubEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const event = str(p.hook_event_name);
  const sessionId = str(p.session_id);
  const cwd = str(p.cwd);
  if (!event || !sessionId || cwd === undefined) return null;
  if (!(HOOK_EVENTS as readonly string[]).includes(event)) return null;

  const ev: HubEvent = { host, sessionId, event: event as HookEventName, cwd, ts: now };
  const toolName = str(p.tool_name);
  const notificationType = str(p.notification_type);
  if (toolName !== undefined) ev.toolName = toolName;
  if (notificationType !== undefined) ev.notificationType = notificationType;
  // Inside cmux, the hook inherits which workspace/tab the session runs in.
  const workspace = env.CMUX_WORKSPACE_ID;
  const surface = env.CMUX_SURFACE_ID;
  if (isUuid(workspace) && isUuid(surface)) ev.cmux = { workspace, surface };
  return ev;
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
