import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickResult, searchQuery, seasonNumber } from '../scripts/fetch-posters.mjs';

test('searchQuery retire la mention de saison, seasonNumber la lit', () => {
  assert.equal(searchQuery('Loki (saison 2)'), 'Loki');
  assert.equal(seasonNumber('Loki (saison 2)'), 2);
  assert.equal(searchQuery('Iron Man'), 'Iron Man');
  assert.equal(seasonNumber('Iron Man'), null);
});

test('pickResult préfère la bonne année, ignore les résultats sans affiche', () => {
  const results = [
    { id: 1, release_date: '1990-01-01', poster_path: '/old.jpg' },
    { id: 2, release_date: '2008-05-02', poster_path: null },
    { id: 3, release_date: '2008-05-02', poster_path: '/new.jpg' },
  ];
  assert.equal(pickResult(results, 2008).id, 3);
  assert.equal(pickResult(results, 2015).id, 1);
  assert.equal(pickResult([{ id: 9, release_date: '2008-01-01', poster_path: null }], 2008), null);
  assert.equal(pickResult([{ id: 4, first_air_date: '2021-06-09', poster_path: '/tv.jpg' }], 2021).id, 4);
});

test('pickResult: le titre exact prime sur une simple année identique (making-of, podcasts)', () => {
  const results = [
    { id: 1, title: 'Rassemblement : Le making-of de Les Gardiens de la Galaxie Vol. 3', release_date: '2023-05-02', poster_path: '/makingof.jpg' },
    { id: 2, title: 'Les Gardiens de la Galaxie Vol. 3', release_date: '2023-05-03', poster_path: '/film.jpg' },
  ];
  assert.equal(pickResult(results, 2023, 'Les Gardiens de la Galaxie Vol. 3').id, 2);
  assert.equal(pickResult(results, 2023).id, 2);
});

test('pickResult: pénalise making-of et podcasts même sans titre exact', () => {
  const results = [
    { id: 1, title: 'Rassemblement : Le making-of de Les Gardiens de la Galaxie Vol. 3', release_date: '2023-05-02', poster_path: '/makingof.jpg' },
    { id: 2, title: 'Les Gardiens de la Galaxie : Volume 3', release_date: '2023-05-03', poster_path: '/film.jpg' },
    { id: 3, name: 'Daredevil: Born Again Official Podcast', first_air_date: '2026-03-24', poster_path: '/podcast.jpg' },
  ];
  assert.equal(pickResult(results, 2023, 'Les Gardiens de la Galaxie Vol. 3').id, 2);
  assert.equal(pickResult([results[2]], 2026, 'Daredevil : Born Again').id, 3);
});
