import { phaseList, sagaNames } from './phases.js?v=__BUILD__';

// Catégories qu'on peut cesser de suivre en bloc (Réglages > Ce que je suis). Fonctions pures, déduites des données du catalogue.
const averageRuntime = (t) => (t.episodes?.length ? t.episodes.reduce((sum, e) => sum + e.runtimeMin, 0) / t.episodes.length : Infinity);

// Catégories fixes ; chaque saga après la première ajoute la sienne (voir categoriesFor)
export const CATEGORIES = [
  { id: 'series', label: 'Séries', desc: 'Les séries Disney+, épisode par épisode', test: (t) => t.type === 'serie' },
  {
    id: 'shorts', label: 'Courts formats', desc: 'Films de moins d\'une heure et séries aux épisodes de moins de 10 min',
    test: (t) => (t.type === 'film' ? t.runtimeMin < 60 : averageRuntime(t) < 10),
  },
  { id: 'altUniverse', label: 'Autres réalités', desc: 'What If...? et les titres hors de la réalité principale', test: (t) => t.altUniverse === true },
];

// Toutes les catégories : les fixes, puis une par saga de data/sagas.json sauf la première (id de la catégorie = id de la saga)
export const categoriesFor = (sagas = []) => [
  ...CATEGORIES,
  ...sagas.slice(1).map((s, i) => ({ id: s.id, saga: s.id, previous: sagas[i].id, test: (t) => t.saga === s.id })),
];

// Libellé et description d'une catégorie ; celle d'une saga prend son nom dans data/sagas.json (et ses phases dans le catalogue)
export function categoryTexts(c, sagas = [], titles = []) {
  if (!c.saga) return { label: c.label, desc: c.desc };
  const phases = phaseList(titles.filter((t) => t.saga === c.saga));
  const range = phases.length ? (phases.length === 1 ? `Phase ${phases[0]}` : `Phases ${phases[0]} à ${phases.at(-1)}`) : null;
  const stop = c.previous ? ` : à couper pour s'arrêter à ${sagaNames(c.previous, sagas, titles).inText}` : '';
  return { label: sagaNames(c.saga, sagas, titles).short, desc: `${range ?? 'Cette saga'}${stop}` };
}

// Un identifiant de catégorie est un texte non vide ; celui d'une saga est vérifié contre les titres (matchesCategory)
export const isCategoryId = (id) => typeof id === 'string' && id !== '';

export const matchesCategory = (id, title) => {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.test(title) : title.saga === id;
};
export const categoryLabel = (id, sagas = [], titles = []) => {
  const c = categoriesFor(sagas).find((x) => x.id === id);
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
