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

async function scenario(name, run, { prefs = null, seed = null, colorScheme = 'light', viewport = { width: 360, height: 740 } } = {}) {
  scenarios += 1;
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce', acceptDownloads: true });
  await context.route(/image\.tmdb\.org/, (route) => route.abort());
  // Les valeurs de départ ne sont posées qu'une fois (pas à chaque rechargement), pour pouvoir tester la persistance
  await context.addInitScript(([p, s]) => {
    try {
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      if (p) localStorage.setItem('chrono-mcu:view', JSON.stringify(p));
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
  await page.click('[data-fk="s-backup"]');
  await page.setInputFiles('#import-file', path);
  await page.click('[data-fk="b-confirm"]');
  await go(page, 'voir');
  check(await checked(page, 'cb:iron-man'), 'l\'import n\'a pas restauré la coche');

  // Un fichier invalide ne change rien et affiche un message
  await go(page, 'reglages');
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
  check(await page.locator('[data-fk="open:wandavision"]').count() === 1, 'la recherche par titre d\'origine devrait trouver la série');
  await page.fill('#search', fr.titleFr.slice(0, 8));
  check(await page.locator('[data-fk="open:wandavision"]').count() === 1, 'la recherche par titre français devrait trouver la série');
});

await scenario('catégories : couper les séries, réintégrer un titre, tout persiste', async (page) => {
  const data = await page.evaluate(async () => (await fetch('data/mcu.json')).json());
  const films = data.filter((t) => t.type === 'film' && !t.upcoming).length;
  const loki = data.find((t) => t.id === 'loki-saison-1').episodes.length;
  const full = await progressTotal(page);
  await go(page, 'reglages');
  const summary = await page.locator('.follow-total').innerText();
  check(/titres suivis/.test(summary), `résumé du suivi inattendu : ${summary}`);
  await page.locator('[data-fk="follow:series"]').uncheck({ force: true });
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
  await page.locator('[data-fk="follow:series"]').check({ force: true });
  const back = await stored(page);
  check(back.skip.length === 0 && Object.keys(back.included).length === 0, 'suivre à nouveau la catégorie doit effacer la réintégration');
  check((await progressTotal(page)).total === full.total, 'tout le catalogue devrait être de retour');
});

await scenario('barre des phases : sous la barre d\'outils, appui = défilement, suivi du défilement, clavier, fixe en haut', async (page) => {
  check(!(await page.locator('#phasebar').isVisible()), 'en ordre chronologique la barre des phases doit être cachée');
  await page.click('[data-order="release"]');
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
  check((await selected()) === '4' && /Phase 4 · Saga du Multivers/.test(await info()), `phase 4 attendue : ${await info()}`);
  const gap = await page.evaluate(() => {
    const first = document.querySelector('#list [data-phase="4"]').getBoundingClientRect().top;
    return first - Math.max(document.querySelector('.appbar').getBoundingClientRect().bottom, document.querySelector('#phasebar').getBoundingClientRect().bottom);
  });
  check(gap >= -2 && gap <= 40, `le premier titre de la phase 4 devrait être juste sous la barre (écart ${Math.round(gap)} px)`);

  await page.click('[data-fk="ptab:2"]');
  await page.waitForTimeout(150);
  check(/Phase 2 · Infinity Saga/.test(await info()), 'la phase 2 appartient à l\'Infinity Saga');

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

await scenario('noir OLED : réglage conservé après rechargement, y compris en Auto', async (page) => {
  await go(page, 'reglages');
  await page.locator('[data-fk="s-oled"]').check({ force: true });
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
