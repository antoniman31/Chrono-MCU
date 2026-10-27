import { sortTitles } from './logic.js?v=__BUILD__';
import { exportState, importState, isTitleSeen, loadState, saveState, setNote, setPhaseSeen, setTitleSeen, toggleUnit } from './store.js?v=__BUILD__';
import { loadView, saveView } from './prefs.js?v=__BUILD__';
import { $, h, today } from './ui/dom.js?v=__BUILD__';
import { renderDetail, renderDetailEmpty } from './ui/detail.js?v=__BUILD__';
import { backdropImg } from './ui/parts.js?v=__BUILD__';
import { closeSheet, openSheet, refreshSheet, setupSheet, sheetKind } from './ui/sheet.js?v=__BUILD__';
import { renderProgression } from './ui/progression.js?v=__BUILD__';
import { renderBackupSheet, renderReglages } from './ui/reglages.js?v=__BUILD__';
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
  titles: [],
  byId: new Map(),
  state: loadState(storage),
  view: loadView(storage),
  filters: { tab: 'all', query: '', phase: null, hideSeen: false },
  selectedId: null,
  sheetDetailId: null,
  route: 'voir',
  pendingImport: null,
  backupError: '',
  versionLabel: BUILD.startsWith('__') ? 'Version locale' : `Version ${BUILD}`,
};

let storageWarned = false;
let undoSnapshot = null;
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

/* ---------- Message d'erreur global et snackbar ---------- */
function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.className = isError ? 'error' : '';
  el.hidden = !text;
}

function hideSnackbar() {
  clearTimeout(snackTimer);
  undoSnapshot = null;
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
  document.querySelectorAll('.nav-item').forEach((a) => {
    if (a.dataset.route === ctx.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  ROUTES.forEach((r) => { $(`screen-${r}`).hidden = r !== ctx.route; });
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
    undoSnapshot = before;
    showSnackbar(label, true);
  } else if (!label) hideSnackbar();
  render({ detail });
  if (detail) refreshSheet();
}
ctx.update = update;

ctx.toggleTitle = (t) => {
  const seen = isTitleSeen(ctx.state, t);
  update(setTitleSeen(ctx.state, t, !seen, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title}`);
};
ctx.toggleEpisode = (t, e, seen) => update(toggleUnit(ctx.state, `${t.id}/${e.n}`, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title} ép. ${e.n}`);
ctx.toggleUnit = (unit, label) => update(toggleUnit(ctx.state, unit.key, today()), `Vu : ${label}`);
ctx.togglePhase = (phase, all) =>
  update(setPhaseSeen(ctx.state, sortTitles(ctx.titles, ctx.state.order), phase, !all, today()), `${all ? 'Décoché' : 'Coché'} : phase ${phase}`);
ctx.setNote = (id, patch) => {
  ctx.state = setNote(ctx.state, id, patch);
  saveState(storage, ctx.state);
  render({ detail: false });
};
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
  refreshSheet();
};
ctx.toggleCollapse = (phase) => {
  const set = new Set(ctx.view.collapsedPhases);
  if (!set.delete(phase)) set.add(phase);
  ctx.setView({ collapsedPhases: [...set] });
};

/* ---------- Feuilles et fiche ---------- */
ctx.closeSheet = closeSheet;

ctx.openDetail = (id, opener = null, { focus = null } = {}) => {
  const t = ctx.byId.get(id);
  if (!t) return;
  if (isExpanded()) {
    ctx.selectedId = id;
    ctx.sheetDetailId = null;
    closeSheet();
    render();
    const pane = $('detail-pane');
    (focus === 'notes' ? pane.querySelector('.stars input') : null)?.focus();
    return;
  }
  ctx.sheetDetailId = id;
  openSheet({
    title: t.title, kind: 'detail', opener: opener ?? document.activeElement,
    hero: backdropImg(t, ctx.view),
    render: (body) => renderDetail(body, ctx, id, { showTitle: false }),
    onClose: () => { ctx.sheetDetailId = null; },
  });
  if (focus === 'notes') $('sheet-body').querySelector('.stars input')?.focus();
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
  closeSheet();
  showSnackbar('Progression exportée', false);
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
    ctx.titles = await res.json();
  } catch (e) {
    showMessage(`Impossible de charger le catalogue (${e.message}).`, true);
    return;
  }
  ctx.byId = new Map(ctx.titles.map((t) => [t.id, t]));
  ctx.route = routeFromHash();

  setupVoir(ctx);
  $('snackbar-action').addEventListener('click', () => {
    if (!undoSnapshot) return;
    const snapshot = undoSnapshot;
    hideSnackbar();
    update(snapshot);
  });
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
  expandedQuery.addEventListener?.('change', () => {
    if (isExpanded() && sheetKind() === 'detail') {
      ctx.selectedId = ctx.sheetDetailId;
      closeSheet();
    }
    if (!isExpanded()) ctx.selectedId = null;
    render();
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => ctx.view.theme === 'auto' && applyTheme());

  applyTheme();
  render();
  document.getElementById('app')?.setAttribute('data-ready', 'true');
  document.body.dataset.ready = 'true';
}

main();
