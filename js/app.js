import { FILTER_DEFAULTS, countedTitles, releasedView, sortTitles, withVersions } from './logic.js?v=__BUILD__';
import { exportState, importState, isTitleSeen, loadState, markUntil, pendingUntil, saveState, setPhaseSeen, setSkip, setTitleIgnored, setTitleVersion, setTitleSeen, toggleUnit } from './store.js?v=__BUILD__';
import { loadView, saveView } from './prefs.js?v=__BUILD__';
import { dispatchSync, isDone, latestRun, loadToken, runLabel, saveToken } from './github.js?v=__BUILD__';
import { addDays, SNOOZE_DAYS } from './backup.js?v=__BUILD__';
import { categoryLabel, effectiveIgnored } from './categories.js?v=__BUILD__';
import { $, h, icon, today } from './ui/dom.js?v=__BUILD__';
import { renderDetail, renderDetailEmpty } from './ui/detail.js?v=__BUILD__';
import { backdropImg } from './ui/parts.js?v=__BUILD__';
import { closeSheet, openSheet, refreshSheet, setupSheet, sheetKind } from './ui/sheet.js?v=__BUILD__';
import { renderWelcomeSheet } from './ui/welcome.js?v=__BUILD__';
import { achievementInput, renderProgression, showAchievementsTab } from './ui/progression.js?v=__BUILD__';
import { evaluate, mergeUnlocked, unlockMessage } from './achievements.js?v=__BUILD__';
import { renderBackupSheet, renderEraseSheet, renderReglages } from './ui/reglages.js?v=__BUILD__';
import { renderFiltersSheet, renderItemMenu, renderVoir, setupVoir } from './ui/voir.js?v=__BUILD__';

// Remplacé par l'identifiant du commit au déploiement (contourne le cache de 10 min de GitHub Pages): voir .github/workflows/pages.yml
const BUILD = '__BUILD__';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const ROUTES = ['voir', 'progression', 'reglages'];
const ROUTE_TITLES = { voir: 'À voir', progression: 'Progression', reglages: 'Réglages' };
const expandedQuery = window.matchMedia('(min-width: 840px)');
const isExpanded = () => expandedQuery.matches;

const ctx = {
  rawTitles: [], // catalogue tel que dans data/mcu.json
  allTitles: [], // catalogue complet (fiches, épisodes à venir), versions choisies appliquées
  titles: [], // catalogue « sorti » à la date du jour : tout ce qui se compte (voir releasedView)
  ignoredMap: {}, // titres ignorés (explicitement ou par catégorie) : { id: true }
  counted: [],
  byId: new Map(), // titres complets
  availById: new Map(), // titres sortis
  state: loadState(storage),
  view: loadView(storage),
  filters: { tab: 'all', query: '', phase: null, ...FILTER_DEFAULTS },
  selectedId: null,
  sheetDetailId: null,
  route: 'voir',
  pendingImport: null,
  backupError: '',
  persisted: null,
  versionLabel: BUILD.startsWith('__') ? 'Version locale' : `Version ${BUILD}`,
};

let storageWarned = false;
let persistAsked = false;
// Historique des actions annulables (en mémoire, jusqu'au rechargement) : { before: état d'avant, label }
const HISTORY_MAX = 20;
const history = [];
let snackTimer = null;
let snackPaused = false;

/* ---------- Thème ---------- */
function applyTheme() {
  const root = document.documentElement;
  const { theme, oled } = ctx.view;
  delete root.dataset.theme;
  delete root.dataset.oled;
  if (theme === 'light') root.dataset.theme = 'light';
  else if (theme === 'dark') root.dataset.theme = oled ? 'oled' : 'dark';
  else if (oled) root.dataset.oled = ''; // Auto : le CSS applique le noir OLED seulement quand le système est sombre
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

// Bouton du bandeau : Auto, puis Clair, puis Sombre, puis retour à Auto. L'icône montre le mode actuel.
const THEME_CYCLE = ['auto', 'light', 'dark'];
const THEME_INFO = { auto: ['contrast', 'Auto'], light: ['light-mode', 'Clair'], dark: ['dark-mode', 'Sombre'] };
function renderThemeToggle() {
  const [iconName, label] = THEME_INFO[ctx.view.theme] ?? THEME_INFO.auto;
  const next = THEME_INFO[THEME_CYCLE[(THEME_CYCLE.indexOf(ctx.view.theme) + 1) % THEME_CYCLE.length]][1];
  const btn = $('theme-toggle');
  btn.setAttribute('aria-label', `Thème : ${label}. Passer à ${next}`);
  btn.title = `Thème : ${label}`;
  btn.firstElementChild.replaceChildren(icon(iconName));
}

/* ---------- Stockage durable ---------- */
// Demande au navigateur de ne pas effacer les données du site (une fois par session, dès la première coche)
function requestPersistence() {
  if (persistAsked || !navigator.storage?.persist || !Object.keys(ctx.state.seen).length) return;
  persistAsked = true;
  navigator.storage.persist().then((ok) => {
    ctx.persisted = ok;
    if (ctx.route === 'reglages') render({ detail: false });
  }).catch(() => {});
}

/* ---------- Message d'erreur global et snackbar ---------- */
function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.className = isError ? 'error' : '';
  el.hidden = !text;
}

