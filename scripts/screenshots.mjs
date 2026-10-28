// Génère les captures d'écran du README dans docs/screenshots (rendu par Chromium : `npm run screenshots`).
// Données de démonstration : une progression fictive (les 40 premiers titres sortis, cochés sur le dernier mois), sans affiches
// (elles appartiennent à leurs ayants droit et viennent d'un service externe).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../e2e/server.mjs';
import { toUnits } from '../js/logic.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const catalog = JSON.parse(readFileSync(new URL('../data/mcu.json', import.meta.url), 'utf8'));
const titles = (catalog.titles ?? catalog).filter((t) => !t.upcoming).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
const units = toUnits(titles).slice(0, 40);

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toLocaleDateString('en-CA');
const seen = {};
units.forEach((u, i) => { seen[u.key] = day(Math.floor(((units.length - 1 - i) * 27) / units.length) + (i % 3 === 0 ? 0 : 1)); });
const state = { version: 2, order: 'release', seen, ignored: {}, catchUp: {}, skip: [], included: {}, versions: {}, lastSeenKey: units.at(-1).key };

const server = await startServer();
const browser = await chromium.launch();
async function shoot(theme, name, steps) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: 'fr-FR' });
  await context.addInitScript(([s, t, b]) => {
    localStorage.setItem('chrono-mcu:v1', JSON.stringify(s));
    localStorage.setItem('chrono-mcu:view', JSON.stringify({ welcomed: true, theme: t, showPosters: false, feedback: false, lastBackup: b, goalDate: '2027-12-31' }));
  }, [state, theme, { day: day(0), seenCount: units.length }]);
  const page = await context.newPage();
  await page.goto(server.base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  await steps(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('achv-toast').style.display = 'none'; }); // bandeau de succès éventuel
  await page.screenshot({ path: `${out}${name}.png` });
  console.log(`${name}.png`);
  await context.close();
}

const voir = async (page) => { await page.evaluate(() => window.scrollTo(0, 0)); };
await shoot('dark', 'a-voir-sombre', voir);
await shoot('light', 'a-voir-clair', voir);
await shoot('dark', 'fiche', async (page) => { await page.click('[data-fk="open:iron-man"]'); });
await shoot('dark', 'progression', async (page) => { await page.click('.nav-item[data-route="progression"]'); await page.waitForSelector('#screen-progression:not([hidden])'); });
await shoot('dark', 'succes', async (page) => {
  await page.click('.nav-item[data-route="progression"]');
  await page.waitForSelector('#screen-progression:not([hidden])');
  await page.click('#stab-succes');
});
await browser.close();
server.close();
