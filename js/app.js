import { filterTitles, nextToWatch, progress, resumeFrom, sortTitles, stats, toUnits } from './logic.js';
import {
  exportState, importState, isTitleSeen, loadState, saveState, setNote, setOrder, setPhaseSeen, setTitleSeen, toggleUnit,
} from './store.js';

const $ = (id) => document.getElementById(id);

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let titles = [];
let state = loadState(storage);
const filters = { phase: null, type: null };
const openSeries = new Set();
const openNotes = new Set();
let storageWarned = false;

const VIEW_KEY = 'chrono-mcu:view';
const view = (() => {
  try {
    return { groupByPhase: JSON.parse(storage?.getItem(VIEW_KEY))?.groupByPhase !== false };
  } catch {
    return { groupByPhase: true };
  }
})();
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

function update(next) {
  state = next;
  if (!saveState(storage, state) && !storageWarned) {
    storageWarned = true;
    showMessage('Stockage local indisponible: la progression ne sera pas conservée. Utilise Exporter.', true);
  }
  render();
}

function phaseBox(phase, { seen, total }) {
  const all = total > 0 && seen === total;
  const box = h('input', {
    type: 'checkbox', checked: all, disabled: total === 0, 'aria-label': `Vu : phase ${phase} entière`,
    onchange: () => update(setPhaseSeen(state, sortTitles(titles, state.order), phase, !all, today())),
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
      h('button', { type: 'button', text: 'Marquer comme vu', onclick: () => update(toggleUnit(state, unit.key, today())) }));
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

const unverifiedBadge = (t) => (t.verified ? null : h('span', { class: 'badge', text: 'à vérifier' }));

function filmRow(t) {
  const seen = isTitleSeen(state, t);
  return h('li', { class: `row${seen ? ' seen' : ''}` },
    h('input', { type: 'checkbox', checked: seen, 'aria-label': `Vu : ${t.title}`, onchange: () => update(setTitleSeen(state, t, !seen, today())) }),
    h('div', { class: 'name' }, h('span', { class: 'title', text: t.title }), ' ', unverifiedBadge(t),
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
    onchange: () => update(setTitleSeen(state, t, !all, today())),
  });
  box.indeterminate = done > 0 && !all;
  return h('li', {},
    h('details', {
      class: 'serie', open: openSeries.has(t.id),
      ontoggle: (e) => (e.target.open ? openSeries.add(t.id) : openSeries.delete(t.id)),
    },
      h('summary', {},
        h('div', { class: `row${all ? ' seen' : ''}` },
          h('span', { class: 'chev', text: '▶', 'aria-hidden': 'true' }), box,
          h('div', { class: 'name' }, h('span', { class: 'title', text: t.title }), ' ', unverifiedBadge(t),
            h('div', { class: 'meta', text: `Série · ${done}/${t.episodes.length} ép. · ${hours(total)} · ${t.releaseDate.slice(0, 4)} · phase ${t.phase}` })),
          noteButton(t))),
      h('ul', { class: 'episodes' },
        openNotes.has(t.id) ? h('li', {}, notePanel(t)) : null,
        t.episodes.map((e) => {
          const key = `${t.id}/${e.n}`;
          const seen = Boolean(state.seen[key]);
          return h('li', { class: `row${seen ? ' seen' : ''}` },
            h('input', { type: 'checkbox', checked: seen, 'aria-label': `Vu : ${t.title} épisode ${e.n}`, onchange: () => update(toggleUnit(state, key, today())) }),
            h('div', { class: 'name' }, h('span', { class: 'title', text: `Ép. ${e.n} — ${e.title}` }), h('div', { class: 'meta', text: `${e.runtimeMin} min` })));
        }))));
}

function titleRow(t) {
  if (t.upcoming) return upcomingRow(t);
  return t.type === 'serie' ? serieRow(t) : filmRow(t);
}

function phaseHeader(phase, ratio) {
  return h('li', { class: 'phase-head' },
    phaseBox(phase, ratio),
    h('h2', { text: `Phase ${phase}` }),
    h('span', { class: 'muted', text: `${ratio.seen}/${ratio.total} · ${ratio.percent} %` }));
}

function renderList() {
  const shown = filterTitles(sortTitles(titles, state.order), filters);
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
  $('list').replaceChildren(
    ...phases.flatMap((phase) => [
      phaseHeader(phase, byPhase[phase] ?? { seen: 0, total: 0, percent: 0 }),
      ...shown.filter((t) => t.phase === phase).map(titleRow),
    ]),
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
  $('group-phase').checked = view.groupByPhase;
  $('group-phase').addEventListener('change', (e) => { view.groupByPhase = e.target.checked; saveView(); render(); });
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
    const res = await fetch('data/mcu.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    titles = await res.json();
  } catch (e) {
    showMessage(`Impossible de charger le catalogue (${e.message}).`, true);
    return;
  }
  setupControls();
  render();
  document.getElementById('app').dataset.ready = 'true';
}

main();
