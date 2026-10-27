import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTitles, toUnits, filterTitles, progress, nextToWatch, withVersions } from '../js/logic.js';

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

import { resumeFrom, stats } from '../js/logic.js';

test('reprise: unité suivante après la dernière vue, dans l\'ordre actif', () => {
  const seen = { a: '2026-01-01' };
  assert.equal(resumeFrom(titles, seen, 'chrono', 'a').key, 'b');
  assert.equal(resumeFrom(titles, { b: 1 }, 'release', 'b').key, 's/1');
});

test('reprise: saute les déjà vus, null si rien après ou clé inconnue', () => {
  assert.equal(resumeFrom(titles, { a: 1, b: 1 }, 'chrono', 'a').key, 's/1');
  assert.equal(resumeFrom(titles, { 's/2': 1 }, 'chrono', 's/2'), null);
  assert.equal(resumeFrom(titles, {}, 'chrono', null), null);
  assert.equal(resumeFrom(titles, {}, 'chrono', 'zzz'), null);
});

test('reprise: la progression ne dépend pas de l\'ordre, la suggestion si', () => {
  const seen = { a: 1 };
  assert.equal(resumeFrom(titles, seen, 'chrono', 'a').key, 'b');
  assert.equal(resumeFrom(titles, seen, 'release', 'a'), null);
});

test('stats: heures vues/restantes, rythme et date de fin estimée', () => {
  // a,b = 100 min chacun; s = 2 x 30 min. Total 260.
  const seen = { a: '2026-01-01', b: '2026-01-05' };
  const r = stats(titles, seen, '2026-01-11'); // 10 jours écoulés
  assert.equal(r.seenMin, 200);
  assert.equal(r.remainingMin, 60);
  assert.equal(r.paceMinPerDay, 20);
  assert.equal(r.etaDate, '2026-01-14'); // 60 / 20 = 3 jours
});

test('stats: n/a sous 2 jours de données, rien vu, ou aucune donnée', () => {
  assert.equal(stats(titles, { a: '2026-01-10' }, '2026-01-11').etaDate, null);
  assert.equal(stats(titles, { a: '2026-01-10' }, '2026-01-11').paceMinPerDay, null);
  assert.equal(stats(titles, {}, '2026-01-11').etaDate, null);
  assert.equal(stats(titles, {}, '2026-01-11').remainingMin, 260);
});

test('stats: tout vu = fin estimée aujourd\'hui', () => {
  const seen = { a: '2026-01-01', b: '2026-01-01', 's/1': '2026-01-01', 's/2': '2026-01-01' };
  const r = stats(titles, seen, '2026-01-11');
  assert.equal(r.remainingMin, 0);
  assert.equal(r.etaDate, '2026-01-11');
});

test('titres à venir: ignorés des unités, de la progression et du prochain à voir', () => {
  const soon = { id: 'soon', title: 'soon', type: 'film', phase: 6, saga: 'multiverse',
    releaseDate: '2099-01-01', chronoOrder: 0, upcoming: true, verified: false };
  assert.deepEqual(toUnits([soon]), []);
  assert.equal(progress([a, soon], {}).total, 1);
  assert.equal(nextToWatch([soon, a], {}, 'chrono').key, 'a');
  assert.equal(nextToWatch([soon], {}, 'chrono'), null);
  assert.equal(filterTitles([a, soon], { phase: 6 }).length, 1);
});

import { normalizeText, titleSeen } from '../js/logic.js';

test('normalizeText: sans accents ni casse', () => {
  assert.equal(normalizeText('  Les Éternels '), 'les eternels');
});

test('recherche: titre, épisode, accents; vide = tout', () => {
  const eternels = film('eternels', 7, '2021-11-05');
  eternels.title = 'Les Éternels';
  const t = [a, eternels, s];
  s.episodes[1].title = 'Doorman';
  assert.equal(filterTitles(t, { query: '' }).length, 3);
  assert.deepEqual(filterTitles(t, { query: 'eternels' }).map((x) => x.id), ['eternels']);
  assert.deepEqual(filterTitles(t, { query: 'DOORMAN' }).map((x) => x.id), ['s']);
  assert.deepEqual(filterTitles(t, { query: 'zzz' }), []);
});

