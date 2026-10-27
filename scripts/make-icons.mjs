// Génère les icônes PNG de l'application depuis icons/icon.svg (rendu par Chromium : `npm run icons`).
// Le dessin tient dans la zone sûre des icônes « maskable » (cercle de 40 % de la largeur) : la même image sert aux deux usages.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dir = fileURLToPath(new URL('../icons/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const targets = [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]];

const browser = await chromium.launch();
for (const [name, size] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  writeFileSync(`${dir}${name}`, await page.screenshot({ type: 'png' }));
  await page.close();
  console.log(`${name} (${size}x${size})`);
}
await browser.close();
