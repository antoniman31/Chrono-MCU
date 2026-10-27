import { isTitleSeen } from '../store.js?v=__BUILD__';
import { h, icon, hours } from './dom.js?v=__BUILD__';
import { btn, checkbox, posterImg, titleBadges } from './parts.js?v=__BUILD__';

function metaLine(t) {
  const year = t.releaseDate.slice(0, 4);
  if (t.upcoming) return `${t.type === 'serie' ? 'Série' : 'Film'} · sortie prévue ${year} · phase ${t.phase}`;
  if (t.type === 'film') return `Film · ${year} · ${t.runtimeMin} min · phase ${t.phase}`;
  const total = t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0);
  return `Série · ${year} · ${t.episodes.length} ép. · ${hours(total)} · phase ${t.phase}`;
}

function notesSection(ctx, t) {
  const note = ctx.state.notes[t.id] ?? {};
  const name = `rating-${t.id}`;
  const stars = [];
  const paint = (rating) => stars.forEach((s, i) => s.classList.toggle('on', i < rating));
  for (let n = 1; n <= 5; n += 1) {
    const input = h('input', {
      type: 'radio', name, value: String(n), checked: note.rating === n, 'aria-label': `${n} sur 5`, 'data-fk': `star:${t.id}:${n}`,
      onchange: () => {
        ctx.setNote(t.id, { rating: n });
        paint(n);
        clear.hidden = false;
      },
    });
    stars.push(h('label', { class: 'star' }, input, icon('star-o', 'off'), icon('star', 'on')));
  }
  paint(note.rating ?? 0);
  const clear = btn({
    label: 'Effacer la note', variant: 'text', key: `star-clear:${t.id}`,
    onclick: () => {
      ctx.setNote(t.id, { rating: null });
      stars.forEach((s) => { s.querySelector('input').checked = false; });
      paint(0);
      clear.hidden = true;
    },
  });
  clear.hidden = !note.rating;
  const fieldId = `comment-${t.id}`;
  return h('section', { id: `notes-${t.id}`, 'aria-labelledby': `notes-h-${t.id}` },
    h('h3', { id: `notes-h-${t.id}`, text: 'Ma note' }),
    h('div', { role: 'radiogroup', 'aria-label': 'Ma note sur 5', class: 'stars' }, stars, clear),
    h('div', { class: 'field' },
      h('label', { for: fieldId, text: 'Mon commentaire' }),
      h('textarea', {
        id: fieldId, value: note.text ?? '', rows: 3,
        onchange: (e) => ctx.setNote(t.id, { text: e.target.value }),
      })));
}

function episodesSection(ctx, t) {
  const rows = t.episodes.map((e) => {
    const key = `${t.id}/${e.n}`;
    const seen = Boolean(ctx.state.seen[key]);
    return h('li', { class: `item${seen ? ' seen' : ''}` },
      checkbox({ checked: seen, label: `Vu : ${t.title}, épisode ${e.n}`, key: `ep:${key}`, onchange: () => ctx.toggleEpisode(t, e, seen) }),
      h('div', { class: 'ep-text' },
        h('span', { class: 'title', text: `Ép. ${e.n} — ${e.title}` }),
        h('span', { class: 'meta', text: `${e.runtimeMin} min` })));
  });
  return h('section', { class: 'episodes', 'aria-labelledby': `eps-h-${t.id}` },
    h('h3', { id: `eps-h-${t.id}`, text: `Épisodes (${t.episodes.filter((e) => ctx.state.seen[`${t.id}/${e.n}`]).length}/${t.episodes.length} vus)` }),
    h('ul', { class: 'items' }, rows));
}

export function renderDetail(container, ctx, id, { showTitle = true } = {}) {
  const t = ctx.byId.get(id);
  if (!t) {
    container.replaceChildren(h('p', { class: 'detail-empty', text: 'Titre introuvable.' }));
    return;
  }
  const seen = isTitleSeen(ctx.state, t);
  const poster = posterImg(t, ctx.view, 'w342', 96, 144);
  const children = [
    h('div', { class: 'detail-head' },
      poster,
      h('div', {},
        showTitle ? h('h2', { id: `detail-title-${t.id}`, text: t.title }) : null,
        h('p', { class: 'meta', text: metaLine(t) }),
        h('div', { class: 'badges' }, titleBadges(t)))),
  ];
  if (!t.upcoming) {
    children.push(h('div', { class: 'actions' },
      btn({
        label: t.type === 'serie' ? (seen ? 'Marquer la série non vue' : 'Marquer la série vue') : (seen ? 'Marquer comme non vu' : 'Marquer comme vu'),
        iconName: 'check', variant: seen ? 'outlined' : 'filled', key: `detail-seen:${t.id}`, onclick: () => ctx.toggleTitle(t),
      })));
    if (t.type === 'serie') children.push(episodesSection(ctx, t));
    children.push(notesSection(ctx, t));
  } else {
    children.push(h('p', { class: 'muted', text: 'Ce titre n\'est pas encore sorti : il ne compte pas dans ta progression.' }));
  }
  container.replaceChildren(h('div', { class: 'detail' }, children));
}

export function renderDetailEmpty(container) {
  container.replaceChildren(h('p', { class: 'detail-empty', text: 'Sélectionne un titre dans la liste pour voir sa fiche.' }));
}
