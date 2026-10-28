import { goalPlan, progress, stats } from '../logic.js?v=__BUILD__';
import { evaluate, FAMILIES, LEVEL_LABELS, totalMedals } from '../achievements.js?v=__BUILD__';
import { activityByDay, breakdown, heatmap, milestones, perWeek, records, releaseTimeline, streaks, weeklyActivity } from '../insights.js?v=__BUILD__';
import { sagaLabel } from '../phases.js?v=__BUILD__';
import { $, formatDay, formatShort, h, hours, icon, today } from './dom.js?v=__BUILD__';
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

const TABS = [['bilan', 'Bilan'], ['rythme', 'Rythme'], ['mcu', 'MCU'], ['succes', 'Succès']];
let currentTab = 'bilan';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const fact = (label, value) => h('div', { class: 'fact' }, h('dt', { text: label }), h('dd', { text: value }));
const card = (id, title, ...children) => h('section', { class: 'card', 'aria-labelledby': id }, h('h3', { id, text: title }), children);

function renderTabs(ctx) {
  const buttons = TABS.map(([id, label]) =>
    h('button', {
      type: 'button', role: 'tab', id: `stab-${id}`, class: 'stab', 'aria-selected': String(currentTab === id), 'aria-controls': 'progress-panel',
      tabindex: currentTab === id ? '0' : '-1', 'data-fk': `stab:${id}`,
      onclick: () => select(ctx, id),
      onkeydown: (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        select(ctx, TABS[(TABS.findIndex(([t]) => t === id) + step + TABS.length) % TABS.length][0]);
      },
    }, label));
  return h('div', { class: 'stabs', role: 'tablist', 'aria-label': 'Sections de la progression' }, buttons);
}

function select(ctx, id) {
  currentTab = id;
  renderProgression(ctx);
  $(`stab-${id}`)?.focus();
}

function bilan(ctx, p, s) {
  const { state } = ctx;
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
  const ignoredCount = Object.keys(ctx.ignoredMap).length;
  return [
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
    ignoredCount
      ? h('p', { class: 'muted t-body-sm', text: `${plural(ignoredCount, 'titre ignoré', 'titres ignorés')} (un par un ou par catégorie) : ${ignoredCount > 1 ? 'ils ne comptent' : 'il ne compte'} pas ici.` })
      : null,
    Object.keys(state.catchUp ?? {}).some((key) => state.seen[key])
      ? h('p', { class: 'muted t-body-sm', text: 'Ce que tu as marqué d\'un coup (rattrapage) compte dans les heures vues, mais pas dans le rythme.' })
      : null,
  ];
}

function rythme(ctx) {
  const { state } = ctx;
  const now = today();
  const activity = activityByDay(state.seen, state.catchUp);
  const active = Object.keys(activity).length;
  if (!active) {
    return [card('p-rhythm', 'Rythme', h('p', { class: 'muted', text: 'Coche des films ou des épisodes pour voir ton rythme, ta série de jours et ton activité.' }))];
  }
  const run = streaks(activity, now);
  const avg = perWeek(activity, now);
  const weeks = weeklyActivity(activity, now, 12);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const cells = heatmap(activity, now, 18);
  const total = cells.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const ms = milestones(ctx.counted, state.seen);
  const weekSummary = weeks.map((w) => `semaine du ${formatShort(w.start)} : ${w.count}`).join(', ');
  return [
    h('dl', { class: 'stat-grid' },
      h('div', { class: 'card' }, h('dt', { text: 'Série en cours' }), h('dd', { text: plural(run.current, 'jour', 'jours') })),
      h('div', { class: 'card' }, h('dt', { text: 'Meilleure série' }), h('dd', { text: plural(run.best, 'jour', 'jours') })),
      h('div', { class: 'card' }, h('dt', { text: 'Par semaine' }), h('dd', { text: `${avg.toFixed(1).replace('.', ',')} titres` })),
      h('div', { class: 'card' }, h('dt', { text: 'Jours actifs' }), h('dd', { text: String(active) }))),
    card('p-weekly', 'Titres vus par semaine',
      h('div', { class: 'bars', role: 'img', 'aria-label': `Titres vus par semaine sur 12 semaines : ${weekSummary}` },
        weeks.map((w) => h('span', { class: 'bar-col', title: `${formatShort(w.start)} : ${w.count}` },
          h('i', { style: `height:${Math.round((w.count / max) * 100)}%` })))),
      h('div', { class: 'bars-axis muted t-body-sm' }, h('span', { text: formatShort(weeks[0].start) }), h('span', { text: `max ${max} / sem.` }), h('span', { text: 'cette semaine' }))),
    card('p-heat', 'Activité des 18 dernières semaines',
      h('div', { class: 'heat', role: 'img', 'aria-label': `${plural(total, 'unité vue', 'unités vues')} sur les 18 dernières semaines, ${plural(cells.filter((c) => c.count > 0).length, 'jour actif', 'jours actifs')}` },
        cells.map((c) => h('i', { class: c.level == null ? 'future' : `l${c.level}`, title: c.count == null ? '' : `${formatShort(c.day)} : ${c.count}` }))),
      h('p', { class: 'muted t-body-sm', text: 'Une case par jour, du plus clair (rien) au plus foncé (4 vus ou plus). Les rattrapages ne comptent pas.' })),
    card('p-miles', 'Jalons',
      h('dl', { class: 'facts' },
        ms.first ? fact('Première coche', `${formatShort(ms.first.date)} · ${ms.first.label}`) : null,
        ms.last ? fact('Dernière coche', `${formatShort(ms.last.date)} · ${ms.last.label}`) : null,
        ms.steps.map((st) => fact(`${st.pct} % atteints`, st.date ? formatShort(st.date) : 'à venir')))),
  ];
}

