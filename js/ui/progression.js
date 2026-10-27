import { progress, stats } from '../logic.js?v=__BUILD__';
import { $, formatDay, h, hours, today } from './dom.js?v=__BUILD__';
import { checkbox, progressBar } from './parts.js?v=__BUILD__';

export function renderProgression(ctx) {
  const { state } = ctx;
  const p = progress(ctx.counted, state.seen);
  const s = stats(ctx.counted, state.seen, today(), state.catchUp);
  const phases = Object.keys(p.byPhase).map(Number).sort((a, b) => a - b);

  const phaseRows = phases.map((phase) => {
    const r = p.byPhase[phase];
    const all = r.total > 0 && r.seen === r.total;
    return h('li', { class: 'phase-row' },
      checkbox({
        checked: all, indeterminate: r.seen > 0 && !all, disabled: r.total === 0, label: `Vu : phase ${phase} entière`, key: `pr:${phase}`,
        onchange: () => ctx.togglePhase(phase, all),
      }),
      h('div', { class: 'grow' },
        h('div', { class: 'line' }, h('span', { text: `Phase ${phase}` }), h('span', { class: 'muted', text: `${r.seen}/${r.total} · ${r.percent} %` })),
        progressBar(r.percent, `Progression de la phase ${phase}`)));
  });

  const stat = (label, value) => h('div', { class: 'card' }, h('dt', { text: label }), h('dd', { text: value }));
  $('progress-screen').replaceChildren(
    h('section', { class: 'card', 'aria-labelledby': 'p-global' },
      h('h3', { id: 'p-global', text: 'Progression globale' }),
      h('p', { class: 'big-number', text: `${p.percent} %` }),
      progressBar(p.percent, 'Progression globale'),
      h('p', { class: 'muted t-body-md', text: `${p.seen} sur ${p.total} unités vues (films et épisodes)` })),
    h('section', { class: 'card', 'aria-labelledby': 'p-phases' },
      h('h3', { id: 'p-phases', text: 'Par phase' }),
      h('ul', {}, phaseRows)),
    h('dl', { class: 'stat-grid' },
      stat('Heures vues', hours(s.seenMin)),
      stat('Heures restantes', hours(s.remainingMin)),
      stat('Rythme', s.paceMinPerDay == null ? 'n/a' : `${hours(s.paceMinPerDay)} / jour`),
      stat('Fin estimée', s.etaDate == null ? 'n/a' : formatDay(s.etaDate))),
    h('p', { class: 'muted t-body-sm', style: 'margin-top:12px', text: 'Le rythme et la fin estimée apparaissent après deux jours d\'utilisation.' }),
    Object.keys(state.catchUp ?? {}).some((key) => state.seen[key])
      ? h('p', { class: 'muted t-body-sm', text: 'Ce que tu as marqué d\'un coup (rattrapage) compte dans les heures vues, mais pas dans le rythme.' })
      : null);
}

