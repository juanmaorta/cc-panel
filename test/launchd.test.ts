import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlist } from '../src/launchd.ts';

test('renders a valid plist with escaped args', () => {
  const xml = renderPlist({
    label: 'com.cc-panel.hub',
    args: ['/usr/local/bin/node', '/p/a&b/bin/hub.ts'],
    keepAlive: true,
    logFile: '/l/hub.log',
  });
  assert.match(xml, /<string>com\.cc-panel\.hub<\/string>/);
  assert.match(xml, /<string>\/p\/a&amp;b\/bin\/hub\.ts<\/string>/);
  assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.doesNotMatch(xml, /StartInterval/);
});

test('interval jobs run at load and do not keep alive', () => {
  const xml = renderPlist({ label: 'hb', args: ['n'], intervalSec: 60, logFile: '/l' });
  assert.match(xml, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.doesNotMatch(xml, /KeepAlive/);
});
