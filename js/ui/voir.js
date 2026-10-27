import { filterTitles, progress, sortTitles, suggestNext } from '../logic.js?v=__BUILD__';
import { isIgnored, isTitleSeen, setOrder } from '../store.js?v=__BUILD__';
import { $, formatShort, h, hours, icon, withFocusRestore } from './dom.js?v=__BUILD__';
import { filmDate, metaLine } from './detail.js?v=__BUILD__';
import { attachSwipe, swipeBackground } from './swipe.js?v=__BUILD__';
import { btn, checkbox, chip, iconBtn, posterImg, titleBadges } from './parts.js?v=__BUILD__';

const TABS = ['all', 'film', 'serie'];

function unitLabel(unit, byId) {
  const t = byId.get(unit.titleId);
  return unit.kind === 'film' ? t.title : `${t.title} · ép. ${unit.n} — ${unit.title}`;
}

function activeFilterCount(ctx) {
  const f = ctx.filters;
  return (f.phase !== null ? 1 : 0) + (f.hideSeen ? 1 : 0);
}

function renderResume(ctx) {
  const { state, titles, byId } = ctx;
  const { unit, status } = suggestNext(titles, state.seen, state.order, state.lastSeenKey, state.ignored);
  let content;
  if (unit) {
    content = h('div', { class: 'row' },
      posterImg(byId.get(unit.titleId), ctx.view, 'w185', 64, 96),
      h('div', { class: 'text' }, h('div', { class: 'label', text: 'Prochain à voir' }), h('div', { class: 'name', text: unitLabel(unit, byId) })),
      btn({ label: 'Marquer comme vu', variant: 'filled', iconName: 'check', onclick: () => ctx.toggleUnit(unit, unitLabel(unit, byId)) }));
  } else {
    content = h('div', { class: 'row' }, h('div', { class: 'name', text: status === 'done' ? 'Tout est vu. Bravo.' : 'Tu es arrivé à la fin de la liste.' }));
  }
  $('resume').replaceChildren(h('section', { class: 'card card-tonal resume', 'aria-label': 'Suite du visionnage' }, content));
}

function itemFor(ctx, t) {
  const { state, view } = ctx;
  const selected = ctx.selectedId === t.id;
  if (t.upcoming) {
    return h('li', { class: `item upcoming${selected ? ' selected' : ''}` },
      h('span', { class: 'cb-gap', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'item-main', 'aria-haspopup': 'dialog', 'data-fk': `open:${t.id}`, 'aria-current': selected ? 'true' : null, onclick: (e) => ctx.openDetail(t.id, e.currentTarget) },
        posterImg(t, view),
        h('span', { class: 'item-text' },
          h('span', { class: 'title', text: t.title }),
          h('span', { class: 'meta', text: `${t.type === 'serie' ? 'Série' : 'Film'} · sortie prévue le ${formatShort(t.releaseDate)} · phase ${t.phase}` }),
          h('span', { class: 'badges' }, titleBadges(t)))));
  }
  const seen = isTitleSeen(state, t);
  const ignored = isIgnored(state, t.id);
  const done = t.type === 'serie' ? t.episodes.filter((e) => state.seen[`${t.id}/${e.n}`]).length : 0;
  const partial = t.type === 'serie' && done > 0 && !seen;
  const meta = t.type === 'serie'
    ? `Série · ${done}/${t.episodes.length} ép. · ${hours(t.episodes.reduce((s, e) => s + e.runtimeMin, 0))} · ${t.releaseDate.slice(0, 4)}`
    : `${formatShort(filmDate(t))} · ${t.runtimeMin} min`;
  const seenSpec = { icon: 'check', label: seen ? 'Non vu' : 'Vu', run: () => ctx.toggleTitle(t) };
  const ignoreSpec = { icon: ignored ? 'visibility' : 'block', label: ignored ? 'Ne plus ignorer' : 'Ignorer', run: () => ctx.toggleIgnore(t) };
  const swipe = ignored ? { right: ignoreSpec, left: ignoreSpec } : { right: seenSpec, left: ignoreSpec };
  const bg = swipeBackground(swipe);
  const fg = h('div', { class: 'item-fg' },
    checkbox({
      checked: seen, indeterminate: partial, disabled: ignored, label: t.type === 'serie' ? `Vu : ${t.title} (série entière)` : `Vu : ${t.title}`, key: `cb:${t.id}`,
      onchange: () => ctx.toggleTitle(t),
    }),
    h('button', { type: 'button', class: 'item-main', 'aria-haspopup': 'dialog', 'data-fk': `open:${t.id}`, 'aria-current': selected ? 'true' : null, onclick: (e) => ctx.openDetail(t.id, e.currentTarget) },
      posterImg(t, view),
      h('span', { class: 'item-text' },
        h('span', { class: 'title', text: t.title }),
        h('span', { class: 'meta', text: meta }),
        h('span', { class: 'badges' }, titleBadges(t, ignored)))),
    iconBtn({ iconName: 'more', label: `Actions : ${t.title}`, popup: true, key: `menu:${t.id}`, cls: 'item-menu', onclick: (e) => ctx.openItemMenu(t.id, e.currentTarget) }));
  const row = h('li', { class: `item${seen ? ' seen' : ''}${ignored ? ' ignored' : ''}${selected ? ' selected' : ''}` }, bg, fg);
  attachSwipe(row, fg, bg, swipe);
  return row;
}

