import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flashFor, menuState, untilReset } from '../src/ui/menubar-logic.ts';
import type { SessionStatus, SessionView, View } from '../src/types.ts';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function s(id: string, status: SessionStatus, host = 'laptop', hostOnline = true): SessionView {
  return { host, sessionId: id, cwd: `/p/${id}`, project: id, status, firstSeenAt: 0, since: 0, lastEventAt: 0, hostOnline };
}

function view(sessions: SessionView[], extra: Partial<View> = {}): View {
  return {
    generatedAt: NOW,
    hosts: [{ host: 'laptop', lastSeenAt: NOW, online: true }],
    sessions,
    limits: {
      observedAt: NOW,
      fiveHour: { usedPct: 47.4, resetsAt: NOW + 72 * MIN },
      sevenDay: { usedPct: 12, resetsAt: NOW + 3 * 24 * 60 * MIN },
    },
    ...extra,
  };
}

test('limits show usage rounded, with time left to reset', () => {
  const m = menuState(view([]));
  assert.deepEqual(m.fiveHour, { usedPct: 47, resetsIn: '1h12' });
  assert.deepEqual(m.sevenDay, { usedPct: 12, resetsIn: '3d' });
});

test('unknown limits are null, not 0', () => {
  const m = menuState(view([], { limits: null }));
  assert.equal(m.fiveHour, null);
  assert.equal(m.sevenDay, null);
});

test('untilReset formats', () => {
  assert.equal(untilReset(NOW - 1, NOW), 'ya');
  assert.equal(untilReset(NOW + 59_000, NOW), '1m');
  assert.equal(untilReset(NOW + 45 * MIN, NOW), '45m');
  assert.equal(untilReset(NOW + 125 * MIN, NOW), '2h05');
  assert.equal(untilReset(NOW + 30 * 60 * MIN, NOW), '1d');
});

test('tally counts only live sessions; waiting includes errors', () => {
  const m = menuState(
    view([s('a', 'waiting'), s('b', 'error'), s('c', 'done'), s('d', 'working'), s('e', 'idle'), s('f', 'waiting', 'desktop', false)]),
  );
  assert.deepEqual(m.tally, { waiting: 2, done: 1, working: 1, idle: 1 });
});

test('hosts keep their order and online flag', () => {
  const m = menuState(
    view([], {
      hosts: [
        { host: 'laptop', lastSeenAt: NOW, online: true },
        { host: 'desktop', lastSeenAt: 0, online: false },
      ],
    }),
  );
  assert.deepEqual(m.hosts, [{ host: 'laptop', online: true }, { host: 'desktop', online: false }]);
});

test('flash: beep when a session starts waiting or fails, blink when one finishes', () => {
  const before = view([s('a', 'working'), s('b', 'working')]);
  assert.equal(flashFor(null, before), null, 'no flash on first load');
  assert.equal(flashFor(before, before), null);
  assert.equal(flashFor(before, view([s('a', 'done'), s('b', 'working')])), 'blink');
  assert.equal(flashFor(before, view([s('a', 'waiting'), s('b', 'working')])), 'beep');
  assert.equal(flashFor(before, view([s('a', 'done'), s('b', 'error')])), 'beep', 'beep wins');
  const waiting = view([s('a', 'waiting')]);
  assert.equal(flashFor(waiting, waiting), null, 'only on transitions');
  assert.equal(flashFor(before, view([s('a', 'waiting', 'laptop', false), s('b', 'working')])), null, 'offline hosts stay quiet');
});

test('mood: the menu bar cat shows the most urgent live state', () => {
  assert.equal(menuState(view([])).mood, 'sleep');
  assert.equal(menuState(view([s('a', 'idle'), s('b', 'working')])).mood, 'run');
  assert.equal(menuState(view([s('a', 'done'), s('b', 'working')])).mood, 'wash');
  assert.equal(menuState(view([s('a', 'done'), s('b', 'error')])).mood, 'scratch');
  assert.equal(menuState(view([s('a', 'error'), s('b', 'waiting')])).mood, 'alert');
  assert.equal(menuState(view([s('a', 'waiting', 'desktop', false)])).mood, 'sleep', 'offline hosts do not count');
});
