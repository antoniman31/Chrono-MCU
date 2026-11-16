import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

// Les modules atteints depuis js/app.js, en suivant les imports statiques.
function dependances(entree) {
  const vus = new Set();
  const parcourir = (fichier) => {
    for (const m of read(fichier).matchAll(/(?:from|import)\s*'(\.[^'?]+)(?:\?v=__BUILD__)?'/g)) {
      const cible = normalize(join(dirname(fichier), m[1])).replaceAll('\\', '/');
      if (!vus.has(cible)) { vus.add(cible); parcourir(cible); }
    }
  };
  parcourir(entree);
  return vus;
}

test('index.html précharge chaque module de app.js, avec le marqueur de build, et rien d\'autre', () => {
  const html = read('index.html');
  const precharges = [...html.matchAll(/<link rel="modulepreload" href="([^"?]+)\?v=__BUILD__">/g)].map((m) => m[1]);
  const attendus = dependances('js/app.js');
  for (const f of attendus) assert.ok(precharges.includes(f), `${f} manque dans les modulepreload`);
  for (const f of precharges) assert.ok(attendus.has(f), `${f} préchargé sans être importé`);
  assert.equal(new Set(precharges).size, precharges.length, 'doublon');
  assert.equal([...html.matchAll(/rel="modulepreload"/g)].length, precharges.length, 'un modulepreload sans ?v=__BUILD__ contournerait le cache versionné');
});

test('manifeste : identité explicite, sinon un changement de start_url orpheline l\'app installée', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.id, './');
});
