import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, defaultState, validateState, loadState, saveState, setOrder,
  toggleUnit, setTitleSeen, isTitleSeen, exportState, importState, setIgnored, isIgnored, setPhaseSeen,
} from '../js/store.js';

const film = { id: 'f', type: 'film' };
const serie = { id: 's', type: 'serie', episodes: [{ n: 1 }, { n: 2 }, { n: 3 }] };
const D1 = '2026-10-27';
const D2 = '2026-10-28';

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    data,
  };
};
const brokenStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceeded'); },
};

test('état par défaut valide', () => {
  assert.deepEqual(validateState(defaultState()), []);
});

test('chargement: storage vide, absent, cassé ou JSON corrompu = état par défaut', () => {
  assert.deepEqual(loadState(memoryStorage()), defaultState());
  assert.deepEqual(loadState(null), defaultState());
  assert.deepEqual(loadState(undefined), defaultState());
  assert.deepEqual(loadState(brokenStorage), defaultState());
  assert.deepEqual(loadState(memoryStorage({ [STORAGE_KEY]: '{pas du json' })), defaultState());
  assert.deepEqual(loadState(memoryStorage({ [STORAGE_KEY]: '{"version":1,"order":"nope"}' })), defaultState());
});

test('sauvegarde puis chargement restitue l\'état', () => {
  const storage = memoryStorage();
  const state = toggleUnit(defaultState(), 'f', D1);
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(loadState(storage), state);
});

test('sauvegarde: échec de storage = false, sans exception', () => {
  assert.equal(saveState(brokenStorage, defaultState()), false);
});

test('setOrder change l\'ordre sans toucher à la progression', () => {
  const s = toggleUnit(defaultState(), 'f', D1);
  const r = setOrder(s, 'release');
  assert.equal(r.order, 'release');
  assert.deepEqual(r.seen, s.seen);
  assert.throws(() => setOrder(s, 'autre'));
});

test('toggleUnit: coche, décoche, lastSeenKey suit la dernière coche, immutabilité', () => {
  const s0 = defaultState();
  const s1 = toggleUnit(s0, 'f', D1);
  assert.deepEqual(s0.seen, {});
  assert.equal(s1.seen.f, D1);
  assert.equal(s1.lastSeenKey, 'f');
  const s2 = toggleUnit(s1, 's/1', D2);
  assert.equal(s2.lastSeenKey, 's/1');
  const s3 = toggleUnit(s2, 's/1', D2);
  assert.equal(s3.seen['s/1'], undefined);
  assert.equal(s3.lastSeenKey, 's/1');
});

test('série entière: cocher coche tous les épisodes, décocher les décoche', () => {
  const s1 = setTitleSeen(defaultState(), serie, true, D1);
  assert.deepEqual(Object.keys(s1.seen).sort(), ['s/1', 's/2', 's/3']);
  assert.equal(s1.lastSeenKey, 's/3');
  assert.equal(isTitleSeen(s1, serie), true);
  const s2 = setTitleSeen(s1, serie, false, D2);
  assert.deepEqual(s2.seen, {});
  assert.equal(isTitleSeen(s2, serie), false);
});

test('série entière: cocher conserve la date des épisodes déjà vus', () => {
  const partial = toggleUnit(defaultState(), 's/1', D1);
  assert.equal(isTitleSeen(partial, serie), false);
  const full = setTitleSeen(partial, serie, true, D2);
  assert.equal(full.seen['s/1'], D1);
  assert.equal(full.seen['s/2'], D2);
});

test('film via setTitleSeen: idempotent', () => {
  const s1 = setTitleSeen(defaultState(), film, true, D1);
  assert.equal(isTitleSeen(s1, film), true);
  assert.equal(setTitleSeen(s1, film, true, D2), s1);
  assert.equal(isTitleSeen(setTitleSeen(s1, film, false, D2), film), false);
});

test('export puis import: aller-retour à l\'identique', () => {
  let s = toggleUnit(defaultState(), 'f', D1);
  s = setIgnored({ ...s, order: 'release' }, 'g', true);
  const r = importState(exportState(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
});

test('import invalide: rejeté avec message, jamais d\'état retourné', () => {
  const cases = [
    'pas du json',
    '[]',
    '{"version":2,"order":"chrono","seen":{},"lastSeenKey":null}',
    '{"version":1,"order":"nope","seen":{},"lastSeenKey":null}',
    '{"version":1,"order":"chrono","seen":{"f":"hier"},"lastSeenKey":null}',
    '{"version":1,"order":"chrono","seen":{},"ignored":{"f":false},"lastSeenKey":null}',
    '{"version":1,"order":"chrono","seen":{},"lastSeenKey":5}',
  ];
  for (const text of cases) {
    const r = importState(text);
    assert.equal(r.ok, false, text);
    assert.ok(r.error.length > 0);
    assert.equal('state' in r, false);
  }
});

const p1a = { id: 'p1a', type: 'film', phase: 1 };
const p1s = { id: 'p1s', type: 'serie', phase: 1, episodes: [{ n: 1 }, { n: 2 }] };
const p2 = { id: 'p2', type: 'film', phase: 2 };
const soon = { id: 'soon', type: 'film', phase: 1, upcoming: true };

test('setPhaseSeen: coche et décoche tous les titres de la phase, pas les autres', () => {
  const all = [p1a, p1s, p2, soon];
  const s1 = setPhaseSeen(defaultState(), all, 1, true, D1);
  assert.deepEqual(Object.keys(s1.seen).sort(), ['p1a', 'p1s/1', 'p1s/2']);
  assert.equal(isTitleSeen(s1, p2), false);
  const s2 = setPhaseSeen(s1, all, 1, false, D2);
  assert.deepEqual(s2.seen, {});
});

test('setPhaseSeen: conserve les dates existantes et ignore les titres à venir', () => {
  const start = toggleUnit(defaultState(), 'p1a', D1);
  const s = setPhaseSeen(start, [p1a, soon], 1, true, D2);
  assert.equal(s.seen.p1a, D1);
  assert.equal('soon' in s.seen, false);
  assert.equal(isTitleSeen(s, soon), false);
  assert.equal(setTitleSeen(defaultState(), soon, true, D1).seen.soon, undefined);
});

test('ignorer: bascule, garde de setTitleSeen, état déjà ignoré inchangé', () => {
  const film = { id: 'f', title: 'F', type: 'film', phase: 1 };
  let s = setIgnored(defaultState(), 'f', true);
  assert.equal(isIgnored(s, 'f'), true);
  assert.equal(setIgnored(s, 'f', true), s);
  assert.equal(setTitleSeen(s, film, true, D1), s);
  s = setIgnored(s, 'f', false);
  assert.equal(isIgnored(s, 'f'), false);
  assert.equal(isTitleSeen(setTitleSeen(s, film, true, D1), film), true);
});

test('anciens états: notes abandonnées au chargement et à l\'import, ignored absent = vide', () => {
  const old = JSON.stringify({ version: 1, order: 'chrono', seen: { f: D1 }, notes: { f: { rating: 4, text: 'top' } }, lastSeenKey: 'f' });
  const store = { getItem: () => old };
  const loaded = loadState(store);
  assert.equal('notes' in loaded, false);
  assert.deepEqual(loaded.ignored, {});
  assert.deepEqual(loaded.seen, { f: D1 });
  const imported = importState(old);
  assert.equal(imported.ok, true);
  assert.equal('notes' in imported.state, false);
  assert.equal('notes' in JSON.parse(exportState(imported.state)), false);
});
