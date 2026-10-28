import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, mergeUnlocked, unlockMessage, metrics, TOTAL_MEDALS } from '../js/achievements.js';
import { normalizeView } from '../js/prefs.js';

const film = (id, releaseDate, extra = {}) => ({ id, title: id, type: 'film', phase: 1, saga: 'infinity', releaseDate, chronoOrder: 1, runtimeMin: 100, verified: true, ...extra });
const serie = (id, n = 2, extra = {}) => ({
  id, title: id, type: 'serie', phase: 4, saga: 'multiverse', releaseDate: '2021-01-01', chronoOrder: 2, verified: true,
  episodes: Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `e${i + 1}`, runtimeMin: 40, airDate: '2021-01-0' + (i + 1) })), ...extra,
});
const base = (over = {}) => ({ today: '2026-10-28', goalDate: '2026-12-18', spoilerFree: false, versions: {}, catchUp: {}, ...over });
const get = (list, id) => list.find((a) => a.id === id);

test('catalogue : médailles totales cohérentes', () => {
  const list = evaluate(base({ titles: [film('a', '2008-01-01')], seen: {} }));
  assert.equal(list.reduce((sum, a) => sum + a.tiers.length, 0), TOTAL_MEDALS);
  assert.equal(list.filter((a) => a.hidden).length, 5);
});

test('paliers : pourcentage et premier pas', () => {
  const titles = [film('a', '2008-01-01'), film('b', '2009-01-01'), film('c', '2010-01-01'), film('d', '2011-01-01')];
  let list = evaluate(base({ titles, seen: { a: '2026-10-01' } }));
  assert.equal(get(list, 'first').level, 1);
  assert.equal(get(list, 'percent').level, 1); // 25 %
  list = evaluate(base({ titles, seen: { a: '2026-10-01', b: '2026-10-02' } }));
  assert.equal(get(list, 'percent').level, 2);
  assert.equal(get(list, 'percent').next, 100);
  list = evaluate(base({ titles, seen: Object.fromEntries(titles.map((t) => [t.id, '2026-10-01'])) }));
  assert.equal(get(list, 'percent').level, 3);
  assert.equal(get(list, 'infinity').level, 1);
  assert.equal(get(list, 'goal').level, 1);
});

test('objectif : dépassé ou sans date = pas de succès', () => {
  const titles = [film('a', '2008-01-01')];
  assert.equal(get(evaluate(base({ titles, seen: { a: '2026-12-19' } })), 'goal').level, 0);
  assert.equal(get(evaluate(base({ titles, seen: { a: '2026-10-01' }, goalDate: null })), 'goal').level, 0);
});

test('rythme : séries de jours, marathon et semaine, rattrapages exclus', () => {
  const titles = ['a', 'b', 'c', 'd', 'e'].map((id) => film(id, '2008-01-01'));
  const seen = { a: '2026-10-26', b: '2026-10-27', c: '2026-10-28', d: '2026-10-28', e: '2026-10-28' };
  let list = evaluate(base({ titles, seen }));
  assert.equal(get(list, 'streak').level, 1);
  assert.equal(get(list, 'marathon').level, 1);
  assert.equal(get(list, 'marathon').value, 3);
  assert.equal(get(list, 'week').value, 5);
  list = evaluate(base({ titles, seen, catchUp: { c: true, d: true, e: true } }));
  assert.equal(get(list, 'marathon').level, 0);
  assert.equal(get(list, 'streak').level, 0);
});

test('catalogue MCU : séries, films, post-générique, courts, autres réalités', () => {
  const titles = [
    film('long', '2008-01-01', { postCredits: ['end'] }), film('court', '2009-01-01', { runtimeMin: 20 }),
    serie('s', 2), serie('what-if', 1, { altUniverse: true }),
  ];
  const seen = { long: '2026-10-01', court: '2026-10-02', 's/1': '2026-10-03', 's/2': '2026-10-03', 'what-if/1': '2026-10-04' };
  const list = evaluate(base({ titles, seen }));
  assert.equal(get(list, 'series').level, 1);
  assert.equal(get(list, 'series').value, 2);
  assert.equal(get(list, 'films').value, 2);
  assert.equal(get(list, 'post').value, 1);
  assert.equal(get(list, 'shorts').level, 1);
  assert.equal(get(list, 'alt').level, 1);
  assert.equal(get(evaluate(base({ titles, seen: { long: '2026-10-01' } })), 'shorts').level, 0);
});

