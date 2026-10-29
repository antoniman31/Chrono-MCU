// Succès : calculés depuis les coches, le catalogue et quelques réglages (fonctions pures).
// Un succès a un ou trois paliers (bronze, argent, or) ; une fois débloqué, un palier n'est jamais retiré (voir merge).
import { sortTitles, titleSeen, toUnits } from './logic.js?v=__BUILD__';
import { matchesCategory } from './categories.js?v=__BUILD__';
import { sagaNames } from './phases.js?v=__BUILD__';
import { HEROES } from './heroes.js?v=__BUILD__';
import { activityByDay, dayNumber, fromDayNumber, weekStart } from './insights.js?v=__BUILD__';

export const LEVEL_LABELS = ['', 'Bronze', 'Argent', 'Or'];
export const FAMILIES = [['progression', 'Parcours'], ['rythme', 'Rythme'], ['mcu', 'MCU'], ['heroes', 'Personnages et équipes'], ['secret', 'Cachés']];

const plural = (n, one, many) => (n > 1 ? many : one);

// Une ligne par succès : metric(m) donne la valeur à comparer aux paliers ; desc(n) décrit le palier visé
const CATALOG = [
  { id: 'first', family: 'progression', name: 'Premier pas', tiers: [1], metric: (m) => m.seenUnits, desc: () => 'Coche ton premier film ou épisode' },
  { id: 'percent', family: 'progression', name: 'Cap sur la fin', unit: '%', tiers: [25, 50, 100], metric: (m) => m.percent, desc: (n) => `Atteindre ${n} % du catalogue` },
  { id: 'phases', family: 'progression', name: 'Phase après phase', tiers: [1, 3, 5], metric: (m) => m.phasesDone, desc: (n) => `Terminer ${n} ${plural(n, 'phase', 'phases')} en entier` },
  { id: '__phases__' }, // remplacé par un succès par phase du catalogue (catalogFor)
  { id: '__sagas__' }, // remplacé par un succès par saga puis un par pourcentage de saga (catalogFor)
  { id: 'units', family: 'progression', name: 'Épisode par épisode', tiers: [25, 75, 150], metric: (m) => m.seenUnits, desc: (n) => `Cocher ${n} films ou épisodes` },
  { id: 'heroesDone', family: 'progression', name: 'Fan complet', tiers: [1, 5, 10], metric: (m) => m.heroesDone, desc: (n) => `Terminer tous les titres de ${n} ${plural(n, 'personnage ou équipe', 'personnages ou équipes')}` },
  { id: 'hours', family: 'progression', name: 'Heures de vol', unit: 'h', tiers: [24, 100, 200], metric: (m) => m.hoursSeen, desc: (n) => `Cumuler ${n} h de visionnage` },
  { id: 'backup1', family: 'progression', name: 'Prévoyant', tiers: [1], metric: (m) => m.hasBackup, desc: () => 'Exporter ta progression une première fois' },
  { id: 'backup2', family: 'progression', name: 'Sauvegarde à jour', tiers: [1], metric: (m) => m.recentBackup, desc: () => 'Avoir une sauvegarde de moins de 30 jours' },
  { id: 'goal', family: 'progression', name: 'Dans les temps', tiers: [1], metric: (m) => m.goalDone, desc: () => 'Tout voir avant la date de ton objectif' },
  { id: 'streak', family: 'rythme', name: 'Assidu', tiers: [3, 7, 30], metric: (m) => m.bestStreak, desc: (n) => `Regarder quelque chose ${n} jours de suite` },
  { id: 'marathon', family: 'rythme', name: 'Marathon', tiers: [3, 5, 10], metric: (m) => m.maxPerDay, desc: (n) => `Voir ${n} titres en une journée` },
  { id: 'week', family: 'rythme', name: 'Semaine chargée', tiers: [7, 15, 30], metric: (m) => m.maxPerWeek, desc: (n) => `Voir ${n} titres en une semaine (lundi au dimanche)` },
  { id: 'weeks', family: 'rythme', name: 'Régulier', unit: 'sem.', tiers: [4, 8, 12], metric: (m) => m.bestWeekStreak, desc: (n) => `Cocher au moins une fois par semaine pendant ${n} semaines de suite` },
  { id: 'chrono', family: 'rythme', name: 'Chronologue', tiers: [10, 25, 50], metric: (m) => m.chronoRun, desc: (n) => `Voir ${n} films ou épisodes d'affilée dans l'ordre chronologique, sans en sauter` },
  { id: 'release', family: 'rythme', name: 'Fidèle à la sortie', tiers: [10, 25, 50], metric: (m) => m.releaseRun, desc: (n) => `Voir ${n} films ou épisodes d'affilée dans l'ordre de sortie, sans en sauter` },
  { id: 'activeDays', family: 'rythme', name: 'Jours actifs', unit: 'j', tiers: [10, 30, 60], metric: (m) => m.activeDays, desc: (n) => `Cocher quelque chose pendant ${n} jours différents` },
  { id: 'months', family: 'rythme', name: 'Mois après mois', unit: 'mois', tiers: [3, 6, 12], metric: (m) => m.activeMonths, desc: (n) => `Cocher quelque chose pendant ${n} mois différents` },
  { id: 'weekend', family: 'rythme', name: 'Week-end entier', tiers: [1, 5, 10], metric: (m) => m.fullWeekends, desc: (n) => `Cocher un samedi et le dimanche suivant, ${n} ${plural(n, 'week-end', 'week-ends')}` },
  { id: 'weekdays', family: 'rythme', name: 'Tous les jours de la semaine', tiers: [1], metric: (m) => m.allWeekdays, desc: () => 'Cocher au moins une fois un lundi, un mardi, un mercredi, un jeudi, un vendredi, un samedi et un dimanche' },
  { id: 'longDay', family: 'rythme', name: 'Journée fleuve', unit: 'h', tiers: [5, 8, 12], metric: (m) => m.longestDayHours, desc: (n) => `Voir ${n} h de films et d'épisodes en une seule journée` },
  { id: 'doubleFilm', family: 'rythme', name: 'Double séance', tiers: [1], metric: (m) => m.doubleFilm, desc: () => 'Voir deux films de la même phase le même jour' },
  { id: 'seriesDay', family: 'rythme', name: 'Série d\'une traite', tiers: [1], metric: (m) => m.seriesInOneDay, desc: () => 'Terminer une série d\'au moins 4 épisodes en une seule journée' },
  { id: 'phaseFast', family: 'rythme', name: 'Phase express', tiers: [1], metric: (m) => m.phaseFast, desc: () => 'Terminer une phase en 7 jours' },
  { id: 'sagaFast', family: 'rythme', saga: 'infinity', name: 'Saga express', tiers: [1], metric: (m) => m.sagaFast, desc: () => 'Terminer la Saga de l\'Infini en 30 jours', named: (s) => ({ name: 'Saga express', desc: `Terminer ${s.inText} en 30 jours` }) },
  { id: 'series', family: 'mcu', name: 'Binge-watcher', tiers: [1, 5, 10], metric: (m) => m.seriesDone, desc: (n) => `Terminer ${n} ${plural(n, 'série', 'séries')}` },
  { id: 'films', family: 'mcu', name: 'Cinéphile', tiers: [10, 25, 40], metric: (m) => m.filmsDone, desc: (n) => `Voir ${n} films` },
  { id: 'post', family: 'mcu', name: 'Chasseur de scènes', tiers: [10, 25, 35], metric: (m) => m.postDone, desc: (n) => `Voir ${n} titres avec une scène après le générique` },
  { id: 'postAll', family: 'mcu', name: 'Complétiste des scènes', tiers: [1], metric: (m) => m.postAll, desc: () => 'Voir tous les titres avec une scène après le générique' },
  { id: 'longest', family: 'mcu', name: 'Film fleuve', tiers: [1], metric: (m) => m.longestSeen, desc: () => 'Voir le film le plus long du MCU' },
  { id: 'shortest', family: 'mcu', name: 'Film éclair', tiers: [1], metric: (m) => m.shortestSeen, desc: () => 'Voir le film le plus court du MCU' },
  { id: 'seriesAll', family: 'mcu', name: 'Toutes les séries', tiers: [1], metric: (m) => m.seriesAll, desc: () => 'Terminer toutes les séries sorties' },
  { id: 'filmsAll', family: 'mcu', name: 'Tous les films', tiers: [1], metric: (m) => m.filmsAll, desc: () => 'Voir tous les films sortis' },
  { id: 'postMid', family: 'mcu', name: 'Scènes en plein générique', tiers: [5, 12, 20], metric: (m) => m.postMid, desc: (n) => `Voir ${n} titres avec une scène en milieu de générique` },
  { id: 'postEnd', family: 'mcu', name: 'Scènes de la fin', tiers: [5, 15, 25], metric: (m) => m.postEnd, desc: (n) => `Voir ${n} titres avec une scène à la toute fin du générique` },
  { id: 'years', family: 'mcu', name: 'Machine à remonter le temps', tiers: [5, 10, 15], metric: (m) => m.seenYears, desc: (n) => `Voir des titres sortis lors de ${n} années différentes` },
  { id: 'start', family: 'mcu', name: 'Là où tout a commencé', tiers: [1], metric: (m) => m.milestones['iron-man'], desc: () => 'Voir Iron Man' },
  { id: 'assemble', family: 'mcu', name: 'Rassemblement', tiers: [1], metric: (m) => m.milestones.avengers, desc: () => 'Voir Avengers, le premier film' },
  { id: 'snap', family: 'mcu', name: 'Le claquement', tiers: [1], metric: (m) => m.milestones['avengers-infinity-war'], desc: () => 'Voir Avengers : Infinity War' },
  { id: 'endgame', family: 'mcu', name: 'Fin de partie', tiers: [1], metric: (m) => m.milestones['avengers-endgame'], desc: () => 'Voir Avengers : Endgame' },
  { id: 'shorts', family: 'mcu', name: 'Format court', tiers: [1], metric: (m) => m.shortsDone, desc: () => 'Voir tous les courts formats' },
  { id: 'alt', family: 'mcu', name: 'Autres réalités', tiers: [1], metric: (m) => m.altDone, desc: () => 'Voir tous les titres d\'autres réalités' },
  { id: 'spoiler', family: 'secret', hidden: true, name: 'Bouche cousue', tiers: [1], metric: (m) => m.spoilerFree, desc: () => 'Activer le mode sans spoiler' },
  { id: 'version', family: 'secret', hidden: true, name: 'Deuxième séance', tiers: [1], metric: (m) => m.versionChosen, desc: () => 'Choisir une autre version d\'un film' },
  { id: 'birthday', family: 'secret', hidden: true, name: 'Joyeux anniversaire', tiers: [1], metric: (m) => m.birthday, desc: () => 'Voir un titre le jour anniversaire de sa sortie' },
  { id: 'catchup', family: 'secret', hidden: true, name: 'Rattrapage express', tiers: [1], metric: (m) => m.catchUpCount >= 10, desc: () => 'Marquer 10 titres d\'un coup comme déjà vus' },
  { id: 'picky', family: 'secret', hidden: true, name: 'Sélectif', tiers: [1], metric: (m) => m.ignoredCount >= 5, desc: () => 'Ignorer 5 titres' },
  { id: 'encore', family: 'secret', hidden: true, name: 'Encore !', tiers: [1], metric: (m) => m.encoreChosen, desc: () => 'Choisir la version Encore d\'Endgame' },
  { id: 'launch', family: 'secret', hidden: true, name: 'Dès la sortie', tiers: [1], metric: (m) => m.releaseDay, desc: () => 'Voir un titre le jour de sa sortie' },
  { id: 'comeback', family: 'secret', hidden: true, name: 'Rendez-vous manqué', tiers: [1], metric: (m) => m.comeback, desc: () => 'Revenir cocher après au moins 30 jours sans rien cocher' },
  { id: 'newyear', family: 'secret', hidden: true, name: 'Bonne résolution', tiers: [1], metric: (m) => m.specialDays['01-01'], desc: () => 'Voir un titre le 1er janvier' },
  { id: 'halloween', family: 'secret', hidden: true, name: 'Nuit d\'Halloween', tiers: [1], metric: (m) => m.specialDays['10-31'], desc: () => 'Voir un titre le 31 octobre' },
  { id: 'xmas', family: 'secret', hidden: true, name: 'Séance de Noël', tiers: [1], metric: (m) => m.specialDays['12-25'], desc: () => 'Voir un titre le 25 décembre' },
  { id: 'leap', family: 'secret', hidden: true, name: 'Année bissextile', tiers: [1], metric: (m) => m.specialDays['02-29'], desc: () => 'Voir un titre un 29 février' },
  { id: 'friday13', family: 'secret', hidden: true, name: 'Vendredi 13', tiers: [1], metric: (m) => m.friday13, desc: () => 'Voir un titre un vendredi 13' },
  { id: 'oled', family: 'secret', hidden: true, name: 'Noir complet', tiers: [1], metric: (m) => m.oled, desc: () => 'Activer le noir OLED' },
  { id: 'daylight', family: 'secret', hidden: true, name: 'Plein jour', tiers: [1], metric: (m) => m.lightTheme, desc: () => 'Choisir le thème clair' },
  { id: 'noposters', family: 'secret', hidden: true, name: 'Sobre', tiers: [1], metric: (m) => m.noPosters, desc: () => 'Couper les affiches' },
  { id: 'phases3', family: 'secret', hidden: true, name: 'Multivers à la maison', tiers: [1], metric: (m) => m.triplePhaseDay, desc: () => 'Voir trois phases différentes en un seul jour' },
];

