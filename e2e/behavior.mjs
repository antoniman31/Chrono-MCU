// Parcours de comportement de bout en bout (hors accessibilité, couverte par run.mjs) : persistance, annulation, ignorer,
// export / import, thème OLED, migration d'état et rappel de sauvegarde. Lancer avec `npm run e2e`.
import { createRequire } from 'node:module';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const { base, close: closeServer } = await startServer();
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
const failures = [];
let scenarios = 0;

const check = (cond, message) => { if (!cond) throw new Error(message); };
const STATE = 'chrono-mcu:v1';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function scenario(name, run, { prefs = null, seed = null, colorScheme = 'light', viewport = { width: 360, height: 740 } } = {}) {
  scenarios += 1;
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce', acceptDownloads: true });
  await context.route(/image\.tmdb\.org/, (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  // Les valeurs de départ ne sont posées qu'une fois (pas à chaque rechargement), pour pouvoir tester la persistance
  await context.addInitScript(([p, s]) => {
    try {
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      localStorage.setItem('chrono-mcu:view', JSON.stringify({ welcomed: true, ...(p ?? {}) }));
      if (s) localStorage.setItem('chrono-mcu:v1', JSON.stringify(s));
    } catch { /* ignore */ }
  }, [prefs, seed]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`erreur JS : ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(`CSP : ${m.text()}`); });
  try {
    await page.goto(base);
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    await run(page, context);
    if (errors.length) throw new Error(errors[0]);
  } catch (e) {
    failures.push(`${name} : ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

const reload = async (page) => {
  await page.reload();
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
};
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STATE);
const checked = (page, key) => page.locator(`[data-fk="${key}"]`).isChecked();
// Le changement d'écran passe par l'événement hashchange (asynchrone) : on attend que l'écran visé soit affiché
const go = async (page, route) => {
  await page.click(`.nav-item[data-route="${route}"]`);
  await page.waitForSelector(`#screen-${route}:not([hidden])`);
};

// Interrupteur ou choix de Réglages : on clique son libellé (visible, donc Playwright attend que la mise en page soit stable),
// puis on attend l'état voulu sur l'élément rendu de nouveau. Un clic « forcé » sur la case cachée tombait parfois à côté pendant l'ouverture de la section.
const flip = async (page, key, on = true) => {
  const input = page.locator(`[data-fk="${key}"]`);
  if ((await input.isChecked()) === on) return;
  await input.locator('xpath=ancestor::label[1]').click();
  await page.waitForFunction(([k, v]) => document.querySelector(`[data-fk="${k}"]`)?.checked === v, [key, on]);
};

// Réglages : sections repliables, une seule ouverte à la fois
const openSec = async (page, id) => {
  if (!(await page.locator(`[data-sec="${id}"]`).evaluate((d) => d.open))) await page.click(`[data-sec="${id}"] summary`);
};
const progressTotal = async (page) => {
  await go(page, 'progression');
  const text = await page.locator('#progress-screen').first().innerText();
  const m = text.match(/(\d+) sur (\d+) unités/);
  check(m, `texte de progression introuvable : ${text.slice(0, 80)}`);
  const result = { seen: Number(m[1]), total: Number(m[2]) };
  await go(page, 'voir');
  return result;
};

await scenario('épisodes pas encore sortis : exclus des comptes jusqu\'à leur date', async (page, context) => {
  await context.clock.setFixedTime(new Date('2026-10-27T12:00:00'));
  await reload(page);
  const before = await progressTotal(page);
  await page.fill('#search', 'VisionQuest');
  const meta = await page.locator('[data-fk="open:visionquest"]').innerText();
  check(/\(2 à venir\)/.test(meta), `la liste devrait annoncer 2 épisodes à venir : ${meta.replace(/\n/g, ' | ')}`);
  await page.click('[data-fk="open:visionquest"]');
  await page.waitForSelector('#sheet[open]');
  const sheet = await page.locator('#sheet-body').innerText();
  check(/Sort le 03\/11\/2026/.test(sheet) && /Sort le 10\/11\/2026/.test(sheet), 'la fiche devrait afficher les dates de sortie des épisodes 7 et 8');
  check(await page.locator('[data-fk="ep:visionquest/7"]').count() === 0, 'un épisode à venir ne doit pas avoir de case');
  await page.keyboard.press('Escape');
  await context.clock.setFixedTime(new Date('2026-11-11T12:00:00'));
  await reload(page);
  const after = await progressTotal(page);
  check(after.total - before.total === 2, `les 2 épisodes devraient entrer dans le total (${before.total} -> ${after.total})`);
});

await scenario('persistance : une coche survit au rechargement', async (page) => {
  await page.click('[data-fk="cb:iron-man"]');
  check(await checked(page, 'cb:iron-man'), 'la case n\'est pas cochée après le clic');
  await reload(page);
  check(await checked(page, 'cb:iron-man'), 'la coche a disparu après rechargement');
  const state = await stored(page);
  check(state.version === 2 && state.seen['iron-man'], 'l\'état stocké est incomplet');
});

await scenario('annulation : le snackbar restaure l\'état', async (page) => {
  await page.click('[data-fk="cb:thor"]');
  check(await checked(page, 'cb:thor'), 'coche non appliquée');
  await page.click('#snackbar-action');
  check(!(await checked(page, 'cb:thor')), 'l\'annulation n\'a pas décoché');
  check(Object.keys((await stored(page)).seen).length === 0, 'l\'état stocké n\'est pas revenu à vide');
});

await scenario('ignorer : sorti de la progression et du « Prochain à voir »', async (page) => {
  const before = await progressTotal(page);
  const firstSuggested = (await page.locator('#resume .name').innerText()).trim();
  await page.click('[data-fk="menu:wandavision"]');
  await page.click('[data-fk="m-ignore"]');
  const after = await progressTotal(page);
  check(before.total - after.total === 9, `WandaVision (9 épisodes) devrait sortir du total (${before.total} -> ${after.total})`);
  await page.click('[data-fk="menu:captain-america-first-avenger"]');
  await page.click('[data-fk="m-ignore"]');
  const next = (await page.locator('#resume .name').innerText()).trim();
  check(next !== firstSuggested, `le titre ignoré est toujours proposé : ${next}`);
  await reload(page);
  check((await stored(page)).ignored.wandavision === true, 'l\'état « ignoré » n\'a pas été conservé');
});

await scenario('export puis import : aller-retour, fichier invalide sans effet', async (page) => {
  await page.click('[data-fk="cb:iron-man"]');
  await go(page, 'reglages');
  await openSec(page, 'data');
  await page.click('[data-fk="s-backup"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-fk="b-export"]')]);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const exported = JSON.parse(readFileSync(path, 'utf8'));
  check(exported.version === 2 && exported.seen['iron-man'], 'l\'export est incomplet');
  check(!('notes' in exported), 'l\'export ne devrait plus contenir de notes');
  check((await stored(page)) && true, 'état absent');
  const view = await page.evaluate(() => JSON.parse(localStorage.getItem('chrono-mcu:view')));
  check(view.lastBackup && view.lastBackup.seenCount === 1, 'la date de sauvegarde n\'est pas enregistrée après l\'export');

  // On défait la coche, puis on réimporte le fichier exporté
  await go(page, 'voir');
  await page.click('[data-fk="cb:iron-man"]');
  check(!(await checked(page, 'cb:iron-man')), 'décoche non appliquée');
  await go(page, 'reglages');
  await openSec(page, 'data');
  await page.click('[data-fk="s-backup"]');
  await page.setInputFiles('#import-file', path);
  await page.click('[data-fk="b-confirm"]');
  await go(page, 'voir');
  check(await checked(page, 'cb:iron-man'), 'l\'import n\'a pas restauré la coche');

  // Un fichier invalide ne change rien et affiche un message
  await go(page, 'reglages');
  await openSec(page, 'data');
  await page.click('[data-fk="s-backup"]');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') });
  await page.waitForSelector('#sheet [role="alert"]');
  await page.keyboard.press('Escape');
  await go(page, 'voir');
  check(await checked(page, 'cb:iron-man'), 'un import invalide a modifié l\'état');
});

await scenario('rattrapage : « Tout marquer vu jusqu\'ici », rythme exclu, annulation', async (page) => {
  await page.click('[data-fk="menu:iron-man"]');
  const label = await page.locator('[data-fk="m-until"]').innerText();
  check(/jusqu'ici \((\d+) titres\)/.test(label), `libellé inattendu : ${label}`);
  await page.click('[data-fk="m-until"]');
  const state = await stored(page);
  const seenKeys = Object.keys(state.seen);
  check(seenKeys.length >= 2 && seenKeys.every((k) => state.catchUp[k]), 'tout le rattrapage devrait être marqué catchUp');
  check(await checked(page, 'cb:iron-man'), 'iron-man devrait être coché');
  check(state.lastSeenKey === 'iron-man', `lastSeenKey inattendu : ${state.lastSeenKey}`);
  await go(page, 'progression');
  const text = await page.locator('#progress-screen').innerText();
  check(/Rythme\s*\n?\s*n\/a/.test(text), 'le rythme devrait rester n/a après un rattrapage');
  check(/rattrapage/.test(text), 'la note sur le rattrapage devrait s\'afficher');
  await go(page, 'voir');
  await page.click('#snackbar-action');
  check(Object.keys((await stored(page)).seen).length === 0, 'l\'annulation devrait tout restaurer');
});

await scenario('titres d\'épisodes en français affichés dans la fiche', async (page) => {
  const fr = await page.evaluate(async () => {
    const data = await (await fetch('data/mcu.json')).json();
    return data.find((t) => t.id === 'wandavision').episodes.find((e) => e.titleFr);
  });
  check(fr, 'aucun titre français pour WandaVision dans les données');
  await page.click('[data-fk="open:wandavision"]');
  await page.waitForSelector('#sheet[open]');
  check((await page.locator('#sheet-body').innerText()).includes(fr.titleFr), `le titre « ${fr.titleFr} » devrait s'afficher`);
  await page.keyboard.press('Escape');
  await page.fill('#search', fr.title.slice(0, 8));
  check(await page.locator('[data-fk="open:wandavision"]').count() === 0, 'sans l\'option, la recherche ne doit pas porter sur les titres d\'épisodes');
  await page.click('#open-filters');
  await page.click('label.switch-row:has([data-fk="f-episodes"])');
  await page.click('[data-fk="f-done"]');
  check(await page.locator('[data-fk="open:wandavision"]').count() === 1, 'avec l\'option, la recherche par titre d\'origine d\'épisode devrait trouver la série');
  await page.fill('#search', fr.titleFr.slice(0, 8));
  check(await page.locator('[data-fk="open:wandavision"]').count() === 1, 'avec l\'option, la recherche par titre français d\'épisode devrait trouver la série');
});

await scenario('filtres : ignorés masqués/seuls, statut, réinitialisation, compteur', async (page) => {
  const total = async () => parseInt((await page.locator('#result-count').innerText()), 10);
  const all = await total();
  await page.click('[data-fk="menu:wandavision"]');
  await page.click('[data-fk="m-ignore"]');
  check(await page.locator('[data-fk="open:wandavision"]').count() === 1, 'un titre ignoré reste affiché par défaut');
  await page.click('#open-filters');
  await page.click('label.segopt:has([data-fk="f-ignored:hide"])');
  check(/Afficher \d+ titres/.test(await page.locator('[data-fk="f-done"]').innerText()), 'le bouton doit annoncer le nombre de titres');
  await page.click('[data-fk="f-done"]');
  check(await page.locator('[data-fk="open:wandavision"]').count() === 0 && (await total()) === all - 1, 'les ignorés doivent être masqués');
  check(/1 actif/.test(await page.locator('#open-filters').getAttribute('aria-label')), 'le bouton Filtres doit compter 1 filtre actif');
  await page.click('#open-filters');
  await page.click('label.segopt:has([data-fk="f-ignored:only"])');
  await page.click('[data-fk="f-done"]');
  check((await total()) === 1, 'seul le titre ignoré doit rester');
  await page.click('#open-filters');
  await page.click('[data-fk="f-reset"]');
  await page.click('[data-fk="f-done"]');
  check((await total()) === all, 'la réinitialisation doit tout rétablir');
  await page.click('#open-filters');
  await page.click('label.segopt:has([data-fk="f-status:done"])');
  await page.click('[data-fk="f-done"]');
  check((await total()) === 0, 'aucun titre terminé au départ');
});

await scenario('progression : sous-onglets Bilan / Rythme / MCU / Succès, clavier, chiffres', async (page) => {
  await page.click('.nav-item[data-route="progression"]');
  await page.waitForSelector('#screen-progression:not([hidden])');
  check(await page.locator('#stab-bilan').getAttribute('aria-selected') === 'true', 'Bilan doit être sélectionné au départ');
  check(await page.locator('#p-global').count() === 1, 'le bilan doit montrer la progression globale');
  await page.focus('#stab-bilan');
  await page.keyboard.press('ArrowRight');
  check(await page.locator('#stab-rythme').getAttribute('aria-selected') === 'true', 'flèche droite : onglet Rythme');
  check(await page.evaluate(() => document.activeElement.id) === 'stab-rythme', 'le focus doit suivre l\'onglet');
  const txt = await page.locator('#progress-panel').innerText();
  check(/Série en cours\s*3 jours/.test(txt), `série de jours attendue : ${txt.slice(0, 200)}`);
  check(await page.locator('.heat').getAttribute('aria-label').then((l) => /3 unités vues/.test(l)), 'le calendrier doit annoncer 3 unités');
  check(/Première coche/.test(txt) && /25 % atteints/.test(txt), 'les jalons doivent apparaître');
  await page.keyboard.press('ArrowRight');
  const mcuTxt = await page.locator('#progress-panel').innerText();
  check(/Film le plus long/.test(mcuTxt) && /Frise des sorties/.test(mcuTxt) && /Temps vu par phase/.test(mcuTxt), 'l\'onglet MCU doit montrer records, répartition et frise');
  check(await page.locator('.tl-row').count() >= 10, 'la frise doit avoir une ligne par année');
  await page.keyboard.press('ArrowRight');
  check(await page.locator('#stab-succes').getAttribute('aria-selected') === 'true', 'flèche droite : onglet Succès');
  await page.keyboard.press('ArrowRight');
  check(await page.locator('#stab-bilan').getAttribute('aria-selected') === 'true', 'retour au premier onglet en bouclant');
}, { seed: (() => { const d = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA'); return { version: 2, order: 'chrono', seen: { 'iron-man': d(2), 'l-incroyable-hulk': d(1), 'iron-man-2': d(0) }, ignored: {}, lastSeenKey: 'iron-man-2' }; })() });

await scenario('succès : bandeau au déblocage, bouton Voir, onglet Succès, palier conservé', async (page) => {
  check(await page.locator('#achv-toast').isHidden(), 'aucun bandeau de succès au départ');
  await page.click('[data-fk="cb:iron-man"]');
  await page.waitForSelector('#achv-toast:not([hidden])');
  const text = await page.locator('#achv-text').innerText();
  check(/Succès débloqué : Premier pas/.test(text), `bandeau attendu : ${text}`);
  await page.click('#achv-view');
  await page.waitForSelector('#screen-progression:not([hidden])');
  check(await page.locator('#stab-succes').getAttribute('aria-selected') === 'true', 'le bouton Voir doit ouvrir l\'onglet Succès');
  const panel = await page.locator('#progress-panel').innerText();
  check(/Premier pas/.test(panel) && /Obtenu/.test(panel) && /Succès caché/.test(panel), `onglet Succès incomplet : ${panel.slice(0, 200)}`);
  check(await page.locator('#achv-toast').isHidden(), 'le bandeau doit disparaître après Voir');
  check(/^1 \/ \d+/.test(await page.locator('#p-achv ~ .big-number, .big-number').first().innerText()), 'le compteur doit afficher 1 médaille');
  await page.click('.nav-item[data-route="voir"]');
  await page.click('[data-fk="cb:iron-man"]'); // décoche
  await page.click('.nav-item[data-route="progression"]');
  check(/Obtenu/.test(await page.locator('#progress-panel').innerText()), 'un succès obtenu n\'est pas retiré quand on décoche');
}, { prefs: { achv: {} } });

await scenario('filtre par personnage : liste, compteur, succès par personnage', async (page) => {
  const total = async () => parseInt((await page.locator('#result-count').innerText()), 10);
  const all = await total();
  await page.click('#open-filters');
  await page.selectOption('#f-hero', 'guardians');
  await page.click('[data-fk="f-done"]');
  const n = await total();
  check(n >= 3 && n < all, `le filtre Gardiens doit réduire la liste (${n} sur ${all})`);
  check(/1 actif/.test(await page.locator('#open-filters').getAttribute('aria-label')), 'le filtre personnage compte comme filtre actif');
  check(await page.locator('[data-fk="open:les-gardiens-de-la-galaxie"]').count() === 1, 'Les Gardiens de la Galaxie doit rester');
  check(await page.locator('[data-fk="open:iron-man"]').count() === 0, 'Iron Man ne doit plus apparaître');
  await page.click('#open-filters');
  await page.click('[data-fk="f-reset"]');
  await page.click('[data-fk="f-done"]');
  check((await total()) === all, 'la réinitialisation doit effacer le filtre personnage');
  await page.click('.nav-item[data-route="progression"]');
  await page.click('[data-fk="stab:succes"]');
  const txt = await page.locator('#progress-panel').innerText();
  check(/Personnages et équipes/.test(txt) && /Tout sur Iron Man/.test(txt) && /Tout sur les Avengers/.test(txt), 'les succès par personnage doivent apparaître');
});

await scenario('accueil : premier lancement, rattrapage jusqu\'à un titre, jamais réaffiché, relançable', async (page) => {
  await page.waitForSelector('#sheet[open]');
  check(/Bienvenue/.test(await page.locator('#sheet-title').innerText()), 'la feuille d\'accueil doit s\'ouvrir au premier lancement');
  await page.click('[data-fk="w-caught"]');
  check(await page.locator('[data-fk="w-confirm"]').isDisabled(), 'sans titre choisi, le bouton de confirmation est désactivé');
  await page.selectOption('#w-until', 'iron-man-2');
  const txt = await page.locator('#sheet-body').innerText();
  check(/titres? (seront marqués|sera marqué)/.test(txt), `le nombre de titres doit apparaître : ${txt.slice(0, 200)}`);
  await page.click('[data-fk="w-confirm"]');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  const state = await stored(page);
  check(Object.keys(state.seen).length >= 3 && Object.keys(state.catchUp).length === Object.keys(state.seen).length, 'le rattrapage doit marquer les titres précédents');
  check(/marqué/.test(await page.locator('#snackbar-text').innerText()), 'la snackbar doit annoncer le rattrapage');
  await reload(page);
  check(await page.locator('#sheet[open]').count() === 0, 'l\'accueil ne doit plus se rouvrir');
  await page.click('.nav-item[data-route="reglages"]');
  await openSec(page, 'about');
  await page.click('[data-fk="s-welcome"]');
  await page.waitForSelector('#sheet[open]');
  check(/Bienvenue/.test(await page.locator('#sheet-title').innerText()), 'Revoir l\'accueil doit rouvrir la feuille');
}, { prefs: { welcomed: false } });

await scenario('annulation multi-niveaux : plusieurs coches annulées une à une depuis Réglages', async (page) => {
  await page.click('[data-fk="cb:iron-man"]');
  await page.click('[data-fk="cb:iron-man-2"]');
  await page.click('[data-fk="cb:thor"]');
  check(Object.keys((await stored(page)).seen).length === 3, 'trois coches attendues');
  await page.click('.nav-item[data-route="reglages"]');
  await openSec(page, 'data');
  const info = await page.locator('.history-block .desc').innerText();
  check(/3 actions annulables/.test(info) && /Thor/.test(info), `historique attendu : ${info}`);
  await page.click('[data-fk="s-undo"]');
  await page.click('[data-fk="s-undo"]');
  check(Object.keys((await stored(page)).seen).length === 1, 'deux annulations doivent laisser une coche');
  await page.click('[data-fk="s-undo"]');
  check(Object.keys((await stored(page)).seen).length === 0 && await page.locator('[data-fk="s-undo"]').isDisabled(), 'tout annulé : le bouton se désactive');
});

await scenario('retour tactile : animation à la coche, réglage pour le couper', async (page) => {
  await page.evaluate(() => { window.__vibrations = []; navigator.vibrate = (ms) => { window.__vibrations.push(ms); return true; }; });
  await page.click('[data-fk="cb:iron-man"]');
  check((await page.evaluate(() => window.__vibrations.length)) === 1, 'une vibration attendue à la coche');
  check(await page.locator('[data-fk="cb:iron-man"]').evaluate((el) => el.closest('.cb').classList.contains('pop')), 'le rond doit recevoir l\'animation');
  await page.click('[data-fk="cb:iron-man"]');
  check((await page.evaluate(() => window.__vibrations.length)) === 1, 'pas de vibration en décochant');
  await page.click('.nav-item[data-route="reglages"]');
  await openSec(page, 'look');
  await page.click('label.switch-row:has([data-fk="s-feedback"])');
  await page.click('.nav-item[data-route="voir"]');
  await page.click('[data-fk="cb:iron-man"]');
  check((await page.evaluate(() => window.__vibrations.length)) === 1, 'le réglage coupé doit supprimer la vibration');
});

// Hors-ligne : on « construit » une copie (marqueur __BUILD__ remplacé comme au déploiement), on la sert,
// on laisse le service worker s'installer, puis on coupe le réseau et on recharge.
{
  const { mkdtempSync, cpSync, readdirSync, readFileSync, statSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { startServer: startBuilt } = await import('./server.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'chrono-built-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons', 'fonts']) cpSync(new URL(`../${f}`, import.meta.url), join(dir, f), { recursive: true });
  const stamp = (d) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return stamp(p);
    if (/\.(html|js|css|json|webmanifest)$/.test(f)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__BUILD__', 'e2ebuild'));
  });
  stamp(dir);
  const built = await startBuilt(dir);
  scenarios += 1;
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
  await context.route(/image\.tmdb\.org/, (route) => route.abort());
  await context.addInitScript(() => { try { localStorage.setItem('chrono-mcu:view', JSON.stringify({ welcomed: true })); } catch { /* ignore */ } });
  const page = await context.newPage();
  try {
    await page.goto(built.base);
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    check(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'le service worker doit contrôler la page après rechargement');
    const online = await page.locator('#list .item, #list li').count();
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    const offline = await page.locator('#list .item, #list li').count();
    check(online > 10 && offline === online, `hors ligne, la liste doit s'afficher comme en ligne (${offline} / ${online})`);
    await page.click('[data-fk="cb:iron-man"]');
    check(Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('chrono-mcu:v1')))?.seen ?? {}).length === 1, 'cocher doit fonctionner hors ligne');
  } catch (e) {
    failures.push(`hors-ligne : ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
    built.close();
  }
}

await scenario('synchronisation du catalogue : lien GitHub, jeton, lancement et suivi (API simulée)', async (page, context) => {
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    calls.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if (req.method() === 'POST') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ workflow_runs: [{ created_at: new Date(Date.now() + 1000).toISOString(), status: 'completed', conclusion: 'success', html_url: 'https://github.com/antoniman31/Chrono-MCU/actions/runs/1' }] }),
    });
  });
  await go(page, 'reglages');
  await openSec(page, 'data');
  const href = await page.locator('[data-fk="s-sync-link"]').getAttribute('href');
  check(href === 'https://github.com/antoniman31/Chrono-MCU/actions/workflows/catalog-sync.yml', `lien de synchronisation inattendu : ${href}`);
  check(await page.locator('[data-fk="s-sync-run"]').count() === 0, 'sans jeton, pas de bouton de lancement');
  await page.click('.sync-token summary');
  await page.fill('#gh-token', 'pas-un-jeton');
  await page.click('[data-fk="s-sync-save"]');
  check(/pas le bon format/.test(await page.locator('#sync-token-error').innerText()), 'un jeton invalide doit être refusé');
  check((await page.evaluate(() => localStorage.getItem('chrono-mcu:gh-token'))) === null, 'un jeton invalide ne doit pas être enregistré');
  await page.fill('#gh-token', `github_pat_${'A1b2C3d4E5'.repeat(4)}`);
  await page.click('[data-fk="s-sync-save"]');
  await page.waitForSelector('[data-fk="s-sync-run"]');
  check(await page.evaluate(() => localStorage.getItem('chrono-mcu:gh-token') !== null), 'le jeton valide doit être enregistré sur l\'appareil');
  check(!JSON.stringify(await stored(page) ?? {}).includes('github_pat_'), 'le jeton ne doit jamais entrer dans la progression exportable');
  await page.click('[data-fk="s-sync-run"]');
  await page.waitForFunction(() => /Terminée/.test(document.getElementById('sync-status')?.textContent ?? ''), null, { timeout: 20000 });
  check(/pull request/.test(await page.locator('#sync-status').innerText()), 'le résultat doit mentionner la pull request');
  check(await page.locator('#sync-status a').getAttribute('href') === 'https://github.com/antoniman31/Chrono-MCU/actions/runs/1', 'le lien vers le journal doit pointer sur le lancement');
  check(calls[0].startsWith('POST') && calls[0].endsWith('/dispatches') && calls.some((c) => c.startsWith('GET')), `appels API inattendus : ${calls}`);
  await page.click('[data-fk="s-sync-forget"]');
  check(await page.locator('[data-fk="s-sync-run"]').count() === 0 && (await page.evaluate(() => localStorage.getItem('chrono-mcu:gh-token'))) === null, 'retirer le jeton doit effacer le bouton et le jeton');
});

await scenario('titre à venir : menu, ignorer / ne plus ignorer, badge, filtre, fiche', async (page) => {
  const id = 'avengers-doomsday';
  const row = () => page.locator(`li.item:has([data-fk="open:${id}"])`);
  check(await row().locator('.item-menu').count() === 1, 'un titre à venir doit avoir un menu d\'actions');
  check(await row().locator('[data-fk^="cb:"]').count() === 0, 'un titre à venir n\'a pas de case à cocher');
  await page.click(`[data-fk="menu:${id}"]`);
  check(await page.locator('[data-fk="m-seen"]').count() === 0, 'pas de « marquer comme vu » pour un titre à venir');
  await page.click('[data-fk="m-ignore"]');
  check((await stored(page)).ignored[id] === true, 'le titre à venir doit être ignoré dans l\'état');
  check(/ignoré/.test(await row().innerText()) && await row().evaluate((el) => el.classList.contains('ignored') && el.classList.contains('upcoming')), 'badge « ignoré » et ligne grisée attendus');
  await page.click('#open-filters');
  await page.click('label.segopt:has([data-fk="f-ignored:hide"])');
  await page.click('[data-fk="f-done"]');
  check(await page.locator(`[data-fk="open:${id}"]`).count() === 0, 'le filtre « Masquer les ignorés » doit cacher le titre à venir ignoré');
  await page.click('#open-filters');
  await page.click('[data-fk="f-reset"]');
  await page.click('[data-fk="f-done"]');
  await page.click(`[data-fk="open:${id}"]`);
  check(/Ne plus ignorer/.test(await page.locator(`[data-fk="detail-ignore:${id}"]`).innerText()), 'la fiche doit proposer « Ne plus ignorer »');
  check(/tu l'ignores/.test(await page.locator('#sheet-body').innerText()), 'la fiche doit expliquer que le titre est ignoré');
  await page.click(`[data-fk="detail-ignore:${id}"]`);
  check(!(await stored(page)).ignored[id], 'ne plus ignorer doit retirer le titre des ignorés');
});

await scenario('fiche : titres voisins par boutons, flèches du clavier et glissement sur l\'en-tête, dans l\'ordre de la liste filtrée', async (page) => {
  await page.fill('#search', 'Iron Man');
  const ids = await page.locator('#list [data-fk^="open:"]').evaluateAll((els) => els.map((el) => el.dataset.fk.slice(5)));
  check(ids.length === 3, `3 titres Iron Man attendus : ${ids}`);
  const titles = await page.locator('#list .item .title').allInnerTexts();
  const shownTitle = () => page.locator('#sheet-title').innerText();
  const count = () => page.locator('.detail-nav .count').innerText();
  await page.click(`[data-fk="open:${ids[0]}"]`);
  check((await shownTitle()) === titles[0] && (await count()) === '1 / 3', `première fiche : ${await shownTitle()} ${await count()}`);
  check(await page.locator('[data-fk="detail-prev"]').isDisabled(), 'pas de titre précédent au premier');
  await page.click('[data-fk="detail-next"]');
  check((await shownTitle()) === titles[1] && (await count()) === '2 / 3', `suivant : ${await shownTitle()} ${await count()}`);
  check(await page.evaluate(() => document.activeElement?.dataset?.fk) === 'detail-next', 'le focus reste sur le bouton Suivant');
  await page.keyboard.press('ArrowRight');
  check((await shownTitle()) === titles[2] && await page.locator('[data-fk="detail-next"]').isDisabled(), 'flèche droite : dernière fiche, Suivant désactivé');
  await page.keyboard.press('ArrowRight');
  check((await shownTitle()) === titles[2], 'au dernier titre, la flèche droite ne change rien');
  await page.keyboard.press('ArrowLeft');
  check((await shownTitle()) === titles[1], 'flèche gauche : fiche précédente');
  const swipe = (selector, from, to) => page.evaluate(([sel, a, b]) => {
    const el = document.querySelector(sel);
    const fire = (type, x) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: 300, bubbles: true }));
    fire('pointerdown', a);
    fire('pointerup', b);
  }, [selector, from, to]);
  await swipe('.detail-head', 280, 80); // vers la gauche : suivant
  check((await shownTitle()) === titles[2], 'glissement à gauche sur l\'en-tête : titre suivant');
  await swipe('.detail-head', 80, 280); // vers la droite : précédent
  check((await shownTitle()) === titles[1], 'glissement à droite sur l\'en-tête : titre précédent');
  await swipe('.detail-head', 200, 170); // trop court
  check((await shownTitle()) === titles[1], 'un glissement trop court ne change rien');
  await page.keyboard.press('Escape');
  check(await page.locator('#sheet[open]').count() === 0, 'la fiche se ferme');
});

await scenario('fiche sur grand écran : boutons et flèches changent le panneau et la ligne sélectionnée', async (page) => {
  const ids = await page.locator('#list [data-fk^="open:"]').evaluateAll((els) => els.slice(0, 3).map((el) => el.dataset.fk.slice(5)));
  await page.click(`[data-fk="open:${ids[0]}"]`);
  const paneTitle = () => page.locator('#detail-pane h2').innerText();
  const first = await paneTitle();
  await page.click('[data-fk="detail-next"]');
  const second = await paneTitle();
  check(first !== second && await page.locator(`#list li.selected:has([data-fk="open:${ids[1]}"])`).count() === 1, 'le bouton Suivant doit changer le panneau et la ligne sélectionnée');
  await page.keyboard.press('ArrowRight');
  check(await paneTitle() !== second && await page.locator(`#list li.selected:has([data-fk="open:${ids[2]}"])`).count() === 1, 'la flèche droite doit passer au titre suivant');
  await page.keyboard.press('ArrowLeft');
  check(await paneTitle() === second, 'la flèche gauche doit revenir au titre précédent');
}, { viewport: { width: 1200, height: 800 } });

await scenario('catégories : couper les séries, réintégrer un titre, tout persiste', async (page) => {
  const data = await page.evaluate(async () => (await fetch('data/mcu.json')).json());
  const films = data.filter((t) => t.type === 'film' && !t.upcoming).length;
  const loki = data.find((t) => t.id === 'loki-saison-1').episodes.length;
  const full = await progressTotal(page);
  await go(page, 'reglages');
  await openSec(page, 'follow');
  const summary = await page.locator('.follow-total').innerText();
  check(/titres suivis/.test(summary), `résumé du suivi inattendu : ${summary}`);
  await flip(page, 'follow:series', false);
  check((await page.locator('.follow-total').innerText()) !== summary, 'le résumé devrait changer après avoir coupé les séries');
  const filmsOnly = await progressTotal(page);
  check(filmsOnly.total === films, `seuls les films devraient rester (${filmsOnly.total} au lieu de ${films})`);
  check(full.total > filmsOnly.total, 'le total aurait dû baisser');

  await page.fill('#search', 'Loki');
  await page.click('[data-fk="menu:loki-saison-1"]');
  const label = await page.locator('[data-fk="m-ignore"]').innerText();
  check(/Réintégrer/.test(label), `le menu devrait proposer « Réintégrer ce titre » : ${label}`);
  await page.click('[data-fk="m-ignore"]');
  await page.fill('#search', '');
  const withLoki = await progressTotal(page);
  check(withLoki.total === films + loki, `Loki devrait revenir (${withLoki.total} au lieu de ${films + loki})`);

  await reload(page);
  const state = await stored(page);
  check(state.skip.includes('series') && state.included['loki-saison-1'], 'catégorie coupée et réintégration à conserver après rechargement');
  check((await progressTotal(page)).total === films + loki, 'le total devrait être le même après rechargement');

  await go(page, 'reglages');
  await openSec(page, 'follow');
  await flip(page, 'follow:series', true);
  const back = await stored(page);
  check(back.skip.length === 0 && Object.keys(back.included).length === 0, 'suivre à nouveau la catégorie doit effacer la réintégration');
  check((await progressTotal(page)).total === full.total, 'tout le catalogue devrait être de retour');
});

await scenario('barre des phases : sous la barre d\'outils, appui = défilement, suivi du défilement, clavier, fixe en haut', async (page) => {
  check(!(await page.locator('#phasebar').isVisible()), 'en ordre chronologique la barre des phases doit être cachée');
  check((await page.locator('#list .group').count()) === 0, 'en ordre chronologique la liste ne doit pas être groupée par phase');
  await page.click('#open-filters');
  check((await page.locator('[data-fk="f-group"]').count()) === 0, 'en ordre chronologique l\'option « Grouper par phase » doit être absente');
  await page.click('[data-fk="f-done"]');
  await page.click('[data-order="release"]');
  check((await page.locator('#list .group').count()) > 0, 'en ordre de sortie la liste est groupée par phase');
  await page.click('#open-filters');
  check((await page.locator('[data-fk="f-group"]').count()) === 1, 'en ordre de sortie l\'option « Grouper par phase » doit être proposée');
  await page.click('[data-fk="f-done"]');
  const after = await page.evaluate(() => Boolean(document.querySelector('.toolbar').compareDocumentPosition(document.querySelector('#phase-tabs')) & Node.DOCUMENT_POSITION_FOLLOWING));
  check(after, 'la barre des phases doit suivre la barre d\'outils');
  check((await page.locator('#phase-tabs [role=tab]').count()) === 6, 'six onglets de phase attendus (plus de « Toutes »)');
  const info = () => page.locator('#phase-info').innerText();
  const selected = () => page.evaluate(() => document.querySelector('#phase-tabs [aria-selected="true"]')?.dataset.phase);
  const total = await page.locator('#result-count').innerText();
  check((await selected()) === '1', 'en haut de la liste, la phase 1 devrait être suivie');

  await page.click('[data-fk="ptab:4"]');
  await page.waitForTimeout(150);
  check((await page.locator('#result-count').innerText()) === total, 'un appui sur un onglet ne doit rien masquer');
  check((await selected()) === '4' && /Saga du Multivers/.test(await info()), `phase 4 attendue : ${await info()}`);
  const gap = await page.evaluate(() => {
    const first = document.querySelector('#list [data-phase="4"]').getBoundingClientRect().top;
    return first - Math.max(document.querySelector('.appbar').getBoundingClientRect().bottom, document.querySelector('#phasebar').getBoundingClientRect().bottom);
  });
  check(gap >= -2 && gap <= 40, `le premier titre de la phase 4 devrait être juste sous la barre (écart ${Math.round(gap)} px)`);

  await page.click('[data-fk="ptab:2"]');
  await page.waitForTimeout(150);
  check(/Saga de l'Infini/.test(await info()), 'la phase 2 appartient à la Saga de l\'Infini');

  // Suivi : on défile à la main vers la phase 5 puis vers le haut
  await page.evaluate(() => { document.querySelector('#list [data-phase="5"]').scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(400);
  check((await selected()) === '5', `en défilant vers la phase 5, l'onglet devrait suivre (${await selected()})`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  check((await selected()) === '1', `en haut de la page, l'onglet devrait revenir à la phase 1 (${await selected()})`);

  await page.locator('[data-fk="ptab:3"]').focus();
  await page.keyboard.press('ArrowRight');
  check((await selected()) === '4' && (await page.evaluate(() => document.activeElement?.dataset?.fk === 'ptab:4')), 'flèche droite : phase 4 avec le focus');
  await page.keyboard.press('Home');
  check((await selected()) === '1', 'Début : phase 1');
  await page.keyboard.press('End');
  check((await selected()) === '6', 'Fin : phase 6');

  // Fixe : après défilement, la barre reste collée sous le titre (qui est lui aussi fixe)
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(200);
  const pos = await page.evaluate(() => ({ appbar: document.querySelector('.appbar').getBoundingClientRect().bottom, bar: document.querySelector('#phasebar').getBoundingClientRect().top }));
  check(Math.abs(pos.bar - pos.appbar) <= 1 && pos.appbar > 0, `la barre devrait être collée sous le titre (${JSON.stringify(pos)})`);
});

await scenario('barre des phases : sur un écran bas (paysage) elle défile avec la page', async (page) => {
  await page.click('[data-order="release"]');
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(200);
  const top = await page.evaluate(() => document.querySelector('#phasebar').getBoundingClientRect().top);
  check(top < 0, `sur un écran bas la barre ne doit pas rester collée (top ${Math.round(top)})`);
}, { viewport: { width: 640, height: 400 } });

await scenario('réglages : une seule section ouverte, conservée quand on change un réglage', async (page) => {
  await go(page, 'reglages');
  const open = () => page.evaluate(() => [...document.querySelectorAll('[data-sec]')].filter((d) => d.open).map((d) => d.dataset.sec));
  check(JSON.stringify(await open()) === '["look"]', `Apparence devrait être ouverte au départ : ${await open()}`);
  await page.click('[data-sec="follow"] summary');
  await page.waitForTimeout(100);
  check(JSON.stringify(await open()) === '["follow"]', `une seule section à la fois : ${await open()}`);
  await flip(page, 'follow:shorts', false);
  check(JSON.stringify(await open()) === '["follow"]', `la section doit rester ouverte après un changement : ${await open()}`);
  await openSec(page, 'look');
  await flip(page, 'theme:light', true);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'le thème Clair devrait s\'appliquer');
  check(JSON.stringify(await open()) === '["look"]', `Apparence doit rester ouverte après le changement de thème : ${await open()}`);
  check(/Clair/.test(await page.locator('[data-sec="look"] .desc').first().innerText()), 'le résumé devrait indiquer le thème choisi');
});

await scenario('bouton de thème du bandeau : visible partout, cycle Auto > Clair > Sombre, synchronisé avec Réglages', async (page) => {
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'auto');
  const label = () => page.getAttribute('#theme-toggle', 'aria-label');
  for (const route of ['voir', 'progression', 'reglages']) {
    await go(page, route);
    check(await page.locator('#theme-toggle').isVisible(), `le bouton de thème doit être visible sur ${route}`);
  }
  check(/Thème : Auto/.test(await label()), `libellé initial inattendu : ${await label()}`);
  await page.click('#theme-toggle');
  check((await theme()) === 'light' && /Thème : Clair/.test(await label()), `après un appui : Clair attendu (${await theme()}, ${await label()})`);
  check(/Clair/.test(await page.locator('#theme-status').innerText()), 'le changement doit être annoncé');
  await page.click('#theme-toggle');
  check((await theme()) === 'dark' && /Thème : Sombre/.test(await label()), `après deux appuis : Sombre attendu (${await theme()})`);
  await page.click('#theme-toggle');
  check((await theme()) === 'auto', 'après trois appuis : retour à Auto');
  await page.click('#theme-toggle');
  await go(page, 'reglages');
  check(await page.locator('[data-fk="theme:light"]').isChecked(), 'Réglages doit refléter le thème choisi avec le bouton');
  await reload(page);
  check((await theme()) === 'light', 'le thème choisi doit être conservé après rechargement');
});

await scenario('film à versions (Endgame Encore) : une seule case, durée et scènes suivent la version choisie', async (page) => {
  const row = () => page.locator('li.item', { has: page.locator('[data-fk="open:avengers-endgame"]') }).first();
  check(/Encore : nouvelle scène/.test(await row().innerText()), 'la liste doit signaler la version Encore et sa nouvelle scène');
  check(/3 h 01 min/.test(await row().innerText()), 'par défaut : durée d\'origine (3 h 01 min)');
  const total = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('chrono-mcu:v1'))?.versions ?? {}));
  await page.click('[data-fk="open:avengers-endgame"]');
  await page.locator('label.segopt', { has: page.locator('[data-fk="version:avengers-endgame:encore"]') }).click();
  check((await total())['avengers-endgame'] === 'encore', 'le choix de version doit être enregistré');
  await page.keyboard.press('Escape');
  check(/3 h 05 min/.test(await row().innerText()) && /version Encore/.test(await row().innerText()), `après le choix : 3 h 05 min et badge « version Encore » (${await row().innerText()})`);
  check(/post-générique/.test(await row().innerText()), 'la scène post-générique de l\'Encore doit être comptée');
  check((await page.locator('[data-fk="cb:avengers-endgame"]').count()) === 1, 'une seule case pour le film');
  await reload(page);
  check(/3 h 05 min/.test(await row().innerText()), 'le choix doit survivre au rechargement');
  await page.click('[data-fk="open:avengers-endgame"]');
  await page.locator('label.segopt', { has: page.locator('[data-fk="version:avengers-endgame:original"]') }).click();
  check(Object.keys(await total()).length === 0, 'revenir à l\'originale doit effacer le choix');
});

await scenario('résumé de la fiche : 3 lignes, « Voir plus » seulement si le texte est plus long', async (page) => {
  await page.click('[data-fk="open:moon-knight"]');
  const p = page.locator('#sheet .overview');
  await page.waitForSelector('[data-fk="more:moon-knight"]:not([hidden])');
  const lines = async () => page.evaluate(() => { const el = document.querySelector('#sheet .overview'); return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)); });
  check((await lines()) === 3, `le résumé long doit tenir sur 3 lignes, pas ${await lines()}`);
  await page.click('[data-fk="more:moon-knight"]');
  check((await lines()) > 3, 'après « Voir plus », le résumé doit être entier');
  check(/Voir moins/.test(await page.locator('[data-fk="more:moon-knight"]').innerText()), 'le bouton doit proposer « Voir moins »');
  check((await page.locator('[data-fk="more:moon-knight"]').getAttribute('aria-expanded')) === 'true', 'aria-expanded doit être vrai');
  await page.click('[data-fk="more:moon-knight"]');
  check((await lines()) === 3, '« Voir moins » doit replier à 3 lignes');
  await page.keyboard.press('Escape');
  await page.click('[data-fk="open:captain-america-first-avenger"]');
  await page.waitForSelector('#sheet .overview');
  await page.waitForTimeout(200);
  check(await page.locator('[data-fk="more:captain-america-first-avenger"]').isHidden(), 'un résumé court ne doit pas avoir de chevron');
  check(!!(await p.count()), 'le résumé court doit s\'afficher');
});

await scenario('mode sans spoiler : résumé, image et titres d\'épisodes floutés, un bouton révèle et re-floute', async (page) => {
  await go(page, 'reglages');
  await openSec(page, 'look');
  await flip(page, 's-spoiler', true);
  await go(page, 'voir');
  await page.click('[data-fk="open:wandavision"]');
  const blurs = () => page.locator('#sheet .spoiler-blur').count();
  check((await page.locator('#sheet .overview.spoiler-blur').count()) === 1, 'le résumé doit être flouté (et non retiré)');
  check((await page.locator('#sheet .overview').getAttribute('aria-hidden')) === 'true', 'le résumé flouté doit être caché aux lecteurs d\'écran');
  check(await page.locator('#sheet-hero .hero-img.spoiler-blur').count() === 1, 'l\'image paysage doit être floutée');
  check((await page.locator('#sheet .ep .spoiler-blur, #sheet .item .spoiler-blur').count()) >= 3, 'les titres d\'épisodes doivent être flous');
  check(/Ép\. 1 —/.test(await page.locator('#sheet').innerText()), 'le numéro de l\'épisode reste lisible');
  await page.click('[data-fk="reveal:wandavision"]');
  check((await blurs()) === 0 && (await page.locator('#sheet-hero .spoiler-blur').count()) === 0, '« Afficher les spoilers » doit tout révéler (résumé, image, épisodes)');
  check(/Masquer les spoilers/.test(await page.locator('[data-fk="spoilers:wandavision"]').innerText()), 'un bouton « Masquer les spoilers » doit apparaître');
  await page.click('[data-fk="spoilers:wandavision"]');
  check((await page.locator('#sheet .overview.spoiler-blur').count()) === 1 && (await page.locator('#sheet-hero .hero-img.spoiler-blur').count()) === 1, 'le second appui doit tout re-flouter');
  // Un clic « forcé » ignore ce qui recouvre la case : on la centre d'abord pour qu'elle ne passe pas sous le pied de fiche épinglé
  const epBox = page.locator('[data-fk="ep:wandavision/1"]');
  await epBox.evaluate((el) => el.closest('li').scrollIntoView({ block: 'center' }));
  await epBox.check({ force: true });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#sheet .episodes .item')].slice(0, 2).map((li) => li.querySelectorAll('.spoiler-blur').length));
  check(rows[0] === 0 && rows[1] === 1, `le titre de l\'épisode vu n\'est plus flou, le suivant le reste : ${rows}`);
  await epBox.evaluate((el) => el.closest('li').scrollIntoView({ block: 'center' }));
  await epBox.uncheck({ force: true });
});

await scenario('objectif : carte sur Progression, date modifiable, retirable', async (page) => {
  await go(page, 'progression');
  check(/Objectif : avant le 18\/12\/2026/.test(await page.locator('#progress-screen').innerText()), 'Doomsday doit être l\'objectif par défaut');
  check(/par semaine/.test(await page.locator('.goal').innerText()), 'la carte doit donner des heures par semaine');
  await go(page, 'reglages');
  await openSec(page, 'goal');
  await page.fill('[data-fk="s-goal"]', '2027-03-01');
  await go(page, 'progression');
  check(/avant le 01\/03\/2027/.test(await page.locator('.goal').innerText()), 'la nouvelle date doit s\'appliquer');
  await go(page, 'reglages');
  await openSec(page, 'goal');
  await page.click('[data-fk="s-goal-clear"]');
  await go(page, 'progression');
  check((await page.locator('.goal').count()) === 0, 'sans objectif, la carte disparaît');
  await reload(page);
  await go(page, 'progression');
  check((await page.locator('.goal').count()) === 0, 'l\'objectif retiré ne doit pas revenir au rechargement');
});

await scenario('rappel de sauvegarde réglable : « Jamais » supprime le rappel', async (page) => {
  check((await page.locator('#nudge .card-nudge').count()) === 1, 'avec beaucoup de coches et 30 jours par défaut, le rappel s\'affiche');
  await go(page, 'reglages');
  await openSec(page, 'data');
  await page.locator('label.segopt', { has: page.locator('[data-fk="nudge:0"]') }).click();
  await go(page, 'voir');
  check((await page.locator('#nudge .card-nudge').count()) === 0, 'avec « Jamais », plus de rappel');
  await reload(page);
  check((await page.locator('#nudge .card-nudge').count()) === 0, 'le choix doit survivre au rechargement');
}, { seed: { version: 2, order: 'chrono', seen: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, '2026-01-01'])), ignored: {}, lastSeenKey: null } });

