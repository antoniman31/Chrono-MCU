// Contrôles de bout en bout : accessibilité (axe-core), taille des cibles tactiles et parcours clavier,
// dans les variantes de thème (clair, sombre, noir OLED, Auto + OLED) et 3 largeurs d'écran (compact, medium, expanded). Lancer avec `npm run e2e`.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root)) throw new Error('hors racine');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end('introuvable');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
const started = Date.now();
const failures = [];
let checks = 0;
const fail = (where, what) => failures.push(`${where}: ${what}`);

async function audit(page, where) {
  checks += 1;
  // On attend la fin des animations d'entrée (feuille, snackbar) pour mesurer les couleurs finales
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ content: axeSource }).catch(() => {});
  // La règle `target-size` d'axe compare chaque paire de cibles (quadratique) : ~18 s sur la liste, contre 0,3 s pour tout le reste.
  // Elle est remplacée par le contrôle maison plus bas, plus strict (44 px au lieu des 24 px de WCAG 2.2).
  const violations = await page.evaluate(async () => {
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { 'target-size': { enabled: false } },
    });
    return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`);
  });
  violations.forEach((v) => fail(where, `axe ${v}`));
  const small = await page.evaluate(() => {
    const out = [];
    const selector = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab]';
    document.querySelectorAll(selector).forEach((el) => {
      if (el.closest('[hidden]') || el.closest('dialog:not([open])')) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  small.slice(0, 5).forEach((s) => fail(where, `cible tactile < 44 px : ${s}`));
}

const viewports = [['compact', 360, 740], ['medium', 768, 900], ['expanded', 1280, 900]];
const variants = {
  light: [{ theme: 'light' }, 'light'],
  dark: [{ theme: 'dark' }, 'dark'],
  oled: [{ theme: 'dark', oled: true }, 'dark'],
  'auto-oled': [{ theme: 'auto', oled: true }, 'dark'],
};
// Les images TMDB sont décoratives (alt vide, aucun texte posé dessus) : on les bloque pour des tests rapides et indépendants du réseau
const blockImages = (context) => context.route(/image\.tmdb\.org/, (route) => route.abort());

async function runCombo(theme, [prefs, scheme], [vname, width, height]) {
  const where = `${theme}/${vname}`;
  const t0 = Date.now();
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
  await blockImages(context);
  await context.addInitScript(([v]) => { try { localStorage.setItem('chrono-mcu:view', JSON.stringify(v)); } catch { /* ignore */ } }, [prefs]);
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(where, `erreur JS : ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });

  await audit(page, `${where} À voir`);

  await page.click('#open-filters');
  await audit(page, `${where} feuille Filtres`);
  await page.keyboard.press('Escape');

  await page.click('[data-fk="menu:iron-man"]');
  await audit(page, `${where} feuille Menu`);
  await page.keyboard.press('Escape');

  await page.click('[data-fk="open:wandavision"]');
  await audit(page, `${where} fiche série`);
  if (vname !== 'expanded') await page.keyboard.press('Escape');

  await page.click('[data-fk="cb:iron-man"]');
  await audit(page, `${where} snackbar`);

  await page.click('.nav-item[data-route="progression"]');
  await page.waitForSelector('#screen-progression:not([hidden])');
  await audit(page, `${where} Progression`);

  await page.click('.nav-item[data-route="reglages"]');
  await page.waitForSelector('#screen-reglages:not([hidden])');
  await audit(page, `${where} Réglages`);

  await page.click('[data-fk="s-backup"]');
  await audit(page, `${where} feuille Sauvegarde`);
  await context.close();
  if (process.env.E2E_VERBOSE) console.log(`${where}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// Les combinaisons thème × largeur sont indépendantes : on les exécute par lots de 4
const combos = Object.entries(variants).flatMap(([theme, variant]) => viewports.map((vp) => [theme, variant, vp]));
const queue = [...combos];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) await runCombo(...queue.shift());
}));

// Parcours clavier : l'écran principal doit être entièrement atteignable sans souris
{
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('body[data-ready]');
  const wanted = ['search', 'tab-all', 'open-filters'];
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    if (wanted.includes(id)) seen.add(id);
  }
  wanted.filter((w) => !seen.has(w)).forEach((w) => fail('clavier', `#${w} inatteignable à la touche Tab`));
  await page.click('.nav-item[data-route="reglages"]');
  await page.waitForSelector('#screen-reglages:not([hidden])');
  await page.click('[data-fk="s-backup"]');
  const importReachable = await page.evaluate(() => [...document.querySelectorAll('#sheet button')].some((b) => /Importer/.test(b.textContent)));
  if (!importReachable) fail('clavier', 'le bouton Importer est introuvable (ou inaccessible)');
  await context.close();
}

