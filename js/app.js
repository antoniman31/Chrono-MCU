import { filterTitles, nextToWatch, normalizeText, progress, resumeFrom, sortTitles, stats, toUnits } from './logic.js?v=__BUILD__';
import {
  exportState, importState, isTitleSeen, loadState, saveState, setNote, setOrder, setPhaseSeen, setTitleSeen, toggleUnit,
} from './store.js?v=__BUILD__';

const $ = (id) => document.getElementById(id);

// Remplacé par l'identifiant du commit au déploiement (cache-busting): voir .github/workflows/pages.yml
const BUILD = '__BUILD__';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let titles = [];
let state = loadState(storage);
const filters = { phase: null, type: null, query: '', hideSeen: false };
const openSeries = new Set();
const openNotes = new Set();
let storageWarned = false;

const VIEW_KEY = 'chrono-mcu:view';
const THEMES = ['auto', 'light', 'dark', 'oled'];
const view = (() => {
  try {
    const saved = JSON.parse(storage?.getItem(VIEW_KEY));
    return {
      groupByPhase: saved?.groupByPhase !== false,
      showPosters: saved?.showPosters !== false,
      collapsedPhases: Array.isArray(saved?.collapsedPhases) ? saved.collapsedPhases.filter(Number.isInteger) : [],
      theme: THEMES.includes(saved?.theme) ? saved.theme : 'auto',
    };
  } catch {
    return { groupByPhase: true, showPosters: true, collapsedPhases: [], theme: 'auto' };
  }
})();
function applyTheme() {
  const root = document.documentElement;
  if (view.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = view.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

const saveView = () => {
  try {
    storage?.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* préférence d'affichage: sans importance si elle n'est pas conservée */
  }
};

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const today = () => new Date().toLocaleDateString('en-CA');
const hours = (min) => `${(min / 60).toFixed(1).replace('.', ',')} h`;
const formatDay = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const titleById = () => new Map(titles.map((t) => [t.id, t]));

function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.className = isError ? 'error' : '';
  el.hidden = !text;
}

let undoSnapshot = null;
let undoTimer = null;

function hideUndo() {
  undoSnapshot = null;
  clearTimeout(undoTimer);
  $('undo').hidden = true;
}

function offerUndo(before, label) {
  undoSnapshot = before;
  clearTimeout(undoTimer);
  $('undo-text').textContent = label;
  $('undo').hidden = false;
  undoTimer = setTimeout(hideUndo, 8000);
}

function update(next, label = null) {
  const before = state;
  state = next;
  if (!saveState(storage, state) && !storageWarned) {
    storageWarned = true;
    showMessage('Stockage local indisponible: la progression ne sera pas conservée. Utilise Exporter.', true);
  }
  if (label && next !== before) offerUndo(before, label);
  else hideUndo();
  render();
}

function phaseBox(phase, { seen, total }) {
  const all = total > 0 && seen === total;
  const box = h('input', {
    type: 'checkbox', checked: all, disabled: total === 0, 'aria-label': `Vu : phase ${phase} entière`,
    onchange: () => update(setPhaseSeen(state, sortTitles(titles, state.order), phase, !all, today()), `${all ? 'Décoché' : 'Coché'} : phase ${phase}`),
  });
  box.indeterminate = seen > 0 && !all;
  return box;
}

function bar(label, { seen, total, percent }, control = null, showPercent = true) {
  return h(
    'div',
    {},
    h('div', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, control, label),
      h('span', { class: 'muted', text: showPercent ? `${seen}/${total} · ${percent} %` : `${seen}/${total}` })),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { style: `width:${percent}%` })),
  );
}

function renderProgress() {
  const p = progress(titles, state.seen);
  const phases = Object.keys(p.byPhase).sort((a, b) => a - b);
  $('progress').replaceChildren(
    h('div', { class: 'card' },
      bar('Progression globale', p),
      h('div', { class: 'phases' }, phases.map((n) => bar(`Phase ${n}`, p.byPhase[n], phaseBox(Number(n), p.byPhase[n]), false)))),
  );
}

