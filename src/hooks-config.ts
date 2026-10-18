/** Substring that identifies hook commands owned by this project. */
export const MARKER = 'cc-panel';

interface HookCommand {
  type: string;
  command: string;
  timeout?: number;
  [k: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
  [k: string]: unknown;
}

type Settings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };

export type HookSpec = ReadonlyArray<readonly [event: string, matcher: string | undefined]>;

/** Event → matcher (undefined = all). PostToolUse is unfiltered: it is what clears `waiting`. */
export const CLAUDE_SPEC: HookSpec = [
  ['SessionStart', undefined],
  ['UserPromptSubmit', undefined],
  ['PreToolUse', 'AskUserQuestion|ExitPlanMode'],
  ['PostToolUse', '*'],
  ['PermissionRequest', '*'],
  ['Notification', undefined],
  ['Stop', undefined],
  ['StopFailure', undefined],
  ['SessionEnd', undefined],
];

/** Codex (0.163): same hook format, its own event set, no matchers. */
export const CODEX_SPEC: HookSpec = [
  ['SessionStart', undefined],
  ['UserPromptSubmit', undefined],
  ['PermissionRequest', undefined],
  ['PostToolUse', undefined],
  ['Stop', undefined],
  ['Interrupt', undefined],
];

const isOurs = (g: HookGroup) => g.hooks.some((h) => typeof h.command === 'string' && h.command.includes(MARKER));

export function uninstallHooks<T extends Settings>(settings: T): T {
  if (!settings.hooks) return structuredClone(settings);
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups.filter((g) => !isOurs(g));
    if (kept.length > 0) hooks[event] = structuredClone(kept);
  }
  const out = structuredClone(settings);
  if (Object.keys(hooks).length > 0) out.hooks = hooks;
  else delete out.hooks;
  return out;
}

export function installHooks<T extends Settings>(settings: T, command: string, spec: HookSpec = CLAUDE_SPEC): T {
  const out = uninstallHooks(settings);
  const hooks = out.hooks ?? {};
  for (const [event, matcher] of spec) {
    const group: HookGroup = { hooks: [{ type: 'command', command, timeout: 5 }] };
    if (matcher !== undefined) group.matcher = matcher;
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  out.hooks = hooks;
  return out;
}
