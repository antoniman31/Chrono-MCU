import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueUpcoming, newCandidates, newSeasons, promoteFilm, promoteSeries, renderReport, slugify } from '../scripts/sync-catalog.mjs';
import { validate } from '../scripts/validate-data.mjs';

const film = (extra) => ({ id: 'a', title: 'A', type: 'film', phase: 6, saga: 'multiverse', releaseDate: '2026-10-01', chronoOrder: 1, verified: false, ...extra });
const TODAY = '2026-10-28';

test('slug : accents, ponctuation, tirets', () => {
  assert.equal(slugify('Spidey et les Avengers : Halloween en équipe !'), 'spidey-et-les-avengers-halloween-en-equipe');
  assert.equal(slugify('Thunderbolts*'), 'thunderbolts');
});

test('titres à venir dont la date est passée', () => {
  const catalog = [film({ id: 'x', upcoming: true, releaseDate: '2026-10-28' }), film({ id: 'y', upcoming: true, releaseDate: '2026-10-29' }), film({ id: 'z', releaseDate: '2020-01-01' })];
  assert.deepEqual(dueUpcoming(catalog, TODAY).map((t) => t.id), ['x']);
});

test('film sorti : durée et date France, plus « à venir » ; rien tant que TMDB n\'a pas de durée', () => {
  const t = film({ id: 'x', upcoming: true });
  const out = promoteFilm(t, { runtime: 123 }, '2026-10-02');
  assert.equal('upcoming' in out, false);
  assert.deepEqual([out.runtimeMin, out.releaseDateFr, out.verified], [123, '2026-10-02', false]);
  assert.equal(promoteFilm(t, { runtime: 0 }, null), null);
  assert.equal(promoteFilm(t, null, null), null);
  assert.deepEqual(validate([out]), []);
});

test('série sortie : épisodes de TVmaze, durées, vérifiée seulement si tout est connu', () => {
  const t = { id: 's', title: 'S (saison 2)', type: 'serie', phase: 6, saga: 'multiverse', releaseDate: '2026-10-01', chronoOrder: 2, upcoming: true, verified: false };
  const tv = [{ number: 2, name: 'Deux', airdate: '2026-10-08', runtime: 31 }, { number: 1, name: 'Un', airdate: '2026-10-01', runtime: 29 }];
  const out = promoteSeries(t, tv, 99);
  assert.equal('upcoming' in out, false);
  assert.deepEqual(out.episodes.map((e) => [e.n, e.title, e.runtimeMin]), [[1, 'Un', 29], [2, 'Deux', 31]]);
  assert.deepEqual([out.tvmazeId, out.verified], [99, true]);
  assert.deepEqual(validate([out]), []);
  const partial = promoteSeries(t, [{ number: 1, name: 'Un', airdate: '2026-10-01', runtime: 29 }, { number: 2, name: '', airdate: '2026-10-08', runtime: null }], 99);
  assert.deepEqual([partial.verified, partial.episodes[1].title, partial.episodes[1].runtimeMin], [false, 'Épisode 2', 0]);
  assert.equal(promoteSeries(t, [], 99), null);
  assert.equal(promoteSeries(t, [{ number: 1, name: 'Un', runtime: null }], 99), null);
});

test('nouveaux titres : inconnus, récents, sans documentaires, placeholders ni horizon lointain', () => {
  const catalog = [film({ id: 'a', tmdbId: 1, chronoOrder: 5, phase: 6, runtimeMin: 100 })];
  const movies = [
    { id: 1, title: 'Déjà là', release_date: '2026-11-01' },
    { id: 2, title: 'Nouveau Film', release_date: '2026-12-01', genre_ids: [28] },
    { id: 3, title: 'Un documentaire', release_date: '2026-12-01', genre_ids: [99] },
    { id: 4, title: 'Marvel Studios: Assembled — le making-of', release_date: '2026-12-01' },
    { id: 5, title: 'Untitled Marvel Film', release_date: '2027-05-01' },
    { id: 6, title: 'Très lointain', release_date: '2030-05-01' },
    { id: 7, title: 'Trop ancien', release_date: '2025-01-01' },
    { id: 8, title: 'Ignoré', release_date: '2026-12-01' },
    { id: 9, title: 'Sans date' },
  ];
  const shows = [{ id: 20, name: 'Nouvelle Série', first_air_date: '2027-01-10' }, { id: 2, name: 'Même id que le film', first_air_date: '2027-01-10' }];
  const drafts = newCandidates({ movies, shows, catalog, ignored: [8], today: TODAY });
  assert.deepEqual(drafts.map((d) => [d.id, d.type, d.chronoOrder, d.upcoming, d.verified]), [['nouveau-film', 'film', 6, true, false], ['nouvelle-serie', 'serie', 7, true, false]]);
  assert.deepEqual(validate([...catalog, ...drafts].map((t, i) => ({ ...t, chronoOrder: i + 1, tmdbId: t.tmdbId ?? 100 + i }))), []);
});

test('nouveaux titres : identifiant unique si le titre existe déjà', () => {
  const catalog = [film({ id: 'doublon', tmdbId: 1 })];
  const drafts = newCandidates({ movies: [{ id: 2, title: 'Doublon', release_date: '2026-12-01' }, { id: 3, title: 'Doublon', release_date: '2026-12-02' }], catalog, today: TODAY });
  assert.deepEqual(drafts.map((d) => d.id), ['doublon-2', 'doublon-3']);
});

test('nouvelle saison d\'une série suivie : signalée si récente ou à venir, jamais si déjà au catalogue', () => {
  const catalog = [
    { id: 's1', title: 'Show (saison 1)', type: 'serie', tvmazeId: 7 },
    { id: 's2', title: 'Show (saison 2)', type: 'serie', tvmazeId: 7 },
    { id: 'o', title: 'Ancienne (saison 1)', type: 'serie', tvmazeId: 8 },
  ];
  const eps = (season, ...dates) => dates.map((airdate) => ({ season, airdate }));
  const tv = new Map([
    [7, [...eps(1, '2024-01-01'), ...eps(2, '2025-01-01'), ...eps(3, '2026-12-01', '2026-12-08')]],
    [8, [...eps(1, '2020-01-01'), ...eps(2, '2021-01-01')]],
  ]);
  assert.deepEqual(newSeasons(catalog, tv, TODAY), [{ show: 'Show', season: 3, first: '2026-12-01', last: '2026-12-08', episodes: 2 }]);
});

test('rapport', () => {
  assert.match(renderReport({ promoted: [], pending: [], drafts: [], seasons: [], skipped: [] }), /Rien à signaler/);
  const text = renderReport({ promoted: [film({ runtimeMin: 120 })], pending: ['B'], drafts: [film({ id: 'n', title: 'N' })], seasons: [{ show: 'S', season: 2, first: '2026-12-01', last: '2026-12-08', episodes: 8 }], skipped: ['x'] });
  for (const part of ['A : 120 min', 'B', 'N (film', 'S, saison 2', 'x']) assert.ok(text.includes(part), part);
});
