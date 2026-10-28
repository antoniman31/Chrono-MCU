import { h, icon } from './dom.js?v=__BUILD__';

export function checkbox({ checked = false, indeterminate = false, disabled = false, label, key, onchange }) {
  const input = h('input', { type: 'checkbox', checked, disabled, 'aria-label': label, 'data-fk': key, onchange });
  input.indeterminate = indeterminate;
  return h('span', { class: 'cb' }, input, h('span', { class: 'box' }, icon('check', 'tick'), h('span', { class: 'dash' })));
}

export function btn({ label, iconName, variant = 'tonal', onclick, popup = false, key, extra = {} }) {
  return h('button', { type: 'button', class: `btn btn-${variant}`, 'aria-haspopup': popup ? 'dialog' : null, 'data-fk': key, onclick, ...extra },
    h('span', { class: 'face' }, iconName ? icon(iconName) : null, label));
}

export function iconBtn({ iconName, label, onclick, popup = false, key, cls = '' }) {
  return h('button', { type: 'button', class: `icon-btn ${cls}`.trim(), 'aria-label': label, 'aria-haspopup': popup ? 'dialog' : null, 'data-fk': key, onclick },
    h('span', { class: 'face' }, icon(iconName)));
}

export function chip({ label, pressed, onclick, key }) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), 'data-fk': key, onclick }, h('span', { class: 'face' }, label));
}

export function progressBar(percent, label) {
  return h('div', { class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent },
    h('span', { style: `width:${percent}%` }));
}

// short : libellés courts pour la liste (cartes de hauteur fixe) ; la fiche garde les libellés complets
export function titleBadges(t, ignored = false, short = false) {
  const out = [];
  if (ignored) out.push(h('span', { class: 'badge ign', text: 'ignoré' }));
  if (!t.verified && !t.upcoming) out.push(h('span', { class: 'badge warn', text: 'à vérifier' }));
  if (t.upcoming) out.push(h('span', { class: 'badge soon', text: 'à venir' }));
  if (t.altUniverse) out.push(h('span', { class: 'badge alt', text: 'autre réalité' }));
  if (Array.isArray(t.versions)) {
    const v = t.versions.find((x) => x.id === t.activeVersion);
    // Version choisie : on l'affiche ; sinon on signale seulement que la version existe et ce qu'elle ajoute
    const first = t.versions[0];
    out.push(h('span', { class: 'badge ver', text: v ? `version ${v.label}` : short && first.badgeShort ? `${first.label} : ${first.badgeShort}` : `version ${first.label} : ${first.badge}` }));
  }
  if (Array.isArray(t.postCredits)) {
    if (t.postCredits.length === 0) out.push(h('span', { class: 'badge', text: 'sans scène' }));
    if (t.postCredits.includes('mid')) out.push(h('span', { class: 'badge post', text: short ? 'mi-générique' : 'scène mi-générique' }));
    if (t.postCredits.includes('end')) out.push(h('span', { class: 'badge post', text: short ? 'post-générique' : 'scène post-générique' }));
  }
  return out;
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/';

export function posterImg(t, view, size = 'w185', width = 72, height = 108) {
  if (!view.showPosters || !t.poster) return null;
  return h('img', {
    class: 'poster', src: `${POSTER_BASE}${size}${t.poster}`, alt: '', width, height, loading: 'lazy', decoding: 'async',
    onerror: (e) => e.target.remove(),
  });
}

export function backdropImg(t, view) {
  if (!view.showPosters || !t.backdrop) return null;
  return h('img', {
    class: 'hero-img', src: `${POSTER_BASE}w780${t.backdrop}`, alt: '', width: 780, height: 439, decoding: 'async',
    onerror: (e) => e.target.closest('.sheet-hero')?.setAttribute('hidden', ''),
  });
}