function renderList(ctx) {
  const { state, titles, filters, view } = ctx;
  const sorted = sortTitles(titles, state.order);
  const shown = filterTitles(sorted, { phase: filters.phase, type: filters.tab === 'all' ? null : filters.tab, query: filters.query, hideSeen: filters.hideSeen, seen: state.seen });
  $('result-count').textContent = shown.length === 1 ? '1 titre' : `${shown.length} titres`;
  const list = $('list');
  if (!shown.length) {
    list.replaceChildren(h('p', { class: 'empty', text: 'Aucun titre pour ces filtres.' }));
    return;
  }
  if (!view.groupByPhase) {
    list.replaceChildren(h('ul', { class: 'items' }, shown.map((t) => itemFor(ctx, t))));
    return;
  }
  const { byPhase } = progress(ctx.counted, state.seen);
  const phases = [...new Set(shown.map((t) => t.phase))].sort((a, b) => a - b);
  const searching = filters.query.trim() !== '';
  list.replaceChildren(...phases.map((phase) => {
    const ratio = byPhase[phase] ?? { seen: 0, total: 0, percent: 0 };
    const collapsed = view.collapsedPhases.includes(phase) && !searching;
    const all = ratio.total > 0 && ratio.seen === ratio.total;
    return h('section', { class: 'group', 'aria-labelledby': `gh-${phase}` },
      h('div', { class: 'group-head' },
        checkbox({
          checked: all, indeterminate: ratio.seen > 0 && !all, disabled: ratio.total === 0, label: `Vu : phase ${phase} entière`, key: `pcb:${phase}`,
          onchange: () => ctx.togglePhase(phase, all),
        }),
        h('h3', { id: `gh-${phase}` },
          h('button', { type: 'button', class: 'group-toggle', 'aria-expanded': String(!collapsed), 'aria-controls': `grp-${phase}`, 'data-fk': `ptoggle:${phase}`, onclick: () => ctx.toggleCollapse(phase) },
            icon('expand'), `Phase ${phase}`)),
        h('span', { class: 'count-text', text: `${ratio.seen}/${ratio.total} · ${ratio.percent} %` })),
      h('ul', { class: 'items', id: `grp-${phase}`, hidden: collapsed }, shown.filter((t) => t.phase === phase).map((t) => itemFor(ctx, t))));
  }));
}

export function renderVoir(ctx) {
  const { state, filters } = ctx;
  renderResume(ctx);
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    const sel = tab.dataset.tab === filters.tab;
    tab.setAttribute('aria-selected', String(sel));
    tab.tabIndex = sel ? 0 : -1;
  });
  $('list-panel').setAttribute('aria-labelledby', `tab-${filters.tab}`);
  document.querySelectorAll('[data-order]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === state.order)));
  const count = activeFilterCount(ctx);
  $('filter-count').hidden = count === 0;
  $('filter-count').textContent = String(count);
  $('open-filters').setAttribute('aria-label', count ? `Filtres, ${count} actif${count > 1 ? 's' : ''}` : 'Filtres');
  $('search-clear').hidden = filters.query === '';
  withFocusRestore(() => renderList(ctx));
}

