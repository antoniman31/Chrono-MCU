import { $, formatShort, h, icon, today } from './dom.js?v=__BUILD__';
import { daysAgoLabel, daysBetween } from '../backup.js?v=__BUILD__';
import { CATEGORIES, matchesCategory } from '../categories.js?v=__BUILD__';
import { stats } from '../logic.js?v=__BUILD__';
import { btn } from './parts.js?v=__BUILD__';

const THEME_LABELS = [
  ['auto', 'Auto', 'Suit le réglage de ton appareil (clair ou sombre)'],
  ['light', 'Clair', null],
  ['dark', 'Sombre', null],
];

const link = (href, name, desc) =>
  h('li', {}, h('a', { class: 'ext-link', href, target: '_blank', rel: 'noopener' }, h('span', { text: name }), h('span', { class: 'desc', text: desc })));

const titleMinutes = (t) => (t.type === 'film' ? t.runtimeMin : t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0));

// Section « Ce que je suis » : une case par catégorie, avec son poids, et le total réellement suivi
function followSection(ctx) {
  const released = ctx.allTitles.filter((t) => !t.upcoming);
  const skip = ctx.state.skip ?? [];
  const rows = CATEGORIES.map((c) => {
    const inCategory = released.filter((t) => matchesCategory(c.id, t));
    const minutes = inCategory.reduce((sum, t) => sum + titleMinutes(t), 0);
    return h('label', { class: 'setting switch-row' },
      h('span', { class: 'text' }, c.label, h('span', { class: 'desc', text: `${c.desc} · ${inCategory.length} titre${inCategory.length > 1 ? 's' : ''}, ${hoursText(minutes)}` })),
      h('input', { type: 'checkbox', role: 'switch', checked: !skip.includes(c.id), 'data-fk': `follow:${c.id}`, onchange: (e) => ctx.setSkip(c.id, !e.target.checked) }),
      h('span', { class: 'switch', 'aria-hidden': 'true' }));
  });
  const followed = ctx.counted.filter((t) => !t.upcoming);
  const s = stats(ctx.counted, ctx.state.seen, today(), ctx.state.catchUp);
  const total = `${followed.length} titre${followed.length > 1 ? 's' : ''} suivi${followed.length > 1 ? 's' : ''}, ${hoursText(s.seenMin + s.remainingMin)} au total`;
  return h('section', { class: 'settings-section card', 'aria-labelledby': 's-follow' },
    h('h3', { id: 's-follow', text: 'Ce que je suis' }),
    h('p', { class: 'muted t-body-sm', text: 'Décoche une catégorie pour l\'exclure de ta progression, de tes statistiques et du « Prochain à voir ». Tu peux réintégrer un titre précis depuis son menu.' }),
    rows,
    h('p', { class: 'follow-total', role: 'status', text: total }));
}

const hoursText = (min) => `${(min / 60).toFixed(1).replace('.', ',')} h`;

