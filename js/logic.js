export const ORDERS = ['chrono', 'release'];

export function sortTitles(titles, order) {
  const byChrono = (a, b) => a.chronoOrder - b.chronoOrder;
  const compare =
    order === 'release'
      ? (a, b) => a.releaseDate.localeCompare(b.releaseDate) || byChrono(a, b)
      : byChrono;
  return [...titles].sort(compare);
}

export function toUnits(titles) {
  return titles.filter((t) => !t.upcoming).flatMap((t) => {
    const base = { titleId: t.id, phase: t.phase, type: t.type };
    if (t.type === 'serie') {
      return t.episodes.map((e) => ({
        ...base,
        key: `${t.id}/${e.n}`,
        kind: 'episode',
        n: e.n,
        title: e.titleFr ?? e.title,
        runtimeMin: e.runtimeMin,
      }));
    }
    return [{ ...base, key: t.id, kind: 'film', title: t.title, runtimeMin: t.runtimeMin }];
  });
}

// Titre voisin dans une liste d'identifiants : dir = +1 (suivant) ou -1 (précédent) ; null au bout de la liste ou si l'identifiant n'y est pas
export function stepId(ids, id, dir) {
  const i = ids.indexOf(id);
  if (i === -1) return null;
  return ids[i + dir] ?? null;
}