function hideSnackbar() {
  clearTimeout(snackTimer);
  $('snackbar').hidden = true;
}

function armSnackbar() {
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => {
    if (snackPaused) armSnackbar();
    else hideSnackbar();
  }, 10000);
}

function showSnackbar(text, action) {
  $('snackbar-text').textContent = text;
  $('snackbar-action').hidden = !action;
  $('snackbar').hidden = false;
  armSnackbar();
}

/* ---------- Synchronisation du catalogue ---------- */
let syncPolling = 0;
const setSyncStatus = (text, url = null) => {
  const el = $('sync-status');
  if (!el) return;
  el.replaceChildren(text, ...(url ? [' ', h('a', { href: url, target: '_blank', rel: 'noopener', text: 'Voir le journal' })] : []));
};
ctx.hasGithubToken = () => loadToken(storage) !== null;
ctx.saveGithubToken = (token) => { if (saveToken(storage, token)) render({ detail: false }); };
ctx.forgetGithubToken = () => { saveToken(storage, null); syncPolling += 1; render({ detail: false }); };
ctx.runSync = async () => {
  const token = loadToken(storage);
  if (!token) return;
  const since = Date.now();
  const mine = (syncPolling += 1);
  setSyncStatus('Envoi de la demande à GitHub…');
  const sent = await dispatchSync(token);
  if (!sent.ok) return setSyncStatus(sent.message);
  setSyncStatus(runLabel(null));
  // GitHub met quelques secondes à créer le lancement : on interroge toutes les 6 s, pendant 5 minutes au plus
  for (let i = 0; i < 50 && syncPolling === mine; i += 1) {
    await new Promise((r) => setTimeout(r, ctx.syncPollMs ?? 6000));
    if (syncPolling !== mine) return;
    const run = await latestRun(token, since);
    if (run) setSyncStatus(runLabel(run), isDone(run) ? run.url : null);
    if (isDone(run)) return;
  }
};

/* ---------- Succès ---------- */
let achvTimer = null;
function hideAchievementToast() {
  clearTimeout(achvTimer);
  $('achv-toast').hidden = true;
}

// Recalcule les succès après un changement d'état ou de réglage ; annonce les nouveaux paliers (rien au tout premier calcul)
function checkAchievements() {
  if (!ctx.counted.length) return;
  const { next, unlocked, changed } = mergeUnlocked(ctx.view.achv, evaluate(achievementInput(ctx)), today());
  if (changed) {
    ctx.view.achv = next;
    saveView(storage, ctx.view);
  }
  if (!unlocked.length) return;
  $('achv-text').textContent = unlockMessage(unlocked);
  $('achv-toast').hidden = false;
  clearTimeout(achvTimer);
  achvTimer = setTimeout(hideAchievementToast, 9000);
}

/* ---------- Rendu ---------- */
function renderDetailPane() {
  const pane = $('detail-pane');
  if (!isExpanded()) {
    pane.replaceChildren();
    return;
  }
  if (ctx.selectedId) renderDetail(pane, ctx, ctx.selectedId, { showTitle: true });
  else renderDetailEmpty(pane);
}

