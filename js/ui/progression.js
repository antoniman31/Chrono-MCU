import { goalPlan, progress, stats } from '../logic.js?v=__BUILD__';
import { $, formatDay, formatShort, h, hours, today } from './dom.js?v=__BUILD__';
import { checkbox, progressBar } from './parts.js?v=__BUILD__';

// Carte « Objectif » : heures par semaine pour tout voir avant la date cible, comparées au rythme actuel
function goalCard(ctx, s) {
  const goalDate = ctx.view.goalDate;
  if (!goalDate) return null;
  const plan = goalPlan({ remainingMin: s.remainingMin, today: today(), goalDate, paceMinPerDay: s.paceMinPerDay });
  const per = (min) => `${hours(min)} par semaine`;
  const days = (n) => `${n} jour${n > 1 ? 's' : ''}`;
  let lines;
  if (plan.status === 'done') lines = ['Objectif atteint : tu as tout vu.'];
  else if (plan.status === 'passed') lines = [`La date est passée depuis ${days(plan.daysLate)}.`, `Il te reste ${hours(plan.remainingMin)} à regarder.`];
  else if (plan.status === 'unknown') lines = [`Il reste ${days(plan.daysLeft)} : il faut regarder ${per(plan.needWeekMin)} pour tout voir.`, 'Ton rythme apparaît après deux jours d\'utilisation.'];
  else if (plan.status === 'on-track') lines = [`Dans les temps : ton rythme actuel est de ${per(plan.paceWeekMin)}, il en faut ${per(plan.needWeekMin)}.`, `Il reste ${days(plan.daysLeft)}.`];
  else lines = [`En retard : ton rythme actuel est de ${per(plan.paceWeekMin)}, il en faut ${per(plan.needWeekMin)}.`, `Il te manque ${per(plan.needWeekMin - plan.paceWeekMin)}. Il reste ${days(plan.daysLeft)}.`];
  return h('section', { class: `card goal goal-${plan.status}`, 'aria-labelledby': 'p-goal' },
    h('h3', { id: 'p-goal', text: `Objectif : avant le ${formatShort(goalDate)}` }),
    lines.map((text, i) => h('p', { class: i === 0 ? 'goal-main' : 'muted t-body-md', text })));
}

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
    goalCard(ctx, s),
    h('section', { class: 'card', 'aria-labelledby': 'p-phases' },
      h('h3', { id: 'p-phases', text: 'Par phase' }),
      h('ul', {}, phaseRows)),
    h('dl', { class: 'stat-grid' },
      stat('Heures vues', hours(s.seenMin)),
      stat('Heures restantes', hours(s.remainingMin)),
      stat('Rythme', s.paceMinPerDay == null ? 'n/a' : `${hours(s.paceMinPerDay)} / jour`),
      stat('Fin estimée', s.etaDate == null ? 'n/a' : formatDay(s.etaDate))),
    h('p', { class: 'muted t-body-sm', style: 'margin-top:12px', text: 'Le rythme et la fin estimée apparaissent après deux jours d\'utilisation.' }),
    Object.keys(ctx.ignoredMap).length
      ? h('p', { class: 'muted t-body-sm', text: `${Object.keys(ctx.ignoredMap).length} titre${Object.keys(ctx.ignoredMap).length > 1 ? 's' : ''} ignoré${Object.keys(ctx.ignoredMap).length > 1 ? 's' : ''} (un par un ou par catégorie) : ils ne comptent pas ici.` })
      : null,
    Object.keys(state.catchUp ?? {}).some((key) => state.seen[key])
      ? h('p', { class: 'muted t-body-sm', text: 'Ce que tu as marqué d\'un coup (rattrapage) compte dans les heures vues, mais pas dans le rythme.' })
      : null);
}