// Un succès par personnage ou équipe : part (en %) des titres sortis où il a un rôle principal
const HEROES_CATALOG = HEROES.map((hero) => {
  const label = hero.team ? hero.label.replace(/^Les /, 'les ') : hero.label;
  return {
    id: `hero:${hero.id}`, family: 'heroes', name: `Tout sur ${label}`, unit: '%', tiers: [50, 75, 100],
    metric: (m) => m.heroPercent[hero.id] ?? 0, desc: (n) => `Voir ${n} % des titres sortis de ${label}`,
  };
});
CATALOG.push(...HEROES_CATALOG);

// Sagas connues : celles de data/sagas.json ; à défaut (données absentes), les deux premières
const sagaIdsOf = (sagas) => (sagas?.length ? sagas.map((x) => x.id) : ['infinity', 'multiverse']);

// Un succès par saga (même identifiant que la saga, donc les déblocages enregistrés restent valables).
// La première se « voit toute », les suivantes se « voient » au fil des sorties ; Saga express porte sur la première.
function catalogFor(sagaIds, phaseIds = []) {
  return CATALOG.flatMap((a) => {
    if (a.id === '__phases__') {
      return phaseIds.map((p) => ({ id: `phase:${p}`, family: 'progression', name: `Phase ${p}`, tiers: [1], metric: (m) => m.phaseDone[p] === true, desc: () => `Terminer toute la phase ${p}` }));
    }
    if (a.id === '__sagas__') {
      const done = sagaIds.map((id, i) => ({
        id, family: 'progression', saga: id, name: id, tiers: [1], metric: (m) => m.sagaDone[id] === true,
        desc: () => (i === 0 ? 'Voir toute la saga' : 'Voir tout ce qui est sorti de la saga'),
        named: (s) => ({ name: s.short, desc: i === 0 ? `Voir toute ${s.inText}` : `Voir tout ce qui est sorti de ${s.inText}` }),
      }));
      const part = sagaIds.map((id) => ({
        id: `sagaPct:${id}`, family: 'progression', saga: id, name: id, unit: '%', tiers: [25, 50, 75], metric: (m) => m.sagaPercent[id] ?? 0,
        desc: (n) => `Voir ${n} % de la saga`,
        named: (s, n) => ({ name: `À l'usure : ${s.short}`, desc: `Voir ${n} % de ${s.inText}` }),
      }));
      return [...done, ...part];
    }
    return a.id === 'sagaFast' ? [{ ...a, saga: sagaIds[0] }] : [a];
  });
}

