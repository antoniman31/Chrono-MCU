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
