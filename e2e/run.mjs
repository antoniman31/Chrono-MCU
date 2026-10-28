// Contrôles de bout en bout : accessibilité (axe-core), taille des cibles tactiles et parcours clavier,
// dans les variantes de thème (clair, sombre, noir OLED, Auto + OLED) et 3 largeurs d'écran (compact, medium, expanded). Lancer avec `npm run e2e`.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const { base, close: closeServer } = await startServer();

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
const started = Date.now();
const failures = [];
let checks = 0;
const fail = (where, what) => failures.push(`${where}: ${what}`);

// Réglages : sections repliables ; ouvre la section demandée si elle ne l'est pas déjà
async function openSection(page, id) {
  if (!(await page.locator(`[data-sec="${id}"]`).evaluate((d) => d.open))) await page.click(`[data-sec="${id}"] summary`);
  await page.waitForFunction((sec) => document.querySelector(`[data-sec="${sec}"]`).open, id);
}

async function audit(page, where) {
  checks += 1;
  // On attend la fin des animations d'entrée (feuille, snackbar) pour mesurer les couleurs finales
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
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
// axe est injecté par le mécanisme d'initialisation de Playwright (hors CSP) : la CSP du site reste active pendant les audits
// Évite la feuille d'accueil du premier lancement dans les parcours qui ne la testent pas
const skipWelcome = (context) => context.addInitScript(() => {
  try { localStorage.setItem('chrono-mcu:view', JSON.stringify({ ...JSON.parse(localStorage.getItem('chrono-mcu:view') ?? 'null'), welcomed: true })); } catch { /* ignore */ }
});
const withAxe = (context) => context.addInitScript({ content: axeSource });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// Pas de réseau, mais une image de 1 pixel : les affiches existent, donc la mise en page avec affiche est celle qui est auditée
const blockImages = (context) => context.route(/image\.tmdb\.org/, (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));

async function runCombo(theme, [prefs, scheme], [vname, width, height]) {
  const where = `${theme}/${vname}`;
  const t0 = Date.now();
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
  await blockImages(context);
  await withAxe(context);
  await context.addInitScript(([v]) => { try { localStorage.setItem('chrono-mcu:view', JSON.stringify(v)); } catch { /* ignore */ } }, [prefs]);
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(where, `erreur JS : ${e.message}`));
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) fail(where, `violation CSP : ${m.text().slice(0, 140)}`); });
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });

  // Premier lancement : la feuille d'accueil s'ouvre d'elle-même ; on audite ses deux étapes puis on la ferme
  await page.waitForSelector('#sheet[open]');
  await audit(page, `${where} accueil`);
  await page.click('[data-fk="w-caught"]');
  await page.selectOption('#w-until', 'iron-man');
  await audit(page, `${where} accueil rattrapage`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });

  await audit(page, `${where} À voir`);

  await page.click('[data-order="release"]');
  await page.click('[data-fk="ptab:4"]');
  await audit(page, `${where} phase 4 atteinte`);
  await page.click('[data-order="chrono"]');

  await page.click('#open-filters');
  await audit(page, `${where} feuille Filtres`);
  await page.keyboard.press('Escape');

  await page.click('[data-fk="menu:iron-man"]');
  await audit(page, `${where} feuille Menu`);
  await page.keyboard.press('Escape');

  await page.click('[data-fk="open:wandavision"]');
  await audit(page, `${where} fiche série`);
  if (vname !== 'expanded') await page.keyboard.press('Escape');

  await page.click('[data-fk="open:avengers-endgame"]');
  await audit(page, `${where} fiche film à versions`);
  if (vname !== 'expanded') await page.keyboard.press('Escape');

  await page.click('[data-fk="cb:iron-man"]');
  await audit(page, `${where} snackbar`);

  await page.click('.nav-item[data-route="progression"]');
  await page.waitForSelector('#screen-progression:not([hidden])');
  await audit(page, `${where} Progression`);
  await page.click('[data-fk="stab:rythme"]');
  await audit(page, `${where} Progression Rythme`);
  await page.click('[data-fk="stab:mcu"]');
  await audit(page, `${where} Progression MCU`);
  await page.click('[data-fk="stab:succes"]');
  await audit(page, `${where} Progression Succès`);
  await page.click('[data-fk="stab:bilan"]');

  await page.click('.nav-item[data-route="reglages"]');
  await page.waitForSelector('#screen-reglages:not([hidden])');
  // Sections repliables : on audite chacune ouverte (la dernière, Données, reste ouverte pour la suite)
  for (const sec of ['look', 'follow', 'goal', 'about', 'data']) {
    await openSection(page, sec);
    await audit(page, `${where} Réglages ${sec}`);
  }

  await page.click('[data-fk="s-backup"]');
  await audit(page, `${where} feuille Sauvegarde`);
  await page.keyboard.press('Escape');
  await page.click('[data-fk="s-erase"]');
  await audit(page, `${where} feuille Effacer`);
  await context.close();
  if (process.env.E2E_VERBOSE) console.log(`${where}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// Les combinaisons thème × largeur sont indépendantes : on les exécute par lots de 4
const combos = Object.entries(variants).flatMap(([theme, variant]) => viewports.map((vp) => [theme, variant, vp]));
const queue = [...combos];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) await runCombo(...queue.shift());
}));

// États moins courants, thèmes clair et sombre : bandeaux de réparation, objectif atteint / en retard / dans les temps, tout vu,
// bandeau de succès, import raté, catalogue indisponible
{
  const catalogue = JSON.parse(await readFile(new URL('../data/mcu.json', import.meta.url), 'utf8'));
  const released = catalogue.filter((t) => !t.upcoming);
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const stateOf = (ids) => ({ version: 2, order: 'chrono', seen: Object.fromEntries(ids.map((id, i) => [id, day(-30 + (i % 20))])), ignored: {}, catchUp: {}, skip: [], included: {}, versions: {}, lastSeenKey: null });
  const some = stateOf(released.slice(0, 12).map((t) => t.id));
  const all = stateOf(released.flatMap((t) => (t.type === 'serie' ? t.episodes.map((e) => `${t.id}/${e.n}`) : [t.id])));
  const withBad = JSON.stringify({ ...some, seen: { ...some.seen, truc: 'pas-une-date' } });
  const cases = [
    { name: 'objectif dans les temps', state: some, view: { goalDate: day(400) }, route: 'progression' },
    { name: 'objectif en retard', state: some, view: { goalDate: day(3) }, route: 'progression' },
    { name: 'tout vu', state: all, view: { goalDate: day(400) }, route: 'progression' },
    { name: 'tout vu (À voir)', state: all, view: {}, route: null },
    { name: 'données réparées', raw: withBad, view: {}, route: null },
    { name: 'données illisibles', raw: '{pas du json', view: {}, route: null },
    { name: 'données d\'une version plus récente', raw: JSON.stringify({ version: 99, order: 'chrono', seen: {} }), view: {}, route: null },
    { name: 'bandeau de succès', state: stateOf(['iron-man']), view: { achv: {} }, route: null, wait: '#achv-toast:not([hidden])' },
  ];
  for (const scheme of ['light', 'dark']) {
    for (const c of cases) {
      const where = `états/${scheme} ${c.name}`;
      const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, reducedMotion: 'reduce' });
      await blockImages(context);
      await withAxe(context);
      await context.addInitScript(([state, raw, view]) => {
        try {
          localStorage.setItem('chrono-mcu:view', JSON.stringify({ welcomed: true, ...view }));
          if (raw !== null) localStorage.setItem('chrono-mcu:v1', raw);
          else localStorage.setItem('chrono-mcu:v1', JSON.stringify(state));
        } catch { /* ignore */ }
      }, [c.state ?? null, c.raw ?? null, c.view]);
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(where, `erreur JS : ${e.message}`));
      page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) fail(where, `violation CSP : ${m.text().slice(0, 140)}`); });
      await page.goto(base);
      await page.waitForSelector('body[data-ready]', { state: 'attached' });
      if (c.wait) await page.waitForSelector(c.wait);
      if (c.route) {
        await page.click(`.nav-item[data-route="${c.route}"]`);
        await page.waitForSelector(`#screen-${c.route}:not([hidden])`);
      }
      await audit(page, where);
      await context.close();
    }

    // Import raté : le message d'erreur de la feuille Sauvegarde
    {
      const where = `états/${scheme} import raté`;
      const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, reducedMotion: 'reduce' });
      await skipWelcome(context);
      await blockImages(context);
      await withAxe(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(where, `erreur JS : ${e.message}`));
      await page.goto(base);
      await page.waitForSelector('body[data-ready]', { state: 'attached' });
      await page.click('.nav-item[data-route="reglages"]');
      await openSection(page, 'data');
      await page.click('[data-fk="s-backup"]');
      await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') });
      await page.waitForSelector('#sheet [role="alert"]');
      await audit(page, where);
      await context.close();
    }

    // Catalogue indisponible : message plein écran
    {
      const where = `états/${scheme} catalogue indisponible`;
      const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, reducedMotion: 'reduce' });
      await skipWelcome(context);
      await withAxe(context);
      await context.route(/data\/mcu\.json/, (route) => route.fulfill({ status: 500, body: 'erreur' }));
      const page = await context.newPage();
      await page.goto(base);
      await page.waitForSelector('#message:not([hidden])');
      await audit(page, where);
      await context.close();
    }
  }
}

