import { isTitleSeen } from '../store.js?v=__BUILD__';
import { categoryLabel, ignoreInfo } from '../categories.js?v=__BUILD__';
import { formatShort, h, icon, hours, today } from './dom.js?v=__BUILD__';
import { btn, checkbox, posterImg, titleBadges } from './parts.js?v=__BUILD__';
import { attachPageSwipe, attachSwipe, swipeBackground } from './swipe.js?v=__BUILD__';
import { isReleased } from '../logic.js?v=__BUILD__';
import { hasSpoilers, hideEpisodeTitle, hideSummary } from '../spoilers.js?v=__BUILD__';

// Mode sans spoiler : titres dont les spoilers sont affichés dans la fiche (jusqu'au rechargement) et résumés dépliés (« Voir plus »)
const revealed = new Set();
const expanded = new Set();

// Titre d'épisode : flouté (et caché aux lecteurs d'écran) tant que le mode sans spoiler l'exige
function episodeName(ctx, t, e) {
  const name = e.titleFr ?? e.title;
  if (!(hideEpisodeTitle(ctx.view, ctx.state, t.id, e.n) && !revealed.has(t.id))) return [`Ép. ${e.n} — ${name}`];
  return [`Ép. ${e.n} — `, h('span', { class: 'spoiler-blur', 'aria-hidden': 'true', text: name }), h('span', { class: 'sr-only', text: 'titre masqué' })];
}

export const filmDate = (t) => t.releaseDateFr ?? t.releaseDate;

export function metaLine(t) {
  const year = t.releaseDate.slice(0, 4);
  if (t.upcoming) return `${t.type === 'serie' ? 'Série' : 'Film'} · sortie prévue le ${formatShort(t.releaseDate)} · phase ${t.phase}`;
  if (t.type === 'film') return `Film · ${formatShort(filmDate(t))} · ${hours(t.runtimeMin)} · phase ${t.phase}`;
  const total = t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0);
  return `Série · ${year} · ${t.episodes.length} ép. · ${hours(total)} · phase ${t.phase}`;
}

// Films ayant plusieurs versions : une seule case « vu », mais la durée et les scènes comptées suivent la version choisie
function versionSection(ctx, t) {
  const options = [{ id: null, label: 'Originale' }, ...t.versions.map((v) => ({ id: v.id, label: v.label }))];
  const current = t.activeVersion ?? null;
  return h('section', { class: 'versions', 'aria-labelledby': `ver-h-${t.id}` },
    h('h3', { id: `ver-h-${t.id}`, text: 'Version regardée' }),
    h('fieldset', { class: 'theme-field' },
      h('legend', { class: 'sr-only', text: 'Version regardée' }),
      h('div', { class: 'seg3' }, options.map((o) =>
        h('label', { class: 'segopt' },
          h('input', { type: 'radio', name: `version-${t.id}`, value: o.id ?? '', checked: current === o.id, 'data-fk': `version:${t.id}:${o.id ?? 'original'}`, onchange: () => ctx.setVersion(t, o.id) }),
          h('span', { class: 'face', text: o.label }))))),
    t.versions.map((v) => h('p', { class: 'muted t-body-sm', text: `${v.label}, ressortie le ${formatShort(v.releaseDate)} : ${hours(v.runtimeMin)}. ${v.note}` })));
}

// Résumé : 3 lignes, « Voir plus » seulement si le texte est plus long ; flouté (avec un bouton dessus) tant que les spoilers sont masqués
function summarySection(t, { blurred, toggleSpoilers, spoilers, revealed: isRevealed }) {
  const open = expanded.has(t.id);
  const p = h('p', { class: `overview clamp${open ? ' open' : ''}${blurred ? ' spoiler-blur' : ''}`, 'aria-hidden': blurred ? 'true' : null, text: t.overview });
  const more = h('button', { type: 'button', class: 'link-btn more', hidden: !open, 'aria-expanded': String(open), 'data-fk': `more:${t.id}` },
    h('span', { text: open ? 'Voir moins' : 'Voir plus' }), icon('expand', 'chev'));
  more.addEventListener('click', () => {
    const now = p.classList.toggle('open');
    if (now) expanded.add(t.id);
    else expanded.delete(t.id);
    more.setAttribute('aria-expanded', String(now));
    more.firstElementChild.textContent = now ? 'Voir moins' : 'Voir plus';
  });
  // Le chevron n'apparaît que si le texte dépasse les 3 lignes (mesuré quand la fiche est affichée, et à chaque changement de largeur)
  new ResizeObserver(() => { if (!p.classList.contains('open')) more.hidden = !(p.scrollHeight - p.clientHeight > 1); }).observe(p);
  const eye = (iconName, label, key) => h('button', { type: 'button', class: 'link-btn', 'data-fk': key, onclick: toggleSpoilers }, icon(iconName), h('span', { text: label }));
  return h('div', { class: 'summary' },
    h('div', { class: 'summary-text' }, p,
      blurred ? btn({ label: 'Afficher les spoilers', iconName: 'visibility', variant: 'tonal', key: `reveal:${t.id}`, extra: { class: 'btn btn-tonal reveal-over' }, onclick: toggleSpoilers }) : null),
    h('div', { class: 'summary-foot' }, more,
      spoilers && !blurred ? eye(isRevealed ? 'visibility-off' : 'visibility', isRevealed ? 'Masquer les spoilers' : 'Afficher les spoilers', `spoilers:${t.id}`) : null));
}

