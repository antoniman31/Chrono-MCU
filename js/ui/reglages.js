import { $, h, icon } from './dom.js?v=__BUILD__';
import { btn } from './parts.js?v=__BUILD__';

const THEME_LABELS = [
  ['auto', 'Auto', 'Suit le réglage de ton appareil'],
  ['light', 'Clair', null],
  ['dark', 'Sombre', null],
  ['oled', 'Noir OLED', 'Noir pur, économise la batterie des écrans OLED'],
];

const link = (href, name, desc) =>
  h('li', {}, h('a', { class: 'ext-link', href, target: '_blank', rel: 'noopener' }, h('span', { text: name }), h('span', { class: 'desc', text: desc })));

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

  const sections = [
    h('section', { class: 'settings-section card', 'aria-labelledby': 's-look' },
      h('h3', { id: 's-look', text: 'Apparence' }),
      themeFieldset,
      hasPosters
        ? h('label', { class: 'setting switch-row' },
          h('span', { class: 'text' }, 'Afficher les affiches', h('span', { class: 'desc', text: 'Chargées depuis TMDB' })),
          h('input', { type: 'checkbox', role: 'switch', checked: view.showPosters, 'data-fk': 's-posters', onchange: (e) => ctx.setView({ showPosters: e.target.checked }) }),
          h('span', { class: 'switch', 'aria-hidden': 'true' }))
        : null),
    h('section', { class: 'settings-section card', 'aria-labelledby': 's-data' },
      h('h3', { id: 's-data', text: 'Données' }),
      h('button', { type: 'button', class: 'setting', 'aria-haspopup': 'dialog', 'data-fk': 's-backup', onclick: (e) => ctx.openBackup(e.currentTarget) },
        h('span', { class: 'text' }, 'Sauvegarde et restauration', h('span', { class: 'desc', text: 'Exporter ou importer ta progression' })),
        icon('chevron'))),
    h('section', { class: 'settings-section card about', 'aria-labelledby': 's-about' },
      h('h3', { id: 's-about', text: 'À propos' }),
      h('p', { class: 'muted', text: 'Chrono-MCU suit ton visionnage du MCU (films et séries Disney+), sans compte : ta progression reste dans ce navigateur.' }),
      h('ul', { class: 'link-list' },
        link('https://github.com/les2/marvel-screen-archive', 'Marvel Archive', 'ordre chronologique (CC BY 4.0)'),
        link('https://www.tvmaze.com', 'TVmaze', 'durées et titres des épisodes'),
        link('https://www.wikipedia.org', 'Wikipedia', 'durées des films, scènes après le générique'),
        hasPosters ? link('https://www.themoviedb.org', 'TMDB', 'affiches') : null),
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