await scenario('effacer ma progression : sauvegarde téléchargée, coches effacées, annulable', async (page) => {
  await page.click('[data-fk="cb:iron-man"]');
  await go(page, 'reglages');
  await openSec(page, 'data');
  await page.click('[data-fk="s-erase"]');
  check(/ta coche/.test(await page.locator('#sheet').innerText()), 'la feuille doit annoncer ce qui sera effacé');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-fk="e-confirm"]')]);
  check(download.suggestedFilename().startsWith('chrono-mcu-'), 'une sauvegarde doit être téléchargée avant l\'effacement');
  const seen = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('chrono-mcu:v1')).seen).length);
  check((await seen()) === 0, 'les coches doivent être effacées');
  check(/Progression effacée/.test(await page.locator('#snackbar').innerText()), 'un message avec « Annuler » doit apparaître');
  await page.click('#snackbar-action');
  check((await seen()) === 1, 'Annuler doit rendre la coche');
});

await scenario('affiches de la liste : toutes de la même taille, même avec des badges longs', async (page) => {
  // Les tests bloquent les images TMDB ; ici on sert une image de 1 pixel pour que les affiches existent
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route(/image\.tmdb\.org/, (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await reload(page);
  await page.waitForFunction(() => document.querySelectorAll('#list .poster').length > 5);
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll('#list .poster')].map((i) => `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`))]);
  check(sizes.length === 1, `toutes les affiches doivent avoir la même taille : ${sizes.join(', ')}`);
  // Cartes de même hauteur : l'affiche remplit la carte (144 px) pour tous les titres de début de liste
  const heights = await page.evaluate(() => [...document.querySelectorAll('#list li.item')].slice(0, 25).map((li) => ({
    card: Math.round(li.querySelector('.item-fg').getBoundingClientRect().height),
    poster: Math.round(li.querySelector('.poster').getBoundingClientRect().height),
  })));
  const distinct = [...new Set(heights.map((x) => x.card))];
  check(distinct.length === 1 && distinct[0] === 144, `toutes les cartes doivent avoir la même hauteur : ${distinct.join(', ')}`);
  check(heights.every((x) => x.poster === x.card), 'l\'affiche doit remplir toute la hauteur de la carte');
  // La case « vu » et le menu forment une colonne à droite : rien ne cache l'affiche, le menu est au-dessus de la case
  const layout = await page.evaluate(() => [...document.querySelectorAll('#list li.item:not(.upcoming)')].slice(0, 25).map((li) => {
    const p = li.querySelector('.poster').getBoundingClientRect();
    const cb = li.querySelector('.cb').getBoundingClientRect();
    const menu = li.querySelector('.item-menu').getBoundingClientRect();
    const card = li.querySelector('.item-fg').getBoundingClientRect();
    return { clearOfPoster: cb.left >= p.right && menu.left >= p.right, menuAbove: menu.bottom <= cb.top + 1, atRight: Math.abs(card.right - cb.right) <= 1 && Math.abs(card.right - menu.right) <= 1 };
  }));
  check(layout.every((x) => x.clearOfPoster), 'la case et le menu ne doivent pas recouvrir l\'affiche');
  check(layout.every((x) => x.menuAbove && x.atRight), 'le menu doit être en haut à droite et la case en bas à droite');
});