// Swipe tactile : droite = vu, gauche = ignorer, geste court = rien ; un swipe n'ouvre pas la fiche (événements tactiles réels via CDP)
{
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, reducedMotion: 'reduce' });
  await blockImages(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => fail('swipe', `erreur JS : ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const drag = async (row, from, to) => {
    // Au milieu de l'écran : ni le snackbar (en bas) ni la barre d'application (en haut) ne doivent recouvrir la ligne testée
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(50);
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    await touch('touchStart', box.x + from, y);
    for (let i = 1; i <= 8; i += 1) await touch('touchMove', box.x + from + ((to - from) * i) / 8, y);
    await touch('touchEnd');
    await page.waitForTimeout(150);
  };
  const row = (id) => page.locator(`li.item:has([data-fk="cb:${id}"])`);

  await drag(row('iron-man'), 60, 120);
  if (await page.locator('[data-fk="cb:iron-man"]').isChecked()) fail('swipe', 'un geste court ne doit rien cocher');
  await drag(row('iron-man'), 60, 300);
  if (!(await page.locator('[data-fk="cb:iron-man"]').isChecked())) fail('swipe', 'un swipe à droite doit marquer le titre comme vu');
  if (await page.locator('#sheet[open]').count()) fail('swipe', 'un swipe ne doit pas ouvrir la fiche');
  await drag(row('iron-man'), 60, 300);
  if (await page.locator('[data-fk="cb:iron-man"]').isChecked()) fail('swipe', 'un second swipe à droite doit repasser le titre en non vu');
  await drag(row('iron-man'), 300, 60);
  if (!(await row('iron-man').locator('.badge', { hasText: 'ignoré' }).count())) fail('swipe', 'un swipe à gauche doit ignorer le titre');
  if (!(await page.locator('[data-fk="cb:iron-man"]').isDisabled())) fail('swipe', 'un titre ignoré ne doit plus être cochable');
  await drag(row('iron-man'), 300, 60);
  if (await row('iron-man').locator('.badge', { hasText: 'ignoré' }).count()) fail('swipe', 'un swipe sur un titre ignoré doit le réactiver');
  // Épisodes dans la fiche : swipe à droite = vu, pas d'action à gauche
  await page.click('[data-fk="open:wandavision"]');
  const ep = page.locator('li.item:has([data-fk="ep:wandavision/1"])');
  await page.waitForTimeout(400);
  const epBox = await ep.boundingBox();
  const epY = epBox.y + epBox.height / 2;
  const epDrag = async (from, to) => {
    await touch('touchStart', epBox.x + from, epY);
    for (let i = 1; i <= 8; i += 1) await touch('touchMove', epBox.x + from + ((to - from) * i) / 8, epY);
    await touch('touchEnd');
    await page.waitForTimeout(150);
  };
  await epDrag(300, 60);
  if (await page.locator('[data-fk="ep:wandavision/1"]').isChecked()) fail('swipe', 'un swipe à gauche sur un épisode ne doit rien faire');
  await epDrag(60, 300);
  if (!(await page.locator('[data-fk="ep:wandavision/1"]').isChecked())) fail('swipe', 'un swipe à droite sur un épisode doit le marquer comme vu');
  await context.close();
}

await browser.close();
server.close();
console.log(`${checks} contrôles d'accessibilité exécutés (4 variantes de thème × 3 largeurs × 8 états) en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
if (failures.length) {
  console.log(`${failures.length} problème(s) :`);
  [...new Set(failures)].forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Aucun problème détecté.');