function unitLabel(unit, byId) {
  const t = byId.get(unit.titleId);
  return unit.kind === 'film' ? t.title : `${t.title} · ép. ${unit.n} — ${unit.title}`;
}

function renderBanners() {
  const byId = titleById();
  const next = nextToWatch(titles, state.seen, state.order);
  const resume = resumeFrom(titles, state.seen, state.order, state.lastSeenKey);
  const banner = (kind, unit) =>
    h('div', { class: 'card banner' },
      h('div', {}, h('div', { class: 'muted', text: kind }), h('strong', { text: unitLabel(unit, byId) })),
      h('button', { type: 'button', text: 'Marquer comme vu', onclick: () => update(toggleUnit(state, unit.key, today()), `Vu : ${unitLabel(unit, byId)}`) }));
  const cards = [];
  if (!next) cards.push(h('div', { class: 'card', text: 'Tout est vu. Bravo.' }));
  else {
    if (resume && resume.key !== next.key) cards.push(banner('Je reprends', resume));
    cards.push(banner('Prochain à voir', next));
  }
  $('banners').replaceChildren(...cards);
}

function renderStats() {
  const s = stats(titles, state.seen, today());
  const item = (dt, dd) => h('div', {}, h('dt', { text: dt }), h('dd', { text: dd }));
  $('stats').replaceChildren(
    h('div', { class: 'card' },
      h('dl', {},
        item('Heures vues', hours(s.seenMin)),
        item('Heures restantes', hours(s.remainingMin)),
        item('Rythme', s.paceMinPerDay == null ? 'n/a' : `${hours(s.paceMinPerDay)} / jour`),
        item('Fin estimée', s.etaDate == null ? 'n/a' : formatDay(s.etaDate)))),
  );
}

function notePanel(title) {
  const note = state.notes[title.id] ?? {};
  return h('div', { class: 'note-panel' },
    h('label', {}, 'Note',
      h('select', {
        'aria-label': `Note de ${title.title}`,
        onchange: (e) => update(setNote(state, title.id, { rating: e.target.value ? Number(e.target.value) : null })),
      }, h('option', { value: '', text: '—' }),
        [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), text: '★'.repeat(n), selected: note.rating === n })))),
    h('textarea', {
      'aria-label': `Commentaire sur ${title.title}`,
      placeholder: 'Mon avis…',
      value: note.text ?? '',
      onchange: (e) => update(setNote(state, title.id, { text: e.target.value })),
    }),
  );
}

function noteButton(title) {
  const note = state.notes[title.id];
  const label = note?.rating ? `★${note.rating}` : note?.text ? 'Note' : 'Noter';
  return h('button', {
    type: 'button', class: 'note-btn', text: label, 'aria-expanded': openNotes.has(title.id),
    onclick: () => {
      if (openNotes.has(title.id)) openNotes.delete(title.id);
      else {
        openNotes.add(title.id);
        if (title.type === 'serie') openSeries.add(title.id);
      }
      render();
    },
  });
}

function upcomingRow(t) {
  return h('li', { class: 'row upcoming' },
    posterImg(t),
    h('div', { class: 'name' }, h('span', { class: 'title', text: t.title }), ' ', h('span', { class: 'badge soon', text: 'à venir' }),
      h('div', { class: 'meta', text: `${t.type === 'serie' ? 'Série' : 'Film'} · sortie prévue le ${formatDay(t.releaseDate)} · phase ${t.phase}` })));
}