// Nombre total de médailles d'une liste de succès évaluée (un palier = une médaille)
export const totalMedals = (list) => list.reduce((sum, a) => sum + a.tiers.length, 0);

const md = (day) => day.slice(5);

export function metrics({ sagas = [], titles, seen, catchUp = {}, today, goalDate = null, spoilerFree = false, versions = {}, ignored = {}, lastBackup = null, theme = 'auto', oled = false, showPosters = true }) {
  const units = toUnits(titles);
  const byId = new Map(titles.map((t) => [t.id, t]));
  const seenUnits = units.filter((u) => seen[u.key]);
  const allDone = (list) => list.length > 0 && list.every((t) => titleSeen(t, seen));
  const sagaDone = (saga) => allDone(titles.filter((t) => t.saga === saga && !t.upcoming));
  const phases = [...new Set(titles.map((t) => t.phase))];
  const phasesDone = phases.filter((p) => allDone(titles.filter((t) => t.phase === p))).length;
  const activity = activityByDay(seen, catchUp);
  const days = Object.keys(activity).map(Number).sort((a, b) => a - b);
  let bestStreak = 0;
  let run = 0;
  days.forEach((d, i) => { run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); });
  const perWeekCounts = {};
  for (const d of days) perWeekCounts[weekStart(d)] = (perWeekCounts[weekStart(d)] ?? 0) + activity[d];
  const phasesByDay = {};
  for (const u of seenUnits) {
    if (catchUp[u.key]) continue;
    const day = dayNumber(seen[u.key]);
    (phasesByDay[day] ??= new Set()).add(u.phase);
  }
  const lastSeen = seenUnits.map((u) => seen[u.key]).sort().at(-1) ?? null;
  const birthday = seenUnits.some((u) => {
    const t = byId.get(u.titleId);
    const release = u.kind === 'film' ? t.releaseDate : t.episodes.find((e) => e.n === u.n)?.airDate;
    return typeof release === 'string' && typeof seen[u.key] === 'string' && md(release) === md(seen[u.key]) && release < seen[u.key];
  });
  // Plus longue suite de films ou épisodes vus d'affilée dans un ordre donné, dans cet ordre (les rattrapages ne comptent pas)
  const runIn = (order) => {
    let best = 0;
    let run = 0;
    let prev = null;
    for (const u of toUnits(sortTitles(titles, order))) {
      const day = seen[u.key];
      if (!day || catchUp[u.key]) { run = 0; prev = null; continue; }
      run = prev !== null && day >= prev ? run + 1 : 1;
      prev = day;
      best = Math.max(best, run);
    }
    return best;
  };
  const weekSet = new Set(days.map(weekStart));
  let bestWeekStreak = 0;
  let weekRun = 0;
  [...weekSet].sort((a, b) => a - b).forEach((w, i, all) => { weekRun = i > 0 && w === all[i - 1] + 7 ? weekRun + 1 : 1; bestWeekStreak = Math.max(bestWeekStreak, weekRun); });
  // Tout un groupe de titres vu sans rattrapage, étalé sur au plus `maxDays` jours
  const doneWithin = (group, maxDays) => {
    const gu = toUnits(group);
    if (!gu.length || !gu.every((u) => seen[u.key] && !catchUp[u.key])) return false;
    const ds = gu.map((u) => dayNumber(seen[u.key]));
    return Math.max(...ds) - Math.min(...ds) + 1 <= maxDays;
  };
  const released = titles.filter((t) => !t.upcoming);
  const films = released.filter((t) => t.type === 'film');
  const extreme = (dir) => films.reduce((best, t) => (best === null || dir * (t.runtimeMin - best.runtimeMin) > 0 ? t : best), null);
  const longest = extreme(1);
  const shortest = extreme(-1);
  const withPost = released.filter((t) => (t.postCredits ?? []).length > 0);
  const releaseDay = seenUnits.some((u) => {
    const t = byId.get(u.titleId);
    const days = u.kind === 'film' ? [t.releaseDate, t.releaseDateFr] : [t.episodes.find((e) => e.n === u.n)?.airDate];
    return days.includes(seen[u.key]);
  });
  // Séances réelles uniquement : un rattrapage (« déjà vu avant ») ne compte pas comme un jour de visionnage
  const live = seenUnits.filter((u) => !catchUp[u.key]);
  const minutesByDay = {};
  const filmsByDayPhase = {};
  for (const u of live) {
    const day = dayNumber(seen[u.key]);
    minutesByDay[day] = (minutesByDay[day] ?? 0) + (u.runtimeMin ?? 0);
    if (u.kind === 'film') { const k = `${day}/${u.phase}`; filmsByDayPhase[k] = (filmsByDayPhase[k] ?? 0) + 1; }
  }
  const dayOfWeek = (d) => (d + 3) % 7; // 0 lundi … 6 dimanche
  const daySet = new Set(days);
  const specialDays = {};
  for (const u of live) specialDays[md(seen[u.key])] = true;
  const friday13 = live.some((u) => { const d = new Date(`${seen[u.key]}T00:00:00Z`); return d.getUTCDay() === 5 && d.getUTCDate() === 13; });
  const seenTitles = titles.filter((t) => titleSeen(t, seen));
  const seriesOneDay = titles.some((t) => {
    if (t.type !== 'serie' || t.upcoming || (t.episodes ?? []).length < 4) return false;
    const ds = t.episodes.map((e) => (catchUp[`${t.id}/${e.n}`] ? null : seen[`${t.id}/${e.n}`]));
    return ds.every((d) => d && d === ds[0]);
  });
  const shorts = titles.filter((t) => matchesCategory('shorts', t));
  const alts = titles.filter((t) => t.altUniverse === true);
  return {
    seenUnits: seenUnits.length,
    percent: units.length ? Math.floor((seenUnits.length / units.length) * 100) : 0,
    phasesDone,
    sagaDone: Object.fromEntries(sagaIdsOf(sagas).map((id) => [id, sagaDone(id)])),
    goalDone: Boolean(goalDate) && units.length > 0 && seenUnits.length === units.length && lastSeen <= goalDate,
    bestStreak,
    maxPerDay: Math.max(0, ...Object.values(activity)),
    maxPerWeek: Math.max(0, ...Object.values(perWeekCounts)),
    seriesDone: titles.filter((t) => t.type === 'serie' && titleSeen(t, seen)).length,
    filmsDone: titles.filter((t) => t.type === 'film' && titleSeen(t, seen)).length,
    postDone: titles.filter((t) => (t.postCredits ?? []).length > 0 && titleSeen(t, seen)).length,
    shortsDone: allDone(shorts),
    altDone: allDone(alts),
    spoilerFree: spoilerFree === true,
    versionChosen: Object.keys(versions ?? {}).length > 0,
    birthday,
    catchUpCount: Object.keys(catchUp).filter((key) => seen[key]).length,
    triplePhaseDay: Object.values(phasesByDay).some((set) => set.size >= 3),
    hoursSeen: Math.floor(seenUnits.reduce((sum, u) => sum + u.runtimeMin, 0) / 60),
    hasBackup: Boolean(lastBackup),
    recentBackup: Boolean(lastBackup) && dayNumber(today) - dayNumber(lastBackup.day) <= 30,
    bestWeekStreak,
    chronoRun: runIn('chrono'),
    releaseRun: runIn('release'),
    phaseFast: phases.some((p) => doneWithin(titles.filter((t) => t.phase === p), 7)),
    sagaFast: doneWithin(titles.filter((t) => t.saga === sagaIdsOf(sagas)[0]), 30),
    postAll: allDone(withPost),
    longestSeen: longest !== null && titleSeen(longest, seen),
    shortestSeen: shortest !== null && titleSeen(shortest, seen),
    ignoredCount: Object.values(ignored ?? {}).filter(Boolean).length,
    encoreChosen: versions?.['avengers-endgame'] === 'encore',
    releaseDay,
    activeDays: days.length,
    activeMonths: new Set(days.map((d) => fromDayNumber(d).slice(0, 7))).size,
    fullWeekends: days.filter((d) => dayOfWeek(d) === 5 && daySet.has(d + 1)).length,
    allWeekdays: new Set(days.map(dayOfWeek)).size === 7,
    longestDayHours: Math.floor(Math.max(0, ...Object.values(minutesByDay)) / 60),
    doubleFilm: Object.values(filmsByDayPhase).some((n) => n >= 2),
    seriesInOneDay: seriesOneDay,
    seriesAll: allDone(released.filter((t) => t.type === 'serie')),
    filmsAll: allDone(films),
    postMid: seenTitles.filter((t) => (t.postCredits ?? []).includes('mid')).length,
    postEnd: seenTitles.filter((t) => (t.postCredits ?? []).includes('end')).length,
    seenYears: new Set(seenTitles.map((t) => String(t.releaseDate).slice(0, 4))).size,
    milestones: Object.fromEntries(['iron-man', 'avengers', 'avengers-infinity-war', 'avengers-endgame'].map((id) => [id, byId.has(id) && titleSeen(byId.get(id), seen)])),
    comeback: days.some((d, i) => i > 0 && d - days[i - 1] > 30),
    specialDays,
    friday13,
    oled: oled === true,
    lightTheme: theme === 'light',
    noPosters: showPosters === false,
    phaseDone: Object.fromEntries(phases.map((p) => [p, allDone(titles.filter((t) => t.phase === p))])),
    sagaPercent: Object.fromEntries(sagaIdsOf(sagas).map((id) => {
      const own = titles.filter((t) => t.saga === id && !t.upcoming);
      return [id, own.length ? Math.floor((own.filter((t) => titleSeen(t, seen)).length / own.length) * 100) : 0];
    })),
    heroesDone: HEROES.filter((hero) => { const own = titles.filter((t) => (t.heroes ?? []).includes(hero.id)); return own.length > 0 && own.every((t) => titleSeen(t, seen)); }).length,
    heroPercent: Object.fromEntries(HEROES.map((hero) => {
      const own = titles.filter((t) => (t.heroes ?? []).includes(hero.id));
      return [hero.id, own.length ? Math.floor((own.filter((t) => titleSeen(t, seen)).length / own.length) * 100) : 0];
    })),
    today,
  };
}

