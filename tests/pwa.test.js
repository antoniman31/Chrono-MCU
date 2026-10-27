import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

test('le manifeste est installable : nom, démarrage, affichage autonome, icônes 192 et 512 existantes', () => {
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url && manifest.scope);
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok(existsSync(`${root}${icon.src}`), `${icon.src} introuvable`);
});

test('index.html déclare le manifeste et l\'icône iOS ; le déploiement copie manifeste et icônes', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.ok(existsSync(`${root}icons/apple-touch-icon.png`));
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /cp -r [^\n]*manifest\.webmanifest[^\n]*icons[^\n]* _site\//);
});

test('police du titre : fichier présent, licence jointe, déclarée dans la CSS et copiée au déploiement', () => {
  const css = read('css/style.css');
  const src = css.match(/@font-face\s*{[^}]*url\('\.\.\/(fonts\/[^']+)'\)/)?.[1];
  assert.ok(src, '@font-face introuvable dans style.css');
  assert.ok(existsSync(`${root}${src}`), `${src} introuvable`);
  assert.ok(existsSync(`${root}fonts/OFL.txt`), 'licence de la police manquante');
  assert.match(read('.github/workflows/pages.yml'), /cp -r [^\n]*\bfonts\b[^\n]* _site\//);
});
