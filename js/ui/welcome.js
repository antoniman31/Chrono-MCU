import { h } from './dom.js?v=__BUILD__';
import { pendingUntil, setOrder } from '../store.js?v=__BUILD__';
import { sortTitles } from '../logic.js?v=__BUILD__';
import { btn } from './parts.js?v=__BUILD__';
import { refreshSheet } from './sheet.js?v=__BUILD__';

// Étape de l'accueil : 'intro' ou 'caught-up' (rattrapage). Mémoire du module : l'accueil se rouvre toujours à l'étape 1.
let step = 'intro';
let untilId = '';

export function renderWelcomeSheet(body, ctx) {
  if (step === 'caught-up') return renderCatchUp(body, ctx);
  body.append(
    h('p', { text: 'Chrono-MCU suit ce que tu as vu du MCU, sans compte : tout reste dans ce navigateur.' }),
    h('ul', { class: 'welcome-tips' },
      h('li', { text: 'Appuie sur le rond d\'une ligne pour la marquer vue.' }),
      h('li', { text: 'Sur téléphone, glisse une ligne vers la droite pour la cocher, vers la gauche pour l\'ignorer.' }),
      h('li', { text: 'Le menu ⋮ d\'une ligne propose « Tout marquer vu jusqu\'ici » pour un rattrapage.' }),
      h('li', { text: 'Exporte ta progression de temps en temps (Réglages) : c\'est ta sauvegarde.' })),
    h('div', { class: 'welcome-actions' },
      btn({ label: 'Je commence de zéro', variant: 'filled', key: 'w-fresh', onclick: () => ctx.closeSheet() }),
      btn({ label: 'J\'ai déjà vu une partie du MCU', variant: 'outlined', key: 'w-caught', onclick: () => { step = 'caught-up'; refreshSheet(); } })));
}

function renderCatchUp(body, ctx) {
  const ordered = sortTitles(ctx.counted, ctx.state.order);
  const target = ordered.find((t) => t.id === untilId) ?? null;
  const pending = target ? new Set(pendingUntil(ctx.state, ctx.titles, target.id).map((u) => u.titleId)).size : 0;
  const order = (value, label) =>
    h('label', { class: 'segopt' },
      h('input', { type: 'radio', name: 'w-order', value, checked: ctx.state.order === value, 'data-fk': `w-order:${value}`, onchange: () => ctx.update(setOrder(ctx.state, value)) }),
      h('span', { class: 'face', text: label }));
  body.append(
    h('p', { text: 'Choisis ton ordre de visionnage, puis le dernier titre que tu as vu : tout ce qui le précède sera marqué comme vu.' }),
    h('fieldset', { class: 'theme-field' },
      h('legend', { class: 'field-label', text: 'Ordre' }),
      h('div', { class: 'seg3' }, order('chrono', 'Chronologique'), order('release', 'Sortie'))),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'w-until', text: 'Dernier titre vu' }),
      h('select', { id: 'w-until', class: 'date-input', 'data-fk': 'w-until', onchange: (e) => { untilId = e.target.value; refreshSheet(); } },
        h('option', { value: '', text: 'Choisir…' }),
        ordered.map((t) => h('option', { value: t.id, selected: t.id === untilId, text: t.title })))),
    h('p', { class: 'muted t-body-md', role: 'status', text: target ? `${pending} titre${pending > 1 ? 's' : ''} ${pending > 1 ? 'seront marqués' : 'sera marqué'} comme vu${pending > 1 ? 's' : ''} (rattrapage : ils comptent dans tes heures, pas dans ton rythme).` : 'Aucun titre choisi pour l\'instant.' }),
    h('div', { class: 'sheet-footer' },
      btn({ label: 'Retour', variant: 'text', key: 'w-back', onclick: () => { step = 'intro'; refreshSheet(); } }),
      btn({ label: 'Marquer et commencer', variant: 'filled', key: 'w-confirm', extra: target ? {} : { disabled: true }, onclick: () => { const t = target; step = 'intro'; untilId = ''; ctx.closeSheet(); ctx.markUntil(t); } })));
}