// Valeur numérique d'une métrique booléenne : vrai = 1
const num = (v) => (typeof v === 'boolean' ? Number(v) : v);

export function evaluate(input) {
  const m = metrics(input);
  const phaseIds = [...new Set(input.titles.map((t) => t.phase))].sort((a, b) => a - b);
  return catalogFor(sagaIdsOf(input.sagas), phaseIds).map((a) => {
    const value = num(a.metric(m));
    const level = a.tiers.filter((t) => value >= t).length;
    const next = a.tiers[level] ?? null;
    // Les succès liés à une saga prennent son nom dans data/sagas.json (input.sagas) ; sinon le texte de repli du catalogue
    const text = a.named ? a.named(sagaNames(a.saga, input.sagas, input.titles), next ?? a.tiers.at(-1)) : { name: a.name, desc: a.desc(next ?? a.tiers.at(-1)) };
    return { id: a.id, family: a.family, name: text.name, unit: a.unit ?? '', hidden: a.hidden === true, tiers: a.tiers, value, level, next, desc: text.desc };
  });
}

// Fusionne ce qui est déjà débloqué (prefs : { id: { level, date } }) avec l'état actuel.
// Premier appel (prev absent) : on enregistre en silence, sans rien annoncer. Un palier n'est jamais retiré.
export function mergeUnlocked(prev, evaluated, today) {
  const silent = prev == null;
  const next = { ...(prev ?? {}) };
  const unlocked = [];
  for (const a of evaluated) {
    const before = next[a.id]?.level ?? 0;
    if (a.level > before) {
      next[a.id] = { level: a.level, date: silent ? null : today };
      if (!silent) unlocked.push({ id: a.id, name: a.name, level: a.level, hidden: a.hidden, single: a.tiers.length === 1 });
    }
  }
  return { next, unlocked, changed: silent || unlocked.length > 0 };
}

// Texte du bandeau pour un ou plusieurs déblocages
export function unlockMessage(unlocked) {
  const label = (u) => (u.single ? u.name : `${u.name} (${LEVEL_LABELS[u.level].toLowerCase()})`);
  if (unlocked.length === 1) return `Succès débloqué : ${label(unlocked[0])}`;
  return `${unlocked.length} succès débloqués : ${unlocked.slice(0, 2).map(label).join(', ')}${unlocked.length > 2 ? '…' : ''}`;
}
