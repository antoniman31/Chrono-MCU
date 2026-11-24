import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parisToday } from '../js/paris.js';
import { today } from '../js/ui/dom.js';

// Un instant (UTC) → le jour affiché à Paris. Le fuseau du système de test n'entre jamais en compte.
const jour = (iso) => parisToday(new Date(iso));

test('le jour est celui de Paris, pas celui de l\'appareil ni d\'UTC', () => {
  assert.equal(jour('2026-10-24T22:30:00Z'), '2026-10-25'); // 00 h 30 à Paris (heure d'été), encore le 24 en UTC
  assert.equal(jour('2026-01-10T23:30:00Z'), '2026-01-11'); // 00 h 30 à Paris (heure d'hiver)
  assert.equal(jour('2026-06-15T21:59:59Z'), '2026-06-15'); // 23 h 59 à Paris
  assert.equal(jour('2026-06-15T22:00:00Z'), '2026-06-16'); // minuit à Paris
});

test('changement d\'heure de mars : le 28/03/2027 dure 23 heures', () => {
  assert.equal(jour('2027-03-27T22:59:59Z'), '2027-03-27'); // 23 h 59 en heure d'hiver
  assert.equal(jour('2027-03-27T23:00:00Z'), '2027-03-28'); // minuit
  assert.equal(jour('2027-03-28T00:59:59Z'), '2027-03-28'); // 01 h 59, juste avant le saut
  assert.equal(jour('2027-03-28T01:00:00Z'), '2027-03-28'); // 03 h 00 (heure d'été)
  assert.equal(jour('2027-03-28T21:59:59Z'), '2027-03-28'); // 23 h 59
  assert.equal(jour('2027-03-28T22:00:00Z'), '2027-03-29'); // minuit
});

test('changement d\'heure d\'octobre : le 31/10/2027 dure 25 heures', () => {
  assert.equal(jour('2027-10-30T21:59:59Z'), '2027-10-30'); // 23 h 59 en heure d'été
  assert.equal(jour('2027-10-30T22:00:00Z'), '2027-10-31'); // minuit
  assert.equal(jour('2027-10-31T00:59:59Z'), '2027-10-31'); // 02 h 59 (heure d'été)
  assert.equal(jour('2027-10-31T01:00:00Z'), '2027-10-31'); // 02 h 00 (heure d'hiver), la seconde fois
  assert.equal(jour('2027-10-31T22:59:59Z'), '2027-10-31'); // 23 h 59
  assert.equal(jour('2027-10-31T23:00:00Z'), '2027-11-01'); // minuit
});

test('today() de l\'appli suit la même règle', () => {
  assert.equal(today(new Date('2026-10-24T22:30:00Z')), '2026-10-25');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
