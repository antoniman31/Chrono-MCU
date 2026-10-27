import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_KEY, STATE_VERSION, migrate, STORAGE_KEY, defaultState, validateState, loadState, saveState, setOrder,
  toggleUnit, setTitleSeen, isTitleSeen, exportState, importState, setIgnored, isIgnored, setPhaseSeen, markUntil, pendingUntil, setTitleIgnored, setSkip,
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
    '{"version":3,"order":"chrono","seen":{},"lastSeenKey":null}',
    '{"version":0,"order":"chrono","seen":{},"lastSeenKey":null}',
    '{"order":"chrono","seen":{},"lastSeenKey":null}',
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
  assert.equal(isIgnored(s, film), true);
  assert.equal(setIgnored(s, 'f', true), s);
  assert.equal(setTitleSeen(s, film, true, D1), s);
  s = setIgnored(s, 'f', false);
  assert.equal(isIgnored(s, film), false);
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

test('migrate: v1 devient v2 (notes abandonnées, ignored ajouté), v2 inchangé, futur refusé', () => {
  assert.equal(STATE_VERSION, 2);
  const v1 = { version: 1, order: 'release', seen: { f: D1 }, notes: { f: { rating: 3 } }, lastSeenKey: 'f' };
  assert.deepEqual(migrate(v1), { ok: true, state: { version: 2, order: 'release', seen: { f: D1 }, ignored: {}, catchUp: {}, skip: [], included: {}, lastSeenKey: 'f' } });
  const v2 = { version: 2, order: 'chrono', seen: {}, ignored: { g: true }, catchUp: {}, skip: [], included: {}, lastSeenKey: null };
  assert.deepEqual(migrate(v2), { ok: true, state: v2 });
  const future = migrate({ version: 9, order: 'chrono', seen: {}, lastSeenKey: null });
  assert.equal(future.ok, false);
  assert.match(future.error, /plus récent/);
  assert.equal(migrate([]).ok, false);
  assert.equal(migrate({ version: 'x' }).ok, false);
});

test('loadState: un état v1 est migré, réécrit en v2 et l\'ancien contenu est gardé une seule fois', () => {
  const old = JSON.stringify({ version: 1, order: 'chrono', seen: { f: D1 }, notes: { f: { text: 'top' } }, lastSeenKey: 'f' });
  const storage = memoryStorage({ [STORAGE_KEY]: old });
  const loaded = loadState(storage);
  assert.equal(loaded.version, 2);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 2);
  assert.equal(storage.getItem(BACKUP_KEY), old);
  // Un second chargement ne réécrit pas la copie de secours
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, order: 'chrono', seen: {}, lastSeenKey: null }));
  loadState(storage);
  assert.equal(storage.getItem(BACKUP_KEY), old);
});

test('importState: un export v1 est accepté et migré, un export plus récent est refusé clairement', () => {
  const r = importState('{"version":1,"order":"chrono","seen":{},"notes":{},"lastSeenKey":null}');
  assert.equal(r.ok, true);
  assert.equal(r.state.version, 2);
  const future = importState('{"version":5,"order":"chrono","seen":{},"lastSeenKey":null}');
  assert.equal(future.ok, false);
  assert.match(future.error, /plus récent/);
});

const t1 = { id: 't1', type: 'film', phase: 1, chronoOrder: 1, releaseDate: '2008-01-01', runtimeMin: 100 };
const t2 = { id: 't2', type: 'serie', phase: 1, chronoOrder: 2, releaseDate: '2009-01-01', episodes: [{ n: 1, runtimeMin: 30 }, { n: 2, runtimeMin: 30 }] };
const t3 = { id: 't3', type: 'film', phase: 2, chronoOrder: 3, releaseDate: '2010-01-01', runtimeMin: 100 };
const t4 = { id: 't4', type: 'film', phase: 2, chronoOrder: 4, releaseDate: '2011-01-01', runtimeMin: 100 };
const catalogue = [t4, t2, t1, t3];

test('markUntil: marque tout jusqu\'au titre inclus, en rattrapage, sans toucher aux déjà vus ni à la suite', () => {
  let s = toggleUnit(defaultState(), 't1', D1);
  s = markUntil(s, catalogue, 't3', D2);
  assert.deepEqual(Object.keys(s.seen).sort(), ['t1', 't2/1', 't2/2', 't3']);
  assert.equal(s.seen.t1, D1);
  assert.equal(s.seen.t3, D2);
  assert.deepEqual(Object.keys(s.catchUp).sort(), ['t2/1', 't2/2', 't3']);
  assert.equal(s.lastSeenKey, 't3');
  assert.equal('t4' in s.seen, false);
});

