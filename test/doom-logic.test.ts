import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barState, flashFor, healthTier } from '../src/ui/doom-logic.ts';
import type { SessionStatus, SessionView, View } from '../src/types.ts';

function s(id: string, status: SessionStatus, host = 'laptop', hostOnline = true): SessionView {
  return { host, sessionId: id, cwd: `/p/${id}`, project: id, status, firstSeenAt: 0, since: 0, lastEventAt: 0, hostOnline };
}

function view(sessions: SessionView[], extra: Partial<View> = {}): View {
  return {
    generatedAt: 0,
    hosts: [{ host: 'laptop', lastSeenAt: 0, online: true }],
    sessions,
    limits: { observedAt: 0, fiveHour: { usedPct: 9, resetsAt: 1 }, sevenDay: { usedPct: 1, resetsAt: 1 } },
    ...extra,
  };
}

test('health tiers follow Doom: more damage as health drops', () => {
  assert.equal(healthTier(100), 0);
  assert.equal(healthTier(80), 0);
  assert.equal(healthTier(79), 1);
  assert.equal(healthTier(40), 2);
  assert.equal(healthTier(39), 3);
  assert.equal(healthTier(1), 4);
  assert.equal(healthTier(null), 0);
});

test('bar: health/armor are what is left of the limits', () => {
  const b = barState(view([]));
  assert.equal(b.health, 91);
  assert.equal(b.armor, 99);
});

test('bar: unknown limits show as null, not 100', () => {
  const b = barState(view([], { limits: null }));
  assert.equal(b.health, null);
  assert.equal(b.armor, null);
});

test('bar: face takes the most urgent session status', () => {
  assert.equal(barState(view([s('a', 'idle'), s('b', 'working')])).face.expression, 'working');
  assert.equal(barState(view([s('a', 'done'), s('b', 'working')])).face.expression, 'done');
  assert.equal(barState(view([s('a', 'done'), s('b', 'error')])).face.expression, 'error');
  assert.equal(barState(view([s('a', 'error'), s('b', 'waiting')])).face.expression, 'waiting');
  assert.equal(barState(view([])).face.expression, 'idle');
});

test('bar: sessions on offline hosts do not drive the face', () => {
  assert.equal(barState(view([s('a', 'waiting', 'desktop', false), s('b', 'idle')])).face.expression, 'idle');
});

test('bar: dead when the 5h window is exhausted', () => {
  const v = view([s('a', 'working')], { limits: { observedAt: 0, fiveHour: { usedPct: 100, resetsAt: 1 } } });
  assert.deepEqual(barState(v).face, { expression: 'dead', tier: 4 });
});

test('bar: keys, tally and ammo', () => {
  const b = barState(view([s('a', 'waiting'), s('b', 'done'), s('c', 'done'), s('d', 'idle'), s('e', 'error')]));
  assert.deepEqual(b.keys, { red: true, yellow: true, blue: false });
  assert.deepEqual(b.tally, { waiting: 2, done: 2, working: 0, idle: 1 });
  assert.equal(b.ammo, 5);
});

test('bar: arms = up to 6 host slots, lit when online', () => {
  const b = barState(
    view([], {
      hosts: [
        { host: 'laptop', lastSeenAt: 0, online: true },
        { host: 'desktop', lastSeenAt: 0, online: false },
      ],
    }),
  );
  assert.deepEqual(b.arms, [
    { slot: 1, host: 'laptop', online: true },
    { slot: 2, host: 'desktop', online: false },
    { slot: 3, host: null, online: false },
    { slot: 4, host: null, online: false },
    { slot: 5, host: null, online: false },
    { slot: 6, host: null, online: false },
  ]);
});

test('flash: pain when a session starts waiting or fails, pickup when one finishes', () => {
  const before = view([s('a', 'working'), s('b', 'working')]);
  assert.equal(flashFor(null, before), null, 'no flash on first load');
  assert.equal(flashFor(before, before), null);
  assert.equal(flashFor(before, view([s('a', 'done'), s('b', 'working')])), 'pickup');
  assert.equal(flashFor(before, view([s('a', 'waiting'), s('b', 'working')])), 'pain');
  assert.equal(flashFor(before, view([s('a', 'done'), s('b', 'error')])), 'pain', 'pain wins');
  assert.equal(flashFor(before, view([s('a', 'done'), s('b', 'working'), s('c', 'done')])), 'pickup');
  const waiting = view([s('a', 'waiting')]);
  assert.equal(flashFor(waiting, waiting), null, 'only on transitions');
});
