import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneSessionCaptures, readSessionName, sessionNameFrom, toHubEvent } from '../src/report.ts';

const base = { session_id: 'abc-123', cwd: '/Users/j/p', transcript_path: '/t.jsonl' };

test('maps the fields the hub needs and nothing else', () => {
  const ev = toHubEvent(
    { ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    'laptop',
    42,
  );
  assert.deepEqual(ev, {
    host: 'laptop',
    sessionId: 'abc-123',
    event: 'PermissionRequest',
    cwd: '/Users/j/p',
    ts: 42,
    agent: 'claude',
    toolName: 'Bash',
  });
});

test('keeps notification_type', () => {
  const ev = toHubEvent({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'm' }, 'laptop', 1);
  assert.equal(ev?.notificationType, 'idle_prompt');
});

test('returns null for events the hub does not track or garbage', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'SubagentStop' }, 'laptop', 1), null);
  assert.equal(toHubEvent({ hook_event_name: 'Stop' }, 'laptop', 1), null);
  assert.equal(toHubEvent(null, 'laptop', 1), null);
  assert.equal(toHubEvent('x', 'laptop', 1), null);
});

const WS = 'A74797B6-7297-46C0-A6EB-58F34F9747C9';
const SURF = '5FD931CE-E304-41CF-A1F6-2398029034B8';

test('picks up the cmux workspace and surface from the hook environment', () => {
  const ev = toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { env: { CMUX_WORKSPACE_ID: WS, CMUX_SURFACE_ID: SURF } });
  assert.deepEqual(ev?.cmux, { workspace: WS, surface: SURF });
});

test('ignores cmux ids that are missing or not UUIDs', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { env: {} })?.cmux, undefined);
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { env: { CMUX_WORKSPACE_ID: WS } })?.cmux, undefined);
  assert.equal(
    toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { env: { CMUX_WORKSPACE_ID: '; rm -rf /', CMUX_SURFACE_ID: SURF } })?.cmux,
    undefined,
  );
});

test('carries the session title when there is one', () => {
  const ev = toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { name: 'Tweet de Kacper' });
  assert.equal(ev?.name, 'Tweet de Kacper');
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1)?.name, undefined);
});

test('session title comes from the statusline capture, trimmed and bounded', () => {
  assert.equal(sessionNameFrom({ session_name: '  Refactor auth  ' }), 'Refactor auth');
  assert.equal(sessionNameFrom({ session_name: '' }), undefined);
  assert.equal(sessionNameFrom({ session_name: 42 }), undefined);
  assert.equal(sessionNameFrom({}), undefined);
  assert.equal(sessionNameFrom(null), undefined);
  assert.equal(sessionNameFrom({ session_name: 'x'.repeat(500) })?.length, 120);
});

test('readSessionName reads <dir>/<id>.json and refuses unsafe ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-panel-sess-'));
  writeFileSync(join(dir, 'abc-123.json'), JSON.stringify({ session_name: 'Hola' }));
  assert.equal(readSessionName(dir, 'abc-123'), 'Hola');
  assert.equal(readSessionName(dir, 'missing'), undefined);
  assert.equal(readSessionName(dir, '../abc-123'), undefined);
  writeFileSync(join(dir, 'broken.json'), '{nope');
  assert.equal(readSessionName(dir, 'broken'), undefined);
});

test('pruneSessionCaptures removes captures older than the max age', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-panel-prune-'));
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'old.json'), '{}');
  writeFileSync(join(dir, 'new.json'), '{}');
  const now = Date.now();
  utimesSync(join(dir, 'old.json'), new Date(now - 3 * 86_400_000), new Date(now - 3 * 86_400_000));
  pruneSessionCaptures(dir, now, 2 * 86_400_000);
  assert.equal(existsSync(join(dir, 'old.json')), false);
  assert.equal(existsSync(join(dir, 'new.json')), true);
  assert.equal(existsSync(join(dir, 'sub')), true, 'only .json files are touched');
  pruneSessionCaptures(join(dir, 'nope'), now, 1); // missing dir is fine
});

test('tags the agent; Claude is the default', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1)?.agent, 'claude');
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Stop' }, 'laptop', 1, { agent: 'codex' })?.agent, 'codex');
});

test('maps Codex-only events', () => {
  assert.equal(toHubEvent({ ...base, hook_event_name: 'Interrupt' }, 'laptop', 1, { agent: 'codex' })?.event, 'Interrupt');
});