await scenario('Prochain à voir : bandeau fin, un appui retire la recherche, va à la ligne et ouvre la fiche', async (page) => {
  const bar = await page.locator('#resume .resume-bar').boundingBox();
  check(bar.height <= 96, `le bandeau doit rester fin (${Math.round(bar.height)} px)`);
  await page.fill('#search', 'thor');
  await page.waitForTimeout(200);
  const found = await page.locator('#list li.item').count();
  check(found >= 1 && found < 10, `la recherche doit réduire la liste (${found} titres)`);
  await page.click('[data-fk="resume-open"]');
  check((await page.inputValue('#search')) === '', 'la recherche doit être retirée pour retrouver la ligne');
  check((await page.locator('#list li.item').count()) > 10, 'la liste complète doit être revenue');
  check(/Captain America/.test(await page.locator('#sheet-title').innerText()), 'la fiche du prochain titre doit s\'ouvrir');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check((await page.locator('#list li.flash').count()) === 1, 'la ligne doit être mise en évidence à la fermeture de la fiche');
  const box = await page.locator('#list li.flash').boundingBox();
  check(box.y >= 0 && box.y + box.height <= 740, 'la ligne doit être visible à l\'écran');
});

await scenario('Prochain à voir : un épisode ouvre la série, défile jusqu\'à lui et le met en évidence ; le rond coche', async (page) => {
  check(/WandaVision · ép\. 2/.test(await page.locator('#resume .name').innerText()), `l'épisode suivant doit être proposé : ${await page.locator('#resume .name').innerText()}`);
  await page.click('[data-fk="resume-open"]');
  check(/WandaVision/.test(await page.locator('#sheet-title').innerText()), 'la fiche de la série doit s\'ouvrir');
  const ep = page.locator('#sheet li.item', { has: page.locator('[data-fk="ep:wandavision/2"]') });
  check((await ep.count()) === 1 && (await ep.getAttribute('class')).includes('flash'), 'l\'épisode doit être mis en évidence');
  const inView = await page.evaluate(() => { const li = document.querySelector('[data-fk="ep:wandavision/2"]').closest('li').getBoundingClientRect(); const body = document.querySelector('#sheet-body').getBoundingClientRect(); return li.top >= body.top - 1 && li.bottom <= body.bottom + 1; });
  check(inView, 'la fiche doit défiler jusqu\'à l\'épisode');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('chrono-mcu:v1')).seen).length);
  await page.click('[data-fk="resume-check"]');
  const after = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('chrono-mcu:v1')).seen).length);
  check(after === before + 1, 'le rond « coche » doit marquer l\'épisode vu sans ouvrir la fiche');
  check(!(await page.locator('#sheet').evaluate((d) => d.open)), 'le rond « coche » ne doit pas ouvrir la fiche');
}, { seed: { version: 2, order: 'chrono', seen: { 'wandavision/1': '2026-10-01' }, ignored: {}, lastSeenKey: 'wandavision/1' } });

