// Barre des phases : libellés et chiffres, calculés à partir du catalogue (fonctions pures).
import { progress, toUnits } from './logic.js?v=__BUILD__';
import { formatDuration } from './duration.js?v=__BUILD__';

// Marvel ne nomme officiellement que les deux sagas ; les phases n'ont pas de nom propre.
const SAGAS = { infinity: 'Infinity Saga', multiverse: 'Saga du Multivers' };
export const sagaLabel = (saga) => SAGAS[saga] ?? saga;

export const phaseList = (titles) => [...new Set(titles.map((t) => t.phase))].sort((a, b) => a - b);

const mostFrequent = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// phase : numéro, ou null pour « toutes ». allTitles : catalogue complet ; counted : titres suivis (ni ignorés ni pas sortis).
export function phaseSummary(allTitles, counted, seen, phase) {
  const inPhase = (t) => phase === null || t.phase === phase;
  const years = allTitles.filter(inPhase).map((t) => Number(t.releaseDate.slice(0, 4)));
  const followed = counted.filter((t) => inPhase(t) && !t.upcoming);
  const saga = phase === null ? null : mostFrequent(allTitles.filter(inPhase).map((t) => t.saga));
  return {
    phase,
    saga: saga ? sagaLabel(saga) : null,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
    titles: followed.length,
    minutes: toUnits(followed).reduce((sum, u) => sum + u.runtimeMin, 0),
    percent: progress(followed, seen).percent,
  };
}


// Deux lignes sous la barre : le titre (« Phase 4 · Saga du Multivers ») et les chiffres
export function phaseInfo(s) {
  const title = s.phase === null ? 'Toutes les phases' : `Phase ${s.phase} · ${s.saga}`;
  const years = s.from === null ? null : s.from === s.to ? String(s.from) : `${s.from}–${s.to}`;
  const details = [years, `${s.titles} titre${s.titles > 1 ? 's' : ''}`, formatDuration(s.minutes), `${s.percent} % vu`].filter(Boolean).join(' · ');
  return { title, details };
}