function episodesSection(ctx, t, ignored) {
  const day = today();
  const released = t.episodes.filter((e) => isReleased(e, day));
  const rows = t.episodes.map((e) => {
    if (!isReleased(e, day)) {
      // Pas encore sorti : visible, mais sans case et hors de tous les comptes
      return h('li', { class: 'item upcoming-ep' },
        h('div', { class: 'item-fg' },
          h('span', { class: 'cb', 'aria-hidden': 'true' }),
          h('div', { class: 'ep-text' },
            h('span', { class: 'title' }, episodeName(ctx, t, e)),
            h('span', { class: 'meta', text: `Sort le ${formatShort(e.airDate)}` }))));
    }
    const key = `${t.id}/${e.n}`;
    const seen = Boolean(ctx.state.seen[key]);
    const swipe = ignored ? { right: null, left: null } : { right: { icon: 'check', label: seen ? 'Non vu' : 'Vu', run: () => ctx.toggleEpisode(t, e, seen) }, left: null };
    const bg = swipeBackground(swipe);
    const fg = h('div', { class: 'item-fg' },
      checkbox({ checked: seen, disabled: ignored, label: `Vu : ${t.title}, épisode ${e.n}`, key: `ep:${key}`, onchange: () => ctx.toggleEpisode(t, e, seen) }),
      h('div', { class: 'ep-text' },
        h('span', { class: 'title' }, episodeName(ctx, t, e)),
        h('span', { class: 'meta', text: e.airDate ? `${formatShort(e.airDate)} · ${hours(e.runtimeMin)}` : hours(e.runtimeMin) })));
    const row = h('li', { class: `item${seen ? ' seen' : ''}` }, bg, fg);
    attachSwipe(row, fg, bg, swipe);
    return row;
  });
  const seenCount = released.filter((e) => ctx.state.seen[`${t.id}/${e.n}`]).length;
  const pending = t.episodes.length - released.length;
  return h('section', { class: 'episodes', 'aria-labelledby': `eps-h-${t.id}` },
    h('h3', { id: `eps-h-${t.id}`, text: `Épisodes (${seenCount}/${released.length} vus${pending ? `, ${pending} à venir` : ''})` }),
    h('ul', { class: 'items' }, rows));
}

// Pied de fiche « ‹ titre précédent · n / N · titre suivant › » : titres voisins dans la liste affichée (absent si le titre n'y figure pas)
function detailNav(ctx, id) {
  const ids = ctx.navIds ?? [];
  const i = ids.indexOf(id);
  if (i === -1 || ids.length < 2) return null;
  const step = (dir, word, key) => {
    const target = ctx.byId.get(ids[i + dir]);
    const name = h('span', { class: 'name', text: target?.title ?? '' });
    const chevron = icon('chevron');
    const b = h('button', { type: 'button', class: `nav-step ${dir < 0 ? 'prev' : 'next'}`, 'aria-label': target ? `${word} : ${target.title}` : word, 'data-fk': key, onclick: () => ctx.stepDetail(dir, key) },
      ...(dir < 0 ? [chevron, name] : [name, chevron]));
    b.disabled = !target;
    return b;
  };
  return h('nav', { class: 'detail-nav', 'aria-label': 'Fiches voisines' },
    step(-1, 'Titre précédent', 'detail-prev'),
    h('span', { class: 'count', role: 'status', 'aria-live': 'polite', text: `${i + 1} / ${ids.length}` }),
    step(1, 'Titre suivant', 'detail-next'));
}

