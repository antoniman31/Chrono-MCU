import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] ?? '';
const directives = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values];
}));

test('la CSP existe et précède tout script', () => {
  assert.ok(csp, 'meta Content-Security-Policy absente');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'la CSP doit être avant le premier script');
  assert.deepEqual(directives['default-src'], ["'none'"]);
});

test('scripts : site seul + hash du script de thème, jamais unsafe-inline ni unsafe-eval', () => {
  const script = directives['script-src'];
  assert.ok(script.includes("'self'"));
  assert.ok(!script.some((v) => v.includes('unsafe')), 'script-src ne doit contenir aucun unsafe-*');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, 'un seul script inline attendu (le script de thème)');
  const hash = `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`;
  assert.ok(script.includes(hash), `le hash du script de thème a changé : mets ${hash} dans la CSP`);
});

test('images : site, TMDB et data: seulement ; connexions : site et API GitHub ; manifeste : site seul ; pas de base ni de formulaire', () => {
  assert.deepEqual([...directives['img-src']].sort(), ["'self'", 'data:', 'https://image.tmdb.org']);
  // api.github.com : lancement de la synchronisation du catalogue depuis Réglages (jeton personnel facultatif)
  assert.deepEqual([...directives['connect-src']].sort(), ["'self'", 'https://api.github.com']);
  assert.deepEqual(directives['font-src'], ["'self'"]);
  assert.deepEqual(directives['manifest-src'], ["'self'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.deepEqual(directives['form-action'], ["'none'"]);
  assert.deepEqual(directives['style-src'], ["'self'"]);
  assert.deepEqual(directives['style-src-attr'], ["'unsafe-inline'"]);
});

test('aucun gestionnaire d\'événement inline ni feuille de style inline dans index.html', () => {
  assert.doesNotMatch(html, /\son[a-z]+="/i);
  assert.doesNotMatch(html, /<style[\s>]/i);
});
