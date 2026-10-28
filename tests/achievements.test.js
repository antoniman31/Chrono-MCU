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
  assert.equal(list.filter((a) => a.hidden).length, 8);
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

test('personnages et équipes : part des titres sortis où le héros a un rôle principal', () => {
  const titles = [
    film('a', '2008-01-01', { heroes: ['iron-man', 'avengers'] }), film('b', '2009-01-01', { heroes: ['iron-man'] }),
    film('c', '2010-01-01', { heroes: ['iron-man'] }), film('d', '2011-01-01', { heroes: ['iron-man'] }), film('e', '2012-01-01'),
  ];
  let list = evaluate(base({ titles, seen: { a: '2026-10-01', b: '2026-10-01' } }));
  const iron = get(list, 'hero:iron-man');
  assert.deepEqual([iron.value, iron.level, iron.next, iron.unit, iron.family], [50, 1, 75, '%', 'heroes']);
  assert.equal(get(list, 'hero:avengers').level, 3);
  assert.equal(get(list, 'hero:avengers').name, 'Tout sur les Avengers');
  assert.equal(get(list, 'hero:thor').value, 0);
  list = evaluate(base({ titles, seen: Object.fromEntries(titles.map((t) => [t.id, '2026-10-01'])) }));
  assert.equal(get(list, 'hero:iron-man').level, 3);
});

const filmAt = (id, chronoOrder, releaseDate, extra = {}) => ({ ...film(id, releaseDate), chronoOrder, ...extra });

test('heures de vol, sauvegardes', () => {
  const titles = Array.from({ length: 15 }, (_, i) => filmAt(`f${i}`, i + 1, `2008-01-${String(i + 1).padStart(2, '0')}`));
  const seen = Object.fromEntries(titles.map((t) => [t.id, '2026-10-01']));
  const hours = get(evaluate(base({ titles, seen })), 'hours');
  assert.deepEqual([hours.value, hours.level, hours.unit], [25, 1, 'h']);
  let list = evaluate(base({ titles, seen: {}, lastBackup: { day: '2026-10-20', seenCount: 3 } }));
  assert.deepEqual([get(list, 'backup1').level, get(list, 'backup2').level], [1, 1]);
  list = evaluate(base({ titles, seen: {}, lastBackup: { day: '2026-09-01', seenCount: 3 } }));
  assert.deepEqual([get(list, 'backup1').level, get(list, 'backup2').level], [1, 0]);
  list = evaluate(base({ titles, seen: {} }));
  assert.deepEqual([get(list, 'backup1').level, get(list, 'backup2').level], [0, 0]);
});

test('régularité : semaines consécutives avec une coche', () => {
  const titles = ['a', 'b', 'c', 'd', 'e'].map((id, i) => filmAt(id, i + 1, '2008-01-01'));
  const seen = { a: '2026-10-05', b: '2026-10-14', c: '2026-10-22', d: '2026-11-04', e: '2026-12-01' };
  // semaines du 5/10, 12/10, 19/10, 2/11 : trois d'affilée, puis une coupure
  assert.equal(get(evaluate(base({ titles, seen })), 'weeks').value, 3);
  seen.e = '2026-10-28';
  assert.equal(get(evaluate(base({ titles, seen })), 'weeks').value, 5);
  assert.equal(get(evaluate(base({ titles, seen })), 'weeks').level, 1);
});

test('chronologue et fidèle à la sortie : suites vues dans l\'ordre, sans saut, rattrapages exclus', () => {
  // ordre chrono : a b c d e ; ordre de sortie : e d c b a
  const titles = [filmAt('a', 1, '2012-01-01'), filmAt('b', 2, '2011-01-01'), filmAt('c', 3, '2010-01-01'), filmAt('d', 4, '2009-01-01'), filmAt('e', 5, '2008-01-01')];
  const inOrder = { a: '2026-10-01', b: '2026-10-02', c: '2026-10-02', d: '2026-10-03', e: '2026-10-04' };
  let m = metrics({ ...base(), titles, seen: inOrder });
  assert.equal(m.chronoRun, 5);
  assert.equal(m.releaseRun, 2); // presque à l'envers dans l'ordre de sortie : seuls b et c (même jour) se suivent
  const skipped = { ...inOrder }; delete skipped.c;
  assert.equal(metrics({ ...base(), titles, seen: skipped }).chronoRun, 2);
  const outOfOrder = { ...inOrder, c: '2026-09-01' }; // c vu avant a et b : casse la suite
  assert.equal(metrics({ ...base(), titles, seen: outOfOrder }).chronoRun, 3);
  assert.equal(metrics({ ...base(), titles, seen: inOrder, catchUp: { c: true } }).chronoRun, 2);
});

test('phase et saga express', () => {
  const titles = [filmAt('a', 1, '2008-01-01'), filmAt('b', 2, '2009-01-01'), filmAt('c', 3, '2010-01-01')]; // phase 1, Infinity Saga
  const at = (c, extra = {}) => metrics({ ...base(), titles, seen: { a: '2026-10-01', b: '2026-10-03', c }, ...extra });
  assert.equal(at('2026-10-07').phaseFast, true); // 7 jours, bornes comprises
  assert.equal(at('2026-10-08').phaseFast, false);
  assert.equal(at('2026-10-30').sagaFast, true); // 30 jours
  assert.equal(at('2026-10-31').sagaFast, false);
  assert.equal(at('2026-10-07', { catchUp: { a: true } }).phaseFast, false);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-10-01', b: '2026-10-03' } }).phaseFast, false);
});

test('scènes complètes, film le plus long et le plus court', () => {
  const titles = [filmAt('a', 1, '2008-01-01', { runtimeMin: 181, postCredits: ['end'] }), filmAt('b', 2, '2009-01-01', { runtimeMin: 80, postCredits: ['mid'] }), filmAt('c', 3, '2010-01-01', { runtimeMin: 100, postCredits: [] })];
  let m = metrics({ ...base(), titles, seen: { a: '2026-10-01' } });
  assert.deepEqual([m.postAll, m.longestSeen, m.shortestSeen], [false, true, false]);
  m = metrics({ ...base(), titles, seen: { a: '2026-10-01', b: '2026-10-01' } });
  assert.deepEqual([m.postAll, m.longestSeen, m.shortestSeen], [true, true, true]);
});

test('cachés : sélectif, Encore, dès la sortie', () => {
  const titles = [filmAt('a', 1, '2008-05-02', { releaseDateFr: '2008-04-30' })];
  assert.equal(metrics({ ...base(), titles, seen: {}, ignored: { a: true, b: true, c: true, d: true, e: true } }).ignoredCount, 5);
  assert.equal(metrics({ ...base(), titles, seen: {}, ignored: { a: true, b: false } }).ignoredCount, 1);
  assert.equal(metrics({ ...base(), titles, seen: {}, versions: { 'avengers-endgame': 'encore' } }).encoreChosen, true);
  assert.equal(metrics({ ...base(), titles, seen: {}, versions: { x: 'encore' } }).encoreChosen, false);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2008-04-30' } }).releaseDay, true);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2008-05-02' } }).releaseDay, true);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2008-05-03' } }).releaseDay, false);
});
