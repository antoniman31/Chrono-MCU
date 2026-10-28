import { $, formatShort, h, icon, today } from './dom.js?v=__BUILD__';
import { daysAgoLabel, daysBetween } from '../backup.js?v=__BUILD__';
import { categoriesFor, categoryTexts, matchesCategory } from '../categories.js?v=__BUILD__';
import { stats } from '../logic.js?v=__BUILD__';
import { formatDuration } from '../duration.js?v=__BUILD__';
import { btn } from './parts.js?v=__BUILD__';
import { DEFAULT_GOAL, NUDGE_CHOICES } from '../prefs.js?v=__BUILD__';
import { ACTIONS_URL, validToken } from '../github.js?v=__BUILD__';

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
  const categories = categoriesFor(ctx.sagas);
  const rows = categories.map((c) => {
    const inCategory = released.filter((t) => matchesCategory(c.id, t));
    const minutes = inCategory.reduce((sum, t) => sum + titleMinutes(t), 0);
    const texts = categoryTexts(c, ctx.sagas, ctx.allTitles);
    return h('label', { class: 'setting switch-row' },
      h('span', { class: 'text' }, texts.label, h('span', { class: 'desc', text: `${texts.desc} · ${inCategory.length} titre${inCategory.length > 1 ? 's' : ''}, ${hoursText(minutes)}` })),
      h('input', { type: 'checkbox', role: 'switch', checked: !skip.includes(c.id), 'data-fk': `follow:${c.id}`, onchange: (e) => ctx.setSkip(c.id, !e.target.checked) }),
      h('span', { class: 'switch', 'aria-hidden': 'true' }));
  });
  const followed = ctx.counted.filter((t) => !t.upcoming);
  const s = stats(ctx.counted, ctx.state.seen, today(), ctx.state.catchUp);
  const total = `${followed.length} titre${followed.length > 1 ? 's' : ''} suivi${followed.length > 1 ? 's' : ''}, ${hoursText(s.seenMin + s.remainingMin)} au total`;
  const active = categories.length - skip.filter((id) => categories.some((c) => c.id === id)).length;
  return {
    summary: `${active} catégorie${active > 1 ? 's' : ''} sur ${categories.length} · ${followed.length} titre${followed.length > 1 ? 's' : ''}`,
    content: [
      h('p', { class: 'muted t-body-sm', text: 'Décoche une catégorie pour l\'exclure de ta progression, de tes statistiques et du « Prochain à voir ». Tu peux réintégrer un titre précis depuis son menu.' }),
      rows,
      h('p', { class: 'follow-total', role: 'status', text: total }),
    ],
  };
}

const hoursText = formatDuration;

// Synchronisation du catalogue : lien vers GitHub, et vrai bouton si un jeton personnel est enregistré sur cet appareil
function syncBlock(ctx) {
  const hasToken = ctx.hasGithubToken();
  const input = h('input', { type: 'password', id: 'gh-token', class: 'date-input', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', 'data-fk': 'gh-token' });
  return h('div', { class: 'sync-block' },
    h('p', { class: 'field-label', text: 'Catalogue' }),
    h('p', { class: 'desc', text: 'Cherche les nouveaux titres, les sorties et les durées (TMDB, TVmaze). Le résultat arrive en pull request à relire ; la synchronisation tourne aussi seule le 1er de chaque mois.' }),
    h('a', { class: 'btn btn-outlined', href: ACTIONS_URL, target: '_blank', rel: 'noopener', 'data-fk': 's-sync-link' }, h('span', { class: 'face' }, 'Ouvrir la synchronisation sur GitHub')),
    hasToken
      ? h('div', { class: 'sync-run' },
        btn({ label: 'Lancer la synchronisation', variant: 'filled', iconName: 'backup', key: 's-sync-run', onclick: () => ctx.runSync() }),
        h('p', { id: 'sync-status', class: 'muted t-body-sm', role: 'status', 'aria-live': 'polite', text: '' }),
        btn({ label: 'Retirer le jeton', variant: 'text', key: 's-sync-forget', onclick: () => ctx.forgetGithubToken() }))
      : h('details', { class: 'sync-token' },
        h('summary', { text: 'Lancer depuis l\'application (jeton personnel)' }),
        h('p', { class: 'muted t-body-sm', text: 'Crée sur GitHub un jeton « fine-grained » limité à ce dépôt, avec le seul droit « Actions : lecture et écriture ». Il reste dans ce navigateur et n\'est jamais exporté avec ta progression.' }),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'gh-token', text: 'Jeton GitHub' }),
          input),
        h('p', { id: 'sync-token-error', class: 'muted t-body-sm', role: 'status', 'aria-live': 'polite', text: '' }),
        btn({ label: 'Enregistrer le jeton', variant: 'tonal', key: 's-sync-save', onclick: () => {
          const ok = validToken(input.value);
          $('sync-token-error').textContent = ok ? '' : 'Ce jeton n\'a pas le bon format (il commence par github_pat_ ou ghp_).';
          if (ok) ctx.saveGithubToken(input.value);
        } })));
}