function breakdownCard(id, title, groups, label) {
  const rows = groups.map((g) => {
    const percent = g.totalMin ? Math.round((g.seenMin / g.totalMin) * 100) : 0;
    return h('li', { class: 'brk-row' },
      h('div', { class: 'line' }, h('span', { text: label(g.key) }), h('span', { class: 'muted', text: `${hours(g.seenMin)} / ${hours(g.totalMin)}` })),
      progressBar(percent, `${label(g.key)} : ${percent} % du temps vu`));
  });
  return card(id, title, h('ul', {}, rows));
}

function mcu(ctx) {
  const { state, counted } = ctx;
  const r = records(counted, state.seen);
  const b = breakdown(counted, state.seen);
  const line = (t) => (t ? `${t.title} · ${hours(t.min)}` : 'n/a');
  const timeline = releaseTimeline(counted, state.seen);
  const formatLabel = { film: 'Films', serie: 'Séries', short: 'Courts formats' };
  return [
    card('p-facts', 'Le MCU en chiffres',
      h('dl', { class: 'facts' },
        fact('Durée totale', hours(r.totalMin)),
        fact('Films', String(r.films)),
        fact('Séries', `${r.series} (${r.episodes} épisodes)`),
        fact('Film le plus long', line(r.longest)),
        fact('Film le plus court', line(r.shortest)),
        fact('Série la plus fournie', r.mostEpisodes ? `${r.mostEpisodes.title} · ${r.mostEpisodes.n} épisodes` : 'n/a'),
        fact('Série la plus longue', line(r.longestSeries)),
        fact('Année la plus chargée', r.topYear ? `${r.topYear.year} · ${plural(r.topYear.n, 'titre', 'titres')}` : 'n/a'),
        fact('Scènes post-générique', `${r.postCredits.with} titres sur ${r.postCredits.total} · ${r.postCredits.seen} déjà vus`))),
    breakdownCard('p-by-phase', 'Temps vu par phase', b.byPhase, (k) => `Phase ${k}`),
    breakdownCard('p-by-saga', 'Temps vu par saga', b.bySaga, (k) => sagaLabel(k, ctx.sagas, ctx.allTitles)),
    breakdownCard('p-by-format', 'Temps vu par format', b.byFormat, (k) => formatLabel[k] ?? k),
    card('p-timeline', 'Frise des sorties',
      h('ul', { class: 'timeline' }, timeline.map((row) =>
        h('li', { class: 'tl-row', 'aria-label': `${row.year} : ${plural(row.items.length, 'titre', 'titres')}, ${row.done} vu${row.done > 1 ? 's' : ''}` },
          h('span', { class: 'tl-year', 'aria-hidden': 'true', text: row.year }),
          h('span', { class: 'tl-dots', 'aria-hidden': 'true' }, row.items.map((i) =>
            h('i', { class: `${i.done ? 'done' : ''} ${i.type === 'serie' ? 'serie' : ''}`, title: i.title })))))),
      h('p', { class: 'muted t-body-sm', text: 'Un rond par titre, plein quand il est vu ; les séries sont carrées.' })),
  ];
}

