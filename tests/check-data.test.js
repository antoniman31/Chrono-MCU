import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSeries, isComplete } from '../scripts/check-data.mjs';

const mine = [
  { n: 1, title: 'A', runtimeMin: 40 },
  { n: 2, title: 'B', runtimeMin: 45 },
];

test('compareSeries: aucun écart', () => {
  assert.deepEqual(compareSeries(mine, [{ number: 1, runtime: 40 }, { number: 2, runtime: 45 }]), []);
});

test('compareSeries: durée différente et nombre d\'épisodes différent', () => {
  const diffs = compareSeries(mine, [{ number: 1, runtime: 41 }, { number: 2, runtime: 45 }, { number: 3, runtime: 50 }]);
  assert.equal(diffs.length, 2);
  assert.ok(diffs.some((d) => d.includes('ép. 1')));
  assert.ok(diffs.some((d) => d.includes('nombre')));
});

test('compareSeries: une durée inconnue chez TVmaze n\'est pas un écart', () => {
  assert.deepEqual(compareSeries(mine, [{ number: 1, runtime: 40 }, { number: 2, runtime: null }]), []);
});

test('isComplete: faux s\'il manque une durée ou un épisode', () => {
  assert.equal(isComplete(mine, [{ number: 1, runtime: 40 }, { number: 2, runtime: 45 }]), true);
  assert.equal(isComplete(mine, [{ number: 1, runtime: 40 }, { number: 2, runtime: null }]), false);
  assert.equal(isComplete(mine, [{ number: 1, runtime: 40 }]), false);
});
