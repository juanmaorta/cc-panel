import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, applyHeartbeat, applyRelaySeen, buildView, emptyStore, prune, sessionKey } from '../src/state.ts';
import type { HubEvent, Store } from '../src/types.ts';

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function ev(event: HubEvent['event'], ts: number, extra: Partial<HubEvent> = {}): HubEvent {
  return { host: 'laptop', sessionId: 's1', event, cwd: '/Users/j/Projects/foo', ts, ...extra };
}

function run(events: HubEvent[]): Store {
  return events.reduce(applyEvent, emptyStore());
}

function statusOf(store: Store, host = 'laptop', id = 's1') {
  return store.sessions[sessionKey(host, id)]?.status;
}

test('session lifecycle: start → working → done → ended', () => {
  let s = run([ev('SessionStart', T0)]);
  assert.equal(statusOf(s), 'idle');
  s = applyEvent(s, ev('UserPromptSubmit', T0 + 1));
  assert.equal(statusOf(s), 'working');
  s = applyEvent(s, ev('Stop', T0 + 2));
  assert.equal(statusOf(s), 'done');
  s = applyEvent(s, ev('SessionEnd', T0 + 3));
  assert.equal(statusOf(s), 'ended');
});

test('unknown session is created on first event of any kind', () => {
  const s = run([ev('UserPromptSubmit', T0)]);
  assert.equal(statusOf(s), 'working');
});

test('permission request → waiting, cleared by PostToolUse', () => {
  let s = run([ev('UserPromptSubmit', T0), ev('PermissionRequest', T0 + 1, { toolName: 'Bash' })]);
  assert.equal(statusOf(s), 'waiting');
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.detail, 'permission: Bash');
  s = applyEvent(s, ev('PostToolUse', T0 + 2, { toolName: 'Bash' }));
  assert.equal(statusOf(s), 'working');
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.detail, undefined);
});

test('AskUserQuestion and ExitPlanMode put the session in waiting', () => {
  for (const toolName of ['AskUserQuestion', 'ExitPlanMode']) {
    const s = run([ev('UserPromptSubmit', T0), ev('PreToolUse', T0 + 1, { toolName })]);
    assert.equal(statusOf(s), 'waiting', toolName);
  }
});

test('Notification only changes status for blocking types', () => {
  let s = run([ev('UserPromptSubmit', T0), ev('Notification', T0 + 1, { notificationType: 'permission_prompt' })]);
  assert.equal(statusOf(s), 'waiting');

  s = run([ev('UserPromptSubmit', T0), ev('Notification', T0 + 1, { notificationType: 'elicitation_dialog' })]);
  assert.equal(statusOf(s), 'waiting');

  s = run([ev('Stop', T0), ev('Notification', T0 + 1, { notificationType: 'idle_prompt' })]);
  assert.equal(statusOf(s), 'done');
});

test('StopFailure → error', () => {
  const s = run([ev('UserPromptSubmit', T0), ev('StopFailure', T0 + 1)]);
  assert.equal(statusOf(s), 'error');
});

test('out-of-order events are dropped', () => {
  const s = run([ev('Stop', T0 + 10), ev('PostToolUse', T0 + 5)]);
  assert.equal(statusOf(s), 'done');
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.lastEventAt, T0 + 10);
});

test('since only moves on status change', () => {
  const s = run([ev('UserPromptSubmit', T0), ev('PostToolUse', T0 + 5), ev('PostToolUse', T0 + 9)]);
  const sess = s.sessions[sessionKey('laptop', 's1')];
  assert.equal(sess?.since, T0);
  assert.equal(sess?.lastEventAt, T0 + 9);
});

test('cwd follows the latest event', () => {
  const s = run([ev('SessionStart', T0), ev('UserPromptSubmit', T0 + 1, { cwd: '/x/bar' })]);
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.cwd, '/x/bar');
});

test('same session id on two hosts are distinct sessions', () => {
  const s = run([ev('Stop', T0), ev('UserPromptSubmit', T0, { host: 'desktop' })]);
  assert.equal(statusOf(s, 'laptop'), 'done');
  assert.equal(statusOf(s, 'desktop'), 'working');
});

test('events count as host liveness; heartbeats too', () => {
  let s = run([ev('SessionStart', T0)]);
  assert.equal(s.hosts['laptop']?.lastSeenAt, T0);
  s = applyHeartbeat(s, { host: 'laptop', ts: T0 + MIN });
  assert.equal(s.hosts['laptop']?.lastSeenAt, T0 + MIN);
  s = applyHeartbeat(s, { host: 'laptop', ts: T0 });
  assert.equal(s.hosts['laptop']?.lastSeenAt, T0 + MIN, 'older heartbeat must not rewind');
});