test('masquer les terminés: films vus, séries entièrement vues; série partielle gardée', () => {
  assert.equal(titleSeen(a, { a: '2026-01-01' }), true);
  assert.equal(titleSeen(s, { 's/1': 1 }), false);
  assert.equal(titleSeen(s, { 's/1': 1, 's/2': 1 }), true);
  const seen = { a: 1, 's/1': 1 };
  assert.deepEqual(filterTitles([a, b, s], { hideSeen: true, seen }).map((x) => x.id), ['b', 's']);
  assert.deepEqual(filterTitles([a, b, s], { hideSeen: false, seen }).length, 3);
  const all = { a: 1, b: 1, 's/1': 1, 's/2': 1 };
  assert.deepEqual(filterTitles([a, b, s], { hideSeen: true, seen: all }), []);
});

import { suggestNext } from '../js/logic.js';

test('suggestNext: sans historique, le tout premier titre', () => {
  assert.equal(suggestNext(titles, {}, 'chrono', null).unit.key, 'a');
  assert.equal(suggestNext(titles, {}, 'chrono', null).status, 'next');
});

test('suggestNext: suit le dernier coché et ne rappelle jamais ce qui a été sauté', () => {
  // chrono: a, b, s/1, s/2 ; l'utilisateur a seulement coché b (a sauté)
  const r = suggestNext(titles, { b: '2026-01-01' }, 'chrono', 'b');
  assert.equal(r.unit.key, 's/1');
  // a (sauté) n'est pas proposé, même s'il reste non vu
  assert.notEqual(r.unit.key, 'a');
});

test('suggestNext: passe les déjà vus après le dernier coché, épisode suivant dans une série', () => {
  assert.equal(suggestNext(titles, { a: 1, b: 1, 's/2': 1 }, 'chrono', 'b').unit.key, 's/1');
  assert.equal(suggestNext(titles, { a: 1, b: 1, 's/1': 1 }, 'chrono', 's/1').unit.key, 's/2');
});

test('suggestNext: fin de liste atteinte avec des titres sautés = pas de rappel; tout vu = done', () => {
  const end = suggestNext(titles, { 's/2': 1 }, 'chrono', 's/2');
  assert.deepEqual(end, { unit: null, status: 'end' });
  assert.equal(suggestNext(titles, { a: 1, b: 1, 's/1': 1, 's/2': 1 }, 'chrono', 's/2').status, 'done');
});

test('suggestNext: clé inconnue = repli sur le premier non vu; l\'ordre actif change la suite', () => {
  assert.equal(suggestNext(titles, {}, 'chrono', 'zzz').unit.key, 'a');
  // release: b, s, a — dernier coché b -> suivante s/1 ; en chrono après b aussi s/1 ; après a (release) rien
  assert.equal(suggestNext(titles, { a: 1 }, 'release', 'a').status, 'end');
  assert.equal(suggestNext(titles, { a: 1 }, 'chrono', 'a').unit.key, 'b');
});

import { countedTitles } from '../js/logic.js';

test('suggestNext: un titre ignoré n\'est jamais proposé, même s\'il suit le dernier coché', () => {
  // chrono: a, b, s/1, s/2 ; b est le dernier coché et s est ignorée
  assert.equal(suggestNext(titles, { b: 1 }, 'chrono', 'b', { s: true }).status, 'end');
  // dernier coché dans un titre ignoré après coup: on continue à partir de sa position, sans rappeler les titres sautés avant
  assert.equal(suggestNext(titles, { s: 1 }, 'chrono', 's/1', { s: true }).status, 'end');
  assert.equal(suggestNext(titles, { a: 1, b: 1 }, 'chrono', 'b', { s: true }).status, 'done');
});

test('countedTitles: retire les titres ignorés de progression et stats', () => {
  const counted = countedTitles(titles, { a: true });
  assert.equal(counted.some((t) => t.id === 'a'), false);
  assert.equal(progress(counted, {}).total, progress(titles, {}).total - 1);
});

test('stats: le rattrapage compte dans les heures vues mais pas dans le rythme', () => {
  // titles : a (film 100 min) et s/1, s/2 ... on réutilise le jeu de données du fichier
  const all = stats(titles, { a: '2026-01-01', b: '2026-01-01' }, '2026-01-11');
  const caught = stats(titles, { a: '2026-01-01', b: '2026-01-01' }, '2026-01-11', { a: true, b: true });
  assert.equal(caught.seenMin, all.seenMin);
  assert.equal(caught.paceMinPerDay, null);
  assert.equal(caught.etaDate, null);
  const mixed = stats(titles, { a: '2026-01-01', b: '2026-01-06' }, '2026-01-11', { a: true });
  assert.ok(mixed.paceMinPerDay > 0);
  assert.equal(mixed.paceMinPerDay, titles.find((t) => t.id === 'b').runtimeMin / 5);
});

