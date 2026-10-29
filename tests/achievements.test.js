import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, mergeUnlocked, metrics, totalMedals, ACHV_FILTERS, matchesFilter, closestToUnlock, medalCounts } from '../js/achievements.js';
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
  assert.equal(totalMedals(list), list.reduce((sum, a) => sum + a.tiers.length, 0));
  assert.equal(list.filter((a) => a.hidden).length, 17);
  assert.ok(list.filter((a) => a.hidden).every((a) => a.family === 'secret' && a.tiers.length === 1), 'les succès cachés sont tous à un seul palier');
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

test('déblocages : grand succès (dernier palier, saga, objectif) et description du palier atteint', () => {
  const titles = [film('a', '2008-01-01'), film('b', '2009-01-01')];
  const sagas = [{ id: 'infinity', name: "La Saga de l'Infini" }, { id: 'multiverse', name: 'La Saga du Multivers' }];
  const evaluated = evaluate(base({ titles, sagas, seen: { a: '2026-10-01', b: '2026-10-02' } }));
  const { unlocked } = mergeUnlocked({}, evaluated, '2026-10-02');
  const byId = (id) => unlocked.find((u) => u.id === id);
  assert.equal(byId('percent').big, true, 'Cap sur la fin atteint 100 % : dernier palier');
  assert.equal(byId('percent').level, 3);
  assert.equal(byId('percent').desc, 'Atteindre 100 % du catalogue', 'la description est celle du palier atteint, pas du suivant');
  assert.equal(byId('infinity').big, true, 'une saga terminée est un grand succès');
  assert.equal(byId('first').big, false);
  assert.equal(byId('first').desc, 'Coche ton premier film ou épisode');
  const partial = mergeUnlocked({}, evaluate(base({ titles: [film('a', '2008-01-01'), film('b', '2009-01-01'), film('c', '2010-01-01'), film('d', '2011-01-01')], seen: { a: '2026-10-01', b: '2026-10-02' } })), '2026-10-02');
  const pct = partial.unlocked.find((u) => u.id === 'percent');
  assert.equal(pct.level, 2);
  assert.equal(pct.big, false, 'un palier intermédiaire n\'est pas un grand succès');
  assert.equal(pct.desc, 'Atteindre 50 % du catalogue');
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

test('succès de saga : le nom vient de data/sagas.json, sans article dans le titre', () => {
  const titles = [film('a', '2008-01-01')];
  const sagas = [{ id: 'infinity', name: "La Saga de l'Infini" }, { id: 'multiverse', name: 'La Saga du Multivers' }];
  const list = evaluate(base({ titles, sagas, seen: {} }));
  assert.equal(get(list, 'infinity').name, "Saga de l'Infini");
  assert.equal(get(list, 'infinity').desc, "Voir toute la Saga de l'Infini");
  assert.equal(get(list, 'multiverse').desc, 'Voir tout ce qui est sorti de la Saga du Multivers');
  assert.equal(get(list, 'sagaFast').name, 'Saga express');
  assert.equal(get(list, 'sagaFast').desc, "Terminer la Saga de l'Infini en 30 jours");
  // identifiants inchangés : les déblocages déjà enregistrés restent valables
  const more = evaluate(base({ titles, sagas: [...sagas, { id: 'cosmos', name: 'La Saga du Cosmos' }], seen: {} }));
  assert.equal(get(more, 'cosmos').desc, 'Voir tout ce qui est sorti de la Saga du Cosmos');
  assert.equal(totalMedals(more), totalMedals(list) + 4); // la saga elle-même et ses trois paliers de pourcentage
});

test('succès par phase et par pourcentage de saga', () => {
  const titles = [film('a', '2008-01-01'), film('b', '2009-01-01', { phase: 2 }), film('c', '2010-01-01', { phase: 2 })];
  const sagas = [{ id: 'infinity', name: "La Saga de l'Infini" }, { id: 'multiverse', name: 'La Saga du Multivers' }];
  const list = evaluate(base({ titles, sagas, seen: { a: '2026-10-01', b: '2026-10-02' } }));
  assert.equal(get(list, 'phase:1').level, 1);
  assert.equal(get(list, 'phase:2').level, 0);
  assert.equal(get(list, 'phase:1').desc, 'Terminer toute la phase 1');
  assert.equal(get(list, 'sagaPct:infinity').value, 66);
  assert.equal(get(list, 'sagaPct:infinity').level, 2); // 25 et 50 atteints
  assert.equal(get(list, 'sagaPct:infinity').name, "À l'usure : Saga de l'Infini");
  assert.equal(get(list, 'sagaPct:multiverse').value, 0);
});

test('jours : week-ends, jours de la semaine, mois, jours actifs, journée fleuve, double séance', () => {
  const titles = [film('a', '2008-01-01', { runtimeMin: 240 }), film('b', '2009-01-01', { runtimeMin: 240 }), film('c', '2010-01-01'), film('d', '2011-01-01', { phase: 2 })];
  // 2026-10-03 samedi, 2026-10-04 dimanche
  const m = metrics({ ...base(), titles, seen: { a: '2026-10-03', b: '2026-10-03', c: '2026-10-04', d: '2026-11-02' } });
  assert.equal(m.fullWeekends, 1);
  assert.equal(m.activeDays, 3);
  assert.equal(m.activeMonths, 2);
  assert.equal(m.allWeekdays, false);
  assert.equal(m.longestDayHours, 8);
  assert.equal(m.doubleFilm, true); // a et b : même jour, même phase
  const split = metrics({ ...base(), titles, seen: { a: '2026-10-03', d: '2026-10-03' } });
  assert.equal(split.doubleFilm, false, 'deux phases différentes ne font pas une double séance');
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const all = Object.fromEntries(week.map((d, i) => [`s${i}`, d]));
  const ts = week.map((_, i) => film(`s${i}`, '2008-01-01'));
  assert.equal(metrics({ ...base(), titles: ts, seen: all }).allWeekdays, true);
  // un rattrapage n'est pas une séance
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-10-03', b: '2026-10-03' }, catchUp: { a: true, b: true } }).longestDayHours, 0);
});

test('une série vue en une journée, toutes les séries, tous les films, scènes mi et fin de générique', () => {
  const s = serie('s', 4);
  const f = film('f', '2008-01-01', { postCredits: ['mid', 'end'] });
  const g = film('g', '2009-01-01', { postCredits: ['end'] });
  const day = '2026-10-10';
  const seenAll = { 's/1': day, 's/2': day, 's/3': day, 's/4': day, f: day, g: day };
  const m = metrics({ ...base(), titles: [s, f, g], seen: seenAll });
  assert.equal(m.seriesInOneDay, true);
  assert.equal(m.seriesAll, true);
  assert.equal(m.filmsAll, true);
  assert.equal(m.postMid, 1);
  assert.equal(m.postEnd, 2);
  assert.equal(m.seenYears, 3); // 2021, 2008, 2009
  const spread = { ...seenAll, 's/4': '2026-10-11' };
  assert.equal(metrics({ ...base(), titles: [s, f, g], seen: spread }).seriesInOneDay, false);
  assert.equal(metrics({ ...base(), titles: [serie('t', 3)], seen: { 't/1': day, 't/2': day, 't/3': day } }).seriesInOneDay, false, 'moins de 4 épisodes : pas assez');
});

test('jalons du MCU et personnages terminés', () => {
  const titles = [film('iron-man', '2008-05-02', { heroes: ['iron-man'] }), film('avengers-endgame', '2019-04-24', { heroes: ['iron-man', 'avengers'] })];
  const m = metrics({ ...base(), titles, seen: { 'iron-man': '2026-10-01' } });
  assert.equal(m.milestones['iron-man'], true);
  assert.equal(m.milestones['avengers-endgame'], false);
  assert.equal(m.milestones.avengers, false, 'un titre absent du catalogue ne casse rien');
  assert.equal(m.heroesDone, 0);
  assert.equal(metrics({ ...base(), titles, seen: { 'iron-man': '2026-10-01', 'avengers-endgame': '2026-10-02' } }).heroesDone, 2);
});

test('succès cachés : retour après 30 jours, jours spéciaux, vendredi 13, thème, noir OLED, affiches', () => {
  const titles = [film('a', '2008-01-01'), film('b', '2009-01-01'), film('c', '2010-01-01')];
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-08-01', b: '2026-08-31' } }).comeback, false); // 29 jours sans rien cocher : pas encore
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-08-01', b: '2026-09-01' } }).comeback, true);
  const special = metrics({ ...base(), titles, seen: { a: '2026-01-01', b: '2026-10-31', c: '2024-02-29' } });
  assert.deepEqual([special.specialDays['01-01'], special.specialDays['10-31'], special.specialDays['02-29'], special.specialDays['12-25']], [true, true, true, undefined]);
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-11-13' } }).friday13, true); // vendredi
  assert.equal(metrics({ ...base(), titles, seen: { a: '2026-10-13' } }).friday13, false); // mardi
  assert.equal(metrics({ ...base(), titles, seen: {}, oled: true, theme: 'light', showPosters: false }).oled, true);
  assert.equal(metrics({ ...base(), titles, seen: {}, oled: true, theme: 'light', showPosters: false }).lightTheme, true);
  assert.equal(metrics({ ...base(), titles, seen: {}, oled: true, theme: 'light', showPosters: false }).noPosters, true);
  assert.equal(metrics({ ...base(), titles, seen: {} }).noPosters, false);
});

const fake = (id, level, tiers, value, extra = {}) => ({ id, name: id, hidden: false, tiers, level, value, next: tiers[level] ?? null, ...extra });

test('filtres de la page Succès', () => {
  const none = fake('a', 0, [1], 0);
  const part = fake('b', 1, [10, 25], 12);
  const full = fake('c', 2, [10, 25], 30);
  const single = fake('d', 1, [1], 1);
  const idsFor = (f) => [none, part, full, single].filter((a) => matchesFilter(a, f)).map((a) => a.id);
  assert.deepEqual(idsFor('all'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(idsFor('progress'), ['b']); // de la progression, pas tout obtenu
  assert.deepEqual(idsFor('done'), ['b', 'c', 'd']);
  assert.deepEqual(idsFor('locked'), ['a']);
  assert.deepEqual(ACHV_FILTERS.map(([id]) => id), ['all', 'progress', 'done', 'locked']);
});

test('succès les plus proches : les plus avancés d\'abord, jamais les cachés ni les terminés', () => {
  const list = [
    fake('quart', 0, [10, 25], 3),
    fake('presque', 0, [10, 25], 9),
    fake('moitie', 1, [10, 25], 17),
    fake('rien', 0, [10], 0),
    fake('fini', 2, [10, 25], 40),
    fake('secret', 0, [10], 9, { hidden: true }),
  ];
  assert.deepEqual(closestToUnlock(list).map((a) => a.id), ['presque', 'moitie', 'quart']);
  assert.deepEqual(closestToUnlock(list, 1).map((a) => a.id), ['presque']);
});

test('médailles par couleur : un succès à palier unique compte comme une médaille d\'or', () => {
  const list = [fake('a', 3, [1, 2, 3], 3), fake('b', 2, [1, 2, 3], 2), fake('c', 1, [1, 2, 3], 1), fake('d', 1, [1], 1), fake('e', 0, [1], 0)];
  assert.deepEqual(medalCounts(list), { bronze: 3, silver: 2, gold: 2 });
  assert.equal(totalMedals(list.map((a) => ({ ...a, tiers: a.tiers }))), 3 + 3 + 3 + 1 + 1);
  const sum = medalCounts(list);
  assert.equal(sum.bronze + sum.silver + sum.gold, list.reduce((n, a) => n + a.level, 0), 'la somme des couleurs égale les médailles obtenues');
});
