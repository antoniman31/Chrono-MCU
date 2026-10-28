import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phaseInfo, phaseList, phaseSummary, sagaLabel } from '../js/phases.js';
import { countedTitles } from '../js/logic.js';

const catalogue = JSON.parse(readFileSync(new URL('../data/mcu.json', import.meta.url), 'utf8'));

const sagas = JSON.parse(readFileSync(new URL('../data/sagas.json', import.meta.url), 'utf8'));

// Les noms viennent de data/sagas.json (modifiables sans toucher au code) : les tests lisent le fichier au lieu de les recopier
const sagaName = (id) => sagas.find((s) => s.id === id).name;

test('sagaLabel : les deux sagas actuelles ont le nom du fichier data/sagas.json', () => {
  assert.equal(sagaLabel('infinity', sagas), sagaName('infinity'));
  assert.equal(sagaLabel('multiverse', sagas), sagaName('multiverse'));
});

test('sagaLabel : une saga sans nom officiel s\'affiche « Phases 7 à 9 », sans nom inventé', () => {
  const titles = [{ phase: 7, saga: 'next' }, { phase: 9, saga: 'next' }, { phase: 8, saga: 'next' }, { phase: 6, saga: 'multiverse' }];
  const list = [...sagas, { id: 'next', name: null }];
  assert.equal(sagaLabel('next', list, titles), 'Phases 7 à 9');
  assert.equal(sagaLabel('next', list, [{ phase: 7, saga: 'next' }]), 'Phase 7');
  assert.equal(sagaLabel('inconnue', list, titles), 'inconnue');
  assert.equal(sagaLabel('multiverse', list, titles), sagaName('multiverse'));
});

test('phaseList : phases triées, sans doublon', () => {
  assert.deepEqual(phaseList(catalogue), [1, 2, 3, 4, 5, 6]);
});

test('phaseSummary : saga, années, titres, heures et progression d\'une phase', () => {
  const counted = countedTitles(catalogue, {});
  const phase4 = phaseSummary(catalogue, counted, {}, 4, sagas);
  assert.equal(phase4.saga, sagaName('multiverse'));
  assert.equal(phase4.from, 2021);
  assert.equal(phase4.titles, catalogue.filter((t) => t.phase === 4 && !t.upcoming).length);
  assert.ok(phase4.minutes > 0);
  assert.equal(phase4.percent, 0);
  assert.equal(phaseSummary(catalogue, counted, {}, 1, sagas).saga, sagaName('infinity'));
});

test('phaseSummary : les titres ignorés ne comptent pas, la progression suit les coches', () => {
  const ironMan = catalogue.find((t) => t.id === 'iron-man');
  const base = phaseSummary(catalogue, countedTitles(catalogue, {}), {}, 1);
  const without = phaseSummary(catalogue, countedTitles(catalogue, { 'iron-man': true }), {}, 1);
  assert.equal(without.titles, base.titles - 1);
  assert.equal(base.minutes - without.minutes, ironMan.runtimeMin);
  const seen = phaseSummary(catalogue, countedTitles(catalogue, {}), { 'iron-man': '2026-01-01' }, 1);
  assert.ok(seen.percent > 0);
});

test('phaseSummary : « toutes » couvre tout le catalogue, sans saga', () => {
  const all = phaseSummary(catalogue, countedTitles(catalogue, {}), {}, null);
  assert.equal(all.saga, null);
  assert.equal(all.titles, catalogue.filter((t) => !t.upcoming).length);
  assert.equal(all.from, Math.min(...catalogue.map((t) => Number(t.releaseDate.slice(0, 4)))));
});

test('phaseInfo : libellés lisibles, année unique et pluriels', () => {
  assert.deepEqual(phaseInfo({ phase: 4, saga: 'Saga du Multivers', from: 2021, to: 2022, titles: 18, minutes: 852, percent: 12 }),
    { title: 'Saga du Multivers', details: '2021–2022 · 18 titres · 14 h 12 min · 12 % vu' });
  assert.equal(phaseInfo({ phase: null, saga: null, from: 2025, to: 2025, titles: 1, minutes: 60, percent: 0 }).title, 'Toutes les phases');
  assert.equal(phaseInfo({ phase: null, saga: null, from: 2025, to: 2025, titles: 1, minutes: 60, percent: 0 }).details, '2025 · 1 titre · 1 h · 0 % vu');
});
