import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_SPEC, installHooks, uninstallHooks, MARKER } from '../src/hooks-config.ts';

const CMD = `/usr/local/bin/node /p/${MARKER}/bin/report.ts event`;

const foreign = {
  model: 'opus',
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: 'mneme context' }] }],
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'orca-hook' }] }],
  },
};

function ours(settings: any): number {
  return Object.values(settings.hooks as Record<string, any[]>)
    .flat()
    .filter((g) => g.hooks.some((h: any) => h.command.includes(MARKER))).length;
}

test('adds our hooks and preserves foreign hooks and settings', () => {
  const out: any = installHooks(foreign, CMD);
  assert.equal(out.model, 'opus');
  assert.equal(out.hooks.SessionStart[0].hooks[0].command, 'mneme context');
  assert.equal(out.hooks.PreToolUse[0].hooks[0].command, 'orca-hook');
  assert.ok(ours(out) > 0);
  const pre = out.hooks.PreToolUse.find((g: any) => g.hooks[0].command === CMD);
  assert.equal(pre.matcher, 'AskUserQuestion|ExitPlanMode');
});

test('is idempotent', () => {
  const once = installHooks(foreign, CMD);
  const twice = installHooks(once, CMD);
  assert.deepEqual(twice, once);
});

test('replaces a previous install with a different command path', () => {
  const old = installHooks(foreign, `/old/node /old/${MARKER}/bin/report.ts event`);
  const out: any = installHooks(old, CMD);
  const cmds = Object.values(out.hooks as Record<string, any[]>).flat().flatMap((g) => g.hooks.map((h: any) => h.command));
  assert.ok(!cmds.some((c: string) => c.startsWith('/old/')));
});

test('uninstall removes only ours and drops emptied events', () => {
  const out: any = uninstallHooks(installHooks(foreign, CMD));
  assert.deepEqual(out, foreign);
});

test('does not mutate input', () => {
  const copy = structuredClone(foreign);
  installHooks(foreign, CMD);
  assert.deepEqual(foreign, copy);
});

test('works on settings without hooks', () => {
  const out: any = installHooks({}, CMD);
  assert.ok(ours(out) > 0);
  assert.deepEqual(uninstallHooks(out), {});
});

test('Codex spec: only events Codex has, no matchers, foreign hooks kept, idempotent', () => {
  const codexFile = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'orca codex-hook' }] }] } };
  const out: any = installHooks(codexFile, CODEX_SPEC_CMD, CODEX_SPEC);
  assert.equal(out.hooks.Stop[0].hooks[0].command, 'orca codex-hook');
  const ours = Object.entries(out.hooks as Record<string, any[]>).filter(([, gs]) => gs.some((g) => g.hooks[0].command === CODEX_SPEC_CMD));
  assert.deepEqual(ours.map(([e]) => e).sort(), ['Interrupt', 'PermissionRequest', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const [, gs] of ours) for (const g of gs) assert.equal(g.matcher, undefined);
  assert.deepEqual(installHooks(out, CODEX_SPEC_CMD, CODEX_SPEC), out);
  assert.deepEqual(uninstallHooks(out), codexFile);
});

const CODEX_SPEC_CMD = `/n /p/${MARKER}/bin/report.ts event codex`;
