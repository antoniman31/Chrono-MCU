import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from '../js/duration.js';

test('durées : minutes, heures et jours, unités à zéro omises', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(126), '2 h 06 min');
  assert.equal(formatDuration(181), '3 h 01 min');
  assert.equal(formatDuration(24 * 60), '1 j');
  assert.equal(formatDuration(15 * 1440 + 21 * 60 + 12), '15 j 21 h 12 min');
  assert.equal(formatDuration(15 * 1440 + 12), '15 j 12 min');
});

test('durées : valeurs fractionnaires arrondies, négatives ramenées à zéro', () => {
  assert.equal(formatDuration(89.6), '1 h 30 min');
  assert.equal(formatDuration(-5), '0 min');
});
