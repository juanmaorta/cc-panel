import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostsNeedingRelay } from '../src/ui/relay-hint.ts';
import type { SessionView, View } from '../src/types.ts';

const CMUX = { workspace: 'A74797B6-7297-46C0-A6EB-58F34F9747C9', surface: '5FD931CE-E304-41CF-A1F6-2398029034B8' };

function s(host: string, extra: Partial<SessionView> = {}): SessionView {
  return {
    host, sessionId: `${host}-s`, cwd: '/p/x', project: 'x', status: 'working',
    firstSeenAt: 0, since: 0, lastEventAt: 0, hostOnline: true, canFocus: false, ...extra,
  };
}

const view = (sessions: SessionView[]): View => ({ generatedAt: 0, hosts: [], sessions, limits: null });

test('hosts with cmux sessions that cannot be focused need a relay', () => {
  assert.deepEqual(hostsNeedingRelay(view([s('laptop', { cmux: CMUX }), s('desktop', { cmux: CMUX })])), ['laptop', 'desktop']);
});

test('no hint when the relay is up, outside cmux, or the host is offline', () => {
  assert.deepEqual(hostsNeedingRelay(view([s('laptop', { cmux: CMUX, canFocus: true })])), []);
  assert.deepEqual(hostsNeedingRelay(view([s('laptop')])), []);
  assert.deepEqual(hostsNeedingRelay(view([s('laptop', { cmux: CMUX, hostOnline: false })])), []);
});

test('each host is listed once', () => {
  assert.deepEqual(hostsNeedingRelay(view([s('laptop', { cmux: CMUX }), s('laptop', { cmux: CMUX, sessionId: 'b' })])), ['laptop']);
});