test('titres d\'épisodes en français : unité et recherche', () => {
  const fr = [{ id: 's', title: 'S', type: 'serie', phase: 1, chronoOrder: 1, releaseDate: '2021-01-01', episodes: [{ n: 1, title: 'Pilot', titleFr: 'Le pilote', runtimeMin: 30 }] }];
  assert.equal(toUnits(fr)[0].title, 'Le pilote');
  assert.equal(filterTitles(fr, { query: 'pilote' }).length, 1);
  assert.equal(filterTitles(fr, { query: 'pilot' }).length, 1);
  assert.equal(filterTitles(fr, { query: 'inconnu' }).length, 0);
});

import { isReleased, releasedView } from '../js/logic.js';

const ongoing = {
  id: 'o', title: 'O', type: 'serie', phase: 6, saga: 'multiverse', releaseDate: '2026-10-01', chronoOrder: 9, verified: true,
  episodes: [
    { n: 1, title: 'a', airDate: '2026-10-01', runtimeMin: 30 },
    { n: 2, title: 'b', airDate: '2026-11-03', runtimeMin: 30 },
    { n: 3, title: 'c', airDate: '2026-11-10', runtimeMin: 30 },
  ],
};

test('isReleased : le jour même de la date d\'origine, jamais avant ; sans date = sorti', () => {
  assert.equal(isReleased({ airDate: '2026-11-03' }, '2026-11-02'), false);
  assert.equal(isReleased({ airDate: '2026-11-03' }, '2026-11-03'), true);
  assert.equal(isReleased({ airDate: '2026-11-03' }, '2026-12-01'), true);
  assert.equal(isReleased({}, '2026-01-01'), true);
});

test('releasedView : retire les épisodes à venir, garde les numéros, série sans épisode sorti = à venir', () => {
  const v = releasedView([ongoing, a], '2026-10-27');
  assert.deepEqual(v[0].episodes.map((e) => e.n), [1]);
  assert.equal(v[0].upcoming, undefined);
  assert.equal(v[1], a, 'un film reste le même objet');
  assert.equal(releasedView([ongoing], '2026-11-03')[0].episodes.length, 2);
  assert.equal(releasedView([ongoing], '2026-11-10')[0], ongoing, 'tout est sorti : même objet');
  const none = releasedView([ongoing], '2026-09-01')[0];
  assert.equal(none.upcoming, true);
});

test('releasedView : progression, « Prochain à voir » et statistiques ne comptent que les épisodes sortis', () => {
  const before = releasedView([ongoing], '2026-10-27');
  assert.equal(progress(before, {}).total, 1);
  assert.equal(stats(before, {}, '2026-10-27').remainingMin, 30);
  const seen = { 'o/1': '2026-10-02' };
  assert.equal(suggestNext(before, seen, 'chrono', 'o/1').status, 'done'); // tout ce qui est sorti est vu
  const after = releasedView([ongoing], '2026-11-03');
  assert.equal(progress(after, seen).total, 2);
  assert.equal(suggestNext(after, seen, 'chrono', 'o/1').unit.key, 'o/2');
});

test('withVersions : la version choisie change la durée et les scènes, pas le reste', () => {
  const eg = { ...film('eg', 1, '2019-04-26', 3, 181), postCredits: [], versions: [{ id: 'encore', label: 'Encore', runtimeMin: 185, postCredits: ['end'] }] };
  const other = film('o', 2, '2020-01-01');
  const [none, same] = withVersions([eg, other], {});
  assert.equal(none.runtimeMin, 181);
  assert.equal(none.activeVersion, null);
  assert.equal(same, other, 'un titre sans version est renvoyé tel quel');
  const [enc] = withVersions([eg, other], { eg: 'encore' });
  assert.equal(enc.runtimeMin, 185);
  assert.deepEqual(enc.postCredits, ['end']);
  assert.equal(enc.activeVersion, 'encore');
  assert.equal(enc.id, 'eg');
  assert.equal(eg.runtimeMin, 181, 'le catalogue d\'origine n\'est pas modifié');
  assert.equal(withVersions([eg], { eg: 'inconnue' })[0].runtimeMin, 181, 'une version inconnue est ignorée');
});

test('withVersions : les heures du titre suivent la version choisie', () => {
  const eg = { ...film('eg', 1, '2019-04-26', 3, 181), versions: [{ id: 'encore', label: 'Encore', runtimeMin: 185 }] };
  const seen = { eg: '2026-10-01' };
  const base = stats(withVersions([eg], {}), seen, '2026-10-02');
  const enc = stats(withVersions([eg], { eg: 'encore' }), seen, '2026-10-02');
  assert.equal(enc.seenMin - base.seenMin, 4);
});