// Section ouverte (une seule à la fois) : conservée d'un affichage à l'autre, sinon chaque réglage la refermerait
let openSection = 'look';

function accordion(id, iconName, title, summary, children) {
  const el = h('details', { class: 'acc card', name: 'reglages', 'data-sec': id },
    h('summary', { class: 'acc-head' },
      h('span', { class: 'sec-ic', 'aria-hidden': 'true' }, icon(iconName)),
      h('span', { class: 'text' }, h('span', { class: 'acc-title', text: title }), h('span', { class: 'desc', text: summary })),
      icon('expand', 'acc-chev')),
    h('div', { class: 'acc-body' }, children));
  el.open = openSection === id;
  // Mis à jour au clic (le clavier déclenche aussi un clic sur <summary>), avant que le navigateur ne change l'état
  el.querySelector('summary').addEventListener('click', () => {
    openSection = el.open ? null : id;
  });
  return el;
}

export function renderReglages(ctx) {
  const { view } = ctx;
  const hasPosters = ctx.titles.some((t) => t.poster);
  const theme = THEME_LABELS.find(([value]) => value === view.theme) ?? THEME_LABELS[0];
  const themeFieldset = h('fieldset', { class: 'theme-field' },
    h('legend', { class: 'sr-only', text: 'Thème' }),
    h('div', { class: 'seg3' }, THEME_LABELS.map(([value, label]) =>
      h('label', { class: 'segopt' },
        h('input', { type: 'radio', name: 'theme', value, checked: view.theme === value, 'data-fk': `theme:${value}`, onchange: () => ctx.setView({ theme: value }) }),
        h('span', { class: 'face', text: label })))),
    theme[2] ? h('p', { class: 'desc theme-desc', text: theme[2] }) : null);

  const lb = view.lastBackup;
  const backupDesc = lb
    ? `Dernière sauvegarde : ${formatShort(lb.day)} (${daysAgoLabel(daysBetween(lb.day, today()))})`
    : 'Jamais sauvegardée : exporte ta progression';
  const backupShort = lb ? `Sauvegardé ${daysAgoLabel(daysBetween(lb.day, today()))}` : 'Jamais sauvegardée';
  const persistNote = ctx.persisted === true
    ? 'Stockage protégé : le navigateur ne devrait pas effacer ta progression.'
    : ctx.persisted === false
      ? 'Stockage non protégé : le navigateur peut effacer les données du site. Exporte régulièrement, et installe l\'application sur ton écran d\'accueil si ton navigateur le propose.'
      : null;

  const follow = followSection(ctx);
  const lookSummary = [theme[1], view.oled ? 'noir OLED' : null, view.spoilerFree ? 'sans spoiler' : null, hasPosters ? (view.showPosters ? 'affiches' : 'sans affiches') : null].filter(Boolean).join(' · ');

  const sections = [
    accordion('look', 'palette', 'Apparence', lookSummary, [
      themeFieldset,
      h('label', { class: 'setting switch-row' },
        h('span', { class: 'text' }, 'Noir OLED', h('span', { class: 'desc', text: 'Fond noir pur quand le mode sombre est actif, y compris en Auto. Économise la batterie des écrans OLED.' })),
        h('input', { type: 'checkbox', role: 'switch', checked: view.oled, 'data-fk': 's-oled', onchange: (e) => ctx.setView({ oled: e.target.checked }) }),
        h('span', { class: 'switch', 'aria-hidden': 'true' })),
      h('label', { class: 'setting switch-row' },
        h('span', { class: 'text' }, 'Mode sans spoiler', h('span', { class: 'desc', text: 'Floute le résumé et l\'image de la fiche, et les titres d\'épisodes, tant que tu n\'as pas commencé le titre ou vu l\'épisode. Un bouton les révèle dans la fiche.' })),
        h('input', { type: 'checkbox', role: 'switch', checked: view.spoilerFree, 'data-fk': 's-spoiler', onchange: (e) => ctx.setView({ spoilerFree: e.target.checked }) }),
        h('span', { class: 'switch', 'aria-hidden': 'true' })),
      h('label', { class: 'setting switch-row' },
        h('span', { class: 'text' }, 'Retour tactile', h('span', { class: 'desc', text: 'Petite animation et vibration (si ton appareil le permet) quand tu coches. Les animations restent coupées si ton système les réduit.' })),
        h('input', { type: 'checkbox', role: 'switch', checked: view.feedback, 'data-fk': 's-feedback', onchange: (e) => ctx.setView({ feedback: e.target.checked }) }),
        h('span', { class: 'switch', 'aria-hidden': 'true' })),
      hasPosters
        ? h('label', { class: 'setting switch-row' },
          h('span', { class: 'text' }, 'Afficher les affiches', h('span', { class: 'desc', text: 'Chargées depuis TMDB' })),
          h('input', { type: 'checkbox', role: 'switch', checked: view.showPosters, 'data-fk': 's-posters', onchange: (e) => ctx.setView({ showPosters: e.target.checked }) }),
          h('span', { class: 'switch', 'aria-hidden': 'true' }))
        : null,
    ]),
    accordion('follow', 'check', 'Ce que je suis', follow.summary, follow.content),
    accordion('goal', 'chart', 'Objectif', view.goalDate ? `Tout voir avant le ${formatShort(view.goalDate)}` : 'Aucun objectif', [
      h('p', { class: 'muted t-body-sm', text: 'Choisis une date : l\'écran Progression calcule les heures à regarder par semaine pour tout voir à temps. Par défaut, la sortie annoncée d\'Avengers : Doomsday.' }),
      h('label', { class: 'field' },
        h('span', { class: 'field-label', text: 'Date cible' }),
        h('input', { type: 'date', class: 'date-input', value: view.goalDate ?? '', 'data-fk': 's-goal', onchange: (e) => ctx.setView({ goalDate: e.target.value || null }) })),
      h('div', { class: 'row-actions' },
        view.goalDate !== DEFAULT_GOAL ? btn({ label: 'Doomsday (18/12/2026)', variant: 'tonal', key: 's-goal-default', onclick: () => ctx.setView({ goalDate: DEFAULT_GOAL }) }) : null,
        view.goalDate ? btn({ label: 'Retirer l\'objectif', variant: 'text', key: 's-goal-clear', onclick: () => ctx.setView({ goalDate: null }) }) : null),
    ]),
    accordion('data', 'backup', 'Données', backupShort, [
      h('button', { type: 'button', class: 'setting', 'aria-haspopup': 'dialog', 'data-fk': 's-backup', onclick: (e) => ctx.openBackup(e.currentTarget) },
        h('span', { class: 'text' }, 'Sauvegarde et restauration', h('span', { class: 'desc', text: backupDesc })),
        icon('chevron')),
      h('fieldset', { class: 'theme-field' },
        h('legend', { class: 'field-label', text: 'Rappel de sauvegarde' }),
        h('div', { class: 'seg3' }, NUDGE_CHOICES.map((n) =>
          h('label', { class: 'segopt' },
            h('input', { type: 'radio', name: 'nudge', value: String(n), checked: view.nudgeDays === n, 'data-fk': `nudge:${n}`, onchange: () => ctx.setView({ nudgeDays: n }) }),
            h('span', { class: 'face', text: n === 0 ? 'Jamais' : `${n} jours` })))),
        h('p', { class: 'desc theme-desc', text: view.nudgeDays === 0 ? 'Aucun rappel : pense à exporter toi-même.' : `Rappel après ${view.nudgeDays} jours sans sauvegarde (ou 20 nouvelles coches).` })),
      persistNote ? h('p', { class: 'muted t-body-sm', text: persistNote }) : null,
      ctx.hasCorruptCopy() ? h('div', { class: 'setting history-block' },
        h('span', { class: 'text' }, 'Données illisibles conservées',
          h('span', { class: 'desc', text: 'Copie des données enregistrées qui n\'ont pas pu être lues. Télécharge-la avant de la supprimer.' })),
        h('div', { class: 'row-actions' },
          btn({ label: 'Télécharger', variant: 'outlined', iconName: 'download', key: 's-corrupt-download', onclick: () => ctx.downloadCorruptCopy() }),
          btn({ label: 'Supprimer', variant: 'text', key: 's-corrupt-delete', onclick: () => ctx.deleteCorruptCopy() }))) : null,
      syncBlock(ctx),
      h('div', { class: 'setting history-block' },
        h('span', { class: 'text' }, 'Annuler une action',
          h('span', { class: 'desc', role: 'status', text: ctx.historyInfo().count ? `Dernière : ${ctx.historyInfo().last} · ${ctx.historyInfo().count} action${ctx.historyInfo().count > 1 ? 's' : ''} annulable${ctx.historyInfo().count > 1 ? 's' : ''} jusqu\'au rechargement` : 'Aucune action à annuler pour l\'instant (la liste se vide au rechargement).' })),
        btn({ label: 'Annuler la dernière', variant: 'outlined', key: 's-undo', extra: ctx.historyInfo().count ? {} : { disabled: true }, onclick: () => ctx.undoLast() })),
      h('div', { class: 'danger-zone' },
        h('p', { class: 'muted t-body-sm', text: 'Zone de danger' }),
        btn({ label: 'Effacer toute ma progression', variant: 'outlined', iconName: 'block', key: 's-erase', popup: true, onclick: (e) => ctx.openErase(e.currentTarget) })),
    ]),
    accordion('about', 'info', 'À propos', ctx.versionLabel, [
      h('p', { class: 'muted', text: 'Chrono-MCU suit ton visionnage du MCU (films et séries Disney+), sans compte : ta progression reste dans ce navigateur.' }),
      h('p', { class: 'muted', text: 'Sur écran tactile, glisse une ligne vers la droite pour la marquer vue, vers la gauche pour l\'ignorer.' }),
      btn({ label: 'Revoir l\'accueil', variant: 'outlined', key: 's-welcome', popup: true, onclick: (e) => ctx.openWelcome(e.currentTarget) }),
      h('ul', { class: 'link-list' },
        link('https://github.com/les2/marvel-screen-archive', 'Marvel Archive', 'ordre chronologique (CC BY 4.0)'),
        link('https://www.tvmaze.com', 'TVmaze', 'durées et titres des épisodes'),
        link('https://www.wikipedia.org', 'Wikipedia', 'durées des films, scènes après le générique'),
        link('https://github.com/dharmatype/Bebas-Neue', 'Bebas Neue', 'police du titre (SIL Open Font License)'),
        hasPosters ? link('https://www.themoviedb.org', 'TMDB', 'affiches') : null),
      h('p', { class: 'muted', text: 'Application non officielle : sans lien avec Marvel, Disney ou leurs ayants droit. Le titre reprend un style, pas un logo.' }),
      hasPosters ? h('p', { class: 'muted', text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' }) : null,
      h('p', { class: 'muted version', text: ctx.versionLabel }),
    ]),
  ];
  $('settings-screen').replaceChildren(...sections);
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

// Confirmation avant d'effacer : la sauvegarde est téléchargée d'abord, l'effacement reste annulable quelques secondes
export function renderEraseSheet(body, ctx) {
  const n = Object.keys(ctx.state.seen).length;
  body.append(
    h('p', { text: n ? `Tu vas effacer ${n === 1 ? 'ta coche' : `tes ${n} coches`} (films et épisodes), tes choix de version et ton historique de rattrapage.` : 'Tu n\'as encore rien coché : il n\'y a rien à effacer.' }),
    h('p', { class: 'muted', text: 'Une sauvegarde est téléchargée d\'abord. Tes titres ignorés, tes catégories suivies et tes préférences d\'affichage ne changent pas. Tu pourras annuler pendant 10 secondes.' }),
    h('div', { class: 'sheet-footer' },
      btn({ label: 'Annuler', variant: 'text', key: 'e-cancel', onclick: () => ctx.closeSheet() }),
      btn({ label: 'Sauvegarder et effacer', variant: 'filled', key: 'e-confirm', extra: n ? {} : { disabled: true }, onclick: () => ctx.eraseProgress() })));
}