export function normalizeText(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function titleSeen(t, seen) {
  if (t.upcoming) return false;
  if (t.type === 'film') return Boolean(seen[t.id]);
  return t.episodes.every((e) => seen[`${t.id}/${e.n}`]);
}

function matchesQuery(t, query, inEpisodes) {
  const q = normalizeText(query);
  if (!q) return true;
  if (normalizeText(t.title).includes(q)) return true;
  return inEpisodes && t.type === 'serie' && (t.episodes ?? []).some((e) => normalizeText(e.title).includes(q) || (e.titleFr && normalizeText(e.titleFr).includes(q)));
}

// Statut d'un titre : 'todo' (rien de vu), 'progress' (série entamée), 'done' (entièrement vu)
export function titleStatus(t, seen) {
  if (titleSeen(t, seen)) return 'done';
  if (t.type === 'serie' && (t.episodes ?? []).some((e) => seen[`${t.id}/${e.n}`])) return 'progress';
  return 'todo';
}

export const titleMinutes = (t) => (t.type === 'film' ? t.runtimeMin ?? 0 : (t.episodes ?? []).reduce((sum, e) => sum + (e.runtimeMin ?? 0), 0));

export const DURATION_BOUNDS = { short: 90, long: 120 };

function matchesDuration(t, duration) {
  if (duration === 'any') return true;
  const m = titleMinutes(t);
  if (duration === 'short') return m < DURATION_BOUNDS.short;
  if (duration === 'long') return m > DURATION_BOUNDS.long;
  return m >= DURATION_BOUNDS.short && m <= DURATION_BOUNDS.long;
}

export const FILTER_DEFAULTS = { status: 'all', ignored: 'show', post: 'any', duration: 'any', inEpisodes: false, hero: null };

export function filterTitles(titles, { phase = null, type = null, query = '', hideSeen = false, status = 'all', ignored = 'show', post = 'any', duration = 'any', inEpisodes = false, hero = null, seen = {}, ignoredMap = {} } = {}) {
  return titles.filter((t) => {
    if (phase !== null && t.phase !== phase) return false;
    if (type !== null && t.type !== type) return false;
    if (!matchesQuery(t, query, inEpisodes)) return false;
    if (hero !== null && !(t.heroes ?? []).includes(hero)) return false;
    if (hideSeen && titleSeen(t, seen)) return false;
    if (status !== 'all' && titleStatus(t, seen) !== status) return false;
    const isIgnored = Boolean(ignoredMap[t.id]);
    if (ignored === 'hide' && isIgnored) return false;
    if (ignored === 'only' && !isIgnored) return false;
    const hasPost = (t.postCredits ?? []).length > 0;
    if (post === 'with' && !hasPost) return false;
    if (post === 'without' && hasPost) return false;
    return matchesDuration(t, duration);
  });
}

const ratio = (seen, total) => ({
  seen,
  total,
  percent: total === 0 ? 0 : Math.round((seen / total) * 100),
});

export function progress(titles, seen) {
  const units = toUnits(titles);
  const byPhase = {};
  for (const u of units) {
    const p = (byPhase[u.phase] ??= { seen: 0, total: 0 });
    p.total += 1;
    if (seen[u.key]) p.seen += 1;
  }
  for (const phase of Object.keys(byPhase)) {
    byPhase[phase] = ratio(byPhase[phase].seen, byPhase[phase].total);
  }
  const seenCount = units.filter((u) => seen[u.key]).length;
  return { ...ratio(seenCount, units.length), byPhase };
}

export function nextToWatch(titles, seen, order) {
  return toUnits(sortTitles(titles, order)).find((u) => !seen[u.key]) ?? null;
}

export function resumeFrom(titles, seen, order, lastSeenKey) {
  if (!lastSeenKey) return null;
  const units = toUnits(sortTitles(titles, order));
  const idx = units.findIndex((u) => u.key === lastSeenKey);
  if (idx === -1) return null;
  return units.slice(idx + 1).find((u) => !seen[u.key]) ?? null;
}

// « Prochain à voir » : le premier titre non vu et non ignoré APRÈS le dernier coché, dans l'ordre actif. Ce que tu as sauté
// avant n'est jamais rappelé. Sans historique (rien coché), on propose le tout premier titre de la liste.
// Un épisode est sorti le jour de sa date de diffusion d'origine (date américaine) ; sans date, on le considère sorti.
export const isReleased = (episode, today) => !episode.airDate || episode.airDate <= today;

// Catalogue tel qu'on peut le regarder aujourd'hui : les épisodes pas encore sortis sont retirés (progression, statistiques,
// « Prochain à voir » les ignorent d'office) ; une série dont aucun épisode n'est sorti devient « à venir ».
export function releasedView(titles, today) {
  return titles.map((t) => {
    if (t.type !== 'serie' || t.upcoming) return t;
    const episodes = t.episodes.filter((e) => isReleased(e, today));
    if (episodes.length === t.episodes.length) return t;
    return episodes.length ? { ...t, episodes } : { ...t, upcoming: true };
  });
}

// Versions d'un film (ressortie avec des scènes en plus, par exemple) : le titre garde une seule case, mais sa durée et ses scènes
// post-générique suivent la version que l'utilisateur dit avoir vue (`chosen` : { idDuFilm: idDeLaVersion }, absent = version d'origine).
export function withVersions(titles, chosen = {}) {
  return titles.map((t) => {
    if (!Array.isArray(t.versions)) return t;
    const v = t.versions.find((x) => x.id === chosen[t.id]);
    if (!v) return { ...t, activeVersion: null };
    return { ...t, activeVersion: v.id, runtimeMin: v.runtimeMin ?? t.runtimeMin, postCredits: v.postCredits ?? t.postCredits };
  });
}

export const countedTitles = (titles, ignored = {}) => titles.filter((t) => !ignored[t.id]);

export function suggestNext(titles, seen, order, lastSeenKey, ignored = {}) {
  const units = toUnits(sortTitles(titles, order));
  const open = (u) => !seen[u.key] && !ignored[u.titleId];
  if (!units.some(open)) return { unit: null, status: 'done' };
  const idx = lastSeenKey ? units.findIndex((u) => u.key === lastSeenKey) : -1;
  if (idx === -1) return { unit: units.find(open), status: 'next' };
  const unit = units.slice(idx + 1).find(open);
  return unit ? { unit, status: 'next' } : { unit: null, status: 'end' };
}

const DAY_MS = 86_400_000;
const dayNumber = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Objectif « tout voir avant la date cible » : ce qu'il faut regarder par semaine, comparé au rythme actuel.
// status : 'done' (plus rien à voir), 'passed' (date dépassée), 'unknown' (pas encore de rythme), 'on-track' ou 'behind'.
export function goalPlan({ remainingMin, today, goalDate, paceMinPerDay }) {
  if (remainingMin <= 0) return { status: 'done' };
  const daysLeft = dayNumber(goalDate) - dayNumber(today);
  if (daysLeft <= 0) return { status: 'passed', remainingMin, daysLate: -daysLeft };
  const needWeekMin = (remainingMin / daysLeft) * 7;
  if (paceMinPerDay == null) return { status: 'unknown', daysLeft, remainingMin, needWeekMin };
  const paceWeekMin = paceMinPerDay * 7;
  return { status: paceWeekMin >= needWeekMin ? 'on-track' : 'behind', daysLeft, remainingMin, needWeekMin, paceWeekMin };
}

// `catchUp` : unités marquées d'un coup pour rattraper un historique. Elles comptent dans les heures vues et restantes,
// mais pas dans le rythme (sinon cocher 40 films d'un coup ferait exploser « Rythme » et « Fin estimée »).
export function stats(titles, seen, today, catchUp = {}) {
  const units = toUnits(titles);
  const seenMin = units.filter((u) => seen[u.key]).reduce((sum, u) => sum + u.runtimeMin, 0);
  const remainingMin = units.filter((u) => !seen[u.key]).reduce((sum, u) => sum + u.runtimeMin, 0);
  const regularMin = units.filter((u) => seen[u.key] && !catchUp[u.key]).reduce((sum, u) => sum + u.runtimeMin, 0);

  const days = Object.entries(seen).filter(([key]) => !catchUp[key]).map(([, day]) => dayNumber(day));
  const elapsed = days.length ? dayNumber(today) - Math.min(...days) : 0;
  if (elapsed < 2 || regularMin === 0) {
    return { seenMin, remainingMin, paceMinPerDay: null, etaDate: null };
  }
  const paceMinPerDay = regularMin / elapsed;
  const etaDate = fromDayNumber(dayNumber(today) + Math.ceil(remainingMin / paceMinPerDay));
  return { seenMin, remainingMin, paceMinPerDay, etaDate };
}
