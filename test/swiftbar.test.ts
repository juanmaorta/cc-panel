import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, swiftbarMenu, type MenuConfig } from '../src/swiftbar.ts';
import type { SessionStatus, SessionView, View } from '../src/types.ts';

const NOW = 1_800_000_000_000;
const cfg: MenuConfig = {
  node: '/n/node',
  script: '/r/bin/menubar.ts',
  panelUrl: 'http://127.0.0.1:7420/',
  icons: { calm: 'CALM', alert: 'ALERT' },
};

function s(id: string, status: SessionStatus, extra: Partial<SessionView> = {}): SessionView {
  return {
    host: 'laptop', sessionId: id, cwd: `/p/${id}`, project: id, status, firstSeenAt: NOW, since: NOW - 120_000,
    lastEventAt: NOW, hostOnline: true, canFocus: true, ...extra,
  };
}

function view(sessions: SessionView[], extra: Partial<View> = {}): View {
  return {
    generatedAt: NOW,
    hosts: [{ host: 'laptop', lastSeenAt: NOW, online: true, relay: true }],
    sessions,
    limits: { observedAt: NOW, fiveHour: { usedPct: 2, resetsAt: NOW + 60 * 60_000 }, sevenDay: { usedPct: 4, resetsAt: NOW + 6 * 86_400_000 } },
    ...extra,
  };
}

const lines = (out: string) => out.split('\n');

test('title: calm cat (template) when nothing needs you, whatever else is going on', () => {
  for (const st of ['working', 'done', 'idle'] as const) {
    assert.equal(lines(swiftbarMenu(view([s('a', st)]), cfg))[0], ' | templateImage=CALM', st);
  }
  assert.equal(lines(swiftbarMenu(view([]), cfg))[0], ' | templateImage=CALM');
});

test('title: red startled cat and red count when sessions wait or failed', () => {
  const out = swiftbarMenu(view([s('a', 'waiting'), s('b', 'error'), s('c', 'done')]), cfg);
  assert.equal(lines(out)[0], '2 | image=ALERT color=#ff3b30');
  assert.equal(lines(out)[1], '---');
});

test('sessions on offline hosts do not raise the alert', () => {
  assert.equal(lines(swiftbarMenu(view([s('a', 'waiting', { hostOnline: false })]), cfg))[0], ' | templateImage=CALM');
});

test('focusable sessions run the focus action; others are plain text', () => {
  const out = swiftbarMenu(view([s('a', 'waiting', { name: 'Tweet', detail: 'permission: Bash' }), s('b', 'idle', { canFocus: false })]), cfg);
  assert.ok(
    out.includes(
      '⚠ Tweet · permiso Bash · 2m | bash=/n/node param1=/r/bin/menubar.ts param2=focus param3=laptop param4=a terminal=false refresh=true',
    ),
    out,
  );
  const idle = lines(out).find((l) => l.startsWith('z b'))!;
  assert.ok(!idle.includes('bash='), idle);
});

test('limits, hosts and a link to the panel', () => {
  const out = swiftbarMenu(view([]), cfg);
  assert.ok(out.includes('5H 2% · 1h00   SEM 4% · 6d'), out);
  assert.ok(out.includes('laptop ● ⌘'), out);
  assert.ok(out.includes('Abrir panel | href=http://127.0.0.1:7420/'), out);
});

test('codex sessions are labelled; offline hosts are marked', () => {
  const out = swiftbarMenu(view([s('a', 'working', { agent: 'codex', canFocus: false, hostOnline: false })]), cfg);
  assert.ok(lines(out).some((l) => l.startsWith('» a · codex · offline')), out);
});

test('session text cannot inject SwiftBar parameters or lines', () => {
  assert.equal(clean('evil | bash=/bin/rm param1=-rf\nsecond line'), 'evil ¦ bash=/bin/rm param1=-rf second line');
  const out = swiftbarMenu(view([s('a', 'done', { name: 'x | href=http://evil\n---' })]), cfg);
  const line = lines(out).find((l) => l.startsWith('✓'))!;
  const [text, params] = [line.slice(0, line.indexOf(' | ')), line.slice(line.indexOf(' | ') + 3)];
  assert.equal(line.split('|').length, 2, 'exactly one real separator');
  assert.match(text, /x ¦ href=http:\/\/evil ---/, 'injected text stays inert text');
  assert.ok(!params.includes('evil'), params);
  assert.equal(lines(out).filter((l) => l === '---').length, 2, 'only our separators');
});

test('action paths with spaces are quoted', () => {
  const out = swiftbarMenu(view([s('a', 'done')]), { ...cfg, node: '/My Apps/node', script: '/r/bin/menubar.ts' });
  assert.ok(out.includes('bash="/My Apps/node" param1=/r/bin/menubar.ts'), out);
});
