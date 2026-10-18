import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvent, parseHeartbeat } from '../src/validate.ts';

const valid = { host: 'Jane-Laptop', sessionId: 'a1b2-c3', event: 'Stop', cwd: '/x', ts: 1 };

test('accepts a valid event and keeps optional fields', () => {
  const r = parseEvent({ ...valid, toolName: 'Bash', notificationType: 'permission_prompt' });
  assert.ok(r.ok);
  assert.equal(r.value.toolName, 'Bash');
  assert.equal(r.value.notificationType, 'permission_prompt');
});

test('drops unknown fields', () => {
  const r = parseEvent({ ...valid, prompt: 'secret stuff', tool_input: { a: 1 } });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.value).sort(), ['cwd', 'event', 'host', 'sessionId', 'ts']);
});

test('rejects malformed events', () => {
  const bad: unknown[] = [
    null,
    'x',
    [],
    { ...valid, event: 'Nope' },
    { ...valid, host: '' },
    { ...valid, host: 'a/b' },
    { ...valid, host: 'x'.repeat(65) },
    { ...valid, sessionId: '../etc' },
    { ...valid, cwd: 42 },
    { ...valid, cwd: 'x'.repeat(1025) },
    { ...valid, ts: '1' },
    { ...valid, ts: Number.NaN },
    { ...valid, ts: -1 },
    { ...valid, toolName: 7 },
    { ...valid, toolName: 'x'.repeat(65) },
  ];
  for (const b of bad) assert.equal(parseEvent(b).ok, false, JSON.stringify(b));
});

test('heartbeat', () => {
  assert.ok(parseHeartbeat({ host: 'desktop', ts: 5 }).ok);
  assert.equal(parseHeartbeat({ host: 'desktop' }).ok, false);
  assert.equal(parseHeartbeat({ host: 'm i', ts: 5 }).ok, false);
});

test('heartbeat with limits', () => {
  const limits = { observedAt: 1, fiveHour: { usedPct: 9, resetsAt: 2 } };
  const r = parseHeartbeat({ host: 'desktop', ts: 5, limits });
  assert.ok(r.ok);
  assert.deepEqual(r.value.limits, limits);
  assert.equal(parseHeartbeat({ host: 'desktop', ts: 5, limits: { observedAt: 1, fiveHour: { usedPct: 101, resetsAt: 2 } } }).ok, false);
  assert.equal(parseHeartbeat({ host: 'desktop', ts: 5, limits: { fiveHour: { usedPct: 1, resetsAt: 2 } } }).ok, false);
  assert.equal(parseHeartbeat({ host: 'desktop', ts: 5, limits: 'x' }).ok, false);
});
