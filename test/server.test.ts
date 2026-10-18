import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createHub } from '../src/hub.ts';
import type { View } from '../src/types.ts';

const TOKEN = 'test-token-0123456789';
const dir = mkdtempSync(join(tmpdir(), 'cc-panel-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
const uiDir = mkdtempSync(join(tmpdir(), 'cc-panel-ui-'));
writeFileSync(join(uiDir, 'app.ts'), "import type { View } from '../types.ts';\nexport const n: number = 1;\n");
const stateFile = join(dir, 'state.json');

let clock = 1_800_000_000_000;
const hub = createHub({
  token: TOKEN,
  publicDir: dir,
  uiDir,
  stateFile,
  now: () => clock,
  view: { hostTtlMs: 180_000, sessionWindowMs: 86_400_000 },
  retentionMs: 172_800_000,
  saveDebounceMs: 0,
});
await new Promise<void>((r) => hub.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(hub.server.address() as AddressInfo).port}`;
after(() => hub.close());

const auth = { authorization: `Bearer ${TOKEN}` };
const json = { 'content-type': 'application/json' };

function post(path: string, body: unknown, headers: Record<string, string> = auth) {
  return fetch(base + path, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });
}

const event = { host: 'laptop', sessionId: 's1', event: 'UserPromptSubmit', cwd: '/p/foo', ts: clock };

test('rejects requests without a valid token', async () => {
  assert.equal((await post('/api/events', event, {})).status, 401);
  assert.equal((await post('/api/events', event, { authorization: 'Bearer nope' })).status, 401);
  assert.equal((await fetch(base + '/api/state')).status, 401);
});

test('rejects invalid bodies', async () => {
  assert.equal((await post('/api/events', { ...event, event: 'Nope' })).status, 400);
  const raw = await fetch(base + '/api/events', { method: 'POST', headers: { ...json, ...auth }, body: '{not json' });
  assert.equal(raw.status, 400);
});

test('rejects oversized bodies', async () => {
  const res = await post('/api/events', { ...event, cwd: 'x'.repeat(20_000) });
  assert.equal(res.status, 413);
});

test('accepts events and exposes them in the state view', async () => {
  assert.equal((await post('/api/events', event)).status, 204);
  assert.equal((await post('/api/events', { ...event, event: 'Stop', ts: clock + 1 })).status, 204);
  const res = await fetch(base + '/api/state', { headers: auth });
  assert.equal(res.status, 200);
  const view = (await res.json()) as View;
  assert.equal(view.sessions.length, 1);
  assert.equal(view.sessions[0]?.status, 'done');
  assert.equal(view.sessions[0]?.project, 'foo');
  assert.equal(view.hosts[0]?.online, true);
});

test('heartbeat keeps a host online', async () => {
  clock += 170_000;
  assert.equal((await post('/api/heartbeat', { host: 'laptop', ts: clock })).status, 204);
  clock += 170_000;
  const view = (await (await fetch(base + '/api/state', { headers: auth })).json()) as View;
  assert.equal(view.hosts[0]?.online, true);
});

test('persists state to disk', async () => {
  await hub.flush();
  assert.ok(existsSync(stateFile));
  const stored = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(stored.sessions['laptop/s1'].status, 'done');
});

test('restores persisted state on start', async () => {
  const other = createHub({
    token: TOKEN,
    publicDir: dir,
    uiDir,
    stateFile,
    now: () => clock,
    view: { hostTtlMs: 180_000, sessionWindowMs: 86_400_000 },
    retentionMs: 172_800_000,
    saveDebounceMs: 0,
  });
  assert.equal(other.snapshot().sessions['laptop/s1']?.status, 'done');
  await other.close();
});

test('starts empty on a corrupt state file', async () => {
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{oops');
  const other = createHub({
    token: TOKEN,
    publicDir: dir,
    uiDir,
    stateFile: bad,
    now: () => clock,
    view: { hostTtlMs: 1, sessionWindowMs: 1 },
    retentionMs: 1,
    saveDebounceMs: 0,
    log: () => {},
  });
  assert.deepEqual(other.snapshot(), { sessions: {}, hosts: {} });
  await other.close();
});

test('serves the UI without auth and 404s the rest', async () => {
  const ui = await fetch(base + '/');
  assert.equal(ui.status, 200);
  assert.match(ui.headers.get('content-type') ?? '', /text\/html/);
  assert.equal((await fetch(base + '/../etc/passwd')).status, 404);
  assert.equal((await fetch(base + '/api/nope', { headers: auth })).status, 404);
});

test('serves UI modules as type-stripped JavaScript', async () => {
  const res = await fetch(base + '/ui/app.ts');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/javascript/);
  const body = await res.text();
  assert.match(body, /export const n\s*= 1;/);
  assert.doesNotMatch(body, /: number/);
  assert.doesNotMatch(body, /import type/);
});

test('UI module route rejects traversal and unknown files', async () => {
  assert.equal((await fetch(base + '/ui/missing.ts')).status, 404);
  assert.equal((await fetch(base + '/ui/..%2Fhub.ts')).status, 404);
  assert.equal((await fetch(base + '/ui/App.ts')).status, 404);
});
