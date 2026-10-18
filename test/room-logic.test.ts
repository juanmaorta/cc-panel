import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSeats, buildRooms, hashString, lookFor, poseFor, urgentKey, MAX_ROOMS } from '../src/ui/room-logic.ts';
import type { SessionStatus, SessionView, View } from '../src/types.ts';

let seq = 0;
function s(id: string, status: SessionStatus = 'working', extra: Partial<SessionView> = {}): SessionView {
  seq++;
  return {
    host: 'laptop', sessionId: id, cwd: `/p/${id}`, project: id, status,
    firstSeenAt: seq, since: 0, lastEventAt: 0, hostOnline: true, ...extra,
  };
}

const ids = (xs: (SessionView | null)[]) => xs.map((x) => x?.sessionId ?? null);

test('hashString is deterministic and spreads', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
  assert.ok(hashString('x') >= 0);
});

test('every session gets a desk when they fit, no duplicates', () => {
  const seating = assignSeats([s('a'), s('b'), s('c')], 6, 3);
  const taken = seating.desks.filter(Boolean);
  assert.equal(taken.length, 3);
  assert.equal(new Set(ids(taken)).size, 3);
  assert.deepEqual(seating.sofa, []);
  assert.deepEqual(seating.overflow, { count: 0, urgent: 0 });
});

test('seats are stable when a newer session arrives', () => {
  const a = s('alpha'), b = s('bravo'), c = s('charlie');
  const before = ids(assignSeats([a, b, c], 6, 3).desks);
  const after = ids(assignSeats([s('zulu-new'), c, a, b], 6, 3).desks);
  for (const id of ['alpha', 'bravo', 'charlie']) {
    assert.equal(after.indexOf(id), before.indexOf(id), `${id} moved`);
  }
});

test('seats do not depend on input order', () => {
  const xs = [s('a'), s('b'), s('c'), s('d')];
  assert.deepEqual(ids(assignSeats(xs, 6, 3).desks), ids(assignSeats([...xs].reverse(), 6, 3).desks));
});

test('when desks run out, idle sessions go to the sofa and active ones keep desks', () => {
  const active = [s('w1', 'working'), s('w2', 'waiting'), s('w3', 'done')];
  const idle = [s('i1', 'idle'), s('i2', 'idle'), s('i3', 'idle'), s('i4', 'idle')];
  const seating = assignSeats([...idle, ...active], 4, 3);
  const atDesks = ids(seating.desks);
  for (const a of active) assert.ok(atDesks.includes(a.sessionId), `${a.sessionId} has no desk`);
  assert.equal(seating.desks.filter(Boolean).length, 4);
  assert.equal(seating.sofa.length, 3);
  assert.ok(seating.sofa.every((x) => x.status === 'idle'));
  assert.deepEqual(seating.overflow, { count: 0, urgent: 0 });
});

test('when desks are scarce, sessions that need you beat working ones', () => {
  const seating = assignSeats([s('w1', 'working'), s('w2', 'working'), s('x', 'waiting')], 2, 0);
  assert.ok(ids(seating.desks).includes('x'));
  assert.deepEqual(seating.overflow, { count: 1, urgent: 0 });
});

test('overflow counts what fits nowhere, flagging urgent ones', () => {
  const xs = [s('a', 'waiting'), s('b', 'waiting'), s('c', 'waiting'), s('d', 'idle'), s('e', 'idle')];
  const seating = assignSeats(xs, 2, 1);
  assert.equal(seating.desks.filter(Boolean).length, 2);
  assert.equal(seating.sofa.length, 1);
  assert.deepEqual(seating.overflow, { count: 2, urgent: 1 });
});

test('rooms follow host order (same as ARMS slots) and include empty hosts', () => {
  const v: View = {
    generatedAt: 0,
    hosts: [
      { host: 'laptop', lastSeenAt: 0, online: true },
      { host: 'desktop', lastSeenAt: 0, online: false },
    ],
    sessions: [s('m1', 'working', { host: 'desktop', hostOnline: false })],
    limits: null,
  };
  const rooms = buildRooms(v);
  assert.deepEqual(rooms.map((r) => [r.slot, r.host, r.online]), [[1, 'laptop', true], [2, 'desktop', false]]);
  assert.equal(rooms[0]?.seating.desks.filter(Boolean).length, 0);
  assert.equal(rooms[1]?.seating.desks.filter(Boolean).length, 1);
});

test('rooms are capped like ARMS slots', () => {
  const hosts = Array.from({ length: 9 }, (_, i) => ({ host: `h${i}`, lastSeenAt: 0, online: true }));
  assert.equal(buildRooms({ generatedAt: 0, hosts, sessions: [], limits: null }).length, MAX_ROOMS);
});

test('poses', () => {
  assert.equal(poseFor(s('a', 'working')), 'typing');
  assert.equal(poseFor(s('a', 'idle')), 'sleeping');
  assert.equal(poseFor(s('a', 'waiting')), 'alert');
  assert.equal(poseFor(s('a', 'done')), 'cheer');
  assert.equal(poseFor(s('a', 'error')), 'smoke');
  assert.equal(poseFor(s('a', 'waiting', { hostOnline: false })), 'sleeping', 'offline hosts sleep');
});

test('look is deterministic per session', () => {
  assert.deepEqual(lookFor('abc'), lookFor('abc'));
  const looks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(lookFor(`s${i}`))));
  assert.ok(looks.size > 10, 'looks should vary');
});

test('urgentKey points at the session that drives the face, only when it needs you', () => {
  const v = (sessions: SessionView[]): View => ({ generatedAt: 0, hosts: [], sessions, limits: null });
  assert.equal(urgentKey(v([s('a', 'working'), s('b', 'waiting')])), 'laptop/b');
  assert.equal(urgentKey(v([s('a', 'error'), s('b', 'done')])), 'laptop/a');
  assert.equal(urgentKey(v([s('a', 'working'), s('b', 'done')])), null);
  assert.equal(urgentKey(v([s('a', 'waiting', { hostOnline: false })])), null);
});
