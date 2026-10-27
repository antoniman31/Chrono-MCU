import { filterTitles, isReleased, progress, sortTitles, suggestNext } from '../logic.js?v=__BUILD__';
import { phaseInfo, phaseList, phaseSummary } from '../phases.js?v=__BUILD__';
import { isTitleSeen, setOrder } from '../store.js?v=__BUILD__';
import { ignoreInfo } from '../categories.js?v=__BUILD__';
import { $, formatShort, h, hours, icon, today, withFocusRestore } from './dom.js?v=__BUILD__';
import { filmDate, metaLine } from './detail.js?v=__BUILD__';
import { attachSwipe, swipeBackground } from './swipe.js?v=__BUILD__';
import { backupStatus, NUDGE_AFTER_CHECKS } from '../backup.js?v=__BUILD__';
import { hideEpisodeTitle } from '../spoilers.js?v=__BUILD__';
import { btn, checkbox, iconBtn, posterImg, titleBadges } from './parts.js?v=__BUILD__';

const TABS = ['all', 'film', 'serie'];

function unitLabel(unit, byId, ctx) {
  const t = byId.get(unit.titleId);
  if (unit.kind === 'film') return t.title;
  // Mode sans spoiler : le prochain épisode n'est jamais vu, son titre reste donc caché
  return hideEpisodeTitle(ctx.view, ctx.state, t.id, unit.n) ? `${t.title} · ép. ${unit.n}` : `${t.title} · ép. ${unit.n} — ${unit.title}`;
}

function activeFilterCount(ctx) {
  return ctx.filters.hideSeen ? 1 : 0;
}

// Barre des phases : un onglet par phase. Appuyer fait défiler la liste jusqu'à la phase (rien n'est masqué) ;
// en défilant, l'onglet suit la phase du premier titre visible sous le bloc fixe.
let currentPhase = null;
let lockUntil = 0; // pendant un défilement lancé par un appui, le suivi automatique ne reprend pas la main