export function setupVoir(ctx) {
  const input = $('search');
  input.addEventListener('input', (e) => {
    ctx.filters.query = e.target.value;
    ctx.render();
  });
  $('search-clear').addEventListener('click', () => {
    ctx.filters.query = '';
    input.value = '';
    ctx.render();
    input.focus();
  });
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      ctx.filters.tab = tab.dataset.tab;
      ctx.render();
    });
    tab.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(tab.dataset.tab);
      const target = { ArrowRight: TABS[(i + 1) % 3], ArrowLeft: TABS[(i + 2) % 3], Home: TABS[0], End: TABS[2] }[e.key];
      if (!target) return;
      e.preventDefault();
      ctx.filters.tab = target;
      ctx.render();
      $(`tab-${target}`).focus();
    });
  });
  document.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => ctx.update(setOrder(ctx.state, b.dataset.order))));
  $('open-filters').addEventListener('click', (e) => ctx.openFilters(e.currentTarget));
}

export function renderFiltersSheet(body, ctx) {
  const { filters, view } = ctx;
  const phases = [...new Set(ctx.titles.map((t) => t.phase))].sort((a, b) => a - b);
  const switchRow = (label, desc, checked, onchange, key) =>
    h('label', { class: 'setting switch-row' },
      h('span', { class: 'text' }, label, desc ? h('span', { class: 'desc', text: desc }) : null),
      h('input', { type: 'checkbox', role: 'switch', checked, 'data-fk': key, onchange }),
      h('span', { class: 'switch', 'aria-hidden': 'true' }));
  body.append(
    h('div', { class: 'sheet-group' },
      h('h3', { id: 'f-phase', text: 'Phase' }),
      h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'f-phase' },
        chip({ label: 'Toutes', pressed: filters.phase === null, key: 'fp:all', onclick: () => ctx.setFilter({ phase: null }) }),
        phases.map((p) => chip({ label: `Phase ${p}`, pressed: filters.phase === p, key: `fp:${p}`, onclick: () => ctx.setFilter({ phase: filters.phase === p ? null : p }) })))),
    h('div', { class: 'sheet-group' },
      h('h3', { text: 'Affichage' }),
      switchRow('Masquer les terminés', 'Cache les films et séries entièrement vus', filters.hideSeen, (e) => ctx.setFilter({ hideSeen: e.target.checked }), 'f-hide'),
      switchRow('Grouper par phase', 'Une section repliable par phase', view.groupByPhase, (e) => ctx.setView({ groupByPhase: e.target.checked }), 'f-group')),
    h('div', { class: 'sheet-footer' },
      btn({ label: 'Réinitialiser', variant: 'text', key: 'f-reset', onclick: () => ctx.setFilter({ phase: null, hideSeen: false }) }),
      btn({ label: 'Terminé', variant: 'filled', key: 'f-done', onclick: () => ctx.closeSheet() })));
}

export function renderItemMenu(body, ctx, id) {
  const t = ctx.byId.get(id);
  const seen = isTitleSeen(ctx.state, t);
  const action = (iconName, label, onclick, key) =>
    h('li', {}, h('button', { type: 'button', class: 'sheet-action', 'data-fk': key, onclick }, icon(iconName), label));
  const ignored = isIgnored(ctx.state, id);
  const items = [];
  if (!t.upcoming) {
    if (!ignored) {
      items.push(action('check', t.type === 'serie' ? (seen ? 'Marquer la série comme non vue' : 'Marquer la série comme vue') : (seen ? 'Marquer comme non vu' : 'Marquer comme vu'),
        () => { ctx.closeSheet(); ctx.toggleTitle(t); }, 'm-seen'));
    }
    items.push(action(ignored ? 'visibility' : 'block', ignored ? 'Ne plus ignorer' : 'Ignorer ce titre', () => { ctx.closeSheet(); ctx.toggleIgnore(t); }, 'm-ignore'));
  }
  items.push(action('info', 'Voir la fiche', () => ctx.openDetail(id), 'm-detail'));
  body.append(h('p', { class: 'sheet-sub', text: metaLine(t) }), h('ul', { class: 'sheet-actions' }, items));
}

