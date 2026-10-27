import { isIgnored, isTitleSeen } from '../store.js?v=__BUILD__';
import { formatShort, h, icon, hours } from './dom.js?v=__BUILD__';
import { btn, checkbox, posterImg, titleBadges } from './parts.js?v=__BUILD__';
import { attachSwipe, swipeBackground } from './swipe.js?v=__BUILD__';

export const filmDate = (t) => t.releaseDateFr ?? t.releaseDate;

export function metaLine(t) {
  const year = t.releaseDate.slice(0, 4);
  if (t.upcoming) return `${t.type === 'serie' ? 'Série' : 'Film'} · sortie prévue le ${formatShort(t.releaseDate)} · phase ${t.phase}`;
  if (t.type === 'film') return `Film · ${formatShort(filmDate(t))} · ${t.runtimeMin} min · phase ${t.phase}`;
  const total = t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0);
  return `Série · ${year} · ${t.episodes.length} ép. · ${hours(total)} · phase ${t.phase}`;
}

function episodesSection(ctx, t, ignored) {
  const rows = t.episodes.map((e) => {
    const key = `${t.id}/${e.n}`;
    const seen = Boolean(ctx.state.seen[key]);
    const swipe = ignored ? { right: null, left: null } : { right: { icon: 'check', label: seen ? 'Non vu' : 'Vu', run: () => ctx.toggleEpisode(t, e, seen) }, left: null };
    const bg = swipeBackground(swipe);
    const fg = h('div', { class: 'item-fg' },
      checkbox({ checked: seen, disabled: ignored, label: `Vu : ${t.title}, épisode ${e.n}`, key: `ep:${key}`, onchange: () => ctx.toggleEpisode(t, e, seen) }),
      h('div', { class: 'ep-text' },
        h('span', { class: 'title', text: `Ép. ${e.n} — ${e.title}` }),
        h('span', { class: 'meta', text: e.airDate ? `${formatShort(e.airDate)} · ${e.runtimeMin} min` : `${e.runtimeMin} min` })));
    const row = h('li', { class: `item${seen ? ' seen' : ''}` }, bg, fg);
    attachSwipe(row, fg, bg, swipe);
    return row;
  });
  return h('section', { class: 'episodes', 'aria-labelledby': `eps-h-${t.id}` },
    h('h3', { id: `eps-h-${t.id}`, text: `Épisodes (${t.episodes.filter((e) => ctx.state.seen[`${t.id}/${e.n}`]).length}/${t.episodes.length} vus)` }),
    h('ul', { class: 'items' }, rows));
}

export function renderDetail(container, ctx, id, { showTitle = true, showPoster = showTitle } = {}) {
  const t = ctx.byId.get(id);
  if (!t) {
    container.replaceChildren(h('p', { class: 'detail-empty', text: 'Titre introuvable.' }));
    return;
  }
  const seen = isTitleSeen(ctx.state, t);
  const ignored = isIgnored(ctx.state, t.id);
  const poster = showPoster ? posterImg(t, ctx.view, 'w342', 96, 144) : null;
  const children = [
    h('div', { class: 'detail-head' },
      poster,
      h('div', {},
        showTitle ? h('h2', { id: `detail-title-${t.id}`, text: t.title }) : null,
        h('p', { class: 'meta', text: metaLine(t) }),
        h('div', { class: 'badges' }, titleBadges(t, ignored)))),
  ];
  if (t.overview) children.push(h('p', { class: 'overview', text: t.overview }));
  if (!t.upcoming) {
    const actions = [];
    if (ignored) children.push(h('p', { class: 'muted', text: 'Ignoré : ce titre ne compte pas dans ta progression, tes statistiques ni le « Prochain à voir ».' }));
    else {
      actions.push(btn({
        label: t.type === 'serie' ? (seen ? 'Marquer la série non vue' : 'Marquer la série vue') : (seen ? 'Marquer comme non vu' : 'Marquer comme vu'),
        iconName: 'check', variant: seen ? 'outlined' : 'filled', key: `detail-seen:${t.id}`, onclick: () => ctx.toggleTitle(t),
      }));
    }
    actions.push(btn({
      label: ignored ? 'Ne plus ignorer' : 'Ignorer', iconName: ignored ? 'visibility' : 'block', variant: ignored ? 'filled' : 'text',
      key: `detail-ignore:${t.id}`, onclick: () => ctx.toggleIgnore(t),
    }));
    children.push(h('div', { class: 'actions' }, actions));
    if (t.type === 'serie') children.push(episodesSection(ctx, t, ignored));
  } else {
    children.push(h('p', { class: 'muted', text: 'Ce titre n\'est pas encore sorti : il ne compte pas dans ta progression.' }));
  }
  container.replaceChildren(h('div', { class: 'detail' }, children));
}

export function renderDetailEmpty(container) {
  container.replaceChildren(h('p', { class: 'detail-empty', text: 'Sélectionne un titre dans la liste pour voir sa fiche.' }));
}
