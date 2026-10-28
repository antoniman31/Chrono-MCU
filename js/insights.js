// Statistiques de l'onglet Progression : fonctions pures, calculées depuis les dates de coche (seen[clé] = « AAAA-MM-JJ »)
// et le catalogue. Les coches de rattrapage (catchUp) ne comptent pas dans le rythme, comme dans stats().
import { toUnits } from './logic.js?v=__BUILD__';

const DAY_MS = 86_400_000;
export const dayNumber = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY_MS);
export const fromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
// Lundi = 0 : la semaine commence le lundi (le 1er janvier 1970 était un jeudi)
export const weekStart = (day) => day - ((day + 3) % 7);

// { jour: nombre d'unités (films ou épisodes) cochées ce jour-là }
export function activityByDay(seen, catchUp = {}) {
  const out = {};
  for (const [key, date] of Object.entries(seen)) {
    if (catchUp[key] || typeof date !== 'string') continue;
    const d = dayNumber(date);
    if (Number.isNaN(d)) continue;
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

// Série de jours consécutifs : en cours (aujourd'hui ou hier compte encore) et meilleure
export function streaks(activity, today) {
  const days = Object.keys(activity).map(Number).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const t = dayNumber(today);
  let current = 0;
  let cursor = activity[t] ? t : t - 1;
  while (activity[cursor]) { current += 1; cursor -= 1; }
  return { current, best };
}

// Unités cochées par semaine (lundi à dimanche), de la plus ancienne à la semaine en cours
export function weeklyActivity(activity, today, weeks = 12) {
  const first = weekStart(dayNumber(today)) - (weeks - 1) * 7;
  const out = Array.from({ length: weeks }, (_, i) => ({ start: fromDayNumber(first + i * 7), count: 0 }));
  for (const [d, n] of Object.entries(activity)) {
    const i = Math.floor((Number(d) - first) / 7);
    if (i >= 0 && i < weeks) out[i].count += n;
  }
  return out;
}

// Calendrier d'activité : `weeks` colonnes de 7 jours (lundi en haut), niveau 0 à 3, jours futurs à null
export function heatmap(activity, today, weeks = 18) {
  const t = dayNumber(today);
  const first = weekStart(t) - (weeks - 1) * 7;
  const level = (n) => (!n ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = first + i;
    return { day: fromDayNumber(d), count: d > t ? null : activity[d] ?? 0, level: d > t ? null : level(activity[d]) };
  });
}

// Moyenne d'unités par semaine depuis la première coche (au moins une semaine)
export function perWeek(activity, today) {
  const days = Object.keys(activity).map(Number);
  if (!days.length) return null;
  const total = Object.values(activity).reduce((a, b) => a + b, 0);
  const weeks = Math.max(1, (dayNumber(today) - Math.min(...days) + 1) / 7);
  return total / weeks;
}

// Jalons : première et dernière coche, jour où 25, 50, 75 et 100 % des unités ont été atteints
export function milestones(titles, seen) {
  const units = toUnits(titles);
  const names = new Map(titles.map((t) => [t.id, t.title]));
  const dated = units.filter((u) => typeof seen[u.key] === 'string').map((u) => ({ u, date: seen[u.key] }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!dated.length) return { first: null, last: null, steps: [] };
  const label = (u) => (u.kind === 'film' ? u.title : `${names.get(u.titleId)} · ép. ${u.n}`);
  const steps = [25, 50, 75, 100].map((pct) => {
    const needed = Math.ceil((units.length * pct) / 100);
    return { pct, date: dated.length >= needed ? dated[needed - 1].date : null };
  });
  const first = dated[0];
  const last = dated[dated.length - 1];
  return { first: { date: first.date, label: label(first.u) }, last: { date: last.date, label: label(last.u) }, steps };
}

// Temps (minutes) vu / total par phase, saga et format ; films et séries comptent pour leur durée réelle
export function breakdown(titles, seen) {
  const units = toUnits(titles);
  const byId = new Map(titles.map((t) => [t.id, t]));
  const group = (keyOf) => {
    const map = new Map();
    for (const u of units) {
      const k = keyOf(u, byId.get(u.titleId));
      const g = map.get(k) ?? { key: k, seenMin: 0, totalMin: 0, seen: 0, total: 0 };
      g.totalMin += u.runtimeMin;
      g.total += 1;
      if (seen[u.key]) { g.seenMin += u.runtimeMin; g.seen += 1; }
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => (typeof a.key === 'number' ? a.key - b.key : String(a.key).localeCompare(String(b.key))));
  };
  const format = (u, t) => (t.type === 'serie' ? 'serie' : t.runtimeMin < 60 ? 'short' : 'film');
  return { byPhase: group((u) => u.phase), bySaga: group((u, t) => t.saga), byFormat: group(format) };
}

const titleMinutes = (t) => (t.type === 'film' ? t.runtimeMin : (t.episodes ?? []).reduce((sum, e) => sum + e.runtimeMin, 0));

// Records et chiffres du MCU, sur les titres suivis
export function records(titles, seen) {
  const real = titles.filter((t) => !t.upcoming);
  const films = real.filter((t) => t.type === 'film');
  const series = real.filter((t) => t.type === 'serie');
  const pick = (list, score, dir) => list.reduce((best, t) => (best === null || dir * (score(t) - score(best)) > 0 ? t : best), null);
  const years = {};
  for (const t of real) { const y = t.releaseDate.slice(0, 4); years[y] = (years[y] ?? 0) + 1; }
  const topYear = Object.entries(years).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  const withPost = real.filter((t) => (t.postCredits ?? []).length > 0);
  const postSeen = withPost.filter((t) => (t.type === 'film' ? Boolean(seen[t.id]) : (t.episodes ?? []).every((e) => seen[`${t.id}/${e.n}`]))).length;
  const longest = pick(films, (t) => t.runtimeMin, 1);
  const shortest = pick(films, (t) => t.runtimeMin, -1);
  const mostEpisodes = pick(series, (t) => t.episodes.length, 1);
  const longestSeries = pick(series, titleMinutes, 1);
  return {
    totalMin: real.reduce((sum, t) => sum + titleMinutes(t), 0),
    films: films.length,
    series: series.length,
    episodes: series.reduce((sum, t) => sum + t.episodes.length, 0),
    longest: longest && { title: longest.title, min: longest.runtimeMin },
    shortest: shortest && { title: shortest.title, min: shortest.runtimeMin },
    mostEpisodes: mostEpisodes && { title: mostEpisodes.title, n: mostEpisodes.episodes.length },
    longestSeries: longestSeries && { title: longestSeries.title, min: titleMinutes(longestSeries) },
    topYear: topYear && { year: topYear[0], n: topYear[1] },
    postCredits: { with: withPost.length, seen: postSeen, total: real.length },
  };
}

// Frise des sorties : un point par titre, groupé par année de sortie
export function releaseTimeline(titles, seen) {
  const real = titles.filter((t) => !t.upcoming).slice().sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const years = new Map();
  for (const t of real) {
    const y = t.releaseDate.slice(0, 4);
    const done = t.type === 'film' ? Boolean(seen[t.id]) : (t.episodes ?? []).every((e) => seen[`${t.id}/${e.n}`]);
    const row = years.get(y) ?? { year: y, items: [] };
    row.items.push({ id: t.id, title: t.title, done, type: t.type });
    years.set(y, row);
  }
  return [...years.values()].map((r) => ({ ...r, done: r.items.filter((i) => i.done).length }));
}