function paintPhaseBar(ctx, phase) {
  const bar = $('phase-tabs');
  bar.querySelectorAll('[role="tab"]').forEach((tab) => {
    const on = Number(tab.dataset.phase) === phase;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  const info = phaseInfo(phaseSummary(ctx.allTitles, ctx.counted, ctx.state.seen, phase));
  const [title, details] = $('phase-info').children;
  title.textContent = info.title;
  details.textContent = info.details;
  // Défilement manuel : scrollIntoView déplacerait le point de départ de la touche Tab
  const on = bar.querySelector('[aria-selected="true"]');
  if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
}

function renderPhaseBar(ctx) {
  // En ordre chronologique les phases se mélangent : la barre n'a de sens qu'en ordre de sortie
  $('phasebar').hidden = ctx.state.order === 'chrono';
  const { byPhase } = progress(ctx.counted, ctx.state.seen);
  const phases = phaseList(ctx.allTitles);
  if (!phases.includes(currentPhase)) currentPhase = phases[0] ?? null;
  const bar = $('phase-tabs');
  const left = bar.scrollLeft;
  bar.replaceChildren(...phases.map((p) => {
    const tab = h('button', {
      type: 'button', class: 'ptab', role: 'tab', 'aria-selected': 'false', tabindex: -1, 'aria-controls': 'list-panel',
      'aria-label': `Phase ${p}, ${byPhase[p]?.percent ?? 0} % vu`, 'data-fk': `ptab:${p}`, 'data-phase': String(p), onclick: () => goToPhase(ctx, p),
    }, h('span', { class: 'pdot', 'aria-hidden': 'true' }, h('span', { class: 'pnum', text: String(p) })),
    h('span', { class: 'plabel', 'aria-hidden': 'true', text: `Phase ${p}` }));
    tab.style.setProperty('--p', `${byPhase[p]?.percent ?? 0}%`);
    return tab;
  }));
  bar.scrollLeft = left;
  paintPhaseBar(ctx, currentPhase);
}

// Phase du premier élément de la liste encore visible sous le bloc fixe (titre + barre des phases)
function visiblePhase() {
  const els = [...$('list').querySelectorAll('[data-phase]')];
  if (!els.length) return null;
  const limit = Math.max(document.querySelector('.appbar').getBoundingClientRect().bottom, $('phasebar').getBoundingClientRect().bottom);
  return Number((els.find((el) => el.getBoundingClientRect().bottom > limit + 1) ?? els.at(-1)).dataset.phase);
}

function syncPhase(ctx) {
  if (ctx.state.order === 'chrono') return;
  const phase = visiblePhase();
  if (phase === null || phase === currentPhase) return;
  currentPhase = phase;
  paintPhaseBar(ctx, phase);
}

function goToPhase(ctx, phase) {
  currentPhase = phase;
  paintPhaseBar(ctx, phase);
  const target = $('list').querySelector(`[data-phase="${phase}"]`);
  if (!target) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  lockUntil = performance.now() + (smooth ? 900 : 100);
  target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
}

function renderNudge(ctx) {
  const el = $('nudge');
  const st = backupStatus({ lastBackup: ctx.view.lastBackup, snoozeUntil: ctx.view.nudgeUntil }, Object.keys(ctx.state.seen).length, today(), ctx.view.nudgeDays);
  if (!st.due) {
    el.replaceChildren();
    return;
  }
  const message = st.neverBackedUp
    ? `Tu as ${st.sinceChecks} éléments vus (films et épisodes) et aucune sauvegarde.`
    : st.sinceChecks >= NUDGE_AFTER_CHECKS
      ? `${st.sinceChecks} nouveaux éléments vus depuis ta dernière sauvegarde.`
      : `Ta dernière sauvegarde remonte à ${st.days} jours.`;
  el.replaceChildren(h('section', { class: 'card card-nudge', 'aria-label': 'Rappel de sauvegarde' },
    h('p', { class: 'nudge-title', text: message }),
    h('p', { class: 'muted', text: 'Ta progression n\'est stockée que dans ce navigateur : si les données du site sont effacées, elle est perdue.' }),
    h('div', { class: 'row-actions' },
      btn({ label: 'Exporter maintenant', variant: 'filled', iconName: 'download', key: 'nudge-export', onclick: () => ctx.exportProgress() }),
      btn({ label: 'Plus tard', variant: 'text', key: 'nudge-later', onclick: () => ctx.snoozeNudge() }))));
}

function renderResume(ctx) {
  const { state, titles, byId } = ctx;
  const { unit, status } = suggestNext(titles, state.seen, state.order, state.lastSeenKey, ctx.ignoredMap);
  let content;
  if (unit) {
    content = h('div', { class: 'row' },
      posterImg(byId.get(unit.titleId), ctx.view, 'w185', 64, 96),
      h('div', { class: 'text' }, h('div', { class: 'label', text: 'Prochain à voir' }), h('div', { class: 'name', text: unitLabel(unit, byId, ctx) })),
      btn({ label: 'Marquer comme vu', variant: 'filled', iconName: 'check', onclick: () => ctx.toggleUnit(unit, unitLabel(unit, byId, ctx)) }));
  } else {
    content = h('div', { class: 'row' }, h('div', { class: 'name', text: status === 'done' ? 'Tout est vu. Bravo.' : 'Tu es arrivé à la fin de la liste.' }));
  }
  // Séries commencées dont un épisode sort bientôt : on sait quand reprendre
  const day = today();
  const coming = ctx.allTitles
    .filter((t) => t.type === 'serie' && !t.upcoming && !ctx.ignoredMap[t.id] && t.episodes.some((e) => state.seen[`${t.id}/${e.n}`]))
    .map((t) => ({ t, next: t.episodes.find((e) => !isReleased(e, day)) }))
    .filter((x) => x.next)
    .sort((a, b) => a.next.airDate.localeCompare(b.next.airDate))
    .slice(0, 2);
  const comingRows = coming.map(({ t, next }) =>
    h('div', { class: 'row' }, h('div', { class: 'text' },
      h('div', { class: 'label', text: 'Prochainement' }),
      h('div', { class: 'name', text: `${t.title} : épisode ${next.n} le ${formatShort(next.airDate)}` }))));
  $('resume').replaceChildren(h('section', { class: 'card card-tonal resume', 'aria-label': 'Suite du visionnage' }, content, comingRows));
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
  const info = ignoreInfo(state, t);
  const ignored = info.ignored;
  const done = t.type === 'serie' ? t.episodes.filter((e) => state.seen[`${t.id}/${e.n}`]).length : 0;
  const partial = t.type === 'serie' && done > 0 && !seen;
  const total = t.type === 'serie' ? ctx.byId.get(t.id).episodes.length : 0;
  const pending = t.type === 'serie' ? total - t.episodes.length : 0;
  const meta = t.type === 'serie'
    ? `Série · ${done}/${total} ép.${pending ? ` (${pending} à venir)` : ''} · ${hours(t.episodes.reduce((s, e) => s + e.runtimeMin, 0))} · ${t.releaseDate.slice(0, 4)}`
    : `${formatShort(filmDate(t))} · ${t.runtimeMin} min`;
  const seenSpec = { icon: 'check', label: seen ? 'Non vu' : 'Vu', run: () => ctx.toggleTitle(t) };
  const ignoreSpec = { icon: ignored ? 'visibility' : 'block', label: ignored ? (info.explicit ? 'Ne plus ignorer' : 'Réintégrer') : 'Ignorer', run: () => ctx.toggleIgnore(t) };
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
  // Le regroupement par phase n'a de sens qu'en ordre de sortie : en ordre chronologique les phases se mélangent
  if (!view.groupByPhase || state.order === 'chrono') {
    list.replaceChildren(h('ul', { class: 'items' }, shown.map((t) => {
      const li = itemFor(ctx, t);
      li.dataset.phase = String(t.phase);
      return li;
    })));
    return;
  }
  const { byPhase } = progress(ctx.counted, state.seen);
  const phases = [...new Set(shown.map((t) => t.phase))].sort((a, b) => a - b);
  const searching = filters.query.trim() !== '';
  list.replaceChildren(...phases.map((phase) => {
    const ratio = byPhase[phase] ?? { seen: 0, total: 0, percent: 0 };
    const collapsed = view.collapsedPhases.includes(phase) && !searching;
    const all = ratio.total > 0 && ratio.seen === ratio.total;
    return h('section', { class: 'group', 'data-phase': String(phase), 'aria-labelledby': `gh-${phase}` },
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
  renderNudge(ctx);
  renderResume(ctx);
  renderPhaseBar(ctx);
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
  syncPhase(ctx);
}

export function setupVoir(ctx) {
  // Clavier de la barre des phases : flèches, Début, Fin
  $('phase-tabs').addEventListener('keydown', (e) => {
    const keys = [...$('phase-tabs').querySelectorAll('[role="tab"]')].map((t) => t.dataset.phase);
    const i = keys.indexOf(document.activeElement?.dataset?.phase);
    if (i === -1) return;
    const next = { ArrowRight: (i + 1) % keys.length, ArrowLeft: (i + keys.length - 1) % keys.length, Home: 0, End: keys.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    goToPhase(ctx, Number(keys[next]));
    document.querySelector(`[data-fk="ptab:${keys[next]}"]`)?.focus();
  });
  // Suivi du défilement : l'onglet reste en cohérence avec les titres visibles
  let frame = 0;
  const follow = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (performance.now() >= lockUntil) syncPhase(ctx);
    });
  };
  window.addEventListener('scroll', follow, { passive: true });
  window.addEventListener('resize', follow);
  // Hauteur du bloc fixe : le focus et les défilements automatiques ne doivent jamais passer dessous
  const phasebar = $('phasebar');
  new ResizeObserver(() => document.documentElement.style.setProperty('--phasebar-h', `${phasebar.offsetHeight}px`)).observe(phasebar);
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
  const switchRow = (label, desc, checked, onchange, key) =>
    h('label', { class: 'setting switch-row' },
      h('span', { class: 'text' }, label, desc ? h('span', { class: 'desc', text: desc }) : null),
      h('input', { type: 'checkbox', role: 'switch', checked, 'data-fk': key, onchange }),
      h('span', { class: 'switch', 'aria-hidden': 'true' }));
  body.append(
    h('div', { class: 'sheet-group' },
      h('h3', { text: 'Affichage' }),
      switchRow('Masquer les terminés', 'Cache les films et séries entièrement vus', filters.hideSeen, (e) => ctx.setFilter({ hideSeen: e.target.checked }), 'f-hide'),
      // Option absente en ordre chronologique (la préférence reste mémorisée pour l'ordre de sortie)
      ctx.state.order === 'chrono' ? null : switchRow('Grouper par phase', 'Une section repliable par phase', view.groupByPhase, (e) => ctx.setView({ groupByPhase: e.target.checked }), 'f-group')),
    h('div', { class: 'sheet-footer' },
      btn({ label: 'Réinitialiser', variant: 'text', key: 'f-reset', onclick: () => ctx.setFilter({ phase: null, hideSeen: false }) }),
      btn({ label: 'Terminé', variant: 'filled', key: 'f-done', onclick: () => ctx.closeSheet() })));
}

export function renderItemMenu(body, ctx, id) {
  const t = ctx.availById.get(id) ?? ctx.byId.get(id);
  const seen = isTitleSeen(ctx.state, t);
  const action = (iconName, label, onclick, key) =>
    h('li', {}, h('button', { type: 'button', class: 'sheet-action', 'data-fk': key, onclick }, icon(iconName), label));
  const info = ignoreInfo(ctx.state, t);
  const ignored = info.ignored;
  const items = [];
  if (!t.upcoming) {
    if (!ignored) {
      items.push(action('check', t.type === 'serie' ? (seen ? 'Marquer la série comme non vue' : 'Marquer la série comme vue') : (seen ? 'Marquer comme non vu' : 'Marquer comme vu'),
        () => { ctx.closeSheet(); ctx.toggleTitle(t); }, 'm-seen'));
    }
    const pending = ignored ? 0 : ctx.pendingUntilCount(t);
    if (pending >= 2) items.push(action('check', `Tout marquer vu jusqu'ici (${pending} titres)`, () => { ctx.closeSheet(); ctx.markUntil(t); }, 'm-until'));
    items.push(action(ignored ? 'visibility' : 'block', ignored ? (info.explicit ? 'Ne plus ignorer' : 'Réintégrer ce titre') : 'Ignorer ce titre', () => { ctx.closeSheet(); ctx.toggleIgnore(t); }, 'm-ignore'));
  }
  items.push(action('info', 'Voir la fiche', () => ctx.openDetail(id), 'm-detail'));
  body.append(h('p', { class: 'sheet-sub', text: metaLine(t) }), h('ul', { class: 'sheet-actions' }, items));
}

