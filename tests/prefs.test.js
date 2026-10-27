import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_KEY, THEMES, loadView, normalizeView, saveView } from '../js/prefs.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

test('valeurs par défaut: groupé, affiches, aucune phase repliée, thème auto', () => {
  assert.deepEqual(normalizeView(null), { groupByPhase: true, showPosters: true, collapsedPhases: [], theme: 'auto', oled: false });
});

test('normalizeView: ignore les valeurs invalides', () => {
  const v = normalizeView({ groupByPhase: false, showPosters: false, collapsedPhases: [2, 'x', 3.5, 4], theme: 'rose' });
  assert.deepEqual(v, { groupByPhase: false, showPosters: false, collapsedPhases: [2, 4], theme: 'auto', oled: false });
  for (const theme of THEMES) assert.equal(normalizeView({ theme }).theme, theme);
});

test('loadView / saveView: aller-retour, storage absent, cassé ou corrompu', () => {
  const storage = memory();
  saveView(storage, { groupByPhase: false, showPosters: true, collapsedPhases: [1], theme: 'dark', oled: true });
  assert.deepEqual(loadView(storage), { groupByPhase: false, showPosters: true, collapsedPhases: [1], theme: 'dark', oled: true });
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