await scenario('noir OLED : réglage conservé après rechargement, y compris en Auto', async (page) => {
  await go(page, 'reglages');
  await openSec(page, 'look');
  await flip(page, 's-oled', true);
  check(await page.evaluate(() => document.documentElement.dataset.oled !== undefined), 'data-oled absent après activation');
  await reload(page);
  check(await page.evaluate(() => document.documentElement.dataset.oled !== undefined), 'data-oled absent après rechargement');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(0, 0, 0)', `le fond devrait être noir pur en sombre, reçu ${bg}`);
}, { colorScheme: 'dark' });

await scenario('migration : un état v1 avec notes passe en v2, l\'ancien est gardé', async (page) => {
  const state = await stored(page);
  check(state.version === 2 && !('notes' in state), 'état non migré');
  check(state.seen.f1 === '2026-10-01', 'les coches ont été perdues');
  const backup = await page.evaluate(() => localStorage.getItem('chrono-mcu:v1:pre-v2'));
  check(backup && JSON.parse(backup).notes, 'la copie de secours de l\'ancien état est absente');
}, { seed: { version: 1, order: 'chrono', seen: { f1: '2026-10-01' }, notes: { f1: { rating: 4, text: 'top' } }, lastSeenKey: 'f1' } });

const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`seed${i}`, '2026-10-01']));
await scenario('rappel de sauvegarde : affiché, reportable, disparaît après un export', async (page) => {
  check(await page.locator('#nudge .card-nudge').count() === 1, 'le rappel devrait s\'afficher');
  await page.click('[data-fk="nudge-later"]');
  check(await page.locator('#nudge .card-nudge').count() === 0, 'le rappel devrait disparaître après « Plus tard »');
  await reload(page);
  check(await page.locator('#nudge .card-nudge').count() === 0, 'le rappel reporté ne devrait pas revenir tout de suite');
  const view = await page.evaluate(() => JSON.parse(localStorage.getItem('chrono-mcu:view')));
  check(view.nudgeUntil, 'la date de report n\'est pas enregistrée');
}, { seed: { version: 2, order: 'chrono', seen: many, ignored: {}, lastSeenKey: null } });

await scenario('rappel de sauvegarde : « Exporter maintenant » enregistre la sauvegarde', async (page) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-fk="nudge-export"]')]);
  check(download.suggestedFilename().startsWith('chrono-mcu-'), 'nom de fichier inattendu');
  check(await page.locator('#nudge .card-nudge').count() === 0, 'le rappel devrait disparaître après l\'export');
  await go(page, 'reglages');
  await openSec(page, 'data');
  const text = await page.locator('#settings-screen').innerText();
  check(/Dernière sauvegarde : \d\d\/\d\d\/\d{4} \(aujourd'hui\)/.test(text), 'Réglages devrait afficher la dernière sauvegarde');
}, { seed: { version: 2, order: 'chrono', seen: many, ignored: {}, lastSeenKey: null } });

await browser.close();
closeServer();
console.log(`${scenarios} scénarios de comportement exécutés.`);
if (failures.length) {
  console.log(`${failures.length} problème(s) :`);
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Aucun problème détecté.');
