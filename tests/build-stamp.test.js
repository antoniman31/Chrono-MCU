import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const jsFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
});

// Le workflow remplace __BUILD__ par l'identifiant du commit. Chaque import relatif doit porter ce marqueur,
// sinon le navigateur charge deux copies du même module (ou une version périmée en cache).
test('chaque import relatif de js/ porte le marqueur ?v=__BUILD__', () => {
  const bad = [];
  for (const file of jsFiles(join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!m[1].endsWith('?v=__BUILD__')) bad.push(`${file.replace(root, '')} -> ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('index.html versionne la feuille de style et le script', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /css\/style\.css\?v=__BUILD__/);
  assert.match(html, /js\/app\.js\?v=__BUILD__/);
});