test('markUntil / pendingUntil: ordre de sortie, titres ignorés exclus, rien à faire = état inchangé', () => {
  const release = { ...defaultState(), order: 'release' };
  assert.deepEqual(pendingUntil(release, catalogue, 't2').map((u) => u.key), ['t1', 't2/1', 't2/2']);
  const ignored = setIgnored(defaultState(), 't2', true);
  assert.deepEqual(pendingUntil(ignored, catalogue, 't3').map((u) => u.key), ['t1', 't3']);
  assert.deepEqual(pendingUntil(defaultState(), catalogue, 'inconnu'), []);
  const done = markUntil(defaultState(), catalogue, 't3', D1);
  assert.equal(markUntil(done, catalogue, 't3', D2), done);
});

test('décocher une unité de rattrapage la sort du rattrapage ; l\'état v2 avec catchUp survit à l\'export', () => {
  let s = markUntil(defaultState(), catalogue, 't3', D1);
  s = toggleUnit(s, 't1', D2);
  assert.equal('t1' in s.seen, false);
  assert.equal('t1' in s.catchUp, false);
  assert.equal('t3' in s.catchUp, true);
  assert.deepEqual(importState(exportState(s)).state, s);
  assert.ok(validateState({ ...s, catchUp: { x: false } }).length > 0);
});

const serie1 = { id: 's1', type: 'serie', saga: 'infinity', phase: 1, episodes: [{ n: 1, runtimeMin: 40 }] };
const short1 = { id: 'c1', type: 'film', saga: 'infinity', phase: 1, runtimeMin: 40 };
const multi1 = { id: 'm1', type: 'film', saga: 'multiverse', phase: 4, runtimeMin: 120 };
const all3 = [serie1, short1, multi1];

test('catégories coupées : les titres concernés sont ignorés, pas les autres', () => {
  const s = setSkip(defaultState(), 'series', true, all3);
  assert.equal(isIgnored(s, serie1), true);
  assert.equal(isIgnored(s, multi1), false);
  assert.equal(setTitleSeen(s, serie1, true, D1), s, 'un titre ignoré par catégorie ne se coche pas');
  assert.equal(setSkip(s, 'series', true, all3), s, 'couper une catégorie déjà coupée ne change rien');
  assert.throws(() => setSkip(s, 'nimporte', true, all3));
  const two = setSkip(s, 'shorts', true, all3);
  assert.equal(isIgnored(two, short1), true);
  assert.equal(isIgnored(setSkip(two, 'series', false, all3), serie1), false);
});

test('réintégrer un titre d\'une catégorie coupée, puis l\'ignorer à nouveau', () => {
  let s = setSkip(defaultState(), 'series', true, all3);
  s = setTitleIgnored(s, serie1, false);
  assert.equal(isIgnored(s, serie1), false);
  assert.deepEqual(s.included, { s1: true });
  assert.equal(setTitleIgnored(s, serie1, false), s);
  s = setTitleIgnored(s, serie1, true);
  assert.equal(isIgnored(s, serie1), true);
  assert.equal(s.ignored.s1, true);
  assert.deepEqual(s.included, {});
  // Ignorer explicitement un titre hors catégorie, puis le réactiver : aucune trace de « réintégration »
  let t = setTitleIgnored(defaultState(), multi1, true);
  t = setTitleIgnored(t, multi1, false);
  assert.deepEqual([t.ignored, t.included], [{}, {}]);
});

test('suivre à nouveau une catégorie efface les réintégrations, sauf celles encore utiles à une autre catégorie coupée', () => {
  let s = setSkip(setSkip(defaultState(), 'series', true, all3), 'shorts', true, all3);
  s = setTitleIgnored(s, serie1, false);
  s = setTitleIgnored(s, short1, false);
  assert.deepEqual(Object.keys(s.included).sort(), ['c1', 's1']);
  s = setSkip(s, 'series', false, all3);
  assert.deepEqual(Object.keys(s.included), ['c1']);
});

test('skip et included : validés, exportés, importés', () => {
  let s = setSkip(defaultState(), 'series', true, all3);
  s = setTitleIgnored(s, serie1, false);
  assert.deepEqual(validateState(s), []);
  assert.deepEqual(importState(exportState(s)).state, s);
  assert.ok(validateState({ ...s, skip: ['inconnue'] }).length > 0);
  assert.ok(validateState({ ...s, skip: 'series' }).length > 0);
  assert.ok(validateState({ ...s, included: { x: false } }).length > 0);
  assert.equal(migrate({ version: 2, order: 'chrono', seen: {}, lastSeenKey: null }).state.skip.length, 0);
});