export function renderDetail(container, ctx, id, { showTitle = true, showPoster = showTitle } = {}) {
  const t = ctx.byId.get(id);
  if (!t) {
    container.replaceChildren(h('p', { class: 'detail-empty', text: 'Titre introuvable.' }));
    return;
  }
  const seen = isTitleSeen(ctx.state, ctx.availById.get(t.id) ?? t);
  const info = ignoreInfo(ctx.state, t);
  const ignored = info.ignored;
  const poster = showPoster ? posterImg(t, ctx.view, 'w342', 96, 144) : null;
  const head = h('div', { class: 'detail-head' },
      poster,
      h('div', {},
        showTitle ? h('h2', { id: `detail-title-${t.id}`, text: t.title }) : null,
        h('p', { class: 'meta', text: metaLine(t) }),
        h('div', { class: 'badges' }, titleBadges(t, ignored))));
  const nav = detailNav(ctx, id);
  const children = [head];
  const blurred = hideSummary(ctx.view, ctx.state, t) && !revealed.has(t.id);
  const toggleSpoilers = () => {
    if (revealed.has(t.id)) revealed.delete(t.id);
    else revealed.add(t.id);
    renderDetail(container, ctx, id, { showTitle, showPoster });
  };
  if (!showTitle) document.querySelector('#sheet-hero .hero-img')?.classList.toggle('spoiler-blur', blurred); // image paysage de la feuille
  const summary = t.overview ? summarySection(t, { blurred, toggleSpoilers, spoilers: hasSpoilers(ctx.view, ctx.state, t), revealed: revealed.has(t.id) }) : null;
  if (summary) children.push(summary);
  if (!t.upcoming) {
    const actions = [];
    if (ignored) children.push(h('p', { class: 'muted', text: info.category && !info.explicit
      ? `Ignoré : la catégorie « ${categoryLabel(info.category)} » n'est pas suivie (Réglages > Ce que je suis). Ce titre ne compte pas dans ta progression, tes statistiques ni le « Prochain à voir ».`
      : 'Ignoré : ce titre ne compte pas dans ta progression, tes statistiques ni le « Prochain à voir ».' }));
    else {
      actions.push(btn({
        label: t.type === 'serie' ? (seen ? 'Marquer la série non vue' : 'Marquer la série vue') : (seen ? 'Marquer comme non vu' : 'Marquer comme vu'),
        iconName: 'check', variant: seen ? 'outlined' : 'filled', key: `detail-seen:${t.id}`, onclick: () => ctx.toggleTitle(t),
      }));
    }
    actions.push(btn({
      label: ignored ? (info.explicit ? 'Ne plus ignorer' : 'Réintégrer ce titre') : 'Ignorer', iconName: ignored ? 'visibility' : 'block', variant: ignored ? 'filled' : 'text',
      key: `detail-ignore:${t.id}`, onclick: () => ctx.toggleIgnore(t),
    }));
    children.push(h('div', { class: 'actions' }, actions));
    if (t.type === 'film' && Array.isArray(t.versions)) children.push(versionSection(ctx, t));
    if (t.type === 'serie') children.push(episodesSection(ctx, t, ignored));
  } else {
    children.push(h('p', { class: 'muted', text: ignored
      ? 'Ce titre n\'est pas encore sorti et tu l\'ignores : il ne comptera pas dans ta progression à sa sortie.'
      : 'Ce titre n\'est pas encore sorti : il ne compte pas dans ta progression.' }));
    children.push(h('div', { class: 'actions' }, btn({
      label: ignored ? (info.explicit ? 'Ne plus ignorer' : 'Réintégrer ce titre') : 'Ignorer', iconName: ignored ? 'visibility' : 'block', variant: ignored ? 'filled' : 'text',
      key: `detail-ignore:${t.id}`, onclick: () => ctx.toggleIgnore(t),
    })));
  }
  children.push(nav);
  container.replaceChildren(h('div', { class: 'detail' }, children));
  // Glisser sur l'en-tête (titre, résumé) ou l'image paysage change de fiche ; la liste d'épisodes garde son propre glissement
  if (nav) for (const el of [head, summary]) if (el) attachPageSwipe(el, (dir) => ctx.stepDetail(dir));
}

export function renderDetailEmpty(container) {
  container.replaceChildren(h('p', { class: 'detail-empty', text: 'Sélectionne un titre dans la liste pour voir sa fiche.' }));
}
