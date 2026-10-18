import type { FocusCommand, Result } from './types.ts';
import { isUuid } from './validate.ts';

const MAX_PROJECT = 256;
const CMUX_BUNDLE_ID = 'com.cmuxterm.app';

/** The hub is trusted, but the relay acts on its input: validate before touching cmux. */
export function parseFocusCommand(body: unknown): Result<FocusCommand> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'not an object' };
  const { workspace, surface, project } = body as Record<string, unknown>;
  if (!isUuid(workspace) || !isUuid(surface)) return { ok: false, error: 'invalid cmux ids' };
  if (typeof project !== 'string' || project.length > MAX_PROJECT) return { ok: false, error: 'invalid project' };
  return { ok: true, value: { workspace, surface, project } };
}

/**
 * The only things the relay ever runs. argv lists for execFile: no shell is involved,
 * and the only variable parts are UUIDs validated above.
 */
export function focusArgv(cmd: FocusCommand, cmuxBin: string): string[][] {
  return [
    [cmuxBin, 'workspace', 'select', '--workspace', cmd.workspace],
    [cmuxBin, 'focus-panel', '--panel', cmd.surface, '--workspace', cmd.workspace],
    ['/usr/bin/open', '-b', CMUX_BUNDLE_ID],
  ];
}

/** cmux only accepts socket clients started from its own terminals. */
export function insideCmux(env: Record<string, string | undefined>): boolean {
  return Boolean(env.CMUX_WORKSPACE_ID && env.CMUX_SOCKET_PATH);
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}
