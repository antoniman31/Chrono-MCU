import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const sw = read('sw.js');
const list = (name) => new Function(`return ${sw.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`))[1]}`)();
const jsFiles = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const rel = `${dir}/${f}`;
  return statSync(join(root, rel)).isDirectory() ? jsFiles(rel) : rel.endsWith('.js') ? [rel] : [];
});

test('sw.js : marqueur de build, cache nommé par build, aucun marqueur oublié ailleurs', () => {
  assert.match(sw, /const BUILD = '__BUILD__';/);
  assert.match(sw, /const CACHE = `chrono-mcu-\$\{BUILD\}`;/);
});

test('sw.js précharge tout js/, la feuille de style et le catalogue (sinon l\'app casse hors ligne)', () => {
  const versioned = list('VERSIONED');
  for (const file of [...jsFiles('js'), 'css/style.css', 'data/mcu.json', 'data/sagas.json']) assert.ok(versioned.includes(file), `${file} manque dans VERSIONED`);
  for (const file of versioned) assert.ok(existsSync(join(root, file)), `${file} n'existe pas`);
  assert.equal(new Set(versioned).size, versioned.length, 'doublon dans VERSIONED');
});

test('sw.js : fichiers statiques présents, dont ceux déclarés par le manifeste et la police', () => {
  const statics = list('STATIC');
  assert.ok(statics.includes('./'));
  for (const file of statics.filter((f) => f !== './')) assert.ok(existsSync(join(root, file)), `${file} n'existe pas`);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.ok(statics.includes(icon.src), `${icon.src} manque dans STATIC`);
  assert.ok(statics.includes('manifest.webmanifest'));
  assert.ok(statics.includes('fonts/bebas-neue-subset.woff2'));
});

test('sw.js : enregistré seulement sur un build déployé, copié au déploiement, scripts autorisés par la CSP', () => {
  assert.match(read('js/app.js'), /!BUILD\.startsWith\('__'\)\) \{[\s\S]*?navigator\.serviceWorker\.register\('sw\.js'\)/);
  assert.match(read('.github/workflows/pages.yml'), /cp -r [^\n]*\bsw\.js\b[^\n]* _site\//);
  assert.match(read('index.html'), /script-src 'self'/);
});
