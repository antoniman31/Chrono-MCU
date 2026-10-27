import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hideEpisodeTitle, hideSummary, isStarted } from '../js/spoilers.js';

const film = { id: 'f', type: 'film' };
const serie = { id: 's', type: 'serie', episodes: [{ n: 1 }, { n: 2 }] };
const on = { spoilerFree: true };
const off = { spoilerFree: false };

test('sans spoiler : un titre est commencé dès qu\'une de ses unités est cochée', () => {
  assert.equal(isStarted({ seen: {} }, film), false);
  assert.equal(isStarted({ seen: { f: '2026-10-01' } }, film), true);
  assert.equal(isStarted({ seen: {} }, serie), false);
  assert.equal(isStarted({ seen: { 's/2': '2026-10-01' } }, serie), true);
});

test('sans spoiler : résumé caché seulement si le mode est actif et le titre pas commencé', () => {
  assert.equal(hideSummary(on, { seen: {} }, film), true);
  assert.equal(hideSummary(on, { seen: { f: 'x' } }, film), false);
  assert.equal(hideSummary(off, { seen: {} }, film), false);
  assert.equal(hideSummary(on, { seen: { 's/1': 'x' } }, serie), false, 'série entamée : résumé visible');
});

test('sans spoiler : le titre d\'un épisode reste caché tant qu\'il n\'est pas vu', () => {
  const state = { seen: { 's/1': '2026-10-01' } };
  assert.equal(hideEpisodeTitle(on, state, 's', 1), false);
  assert.equal(hideEpisodeTitle(on, state, 's', 2), true);
  assert.equal(hideEpisodeTitle(off, state, 's', 2), false);
});
