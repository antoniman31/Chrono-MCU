import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_KEY, THEMES, exportPrefs, importedPrefs, loadView, normalizeView, saveView } from '../js/prefs.js';
import { defaultState, exportState, importState } from '../js/store.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

test('valeurs par défaut: groupé, affiches, aucune phase repliée, thème auto', () => {
  assert.deepEqual(normalizeView(null), { groupByPhase: true, showPosters: true, collapsedPhases: [], theme: 'auto', oled: false, lastBackup: null, nudgeUntil: null, nudgeDays: 30, spoilerFree: false, hideSecrets: true, feedback: true, welcomed: false, goalDate: '2026-12-18' });
});

test('normalizeView: ignore les valeurs invalides', () => {
  const v = normalizeView({ groupByPhase: false, showPosters: false, collapsedPhases: [2, 'x', 3.5, 4], theme: 'rose' });
  assert.deepEqual(v, { groupByPhase: false, showPosters: false, collapsedPhases: [2, 4], theme: 'auto', oled: false, lastBackup: null, nudgeUntil: null, nudgeDays: 30, spoilerFree: false, hideSecrets: true, feedback: true, welcomed: false, goalDate: '2026-12-18' });
  for (const theme of THEMES) assert.equal(normalizeView({ theme }).theme, theme);
});

test('loadView / saveView: aller-retour, storage absent, cassé ou corrompu', () => {
  const storage = memory();
  saveView(storage, { groupByPhase: false, showPosters: true, collapsedPhases: [1], theme: 'dark', oled: true });
  assert.deepEqual(loadView(storage), { groupByPhase: false, showPosters: true, collapsedPhases: [1], theme: 'dark', oled: true, lastBackup: null, nudgeUntil: null, nudgeDays: 30, spoilerFree: false, hideSecrets: true, feedback: true, welcomed: false, goalDate: '2026-12-18' });
  assert.equal(loadView(null).theme, 'auto');
  assert.equal(loadView(memory({ [VIEW_KEY]: '{pas du json' })).theme, 'auto');
  assert.doesNotThrow(() => saveView({ setItem() { throw new Error('QuotaExceeded'); } }, normalizeView(null)));
  assert.doesNotThrow(() => saveView(null, normalizeView(null)));
});

test('le noir OLED est indépendant du thème, y compris en Auto', () => {
  assert.deepEqual(pick(normalizeView({ theme: 'auto', oled: true })), { theme: 'auto', oled: true });
  assert.deepEqual(pick(normalizeView({ theme: 'light', oled: true })), { theme: 'light', oled: true });
  assert.equal(normalizeView({ theme: 'dark', oled: 'oui' }).oled, false);
});

test('migration : l\'ancien thème « oled » devient sombre + noir OLED', () => {
  assert.deepEqual(pick(normalizeView({ theme: 'oled' })), { theme: 'dark', oled: true });
});

function pick(v) { return { theme: v.theme, oled: v.oled }; }

test('lastBackup et nudgeUntil: valeurs valides gardées, invalides écartées', () => {
  const ok = normalizeView({ lastBackup: { day: '2026-10-01', seenCount: 12 }, nudgeUntil: '2026-11-01' });
  assert.deepEqual(ok.lastBackup, { day: '2026-10-01', seenCount: 12 });
  assert.equal(ok.nudgeUntil, '2026-11-01');
  const bad = normalizeView({ lastBackup: { day: 'hier', seenCount: 12 }, nudgeUntil: 5 });
  assert.equal(bad.lastBackup, null);
  assert.equal(bad.nudgeUntil, null);
  assert.equal(normalizeView({ lastBackup: { day: '2026-10-01', seenCount: -1 } }).lastBackup, null);
});

test('rappel de sauvegarde, sans spoiler et objectif : valeurs par défaut et validation', () => {
  assert.equal(normalizeView(null).nudgeDays, 30);
  for (const n of [7, 14, 30, 0]) assert.equal(normalizeView({ nudgeDays: n }).nudgeDays, n);
  assert.equal(normalizeView({ nudgeDays: 5 }).nudgeDays, 30);
  assert.equal(normalizeView({ spoilerFree: true }).spoilerFree, true);
  assert.equal(normalizeView({ spoilerFree: 'oui' }).spoilerFree, false);
  assert.equal(normalizeView({}).hideSecrets, true);
  assert.equal(normalizeView({ hideSecrets: false }).hideSecrets, false);
  assert.equal(normalizeView({ hideSecrets: 'non' }).hideSecrets, true);
  assert.equal(normalizeView(null).goalDate, '2026-12-18', 'Doomsday par défaut');
  assert.equal(normalizeView({ goalDate: '2027-03-01' }).goalDate, '2027-03-01');
  assert.equal(normalizeView({ goalDate: null }).goalDate, null, 'objectif retiré : pas de retour automatique à Doomsday');
  assert.equal(normalizeView({ goalDate: 'bientôt' }).goalDate, null);
  assert.equal(normalizeView({ theme: 'dark' }).goalDate, '2026-12-18', 'ancienne préférence sans objectif : Doomsday');
});

test('retour tactile actif par défaut, accueil jamais vu par défaut', () => {
  assert.equal(normalizeView(null).feedback, true);
  assert.equal(normalizeView({ feedback: false }).feedback, false);
  assert.equal(normalizeView({ feedback: 'non' }).feedback, true);
  assert.equal(normalizeView(null).welcomed, false);
  assert.equal(normalizeView({ welcomed: true }).welcomed, true);
  assert.equal(normalizeView({ welcomed: 'oui' }).welcomed, false);
});

test('sauvegarde : thème, objectif et succès voyagent, les réglages propres à l\'appareil restent', () => {
  const view = normalizeView({ theme: 'dark', oled: true, goalDate: '2027-01-01', spoilerFree: true, nudgeDays: 14, lastBackup: { day: '2026-10-01', seenCount: 3 }, welcomed: true, achv: { first: { level: 1, date: '2026-10-02' } } });
  const file = exportState(defaultState(), exportPrefs(view));
  const parsed = JSON.parse(file);
  assert.deepEqual(Object.keys(parsed.prefs).sort(), ['achv', 'feedback', 'goalDate', 'groupByPhase', 'hideSecrets', 'nudgeDays', 'oled', 'showPosters', 'spoilerFree', 'theme']);
  assert.equal('lastBackup' in parsed.prefs || 'welcomed' in parsed.prefs, false);
  const back = importState(file);
  assert.equal(back.ok, true);
  assert.deepEqual(back.state, defaultState());
  const patch = importedPrefs(normalizeView({ achv: { first: { level: 2, date: '2026-09-01' }, hours: { level: 1, date: null } } }), back.prefs);
  assert.equal(patch.theme, 'dark');
  assert.equal(patch.goalDate, '2027-01-01');
  assert.equal(patch.achv.first.level, 2, 'un palier déjà obtenu ici n\'est pas rétrogradé');
  assert.equal(patch.achv.hours.level, 1);
});

test('sauvegarde sans réglages (ancien export) ou avec des réglages invalides : rien n\'est cassé', () => {
  const old = importState(exportState(defaultState()));
  assert.equal(old.prefs, null);
  assert.deepEqual(importedPrefs(normalizeView(null), old.prefs), {});
  const bad = importedPrefs(normalizeView(null), { theme: 'rose', goalDate: 'demain', achv: 'x' });
  assert.equal(bad.theme, 'auto');
  assert.equal(bad.goalDate, null);
  assert.equal('achv' in bad, false);
  assert.deepEqual(importedPrefs(normalizeView(null), [1]), {});
});