function creditsBadges(t) {
  if (!Array.isArray(t.postCredits)) return null;
  if (t.postCredits.length === 0) return h('span', { class: 'badge credits none', text: 'sans scène' });
  return [
    t.postCredits.includes('mid') ? h('span', { class: 'badge credits', text: 'scène mi-générique' }) : null,
    t.postCredits.includes('end') ? h('span', { class: 'badge credits', text: 'scène post-générique' }) : null,
  ];
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w154';

function posterImg(t) {
  if (!view.showPosters || !t.poster) return null;
  return h('img', {
    class: 'poster', src: `${POSTER_BASE}${t.poster}`, alt: '', width: 46, height: 69,
    loading: 'lazy', decoding: 'async', onerror: (e) => e.target.remove(),
  });
}

const tagBadges = (t) => [
  t.verified ? null : h('span', { class: 'badge', text: 'à vérifier' }),
  t.altUniverse ? h('span', { class: 'badge alt', text: 'autre réalité' }) : null,
].filter(Boolean).flatMap((b, i) => (i ? [' ', b] : [b]));

function filmRow(t) {
  const seen = isTitleSeen(state, t);
  return h('li', { class: `row${seen ? ' seen' : ''}` },
    h('input', { type: 'checkbox', checked: seen, 'aria-label': `Vu : ${t.title}`, onchange: () => update(setTitleSeen(state, t, !seen, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title}`) }),
    posterImg(t),
    h('div', { class: 'name' }, h('span', { class: 'title', text: t.title }), ' ', tagBadges(t),
      h('div', { class: 'meta', text: `${t.releaseDate.slice(0, 4)} · ${t.runtimeMin} min · phase ${t.phase}` }),
      h('div', { class: 'credits-line' }, creditsBadges(t))),
    noteButton(t),
    openNotes.has(t.id) ? notePanel(t) : null,
  );
}

function serieRow(t) {
  const done = t.episodes.filter((e) => state.seen[`${t.id}/${e.n}`]).length;
  const all = done === t.episodes.length;
  const total = t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0);
  const box = h('input', {
    type: 'checkbox', checked: all, 'aria-label': `Vu : ${t.title} (série entière)`,
    onchange: () => update(setTitleSeen(state, t, !all, today()), `${all ? 'Décoché' : 'Coché'} : ${t.title}`),
  });
  box.indeterminate = done > 0 && !all;
  const q = normalizeText(filters.query);
  const forcedOpen = q !== '' && !normalizeText(t.title).includes(q) && t.episodes.some((e) => normalizeText(e.title).includes(q));
  return h('li', {},
    h('details', {
      class: 'serie', open: forcedOpen || openSeries.has(t.id),
      ontoggle: forcedOpen ? null : (e) => (e.target.open ? openSeries.add(t.id) : openSeries.delete(t.id)),
    },
      h('summary', {},
        h('div', { class: `row${all ? ' seen' : ''}` },
          h('span', { class: 'chev', text: '▶', 'aria-hidden': 'true' }), box,
          posterImg(t),
          h('div', { class: 'name' }, h('span', { class: 'title', text: t.title }), ' ', tagBadges(t),
            h('div', { class: 'meta', text: `Série · ${done}/${t.episodes.length} ép. · ${hours(total)} · ${t.releaseDate.slice(0, 4)} · phase ${t.phase}` })),
          noteButton(t))),
      h('ul', { class: 'episodes' },
        openNotes.has(t.id) ? h('li', {}, notePanel(t)) : null,
        t.episodes.map((e) => {
          const key = `${t.id}/${e.n}`;
          const seen = Boolean(state.seen[key]);
          return h('li', { class: `row${seen ? ' seen' : ''}` },
            h('input', { type: 'checkbox', checked: seen, 'aria-label': `Vu : ${t.title} épisode ${e.n}`, onchange: () => update(toggleUnit(state, key, today()), `${seen ? 'Décoché' : 'Coché'} : ${t.title} ép. ${e.n}`) }),
            h('div', { class: 'name' }, h('span', { class: 'title', text: `Ép. ${e.n} — ${e.title}` }), h('div', { class: 'meta', text: `${e.runtimeMin} min` })));
        }))));
}

function titleRow(t) {
  if (t.upcoming) return upcomingRow(t);
  return t.type === 'serie' ? serieRow(t) : filmRow(t);
}

function togglePhase(phase) {
  const set = new Set(view.collapsedPhases);
  if (!set.delete(phase)) set.add(phase);
  view.collapsedPhases = [...set];
  saveView();
  render();
}

function phaseHeader(phase, ratio, collapsed) {
  const toggle = () => togglePhase(phase);
  return h('li', { class: `phase-head${collapsed ? ' collapsed' : ''}` },
    h('button', {
      type: 'button', class: 'chev-btn', 'aria-expanded': String(!collapsed),
      'aria-label': `${collapsed ? 'Déplier' : 'Replier'} la phase ${phase}`, onclick: toggle,
    }, h('span', { class: 'chev', text: '▶', 'aria-hidden': 'true' })),
    phaseBox(phase, ratio),
    h('h2', { text: `Phase ${phase}`, onclick: toggle }),
    h('span', { class: 'muted', text: `${ratio.seen}/${ratio.total} · ${ratio.percent} %` }));
}

function renderList() {
  const shown = filterTitles(sortTitles(titles, state.order), { ...filters, seen: state.seen });
  if (!shown.length) {
    $('list').replaceChildren(h('li', { class: 'empty', text: 'Aucun titre pour ces filtres.' }));
    return;
  }
  if (!view.groupByPhase) {
    $('list').replaceChildren(...shown.map(titleRow));
    return;
  }
  const { byPhase } = progress(titles, state.seen);
  const phases = [...new Set(shown.map((t) => t.phase))].sort((a, b) => a - b);
  const searching = filters.query.trim() !== '';
  $('list').replaceChildren(
    ...phases.flatMap((phase) => {
      const collapsed = view.collapsedPhases.includes(phase) && !searching;
      return [
        phaseHeader(phase, byPhase[phase] ?? { seen: 0, total: 0, percent: 0 }, collapsed),
        ...(collapsed ? [] : shown.filter((t) => t.phase === phase).map(titleRow)),
      ];
    }),
  );
}

function render() {
  document.querySelectorAll('[data-order]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === state.order)));
  renderProgress();
  renderBanners();
  renderStats();
  renderList();
}

function setupControls() {
  const phases = [...new Set(titles.map((t) => t.phase))].sort((a, b) => a - b);
  $('filter-phase').append(...phases.map((p) => h('option', { value: String(p), text: `Phase ${p}` })));
  $('filter-phase').addEventListener('change', (e) => { filters.phase = e.target.value ? Number(e.target.value) : null; render(); });
  const hasPosters = titles.some((t) => t.poster);
  $('posters-toggle').hidden = !hasPosters;
  $('credits').hidden = !hasPosters;
  $('show-posters').checked = view.showPosters;
  $('show-posters').addEventListener('change', (e) => { view.showPosters = e.target.checked; saveView(); render(); });
  $('theme').value = view.theme;
  $('theme').addEventListener('change', (e) => { view.theme = e.target.value; saveView(); applyTheme(); });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => view.theme === 'auto' && applyTheme());
  applyTheme();
  $('group-phase').checked = view.groupByPhase;
  $('group-phase').addEventListener('change', (e) => { view.groupByPhase = e.target.checked; saveView(); render(); });
  $('search').addEventListener('input', (e) => { filters.query = e.target.value; render(); });
  $('hide-done').addEventListener('change', (e) => { filters.hideSeen = e.target.checked; render(); });
  $('undo-btn').addEventListener('click', () => {
    if (!undoSnapshot) return;
    const snapshot = undoSnapshot;
    hideUndo();
    update(snapshot);
  });
  $('filter-type').addEventListener('change', (e) => { filters.type = e.target.value || null; render(); });
  document.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => update(setOrder(state, b.dataset.order))));

  $('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([exportState(state)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `chrono-mcu-${today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage('Progression exportée.');
  });

  $('import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const result = importState(await file.text());
    if (!result.ok) return showMessage(result.error, true);
    if (!window.confirm('Remplacer ta progression actuelle par ce fichier ?')) return;
    update(result.state);
    showMessage('Progression importée.');
  });
}

async function main() {
  try {
    const res = await fetch('data/mcu.json?v=__BUILD__');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    titles = await res.json();
  } catch (e) {
    showMessage(`Impossible de charger le catalogue (${e.message}).`, true);
    return;
  }
  setupControls();
  $('version').textContent = BUILD.startsWith('__') ? 'Version locale' : `Version ${BUILD}`;
  render();
  document.getElementById('app').dataset.ready = 'true';
}

main();
