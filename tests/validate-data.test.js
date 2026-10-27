import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../scripts/validate-data.mjs';

const film = (o = {}) => ({
  id: 'f1', title: 'F1', type: 'film', phase: 1, saga: 'infinity',
  releaseDate: '2008-05-02', chronoOrder: 1, runtimeMin: 100, verified: true, ...o,
});
const serie = (o = {}) => ({
  id: 's1', title: 'S1', type: 'serie', phase: 4, saga: 'multiverse',
  releaseDate: '2021-01-15', chronoOrder: 2, verified: true,
  episodes: [{ n: 1, title: 'E1', runtimeMin: 30 }, { n: 2, title: 'E2', runtimeMin: 30 }], ...o,
});

test('le catalogue réel est valide', () => {
  const data = JSON.parse(readFileSync(new URL('../data/mcu.json', import.meta.url), 'utf8'));
  assert.deepEqual(validate(data), []);
});

test('film et série valides', () => {
  assert.deepEqual(validate([film(), serie()]), []);
});

test('rejette un non-tableau', () => {
  assert.equal(validate({}).length, 1);
});

test('rejette ids et chronoOrder en double', () => {
  const errs = validate([film(), film()]);
  assert.ok(errs.some((e) => e.includes('id en double')));
  assert.ok(errs.some((e) => e.includes('chronoOrder en double')));
});

test('rejette date impossible', () => {
  assert.ok(validate([film({ releaseDate: '2008-02-31' })]).some((e) => e.includes('releaseDate')));
});

test('film sans runtimeMin ou avec episodes', () => {
  assert.ok(validate([film({ runtimeMin: undefined })]).some((e) => e.includes('runtimeMin')));
  assert.ok(validate([film({ episodes: [] })]).some((e) => e.includes('episodes')));
});

test('série sans épisodes, épisodes non continus, runtimeMin interdit', () => {
  assert.ok(validate([serie({ episodes: [] })]).length > 0);
  const gap = serie({ episodes: [{ n: 1, title: 'a', runtimeMin: 30 }, { n: 3, title: 'b', runtimeMin: 30 }] });
  assert.ok(validate([gap]).some((e) => e.includes('n=2')));
  assert.ok(validate([serie({ runtimeMin: 60 })]).some((e) => e.includes('interdit')));
});

test('rejette verified non booléen', () => {
  assert.ok(validate([film({ verified: 'oui' })]).some((e) => e.includes('verified')));
});

test('titre à venir: sans durée ni épisodes, upcoming strictement true', () => {
  const up = film({ id: 'u', chronoOrder: 9, runtimeMin: undefined, upcoming: true });
  delete up.runtimeMin;
  assert.deepEqual(validate([up]), []);
  assert.ok(validate([{ ...up, runtimeMin: 100 }]).some((e) => e.includes('à venir')));
  assert.ok(validate([{ ...up, upcoming: false }]).some((e) => e.includes('upcoming')));
  const upSerie = serie({ id: 'us', chronoOrder: 10, upcoming: true });
  assert.ok(validate([upSerie]).some((e) => e.includes('à venir')));
  delete upSerie.episodes;
  assert.deepEqual(validate([upSerie]), []);
});

test('postCredits: films seulement, valeurs mid/end sans doublon', () => {
  assert.deepEqual(validate([film({ postCredits: ['mid', 'end'] })]), []);
  assert.deepEqual(validate([film({ postCredits: [] })]), []);
  assert.ok(validate([film({ postCredits: ['mid', 'mid'] })]).some((e) => e.includes('postCredits')));
  assert.ok(validate([film({ postCredits: ['apres'] })]).some((e) => e.includes('postCredits')));
  assert.ok(validate([film({ postCredits: 'end' })]).some((e) => e.includes('postCredits')));
  assert.ok(validate([serie({ postCredits: ['end'] })]).some((e) => e.includes('postCredits')));
});

test('poster et tmdbId: formats stricts', () => {
  assert.deepEqual(validate([film({ poster: '/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg', tmdbId: 969681 })]), []);
  assert.ok(validate([film({ poster: 'https://evil.example/x.jpg' })]).some((e) => e.includes('poster')));
  assert.ok(validate([film({ poster: '/../x.jpg' })]).some((e) => e.includes('poster')));
  assert.ok(validate([film({ poster: '/ok.gif' })]).some((e) => e.includes('poster')));
  assert.ok(validate([film({ tmdbId: 0 })]).some((e) => e.includes('tmdbId')));
});

test('altUniverse: true ou absent', () => {
  assert.deepEqual(validate([film({ altUniverse: true })]), []);
  assert.ok(validate([film({ altUniverse: false })]).some((e) => e.includes('altUniverse')));
  assert.ok(validate([film({ altUniverse: 'oui' })]).some((e) => e.includes('altUniverse')));
});

test('tvmazeId: séries seulement, entier positif', () => {
  assert.deepEqual(validate([serie({ tvmazeId: 41748 })]), []);
  assert.ok(validate([film({ tvmazeId: 1 })]).some((e) => e.includes('tvmazeId')));
  assert.ok(validate([serie({ tvmazeId: 0 })]).some((e) => e.includes('tvmazeId')));
});

test('releaseDateFr, backdrop et airDate : valides acceptés, invalides rejetés', () => {
  assert.deepEqual(validate([film({ releaseDateFr: '2008-04-30', backdrop: '/abc_123.jpg' }), serie({
    episodes: [{ n: 1, title: 'E1', airDate: '2021-01-15', runtimeMin: 30 }, { n: 2, title: 'E2', runtimeMin: 30 }],
  })]), []);
  assert.ok(validate([film({ releaseDateFr: '2008-02-31' })]).some((e) => e.includes('releaseDateFr')));
  assert.ok(validate([serie({ releaseDateFr: '2021-01-15' })]).some((e) => e.includes('releaseDateFr')));
  assert.ok(validate([film({ backdrop: 'abc.jpg' })]).some((e) => e.includes('backdrop')));
  assert.ok(validate([serie({ episodes: [{ n: 1, title: 'E1', airDate: '15/01/2021', runtimeMin: 30 }] })]).some((e) => e.includes('airDate')));
});

test('overview: texte non vide de 400 caractères maximum', () => {
  assert.deepEqual(validate([film({ overview: 'Un résumé.' })]), []);
  assert.ok(validate([film({ overview: '' })]).some((e) => e.includes('overview')));
  assert.ok(validate([film({ overview: 'x'.repeat(401) })]).some((e) => e.includes('overview')));
});
