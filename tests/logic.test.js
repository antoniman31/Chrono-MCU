import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTitles, toUnits, filterTitles, progress, nextToWatch } from '../js/logic.js';

const film = (id, chronoOrder, releaseDate, phase = 1, runtimeMin = 100) => ({
  id, title: id, type: 'film', phase, saga: 'infinity', releaseDate, chronoOrder, runtimeMin, verified: true,
});
const serie = (id, chronoOrder, releaseDate, phase = 4, n = 2) => ({
  id, title: id, type: 'serie', phase, saga: 'multiverse', releaseDate, chronoOrder, verified: true,
  episodes: Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `e${i + 1}`, runtimeMin: 30 })),
});

// chrono: a(1) b(2) s(3); sortie: b(2008) s(2010) a(2011)
const a = film('a', 1, '2011-01-01');
const b = film('b', 2, '2008-01-01');
const s = serie('s', 3, '2010-01-01');
const titles = [s, a, b];

test('tri chronologique et par sortie, sans muter l\'entrée', () => {
  assert.deepEqual(sortTitles(titles, 'chrono').map((t) => t.id), ['a', 'b', 's']);
  assert.deepEqual(sortTitles(titles, 'release').map((t) => t.id), ['b', 's', 'a']);
  assert.deepEqual(titles.map((t) => t.id), ['s', 'a', 'b']);
});

test('égalité de date de sortie départagée par chronoOrder', () => {
  const x = film('x', 5, '2020-01-01');
  const y = film('y', 4, '2020-01-01');
  assert.deepEqual(sortTitles([x, y], 'release').map((t) => t.id), ['y', 'x']);
});

test('toUnits: un film = 1 unité, une série = ses épisodes', () => {
  const units = toUnits([a, s]);
  assert.deepEqual(units.map((u) => u.key), ['a', 's/1', 's/2']);
  assert.equal(units[0].kind, 'film');
  assert.equal(units[1].kind, 'episode');
  assert.equal(units[1].runtimeMin, 30);
});

test('filtres combinables, absence de filtre = tout', () => {
  const t = [a, film('c', 6, '2012-01-01', 2), s];
  assert.equal(filterTitles(t).length, 3);
  assert.deepEqual(filterTitles(t, { phase: 1 }).map((x) => x.id), ['a']);
  assert.deepEqual(filterTitles(t, { type: 'serie' }).map((x) => x.id), ['s']);
  assert.deepEqual(filterTitles(t, { phase: 4, type: 'serie' }).map((x) => x.id), ['s']);
  assert.deepEqual(filterTitles(t, { phase: 1, type: 'serie' }), []);
});

test('progression: rien vu, partielle, tout vu', () => {
  assert.deepEqual(progress(titles, {}), {
    seen: 0, total: 4, percent: 0,
    byPhase: { 1: { seen: 0, total: 2, percent: 0 }, 4: { seen: 0, total: 2, percent: 0 } },
  });
  const part = progress(titles, { a: '2026-01-01', 's/1': '2026-01-02' });
  assert.equal(part.seen, 2);
  assert.equal(part.percent, 50);
  assert.deepEqual(part.byPhase[4], { seen: 1, total: 2, percent: 50 });
  const all = progress(titles, { a: 1, b: 1, 's/1': 1, 's/2': 1 });
  assert.equal(all.percent, 100);
});

test('progression sur catalogue vide', () => {
  assert.deepEqual(progress([], {}), { seen: 0, total: 0, percent: 0, byPhase: {} });
});

test('la progression globale ne dépend pas des filtres appliqués à l\'affichage', () => {
  const seen = { a: 1 };
  const filtered = filterTitles(titles, { phase: 4 });
  assert.equal(progress(titles, seen).seen, 1);
  assert.equal(progress(filtered, seen).seen, 0);
});

test('prochain à voir: premier non vu selon l\'ordre actif', () => {
  assert.equal(nextToWatch(titles, {}, 'chrono').key, 'a');
  assert.equal(nextToWatch(titles, {}, 'release').key, 'b');
  assert.equal(nextToWatch(titles, { a: 1 }, 'chrono').key, 'b');
});

test('prochain à voir: épisodes dans l\'ordre n, puis null quand tout est vu', () => {
  assert.equal(nextToWatch(titles, { a: 1, b: 1 }, 'chrono').key, 's/1');
  assert.equal(nextToWatch(titles, { a: 1, b: 1, 's/1': 1 }, 'chrono').key, 's/2');
  assert.equal(nextToWatch(titles, { a: 1, b: 1, 's/1': 1, 's/2': 1 }, 'chrono'), null);
});

test('prochain à voir: sauter un épisode intermédiaire le remonte', () => {
  assert.equal(nextToWatch(titles, { a: 1, b: 1, 's/2': 1 }, 'chrono').key, 's/1');
});

test('prochain à voir: catalogue vide', () => {
  assert.equal(nextToWatch([], {}, 'chrono'), null);
});