test('applyEvent does not mutate its input', () => {
  const before = run([ev('SessionStart', T0)]);
  const snapshot = structuredClone(before);
  applyEvent(before, ev('UserPromptSubmit', T0 + 1));
  assert.deepEqual(before, snapshot);
});

const viewOpts = { hostTtlMs: 3 * MIN, sessionWindowMs: 24 * HOUR };

test('view: host offline after TTL, propagated to its sessions', () => {
  const s = run([ev('UserPromptSubmit', T0)]);
  const fresh = buildView(s, T0 + MIN, viewOpts);
  assert.equal(fresh.hosts[0]?.online, true);
  assert.equal(fresh.sessions[0]?.hostOnline, true);

  const stale = buildView(s, T0 + 4 * MIN, viewOpts);
  assert.equal(stale.hosts[0]?.online, false);
  assert.equal(stale.sessions[0]?.hostOnline, false);
  assert.equal(stale.sessions[0]?.status, 'working', 'status is kept, not guessed');
});

test('view: hides ended sessions and those outside the window', () => {
  const s = run([
    ev('SessionEnd', T0, { sessionId: 'gone' }),
    ev('Stop', T0 - 25 * HOUR, { sessionId: 'old' }),
    ev('Stop', T0, { sessionId: 'kept' }),
  ]);
  const ids = buildView(s, T0, viewOpts).sessions.map((x) => x.sessionId);
  assert.deepEqual(ids, ['kept']);
});

test('view: sorted by urgency, then most recent first', () => {
  const s = run([
    ev('SessionStart', T0 + 5, { sessionId: 'idle' }),
    ev('UserPromptSubmit', T0 + 4, { sessionId: 'working' }),
    ev('Stop', T0 + 1, { sessionId: 'done-old' }),
    ev('Stop', T0 + 3, { sessionId: 'done-new' }),
    ev('PermissionRequest', T0, { sessionId: 'waiting' }),
    ev('StopFailure', T0, { sessionId: 'error' }),
  ]);
  const ids = buildView(s, T0 + 10, viewOpts).sessions.map((x) => x.sessionId);
  assert.deepEqual(ids, ['waiting', 'error', 'done-new', 'done-old', 'working', 'idle']);
});

test('view: project is the cwd basename', () => {
  const s = run([ev('Stop', T0, { cwd: '/Users/j/Projects/personal/cc-panel/' })]);
  assert.equal(buildView(s, T0, viewOpts).sessions[0]?.project, 'cc-panel');
});

test('prune drops hosts silent for longer than retention', () => {
  let s = run([ev('Stop', T0 - 49 * HOUR, { host: 'old-name' }), ev('Stop', T0, { host: 'laptop' })]);
  s = prune(s, T0, 48 * HOUR);
  assert.deepEqual(Object.keys(s.hosts), ['laptop']);
});

test('prune drops sessions older than retention and keeps live hosts', () => {
  const s = run([
    ev('Stop', T0 - 49 * HOUR, { sessionId: 'old' }),
    ev('Stop', T0, { sessionId: 'new' }),
  ]);
  const p = prune(s, T0, 48 * HOUR);
  assert.deepEqual(Object.keys(p.sessions), [sessionKey('laptop', 'new')]);
  assert.ok(p.hosts['laptop']);
});

test('limits: newest observation wins across hosts; view applies resets', () => {
  let s = applyHeartbeat(emptyStore(), {
    host: 'laptop', ts: T0, limits: { observedAt: T0, fiveHour: { usedPct: 40, resetsAt: T0 + HOUR } },
  });
  s = applyHeartbeat(s, {
    host: 'desktop', ts: T0 + 1, limits: { observedAt: T0 - 1, fiveHour: { usedPct: 10, resetsAt: T0 + HOUR } },
  });
  assert.equal(s.limits?.fiveHour?.usedPct, 40, 'older observation must not win');

  assert.equal(buildView(s, T0 + 1, viewOpts).limits?.fiveHour?.usedPct, 40);
  assert.equal(buildView(s, T0 + HOUR, viewOpts).limits?.fiveHour?.usedPct, 0);
  assert.equal(buildView(emptyStore(), T0, viewOpts).limits, null);
});

test('firstSeenAt is set once and never moves', () => {
  const s = run([ev('SessionStart', T0), ev('UserPromptSubmit', T0 + 5), ev('Stop', T0 + 9)]);
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.firstSeenAt, T0);
});

