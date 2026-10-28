import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS_URL, TOKEN_KEY, dispatchSync, isDone, latestRun, loadToken, runLabel, saveToken, validToken } from '../js/github.js';

const TOKEN = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;
const memory = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; }, data };
};
const reply = (status, body = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('lien et jeton : format accepté, stockage dans une clé séparée, retrait', () => {
  assert.equal(ACTIONS_URL, 'https://github.com/antoniman31/Chrono-MCU/actions/workflows/catalog-sync.yml');
  assert.ok(validToken(TOKEN) && validToken(`ghp_${'x'.repeat(36)}`));
  for (const bad of ['', 'abc', 'github_pat_court', `Bearer ${TOKEN}`, null, undefined, 42]) assert.equal(validToken(bad), false, String(bad));
  const storage = memory();
  assert.equal(loadToken(storage), null);
  assert.ok(saveToken(storage, `  ${TOKEN} `));
  assert.equal(storage.data[TOKEN_KEY], TOKEN);
  assert.equal(loadToken(storage), TOKEN);
  assert.ok(saveToken(storage, null));
  assert.equal(loadToken(storage), null);
  storage.setItem(TOKEN_KEY, 'corrompu');
  assert.equal(loadToken(storage), null);
  assert.equal(loadToken(null), null);
  assert.equal(saveToken({ setItem() { throw new Error('plein'); } }, TOKEN), false);
});

test('lancement : requête POST sur main avec le jeton, erreurs expliquées', async () => {
  let seen;
  const ok = await dispatchSync(TOKEN, async (url, init) => { seen = { url, init }; return { status: 204, ok: true }; });
  assert.deepEqual(ok, { ok: true });
  assert.match(seen.url, /api\.github\.com\/repos\/antoniman31\/Chrono-MCU\/actions\/workflows\/catalog-sync\.yml\/dispatches$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(seen.init.body), { ref: 'main' });
  for (const [status, part] of [[401, 'refusé'], [403, 'Droit manquant'], [404, 'introuvable'], [422, 'refuse'], [500, '500']]) {
    const r = await dispatchSync(TOKEN, reply(status));
    assert.equal(r.ok, false);
    assert.ok(r.message.includes(part), `${status} : ${r.message}`);
  }
  const offline = await dispatchSync(TOKEN, async () => { throw new TypeError('Failed to fetch'); });
  assert.deepEqual(offline, { ok: false, message: 'GitHub est injoignable (réseau coupé ?).' });
});

test('suivi : le lancement manuel démarré après la demande, état lisible', async () => {
  const since = Date.parse('2026-10-28T12:00:00Z');
  const runs = { workflow_runs: [
    { created_at: '2026-10-28T11:00:00Z', status: 'completed', conclusion: 'success', html_url: 'ancien' },
    { created_at: '2026-10-28T12:00:03Z', status: 'in_progress', conclusion: null, html_url: 'nouveau' },
  ] };
  let url;
  const run = await latestRun(TOKEN, since, async (u) => { url = u; return { ok: true, json: async () => runs }; });
  assert.deepEqual(run, { status: 'in_progress', conclusion: null, url: 'nouveau' });
  assert.match(url, /event=workflow_dispatch&branch=main/);
  assert.equal(await latestRun(TOKEN, since + 3_600_000, async () => ({ ok: true, json: async () => runs })), null);
  assert.equal(await latestRun(TOKEN, since, reply(500)), null);
  assert.equal(await latestRun(TOKEN, since, async () => { throw new Error('réseau'); }), null);
  assert.match(runLabel(null), /attente de GitHub/);
  assert.match(runLabel({ status: 'queued' }), /file d'attente/);
  assert.match(runLabel(run), /en cours/);
  assert.match(runLabel({ status: 'completed', conclusion: 'success' }), /pull request/);
  assert.match(runLabel({ status: 'completed', conclusion: 'failure' }), /sans succès \(failure\)/);
  assert.equal(isDone({ status: 'completed' }), true);
  assert.equal(isDone(run), false);
  assert.equal(isDone(null), false);
});
