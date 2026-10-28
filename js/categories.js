import { phaseList, sagaNames } from './phases.js?v=__BUILD__';

// Catégories qu'on peut cesser de suivre en bloc (Réglages > Ce que je suis). Fonctions pures, déduites des données du catalogue.
const averageRuntime = (t) => (t.episodes?.length ? t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0) / t.episodes.length : Infinity);

export const CATEGORIES = [
  { id: 'series', label: 'Séries', desc: 'Les séries Disney+, épisode par épisode', test: (t) => t.type === 'serie' },
  {
    id: 'shorts', label: 'Courts formats', desc: 'Films de moins d\'une heure et séries aux épisodes de moins de 10 min',
    test: (t) => (t.type === 'film' ? t.runtimeMin < 60 : averageRuntime(t) < 10),
  },
  { id: 'altUniverse', label: 'Autres réalités', desc: 'What If...? et les titres hors de la réalité principale', test: (t) => t.altUniverse === true },
  { id: 'multiverse', saga: 'multiverse', label: 'Saga du Multivers', desc: 'Phases 4 à 6 : à couper pour s\'arrêter à la Saga de l\'Infini', test: (t) => t.saga === 'multiverse' },
];

// Libellé et description d'une catégorie ; celle d'une saga prend son nom dans data/sagas.json (et ses phases dans le catalogue)
export function categoryTexts(c, sagas = [], titles = []) {
  if (!c.saga) return { label: c.label, desc: c.desc };
  const phases = phaseList(titles.filter((t) => t.saga === c.saga));
  const range = phases.length ? (phases.length === 1 ? `Phase ${phases[0]}` : `Phases ${phases[0]} à ${phases.at(-1)}`) : null;
  const previous = sagaNames('infinity', sagas, titles).inText;
  return { label: sagaNames(c.saga, sagas, titles).short, desc: `${range ?? 'Cette saga'} : à couper pour s'arrêter à ${previous}` };
}
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const matchesCategory = (id, title) => Boolean(CATEGORIES.find((c) => c.id === id)?.test(title));
export const categoryLabel = (id, sagas = [], titles = []) => {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? categoryTexts(c, sagas, titles).label : id;
};

// Un titre est ignoré s'il l'a été explicitement, ou si l'une de ses catégories est coupée et qu'il n'a pas été réintégré.
export function ignoreInfo(state, title) {
  const explicit = Boolean(state.ignored?.[title.id]);
  const category = (state.skip ?? []).find((id) => matchesCategory(id, title)) ?? null;
  const viaCategory = category !== null && !state.included?.[title.id];
  return { ignored: explicit || viaCategory, explicit, category: viaCategory ? category : null };
}

export const titleIgnored = (state, title) => ignoreInfo(state, title).ignored;

// Table { id: true } des titres ignorés, à passer aux fonctions de logique.js
export function effectiveIgnored(state, titles) {
  const map = {};
  for (const t of titles) if (titleIgnored(state, t)) map[t.id] = true;
  return map;
}
