import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createHub } from '../src/hub.ts';
import type { View } from '../src/types.ts';

const TOKEN = 'test-token-0123456789-relay';
const dir = mkdtempSync(join(tmpdir(), 'cc-panel-relay-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html>');
let clock = 1_800_000_000_000;
const hub = createHub({
  token: TOKEN,
  publicDir: dir,
  uiDir: dir,
  stateFile: join(dir, 'state.json'),
  now: () => clock,
  view: { hostTtlMs: 180_000, sessionWindowMs: 86_400_000, relayTtlMs: 60_000 },
  retentionMs: 172_800_000,
  saveDebounceMs: 0,
  relayWaitMs: 150,
  relayCommand: 'cd ~/cc-panel && npm run relay',
});
await new Promise<void>((r) => hub.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(hub.server.address() as AddressInfo).port}`;
after(() => hub.close());

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const WS = 'A74797B6-7297-46C0-A6EB-58F34F9747C9';
const SURF = '5FD931CE-E304-41CF-A1F6-2398029034B8';

const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
const poll = (host = 'laptop', headers: Record<string, string> = auth) => fetch(`${base}/api/relay/next?host=${host}`, { headers });
const state = async () => (await (await fetch(base + '/api/state', { headers: auth })).json()) as View;

await post('/api/events', { host: 'laptop', sessionId: 'in-cmux', event: 'Stop', cwd: '/p/compas', ts: clock, cmux: { workspace: WS, surface: SURF } });
await post('/api/events', { host: 'laptop', sessionId: 'plain', event: 'Stop', cwd: '/p/other', ts: clock });

test('relay endpoints require the token and a valid host', async () => {
  assert.equal((await poll('laptop', {})).status, 401);
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'in-cmux' }, { 'content-type': 'application/json' })).status, 401);
  assert.equal((await poll('a%20b')).status, 400);
});

test('focus is refused until the host has a live relay', async () => {
  const res = await post('/api/focus', { host: 'laptop', sessionId: 'in-cmux' });
  assert.equal(res.status, 409);
});

test('an idle poll returns 204 after the wait and marks the relay alive', async () => {
  const res = await poll();
  assert.equal(res.status, 204);
  const v = await state();
  assert.equal(v.hosts.find((h) => h.host === 'laptop')?.relay, true);
  assert.equal(v.sessions.find((s) => s.sessionId === 'in-cmux')?.canFocus, true);
  assert.equal(v.sessions.find((s) => s.sessionId === 'plain')?.canFocus, false);
});

test('focus reaches a waiting relay with the session tab', async () => {
  const waiting = poll();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'in-cmux' })).status, 202);
  const res = await waiting;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { workspace: WS, surface: SURF, project: 'compas' });
});

test('a queued focus is picked up by the next poll, latest wins', async () => {
  await post('/api/events', { host: 'laptop', sessionId: 'second', event: 'Stop', cwd: '/p/second', ts: clock, cmux: { workspace: SURF, surface: WS } });
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'in-cmux' })).status, 202);
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'second' })).status, 202);
  const res = await poll();
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { project: string }).project, 'second');
  assert.equal((await poll()).status, 204, 'consumed');
});

test('stale focus requests are dropped', async () => {
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'in-cmux' })).status, 202);
  clock += 30_000;
  assert.equal((await poll()).status, 204);
});

test('focus rejects unknown sessions, sessions outside cmux and bad bodies', async () => {
  await poll(); // keep the relay alive
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'nope' })).status, 404);
  assert.equal((await post('/api/focus', { host: 'laptop', sessionId: 'plain' })).status, 409);
  assert.equal((await post('/api/focus', { host: 'a b', sessionId: 'x' })).status, 400);
});

test('the state view carries the relay command the hub was configured with', async () => {
  const v = (await (await fetch(base + '/api/state', { headers: auth })).json()) as View;
  assert.equal(v.relayCommand, 'cd ~/cc-panel && npm run relay');
});