// Parcours clavier : l'écran principal doit être entièrement atteignable sans souris
{
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await skipWelcome(context);
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
  await openSection(page, 'data');
  await page.click('[data-fk="s-backup"]');
  const importReachable = await page.evaluate(() => [...document.querySelectorAll('#sheet button')].some((b) => /Importer/.test(b.textContent)));
  if (!importReachable) fail('clavier', 'le bouton Importer est introuvable (ou inaccessible)');
  await context.close();
}

// Fiche en mode sans spoiler : contenu flouté, puis révélé (contrastes, noms accessibles), thèmes clair et sombre
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, reducedMotion: 'reduce' });
  await skipWelcome(context);
  await blockImages(context);
  await withAxe(context);
  await context.addInitScript(() => { try { localStorage.setItem('chrono-mcu:view', JSON.stringify({ spoilerFree: true, welcomed: true })); } catch { /* ignore */ } });
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`spoiler/${scheme}`, `erreur JS : ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  await page.click('[data-fk="open:moon-knight"]');
  await page.waitForSelector('[data-fk="reveal:moon-knight"]');
  await audit(page, `spoiler/${scheme} fiche floutée`);
  await page.click('[data-fk="reveal:moon-knight"]');
  await page.waitForSelector('[data-fk="spoilers:moon-knight"]');
  await audit(page, `spoiler/${scheme} fiche révélée`);
  await context.close();
}

// Rappel de sauvegarde (affiché au-delà de 20 éléments vus sans sauvegarde), thèmes clair et sombre
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, reducedMotion: 'reduce' });
  await skipWelcome(context);
  await blockImages(context);
  await withAxe(context);
  const seen = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`seed${i}`, '2026-10-01']));
  await context.addInitScript(([state]) => { try { localStorage.setItem('chrono-mcu:v1', JSON.stringify(state)); } catch { /* ignore */ } },
    [{ version: 2, order: 'chrono', seen, ignored: {}, lastSeenKey: null }]);
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`rappel/${scheme}`, `erreur JS : ${e.message}`));
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) fail(`rappel/${scheme}`, `violation CSP : ${m.text().slice(0, 140)}`); });
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  if (!(await page.locator('#nudge .card-nudge').count())) fail(`rappel/${scheme}`, 'le rappel de sauvegarde devrait s\'afficher');
  await audit(page, `rappel/${scheme} À voir`);
  await context.close();
}

// Reflow (WCAG 1.4.10) à 320 px et texte agrandi à 200 % (WCAG 1.4.4) : pas de défilement horizontal, aucune commande hors écran ni texte coupé
for (const [label, fontScale] of [['320 px', null], ['320 px et texte à 200 %', '200%']]) {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
  await skipWelcome(context);
  await blockImages(context);
  const page = await context.newPage();
  const where = `reflow ${label}`;
  page.on('pageerror', (e) => fail(where, `erreur JS : ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  if (fontScale) await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontScale);
  const inspect = async (screen) => {
    const problems = await page.evaluate(() => {
      const out = [];
      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > width + 1) out.push(`la page défile horizontalement (${document.documentElement.scrollWidth} px pour ${width} px)`);
      const visible = (el) => !el.closest('[hidden]') && !el.closest('dialog:not([open])') && el.getClientRects().length > 0;
      const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} « ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} »`;
      document.querySelectorAll('button, a[href], input:not([type=hidden]), [role=tab]').forEach((el) => {
        if (!visible(el)) return;
        if (el.closest('.phase-tabs')) return; // rangée d'onglets volontairement défilante (la rangée elle-même tient dans l'écran)
        const r = el.getBoundingClientRect();
        if (r.right > width + 1 || r.left < -1) out.push(`commande hors écran : ${name(el)} (${Math.round(r.left)} à ${Math.round(r.right)} px)`);
      });
      document.querySelectorAll('*').forEach((el) => {
        if (!visible(el) || el.closest('svg') || el.closest('.sr-only') || el.classList.contains('skip-link')) return;
        const style = getComputedStyle(el);
        if ((style.overflowX === 'hidden' || style.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) out.push(`texte coupé dans ${name(el)} (${el.scrollWidth} px pour ${el.clientWidth} px)`);
      });
      return out.slice(0, 4);
    });
    problems.forEach((p) => fail(where, `${screen} : ${p}`));
  };
  await inspect('À voir');
  await page.click('[data-order="release"]');
  await page.click('[data-fk="ptab:4"]');
  await inspect('phase 4 atteinte');
  await page.click('[data-order="chrono"]');
  await page.click('#open-filters');
  await inspect('feuille Filtres');
  await page.keyboard.press('Escape');
  await page.click('[data-fk="open:wandavision"]');
  await inspect('fiche série');
  await page.keyboard.press('Escape');
  await page.click('[data-fk="menu:iron-man"]');
  await inspect('feuille Menu');
  await page.keyboard.press('Escape');
  for (const route of ['progression', 'reglages']) {
    await page.click(`.nav-item[data-route="${route}"]`);
    await page.waitForSelector(`#screen-${route}:not([hidden])`);
    if (route === 'progression') await inspect('Progression');
    else {
      for (const sec of ['look', 'follow', 'goal', 'about', 'data']) {
        await openSection(page, sec);
        await inspect(`Réglages ${sec}`);
      }
    }
  }
  await context.close();
}

// Swipe tactile : droite = vu, gauche = ignorer, geste court = rien ; un swipe n'ouvre pas la fiche (événements tactiles réels via CDP)
{
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, reducedMotion: 'reduce' });
  await skipWelcome(context);
  await blockImages(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => fail('swipe', `erreur JS : ${e.message}`));
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) fail('swipe', `violation CSP : ${m.text().slice(0, 140)}`); });
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
  await ep.evaluate((el) => el.scrollIntoView({ block: 'center' })); // le pied de fiche Précédent / Suivant ne doit pas masquer la ligne
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
closeServer();
console.log(`${checks} contrôles d'accessibilité exécutés (4 variantes de thème × 3 largeurs × 8 états, plus les états rares) en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
if (failures.length) {
  console.log(`${failures.length} problème(s) :`);
  [...new Set(failures)].forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Aucun problème détecté.');
