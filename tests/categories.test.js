import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, categoriesFor, categoryLabel, categoryTexts, effectiveIgnored, ignoreInfo, matchesCategory, titleIgnored } from '../js/categories.js';
import { defaultState } from '../js/store.js';

const catalogue = JSON.parse(readFileSync(new URL('../data/mcu.json', import.meta.url), 'utf8'));
const of = (id) => catalogue.filter((t) => matchesCategory(id, t));

test('séries : tous les titres de type série', () => {
  assert.equal(of('series').length, catalogue.filter((t) => t.type === 'serie').length);
  assert.ok(of('series').every((t) => t.type === 'serie'));
});

test('courts formats : films de moins d\'une heure et séries aux épisodes de moins de 10 min', () => {
  const ids = of('shorts').map((t) => t.id);
  assert.ok(ids.includes('werewolf-by-night'));
  assert.ok(ids.includes('i-am-groot-saison-1'));
  assert.ok(!ids.includes('iron-man'));
  assert.ok(!ids.includes('wandavision'));
});

test('autres réalités et saga du Multivers : lues dans les données', () => {
  assert.ok(of('altUniverse').every((t) => t.altUniverse === true) && of('altUniverse').length >= 5);
  assert.ok(of('multiverse').every((t) => t.saga === 'multiverse'));
  assert.ok(!of('multiverse').some((t) => t.id === 'iron-man'));
});

test('un titre à venir (sans durée) ne plante aucune règle', () => {
  const upcoming = catalogue.filter((t) => t.upcoming);
  assert.ok(upcoming.length >= 1);
  for (const c of CATEGORIES) for (const t of upcoming) assert.equal(typeof c.test(t), 'boolean');
});

test('ignoreInfo : explicite, par catégorie, réintégré', () => {
  const t = catalogue.find((x) => x.id === 'loki-saison-1');
  const base = defaultState();
  assert.deepEqual(ignoreInfo(base, t), { ignored: false, explicit: false, category: null });
  const skipped = { ...base, skip: ['series'] };
  assert.deepEqual(ignoreInfo(skipped, t), { ignored: true, explicit: false, category: 'series' });
  assert.equal(titleIgnored({ ...skipped, included: { [t.id]: true } }, t), false);
  assert.equal(titleIgnored({ ...skipped, included: { [t.id]: true }, ignored: { [t.id]: true } }, t), true);
});

test('effectiveIgnored : table des titres ignorés', () => {
  const map = effectiveIgnored({ ...defaultState(), skip: ['altUniverse'] }, catalogue);
  assert.deepEqual(Object.keys(map).sort(), of('altUniverse').map((t) => t.id).sort());
});

test('catégorie de saga : nom et description suivent data/sagas.json', () => {
  const sagas = JSON.parse(readFileSync(new URL('../data/sagas.json', import.meta.url), 'utf8'));
  const c = categoriesFor(sagas).find((x) => x.id === 'multiverse');
  const texts = categoryTexts(c, sagas, catalogue);
  assert.equal(texts.label, "Saga du Multivers");
  assert.equal(texts.desc, "Phases 4 à 6 : à couper pour s'arrêter à la Saga de l'Infini");
  assert.equal(categoryLabel('multiverse', sagas, catalogue), 'Saga du Multivers');
  assert.equal(categoryLabel('series'), 'Séries');
  // renommé dans le fichier : tout suit, sans l'article en titre
  const renamed = sagas.map((s) => (s.id === 'infinity' ? { ...s, name: "L'Épopée de l'Infini" } : { ...s, name: 'Le Grand Multivers' }));
  assert.equal(categoryTexts(c, renamed, catalogue).label, 'Grand Multivers');
  assert.match(categoryTexts(c, renamed, catalogue).desc, /à couper pour s'arrêter à L'Épopée de l'Infini$/);
});

test('une nouvelle saga ajoute sa catégorie, qui s\'arrête à la précédente', () => {
  const sagas = [{ id: 'a', name: 'La Saga A' }, { id: 'b', name: 'La Saga B' }, { id: 'c', name: 'La Saga C' }];
  const all = categoriesFor(sagas);
  assert.deepEqual(all.map((c) => c.id), [...CATEGORIES.map((c) => c.id), 'b', 'c']);
  const titles = [{ id: 'x', saga: 'c', phase: 7 }, { id: 'y', saga: 'b', phase: 5 }];
  assert.equal(categoryTexts(all.at(-1), sagas, titles).desc, "Phase 7 : à couper pour s'arrêter à la Saga B");
  assert.equal(matchesCategory('c', titles[0]), true);
  assert.equal(matchesCategory('c', titles[1]), false);
});
