import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLimits, parseStatusline } from '../src/limits.ts';

const sample = {
  session_id: 'x',
  rate_limits: {
    five_hour: { used_percentage: 9, resets_at: 1_792_328_400 },
    seven_day: { used_percentage: 1.5, resets_at: 1_792_882_800 },
  },
};

test('parses statusline rate limits, converting resets_at to ms', () => {
  assert.deepEqual(parseStatusline(sample, 123), {
    observedAt: 123,
    fiveHour: { usedPct: 9, resetsAt: 1_792_328_400_000 },
    sevenDay: { usedPct: 1.5, resetsAt: 1_792_882_800_000 },
  });
});

test('tolerates a missing window and garbage', () => {
  const only5 = parseStatusline({ rate_limits: { five_hour: sample.rate_limits.five_hour } }, 1);
  assert.deepEqual(only5, { observedAt: 1, fiveHour: { usedPct: 9, resetsAt: 1_792_328_400_000 } });
  assert.equal(parseStatusline({ rate_limits: { five_hour: { used_percentage: 'x' } } }, 1), null);
  assert.equal(parseStatusline({}, 1), null);
  assert.equal(parseStatusline(null, 1), null);
});

test('clamps percentages to 0-100', () => {
  const l = parseStatusline({ rate_limits: { five_hour: { used_percentage: 140, resets_at: 1 } } }, 1);
  assert.equal(l?.fiveHour?.usedPct, 100);
});

test('a window past its reset counts as unused', () => {
  const l = parseStatusline(sample, 1)!;
  const before = effectiveLimits(l, 1_792_328_400_000 - 1);
  assert.equal(before.fiveHour?.usedPct, 9);
  const after = effectiveLimits(l, 1_792_328_400_000);
  assert.equal(after.fiveHour?.usedPct, 0);
  assert.equal(after.sevenDay?.usedPct, 1.5);
});