const CMUX = { workspace: 'A74797B6-7297-46C0-A6EB-58F34F9747C9', surface: '5FD931CE-E304-41CF-A1F6-2398029034B8' };

test('sessions remember their cmux tab; events without one keep it', () => {
  const s = run([ev('SessionStart', T0, { cmux: CMUX }), ev('Stop', T0 + 1)]);
  assert.deepEqual(s.sessions[sessionKey('laptop', 's1')]?.cmux, CMUX);
});

test('canFocus needs a cmux tab, an online host and a live relay', () => {
  const opts = { ...viewOpts, relayTtlMs: MIN };
  const withTab = run([ev('Stop', T0, { cmux: CMUX })]);
  assert.equal(buildView(withTab, T0, opts).sessions[0]?.canFocus, false, 'no relay yet');

  const relayed = applyRelaySeen(withTab, 'laptop', T0);
  assert.equal(buildView(relayed, T0 + 1, opts).sessions[0]?.canFocus, true);
  assert.equal(buildView(relayed, T0 + 1, opts).hosts[0]?.relay, true);
  assert.equal(buildView(relayed, T0 + 2 * MIN, opts).sessions[0]?.canFocus, false, 'relay went quiet');

  const noTab = applyRelaySeen(run([ev('Stop', T0)]), 'laptop', T0);
  assert.equal(buildView(noTab, T0, opts).sessions[0]?.canFocus, false, 'session outside cmux');
});

test('events keep the account limits (regression: applyEvent dropped them)', () => {
  let s = applyHeartbeat(emptyStore(), {
    host: 'laptop', ts: T0, limits: { observedAt: T0, fiveHour: { usedPct: 40, resetsAt: T0 + HOUR } },
  });
  s = applyEvent(s, ev('PostToolUse', T0 + 1));
  assert.equal(s.limits?.fiveHour?.usedPct, 40);
});

test('session title sticks across events that do not carry it', () => {
  const s = run([ev('UserPromptSubmit', T0, { name: 'Tweet de Kacper' }), ev('Stop', T0 + 1)]);
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.name, 'Tweet de Kacper');
  const renamed = applyEvent(s, ev('Stop', T0 + 2, { name: 'Panel' }));
  assert.equal(renamed.sessions[sessionKey('laptop', 's1')]?.name, 'Panel');
});

test('Interrupt (Codex: turn cut with Esc) hands control back: idle', () => {
  const s = run([ev('UserPromptSubmit', T0), ev('Interrupt', T0 + 1)]);
  assert.equal(statusOf(s), 'idle');
});

test('sessions remember which agent runs them', () => {
  const s = run([ev('SessionStart', T0, { agent: 'codex' }), ev('Stop', T0 + 1)]);
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.agent, 'codex');
});

test('Codex sessions drop any cmux tab, even one stored before the fix', () => {
  let s = run([ev('Stop', T0, { agent: 'codex' })]);
  s.sessions[sessionKey('laptop', 's1')]!.cmux = CMUX; // as persisted by the buggy version
  s = applyEvent(s, ev('UserPromptSubmit', T0 + 1, { agent: 'codex', cmux: CMUX }));
  assert.equal(s.sessions[sessionKey('laptop', 's1')]?.cmux, undefined);
});

test('view hides quiet Codex sessions (no SessionEnd in Codex 0.163), never the waiting ones', () => {
  const opts = { ...viewOpts, codexQuietMs: 30 * MIN };
  const s = run([
    ev('Stop', T0, { sessionId: 'codex-done', agent: 'codex' }),
    ev('PermissionRequest', T0, { sessionId: 'codex-waiting', agent: 'codex' }),
    ev('Stop', T0, { sessionId: 'claude-done', agent: 'claude' }),
  ]);
  const at = (t: number) => buildView(s, t, opts).sessions.map((x) => x.sessionId).sort();
  assert.deepEqual(at(T0 + 29 * MIN), ['claude-done', 'codex-done', 'codex-waiting']);
  assert.deepEqual(at(T0 + 31 * MIN), ['claude-done', 'codex-waiting']);
});

test('a Codex session is never focusable, even with a stale cmux tab in the store', () => {
  let s = run([ev('Stop', T0, { agent: 'codex' })]);
  s.sessions[sessionKey('laptop', 's1')]!.cmux = CMUX;
  s = applyRelaySeen(s, 'laptop', T0);
  assert.equal(buildView(s, T0, { ...viewOpts, relayTtlMs: MIN }).sessions[0]?.canFocus, false);
});
