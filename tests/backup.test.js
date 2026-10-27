import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, backupStatus, daysAgoLabel, daysBetween } from '../js/backup.js';

const none = { lastBackup: null, snoozeUntil: null };

test('jamais sauvegardé : rappel seulement à partir de 20 coches', () => {
  assert.equal(backupStatus(none, 0, '2026-10-27').due, false);
  assert.equal(backupStatus(none, 19, '2026-10-27').due, false);
  const s = backupStatus(none, 20, '2026-10-27');
  assert.equal(s.due, true);
  assert.equal(s.neverBackedUp, true);
});

test('après une sauvegarde : 20 nouvelles coches ou 30 jours avec des changements', () => {
  const last = { day: '2026-10-01', seenCount: 10 };
  assert.equal(backupStatus({ lastBackup: last, snoozeUntil: null }, 29, '2026-10-05').due, false);
  assert.equal(backupStatus({ lastBackup: last, snoozeUntil: null }, 30, '2026-10-05').due, true);
  assert.equal(backupStatus({ lastBackup: last, snoozeUntil: null }, 11, '2026-10-31').due, true);
  assert.equal(backupStatus({ lastBackup: last, snoozeUntil: null }, 11, '2026-10-30').due, false);
});

test('rien n\'a changé depuis la sauvegarde : jamais de rappel, même après des mois', () => {
  assert.equal(backupStatus({ lastBackup: { day: '2026-01-01', seenCount: 10 }, snoozeUntil: null }, 10, '2026-10-27').due, false);
});

test('reporter le rappel le masque jusqu\'à la date, puis il revient', () => {
  const snoozed = { lastBackup: null, snoozeUntil: '2026-11-10' };
  assert.equal(backupStatus(snoozed, 50, '2026-10-27').due, false);
  assert.equal(backupStatus(snoozed, 50, '2026-11-10').due, true);
});

test('daysBetween et addDays', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(addDays('2026-10-27', 14), '2026-11-10');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
});

test('daysAgoLabel', () => {
  assert.equal(daysAgoLabel(0), "aujourd'hui");
  assert.equal(daysAgoLabel(1), 'hier');
  assert.equal(daysAgoLabel(12), 'il y a 12 jours');
});

test('rappel réglable : délai choisi, 0 = jamais', () => {
  const last = { lastBackup: { day: '2026-10-01', seenCount: 10 }, snoozeUntil: null };
  assert.equal(backupStatus(last, 11, '2026-10-08', 7).due, true);
  assert.equal(backupStatus(last, 11, '2026-10-07', 7).due, false);
  assert.equal(backupStatus(last, 11, '2026-10-29', 30).due, false);
  assert.equal(backupStatus(last, 11, '2026-10-31', 30).due, true);
  assert.equal(backupStatus(last, 500, '2027-01-01', 0).due, false, 'désactivé même après beaucoup de coches');
  assert.equal(backupStatus({ lastBackup: null, snoozeUntil: null }, 50, '2026-10-27', 0).due, false);
});