function render({ detail = true } = {}) {
  ctx.allTitles = withVersions(ctx.rawTitles, ctx.state.versions);
  ctx.byId = new Map(ctx.allTitles.map((t) => [t.id, t]));
  ctx.titles = releasedView(ctx.allTitles, today());
  ctx.availById = new Map(ctx.titles.map((t) => [t.id, t]));
  ctx.ignoredMap = effectiveIgnored(ctx.state, ctx.allTitles);
  ctx.counted = countedTitles(ctx.titles, ctx.ignoredMap);
  document.querySelectorAll('.nav-item').forEach((a) => {
    if (a.dataset.route === ctx.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  ROUTES.forEach((r) => { $(`screen-${r}`).hidden = r !== ctx.route; });
  renderThemeToggle();
  document.title = `${ROUTE_TITLES[ctx.route]} · Chrono-MCU`;
  if (ctx.route === 'voir') renderVoir(ctx);
  else if (ctx.route === 'progression') renderProgression(ctx);
  else renderReglages(ctx);
  if (detail) renderDetailPane();
}
ctx.render = render;

/* ---------- Mises à jour de l'état ---------- */
function update(next, label = null, { detail = true } = {}) {
  const before = ctx.state;
  ctx.state = next;
  if (!saveState(storage, ctx.state) && !storageWarned) {
    storageWarned = true;
    showMessage('Stockage local indisponible : la progression ne sera pas conservée. Utilise l\'export dans Réglages.', true);
  }
  if (label && next !== before) {
    history.push({ before, label });
    if (history.length > HISTORY_MAX) history.shift();
    showSnackbar(label, true);
  } else if (!label) hideSnackbar();
  render({ detail });
  checkAchievements();
  if (detail) refreshSheet();
  requestPersistence();
}
ctx.update = update;

// Annule la dernière action de l'historique (la même que le bouton de la snackbar, ou celle de Réglages)
ctx.undoLast = () => {
  const entry = history.pop();
  if (!entry) return;
  hideSnackbar();
  update(entry.before);
};
ctx.historyInfo = () => ({ count: history.length, last: history.at(-1)?.label ?? null });

// Retour tactile à la coche : petite vibration (si l'appareil la permet) et animation du rond, sauf réglage coupé
ctx.feedback = (key) => {
  if (!ctx.view.feedback) return;
  navigator.vibrate?.(12);
  const el = document.querySelector(`[data-fk="${CSS.escape(key)}"]`)?.closest('.cb');
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
};

ctx.toggleTitle = (full) => {
  const t = ctx.availById.get(full.id) ?? full; // seuls les épisodes sortis se cochent
  const seen = isTitleSeen(ctx.state, t);
  update(setTitleSeen(ctx.state, t, !seen, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title}`);
  if (!seen) ctx.feedback(`cb:${t.id}`);
};
ctx.toggleEpisode = (t, e, seen) => {
  update(toggleUnit(ctx.state, `${t.id}/${e.n}`, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title} ép. ${e.n}`);
  if (!seen) ctx.feedback(`ep:${t.id}/${e.n}`);
};
ctx.toggleUnit = (unit, label) => update(toggleUnit(ctx.state, unit.key, today()), `Vu : ${label}`);
ctx.togglePhase = (phase, all) =>
  update(setPhaseSeen(ctx.state, sortTitles(ctx.counted, ctx.state.order), phase, !all, today()), `${all ? 'Décoché' : 'Coché'} : phase ${phase}`);
// Rattrapage : tout marquer comme vu jusqu'à ce titre (inclus), dans l'ordre actif
ctx.pendingUntilCount = (t) => new Set(pendingUntil(ctx.state, ctx.titles, t.id).map((u) => u.titleId)).size;
ctx.markUntil = (t) => {
  const count = ctx.pendingUntilCount(t);
  update(markUntil(ctx.state, ctx.titles, t.id, today()), `${count} titre${count > 1 ? 's' : ''} marqué${count > 1 ? 's' : ''} comme vu${count > 1 ? 's' : ''}`);
};
ctx.toggleIgnore = (t) => {
  const ignored = Boolean(ctx.ignoredMap[t.id]);
  update(setTitleIgnored(ctx.state, t, !ignored), `${ignored ? 'Réintégré' : 'Ignoré'} : ${t.title}`);
};
ctx.setVersion = (title, versionId) => {
  const v = title.versions?.find((x) => x.id === versionId);
  update(setTitleVersion(ctx.state, title.id, versionId), `${title.title} : version ${v ? v.label : 'd\'origine'}`);
};
ctx.setSkip = (id, skipped) => update(setSkip(ctx.state, id, skipped, ctx.allTitles), `${categoryLabel(id)} : ${skipped ? 'non suivi' : 'suivi'}`);
ctx.setFilter = (patch) => {
  Object.assign(ctx.filters, patch);
  render();
  refreshSheet();
};
ctx.setView = (patch) => {
  Object.assign(ctx.view, patch);
  saveView(storage, ctx.view);
  if ('theme' in patch || 'oled' in patch) applyTheme();
  render();
  if ('spoilerFree' in patch || 'goalDate' in patch) checkAchievements();
  refreshSheet();
};
ctx.markBackedUp = () => ctx.setView({ lastBackup: { day: today(), seenCount: Object.keys(ctx.state.seen).length }, nudgeUntil: null });
ctx.snoozeNudge = () => ctx.setView({ nudgeUntil: addDays(today(), SNOOZE_DAYS) });
ctx.toggleCollapse = (phase) => {
  const set = new Set(ctx.view.collapsedPhases);
  if (!set.delete(phase)) set.add(phase);
  ctx.setView({ collapsedPhases: [...set] });
};

/* ---------- Feuilles et fiche ---------- */
ctx.closeSheet = closeSheet;

ctx.openDetail = (id, opener = null) => {
  const t = ctx.byId.get(id);
  if (!t) return;
  if (isExpanded()) {
    ctx.selectedId = id;
    ctx.sheetDetailId = null;
    closeSheet();
    render();
    return;
  }
  ctx.sheetDetailId = id;
  openSheet({
    title: t.title, kind: 'detail', opener: opener ?? document.activeElement,
    hero: backdropImg(t, ctx.view), // mode sans spoiler : renderDetail la floute tant qu'elle n'est pas révélée
    render: (body) => renderDetail(body, ctx, id, { showTitle: false, showPoster: false }),
    onClose: () => {
      ctx.sheetDetailId = null;
      // Venu de « Prochain à voir » : la ligne se met en évidence quand la fiche se referme
      if (ctx.flashOnClose) {
        const id2 = ctx.flashOnClose;
        ctx.flashOnClose = null;
        flashRow(document.querySelector(`#list [data-fk="open:${id2}"]`)?.closest('li'));
      }
    },
  });
};

/* ---------- « Prochain à voir » : aller à la ligne, ouvrir la fiche ---------- */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mise en évidence brève (halo qui s'éteint ; anneau fixe si l'animation est réduite)
function flashRow(li) {
  if (!li) return;
  li.classList.add('flash');
  setTimeout(() => li.classList.remove('flash'), 1600);
}

ctx.goToNext = (unit, opener) => {
  const id = unit.titleId;
  const t = ctx.byId.get(id);
  if (!t) return;
  // On retire ce qui cacherait la ligne : recherche et onglet Films / Séries ; un groupe de phase replié est déplié
  ctx.filters.query = '';
  $('search').value = '';
  ctx.filters.tab = 'all';
  if (ctx.view.collapsedPhases.includes(t.phase) && ctx.view.groupByPhase && ctx.state.order !== 'chrono') ctx.toggleCollapse(t.phase);
  render();
  const row = () => document.querySelector(`#list [data-fk="open:${id}"]`)?.closest('li');
  row()?.scrollIntoView({ block: 'center', behavior: isExpanded() && !reducedMotion() ? 'smooth' : 'auto' });
  ctx.openDetail(id, row()?.querySelector('[data-fk^="open:"]') ?? opener);
  if (isExpanded()) flashRow(row());
  else ctx.flashOnClose = id;
  // Épisode : la fiche défile jusqu'à lui et le met en évidence
  if (unit.kind === 'episode') {
    const ep = document.querySelector(`[data-fk="ep:${id}/${unit.n}"]`)?.closest('li');
    ep?.scrollIntoView({ block: 'center' });
    flashRow(ep);
  }
};
ctx.openItemMenu = (id, opener) => openSheet({ title: ctx.byId.get(id).title, kind: 'menu', opener, render: (body) => renderItemMenu(body, ctx, id) });
ctx.openFilters = (opener) => openSheet({ title: 'Filtres', kind: 'filters', opener, render: (body) => renderFiltersSheet(body, ctx) });
ctx.openBackup = (opener) => {
  ctx.backupError = '';
  ctx.pendingImport = null;
  openSheet({ title: 'Sauvegarde et restauration', kind: 'backup', opener, render: (body) => renderBackupSheet(body, ctx), onClose: () => { ctx.pendingImport = null; ctx.backupError = ''; } });
};

/* ---------- Export / import ---------- */
ctx.exportProgress = () => {
  const url = URL.createObjectURL(new Blob([exportState(ctx.state)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `chrono-mcu-${today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ctx.markBackedUp();
  closeSheet();
  showSnackbar('Progression exportée', false);
};
ctx.openWelcome = (opener) => openSheet({
  title: 'Bienvenue', kind: 'welcome', opener, render: (body) => renderWelcomeSheet(body, ctx),
  onClose: () => { if (!ctx.view.welcomed) ctx.setView({ welcomed: true }); },
});
ctx.openErase = (opener) => openSheet({ title: 'Effacer ma progression', kind: 'erase', opener, render: (body) => renderEraseSheet(body, ctx) });
ctx.eraseProgress = () => {
  const before = ctx.state;
  ctx.exportProgress(); // télécharge la sauvegarde, ferme la feuille
  // On n'efface que l'avancement : coches, rattrapage, dernière coche et versions regardées (le reste est un choix de suivi)
  update({ ...before, seen: {}, catchUp: {}, lastSeenKey: null, versions: {} }, 'Progression effacée');
};
ctx.chooseImportFile = () => $('import-file').click();
ctx.cancelImport = () => {
  ctx.pendingImport = null;
  refreshSheet();
};
ctx.confirmImport = () => {
  const next = ctx.pendingImport;
  ctx.pendingImport = null;
  closeSheet();
  update(next, 'Progression importée');
  ctx.markBackedUp();
};

/* ---------- Navigation ---------- */
function routeFromHash() {
  const r = location.hash.replace('#', '');
  return ROUTES.includes(r) ? r : 'voir';
}

function onRouteChange() {
  ctx.route = routeFromHash();
  closeSheet();
  render();
  window.scrollTo(0, 0);
  $(`h-${ctx.route}`).focus({ preventScroll: true });
}

/* ---------- Démarrage ---------- */
async function main() {
  setupSheet();
  try {
    const res = await fetch('data/mcu.json?v=__BUILD__');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ctx.rawTitles = await res.json();
    ctx.allTitles = withVersions(ctx.rawTitles, ctx.state.versions);
    ctx.titles = ctx.allTitles;
  } catch (e) {
    showMessage(`Impossible de charger le catalogue (${e.message}).`, true);
    return;
  }
  ctx.byId = new Map(ctx.allTitles.map((t) => [t.id, t]));
  ctx.route = routeFromHash();

  setupVoir(ctx);
  $('theme-toggle').addEventListener('click', () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(ctx.view.theme) + 1) % THEME_CYCLE.length];
    ctx.setView({ theme: next });
    $('theme-status').textContent = `Thème : ${THEME_INFO[next][1]}`;
  });
  $('achv-view').addEventListener('click', () => {
    hideAchievementToast();
    showAchievementsTab();
    if (ctx.route === 'progression') render({ detail: false });
    else location.hash = '#progression';
  });
  $('snackbar-action').addEventListener('click', () => ctx.undoLast());
  const snack = $('snackbar');
  snack.addEventListener('pointerenter', () => { snackPaused = true; });
  snack.addEventListener('pointerleave', () => { snackPaused = false; });
  snack.addEventListener('focusin', () => { snackPaused = true; });
  snack.addEventListener('focusout', () => { snackPaused = false; });

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const result = importState(await file.text());
    ctx.backupError = result.ok ? '' : result.error;
    ctx.pendingImport = result.ok ? result.state : null;
    refreshSheet();
  });

  window.addEventListener('hashchange', onRouteChange);
  // Onglet resté ouvert d'un jour à l'autre : les sorties du jour doivent apparaître au retour
  let renderedDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today() !== renderedDay) {
      renderedDay = today();
      render();
    }
  });
  expandedQuery.addEventListener?.('change', () => {
    if (isExpanded() && sheetKind() === 'detail') {
      ctx.selectedId = ctx.sheetDetailId;
      closeSheet();
    }
    if (!isExpanded()) ctx.selectedId = null;
    render();
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => ctx.view.theme === 'auto' && applyTheme());

  navigator.storage?.persisted?.().then((ok) => { ctx.persisted = ok; }).catch(() => {});
  applyTheme();
  render();
  checkAchievements();
  // Accueil : une seule fois, et seulement si rien n'est encore coché (sinon on le considère comme déjà vu)
  if (!ctx.view.welcomed) {
    if (Object.keys(ctx.state.seen).length) ctx.setView({ welcomed: true });
    else ctx.openWelcome(null);
  }
  // Hors-ligne : seulement sur un build déployé (sw.js porte alors un identifiant de version)
  if ('serviceWorker' in navigator && !BUILD.startsWith('__')) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.getElementById('app')?.setAttribute('data-ready', 'true');
  document.body.dataset.ready = 'true';
}

main();
