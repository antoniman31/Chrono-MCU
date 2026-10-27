// Ordre des clés de data/mcu.json, partagé par les scripts qui réécrivent le fichier (un seul endroit à modifier quand un champ apparaît).
export const KEY_ORDER = [
  'id', 'title', 'type', 'phase', 'saga', 'releaseDate', 'releaseDateFr', 'chronoOrder', 'runtimeMin', 'postCredits',
  'upcoming', 'altUniverse', 'tmdbId', 'tvmazeId', 'poster', 'backdrop', 'overview', 'verified', 'episodes',
];
export const EPISODE_KEY_ORDER = ['n', 'title', 'titleFr', 'airDate', 'runtimeMin'];

const pick = (obj, order) => Object.fromEntries(order.filter((k) => k in obj).map((k) => [k, obj[k]]));

export function orderTitle(t) {
  const ordered = pick(t, KEY_ORDER);
  if (t.episodes) ordered.episodes = t.episodes.map((e) => pick(e, EPISODE_KEY_ORDER));
  return ordered;
}