// Ouvre l'onglet Succès à la prochaine visite de Progression (bouton « Voir » du bandeau)
export function showAchievementsTab() { currentTab = 'succes'; }

export function achievementInput(ctx) {
  const { state, view } = ctx;
  return { titles: ctx.counted, sagas: ctx.sagas, seen: state.seen, catchUp: state.catchUp, today: today(), goalDate: view.goalDate, spoilerFree: view.spoilerFree, versions: state.versions, ignored: state.ignored, lastBackup: view.lastBackup };
}

function succes(ctx) {
  const stored = ctx.view.achv ?? {};
  const list = evaluate(achievementInput(ctx)).map((a) => ({ ...a, level: Math.max(a.level, stored[a.id]?.level ?? 0), date: stored[a.id]?.date ?? null }));
  const TOTAL_MEDALS = totalMedals(list);
  const earned = list.reduce((sum, a) => sum + a.level, 0);
  const percent = Math.round((earned / TOTAL_MEDALS) * 100);
  const item = (a) => {
    const locked = a.level === 0;
    const secret = a.hidden && locked;
    const single = a.tiers.length === 1;
    const tier = single ? (locked ? 'Verrouillé' : 'Obtenu') : (locked ? 'Verrouillé' : LEVEL_LABELS[a.level]);
    const showBar = !secret && !single && a.level < a.tiers.length;
    const amount = (n) => `${n}${a.unit ? ` ${a.unit}` : ''}`;
    return h('li', { class: `achv${locked ? ' locked' : ''}` },
      h('span', { class: `medal l${single && !locked ? 3 : a.level}`, 'aria-hidden': 'true' }, secret ? '?' : locked ? icon('lock') : single ? icon('check') : String(a.level)),
      h('div', { class: 'achv-body' },
        h('div', { class: 'achv-name' }, h('span', { text: secret ? 'Succès caché' : a.name }), h('span', { class: 'tier', text: tier })),
        h('div', { class: 'achv-desc', text: secret ? 'À découvrir en regardant.' : a.desc }),
        a.date && !locked ? h('div', { class: 'achv-desc', text: `Débloqué le ${formatShort(a.date)}` }) : null,
        showBar ? progressBar(Math.min(100, Math.round((Math.min(a.value, a.next) / a.next) * 100)), `${a.name} : ${amount(Math.min(a.value, a.next))} sur ${amount(a.next)}`) : null,
        showBar ? h('div', { class: 'achv-desc', text: `${amount(Math.min(a.value, a.next))} / ${amount(a.next)}` }) : null));
  };
  return [
    card('p-achv', 'Succès',
      h('p', { class: 'big-number', text: `${earned} / ${TOTAL_MEDALS}` }),
      progressBar(percent, 'Médailles obtenues'),
      h('p', { class: 'muted t-body-md', text: 'Chaque palier (bronze, argent, or) est une médaille. Un palier obtenu n\'est jamais retiré, même si tu décoches.' })),
    ...FAMILIES.map(([family, label]) => card(`p-f-${family}`, label, h('ul', { class: 'achv-list' }, list.filter((a) => a.family === family).map(item)))),
  ];
}

export function renderProgression(ctx) {
  const { state } = ctx;
  const p = progress(ctx.counted, state.seen);
  const s = stats(ctx.counted, state.seen, today(), state.catchUp);
  const panel = currentTab === 'bilan' ? bilan(ctx, p, s) : currentTab === 'rythme' ? rythme(ctx) : currentTab === 'succes' ? succes(ctx) : mcu(ctx);
  $('progress-screen').replaceChildren(
    renderTabs(ctx),
    h('div', { id: 'progress-panel', role: 'tabpanel', 'aria-labelledby': `stab-${currentTab}`, class: 'ppanel' }, panel));
}
