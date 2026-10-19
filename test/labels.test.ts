import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_LABEL, age, detailLabel } from '../src/ui/labels.ts';

test('age', () => {
  assert.equal(age(4_000), '4s');
  assert.equal(age(125_000), '2m');
  assert.equal(age(3_900_000), '1h05');
  assert.equal(age(90_000_000), '1d');
  assert.equal(age(-5), '0s');
});

test('detail labels', () => {
  assert.equal(detailLabel('permission: Bash'), 'permiso Bash');
  assert.equal(detailLabel('question'), 'pregunta');
  assert.equal(detailLabel(undefined), undefined);
  assert.equal(detailLabel('weird'), 'weird');
});

test('every status has a label', () => {
  for (const st of ['waiting', 'error', 'done', 'working', 'idle', 'ended'] as const) assert.ok(STATUS_LABEL[st]);
});