test('cachés : sans spoiler, version, anniversaire, rattrapage, trois phases', () => {
  const titles = [film('a', '2008-05-02'), film('b', '2009-01-01', { phase: 2 }), film('c', '2010-01-01', { phase: 3 }), ...Array.from({ length: 10 }, (_, i) => film(`x${i}`, '2011-01-01'))];
  const list = evaluate(base({ titles, seen: { a: '2026-05-02', b: '2026-05-02', c: '2026-05-02' }, spoilerFree: true, versions: { a: 'encore' } }));
  for (const id of ['spoiler', 'version', 'birthday', 'phases3']) assert.equal(get(list, id).level, 1, id);
  assert.equal(get(list, 'catchup').level, 0);
  const catchUp = Object.fromEntries(titles.map((t) => [t.id, true]));
  const seen = Object.fromEntries(titles.map((t) => [t.id, '2026-10-01']));
  assert.equal(get(evaluate(base({ titles, seen, catchUp })), 'catchup').level, 1);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2008-05-02' } }).birthday, false); // même jour que la sortie : pas un anniversaire
});

test('déblocages : premier calcul silencieux, ensuite annonce, jamais retiré', () => {
  const titles = [film('a', '2008-01-01'), film('b', '2009-01-01')];
  let r = mergeUnlocked(undefined, evaluate(base({ titles, seen: { a: '2026-10-01' } })), '2026-10-28');
  assert.deepEqual(r.unlocked, []);
  assert.equal(r.next.first.level, 1);
  assert.equal(r.next.first.date, null);
  assert.ok(r.changed);
  const prev = r.next;
  r = mergeUnlocked(prev, evaluate(base({ titles, seen: { a: '2026-10-01' } })), '2026-10-28');
  assert.deepEqual(r.unlocked, []);
  assert.equal(r.changed, false);
  r = mergeUnlocked(prev, evaluate(base({ titles, seen: { a: '2026-10-01', b: '2026-10-28' } })), '2026-10-28');
  assert.ok(r.unlocked.some((u) => u.id === 'percent' && u.level === 3));
  assert.equal(r.next.percent.date, '2026-10-28');
  // décocher ne retire rien
  r = mergeUnlocked(r.next, evaluate(base({ titles, seen: {} })), '2026-10-29');
  assert.equal(r.unlocked.length, 0);
  assert.equal(r.next.percent.level, 3);
});

test('message de déblocage', () => {
  assert.equal(unlockMessage([{ name: 'Premier pas', level: 1, single: true }]), 'Succès débloqué : Premier pas');
  assert.equal(unlockMessage([{ name: 'Assidu', level: 2, single: false }]), 'Succès débloqué : Assidu (argent)');
  assert.equal(unlockMessage([{ name: 'A', level: 1, single: true }, { name: 'B', level: 1, single: true }, { name: 'C', level: 1, single: true }]), '3 succès débloqués : A, B…');
});

test('préférences : achv validé', () => {
  assert.equal(normalizeView(null).achv, undefined);
  assert.deepEqual(normalizeView({ achv: {} }).achv, {});
  const v = normalizeView({ achv: { a: { level: 2, date: '2026-10-01' }, b: { level: 9, date: 'x' }, c: { level: 1, date: 'zzz' }, d: 3 } });
  assert.deepEqual(v.achv, { a: { level: 2, date: '2026-10-01' }, c: { level: 1, date: null } });
  assert.equal(normalizeView([]).achv, undefined);
});
