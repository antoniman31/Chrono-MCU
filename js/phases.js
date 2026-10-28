// Barre des phases : libellés et chiffres, calculés à partir du catalogue (fonctions pures).
import { progress, toUnits } from './logic.js?v=__BUILD__';
import { formatDuration } from './duration.js?v=__BUILD__';

export const phaseList = (titles) => [...new Set(titles.map((t) => t.phase))].sort((a, b) => a - b);

// Les sagas viennent de data/sagas.json : { id, name }. Marvel ne nomme officiellement que deux sagas et les phases n'ont pas
// de nom propre : une saga sans nom (`name: null`) s'affiche « Phases 7 à 9 » d'après les phases du catalogue, sans nom inventé.
export function sagaLabel(saga, sagas = [], titles = []) {
  const name = sagas.find((s) => s.id === saga)?.name;
  if (name) return name;
  const phases = phaseList(titles.filter((t) => t.saga === saga));
  if (!phases.length) return saga;
  return phases.length === 1 ? `Phase ${phases[0]}` : `Phases ${phases[0]} à ${phases.at(-1)}`;
}

// Nom de saga pour un titre (« Saga de l'Infini ») et pour une phrase (« la Saga de l'Infini ») : l'article du fichier est retiré du
// premier et gardé en minuscules dans le second. Un nom sans article (ou « Phases 7 à 9 ») est utilisé tel quel.
export function sagaNames(saga, sagas = [], titles = []) {
  const label = sagaLabel(saga, sagas, titles);
  const m = label.match(/^(la|le|les)\s+(.+)$/i);
  if (!m) return { short: label, inText: label };
  const short = m[2][0].toUpperCase() + m[2].slice(1);
  return { short, inText: `${m[1].toLowerCase()} ${m[2]}` };
}

const mostFrequent = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// phase : numéro, ou null pour « toutes ». allTitles : catalogue complet ; counted : titres suivis (ni ignorés ni pas sortis).
export function phaseSummary(allTitles, counted, seen, phase, sagas = []) {
  const inPhase = (t) => phase === null || t.phase === phase;
  const years = allTitles.filter(inPhase).map((t) => Number(t.releaseDate.slice(0, 4)));
  const followed = counted.filter((t) => inPhase(t) && !t.upcoming);
  const saga = phase === null ? null : mostFrequent(allTitles.filter(inPhase).map((t) => t.saga));
  return {
    phase,
    saga: saga ? sagaLabel(saga, sagas, allTitles) : null,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
    titles: followed.length,
    minutes: toUnits(followed).reduce((sum, u) => sum + u.runtimeMin, 0),
    percent: progress(followed, seen).percent,
  };
}


// Deux lignes sous la barre : le titre (« Saga du Multivers ») et les chiffres
export function phaseInfo(s) {
  const title = s.phase === null ? 'Toutes les phases' : (s.saga ?? `Phase ${s.phase}`);
  const years = s.from === null ? null : s.from === s.to ? String(s.from) : `${s.from}–${s.to}`;
  const details = [years, `${s.titles} titre${s.titles > 1 ? 's' : ''}`, formatDuration(s.minutes), `${s.percent} % vu`].filter(Boolean).join(' · ');
  return { title, details };
}
