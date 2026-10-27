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
  return titles.flatMap((t) => {
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
