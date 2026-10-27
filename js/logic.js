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
        title: e.title,
        runtimeMin: e.runtimeMin,
      }));
    }
    return [{ ...base, key: t.id, kind: 'film', title: t.title, runtimeMin: t.runtimeMin }];
  });
}

export function filterTitles(titles, { phase = null, type = null } = {}) {
  return titles.filter(
    (t) => (phase === null || t.phase === phase) && (type === null || t.type === type),
  );
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

const DAY_MS = 86_400_000;
const dayNumber = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export function stats(titles, seen, today) {
  const units = toUnits(titles);
  const seenMin = units.filter((u) => seen[u.key]).reduce((sum, u) => sum + u.runtimeMin, 0);
  const remainingMin = units.filter((u) => !seen[u.key]).reduce((sum, u) => sum + u.runtimeMin, 0);

  const days = Object.values(seen).map(dayNumber);
  const elapsed = days.length ? dayNumber(today) - Math.min(...days) : 0;
  if (elapsed < 2 || seenMin === 0) {
    return { seenMin, remainingMin, paceMinPerDay: null, etaDate: null };
  }
  const paceMinPerDay = seenMin / elapsed;
  const etaDate = fromDayNumber(dayNumber(today) + Math.ceil(remainingMin / paceMinPerDay));
  return { seenMin, remainingMin, paceMinPerDay, etaDate };
}