export function renderReglages(ctx) {
  const { view } = ctx;
  const hasPosters = ctx.titles.some((t) => t.poster);
  const themeFieldset = h('fieldset', {},
    h('legend', { text: 'Thème' }),
    THEME_LABELS.map(([value, label, desc]) =>
      h('label', { class: 'radio' },
        h('input', { type: 'radio', name: 'theme', value, checked: view.theme === value, 'data-fk': `theme:${value}`, onchange: () => ctx.setView({ theme: value }) }),
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { class: 'text' }, label, desc ? h('span', { class: 'desc', text: desc }) : null))));

  const lb = view.lastBackup;
  const backupDesc = lb
    ? `Dernière sauvegarde : ${formatShort(lb.day)} (${daysAgoLabel(daysBetween(lb.day, today()))})`
    : 'Jamais sauvegardée : exporte ta progression';
  const persistNote = ctx.persisted === true
    ? 'Stockage protégé : le navigateur ne devrait pas effacer ta progression.'
    : ctx.persisted === false
      ? 'Stockage non protégé : le navigateur peut effacer les données du site. Exporte régulièrement, et installe l\'application sur ton écran d\'accueil si ton navigateur le propose.'
      : null;

  const sections = [
    h('section', { class: 'settings-section card', 'aria-labelledby': 's-look' },
      h('h3', { id: 's-look', text: 'Apparence' }),
      themeFieldset,
      h('label', { class: 'setting switch-row' },
        h('span', { class: 'text' }, 'Noir OLED', h('span', { class: 'desc', text: 'Fond noir pur quand le mode sombre est actif, y compris en Auto. Économise la batterie des écrans OLED.' })),
        h('input', { type: 'checkbox', role: 'switch', checked: view.oled, 'data-fk': 's-oled', onchange: (e) => ctx.setView({ oled: e.target.checked }) }),
        h('span', { class: 'switch', 'aria-hidden': 'true' })),
      hasPosters
        ? h('label', { class: 'setting switch-row' },
          h('span', { class: 'text' }, 'Afficher les affiches', h('span', { class: 'desc', text: 'Chargées depuis TMDB' })),
          h('input', { type: 'checkbox', role: 'switch', checked: view.showPosters, 'data-fk': 's-posters', onchange: (e) => ctx.setView({ showPosters: e.target.checked }) }),
          h('span', { class: 'switch', 'aria-hidden': 'true' }))
        : null),
    followSection(ctx),
    h('section', { class: 'settings-section card', 'aria-labelledby': 's-data' },
      h('h3', { id: 's-data', text: 'Données' }),
      h('button', { type: 'button', class: 'setting', 'aria-haspopup': 'dialog', 'data-fk': 's-backup', onclick: (e) => ctx.openBackup(e.currentTarget) },
        h('span', { class: 'text' }, 'Sauvegarde et restauration', h('span', { class: 'desc', text: backupDesc })),
        icon('chevron')),
      persistNote ? h('p', { class: 'muted t-body-sm', text: persistNote }) : null),
    h('section', { class: 'settings-section card about', 'aria-labelledby': 's-about' },
      h('h3', { id: 's-about', text: 'À propos' }),
      h('p', { class: 'muted', text: 'Chrono-MCU suit ton visionnage du MCU (films et séries Disney+), sans compte : ta progression reste dans ce navigateur.' }),
      h('p', { class: 'muted', text: 'Sur écran tactile, glisse une ligne vers la droite pour la marquer vue, vers la gauche pour l\'ignorer.' }),
      h('ul', { class: 'link-list' },
        link('https://github.com/les2/marvel-screen-archive', 'Marvel Archive', 'ordre chronologique (CC BY 4.0)'),
        link('https://www.tvmaze.com', 'TVmaze', 'durées et titres des épisodes'),
        link('https://www.wikipedia.org', 'Wikipedia', 'durées des films, scènes après le générique'),
        link('https://github.com/dharmatype/Bebas-Neue', 'Bebas Neue', 'police du titre (SIL Open Font License)'),
        hasPosters ? link('https://www.themoviedb.org', 'TMDB', 'affiches') : null),
      h('p', { class: 'muted', text: 'Application non officielle : sans lien avec Marvel, Disney ou leurs ayants droit. Le titre reprend un style, pas un logo.' }),
      hasPosters ? h('p', { class: 'muted', text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' }) : null,
      h('p', { class: 'muted version', text: ctx.versionLabel })),
  ];
  $('settings-screen').replaceChildren(...sections.filter(Boolean));
}

export function renderBackupSheet(body, ctx) {
  if (ctx.pendingImport) {
    body.append(
      h('p', { text: 'Remplacer ta progression actuelle par ce fichier ? Cette action ne peut pas être annulée.' }),
      h('div', { class: 'sheet-footer' },
        btn({ label: 'Annuler', variant: 'text', key: 'b-cancel', onclick: () => ctx.cancelImport() }),
        btn({ label: 'Remplacer', variant: 'filled', key: 'b-confirm', onclick: () => ctx.confirmImport() })));
    return;
  }
  const action = (iconName, label, desc, onclick, key) =>
    h('li', {}, h('button', { type: 'button', class: 'sheet-action', 'data-fk': key, onclick },
      icon(iconName), h('span', { class: 'text' }, label, h('span', { class: 'desc', text: desc }))));
  body.append(
    ctx.backupError ? h('p', { class: 'muted', role: 'alert', text: ctx.backupError }) : null,
    h('p', { class: 'muted', text: 'Ta progression est stockée dans ce navigateur. Exporte-la pour la sauvegarder ou la transférer sur un autre appareil.' }),
    h('ul', { class: 'sheet-actions' },
      action('download', 'Exporter ma progression', 'Télécharge un fichier JSON', () => ctx.exportProgress(), 'b-export'),
      action('upload', 'Importer une sauvegarde', 'Remplace la progression actuelle', () => ctx.chooseImportFile(), 'b-import')));
}
