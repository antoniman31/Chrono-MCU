import { ORDERS, sortTitles, toUnits } from './logic.js?v=__BUILD__';
import { CATEGORY_IDS, ignoreInfo, matchesCategory, titleIgnored } from './categories.js?v=__BUILD__';

// Le nom de la clé reste « v1 » pour ne pas déplacer les données ; la version du contenu, elle, est dans `state.version`.
export const STORAGE_KEY = 'chrono-mcu:v1';
export const BACKUP_KEY = 'chrono-mcu:v1:pre-v2';
export const STATE_VERSION = 2;

export function defaultState() {
  return { version: STATE_VERSION, order: 'chrono', seen: {}, ignored: {}, catchUp: {}, skip: [], included: {}, versions: {}, lastSeenKey: null };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export function validateState(s) {
  if (!isObject(s)) return ['état invalide'];
  const errors = [];
  if (s.version !== STATE_VERSION) errors.push(`version non supportée: ${s.version}`);
  if (!ORDERS.includes(s.order)) errors.push('order invalide');
  if (!isObject(s.seen)) errors.push('seen invalide');
  else {
    for (const [key, day] of Object.entries(s.seen)) {
      if (!isDay(day)) errors.push(`seen["${key}"]: date invalide`);
    }
  }
  if ('ignored' in s) {
    if (!isObject(s.ignored)) errors.push('ignored invalide');
    else if (!Object.values(s.ignored).every((v) => v === true)) errors.push('ignored: valeurs true attendues');
  }
  if ('skip' in s) {
    if (!Array.isArray(s.skip) || !s.skip.every((id) => CATEGORY_IDS.includes(id))) errors.push('skip invalide');
  }
  if ('included' in s) {
    if (!isObject(s.included)) errors.push('included invalide');
    else if (!Object.values(s.included).every((v) => v === true)) errors.push('included: valeurs true attendues');
  }
  if ('versions' in s) {
    if (!isObject(s.versions)) errors.push('versions invalide');
    else if (!Object.values(s.versions).every((v) => typeof v === 'string' && v !== '')) errors.push('versions: identifiants de version attendus');
  }
  if ('catchUp' in s) {
    if (!isObject(s.catchUp)) errors.push('catchUp invalide');
    else if (!Object.values(s.catchUp).every((v) => v === true)) errors.push('catchUp: valeurs true attendues');
  }
  if (s.lastSeenKey !== null && typeof s.lastSeenKey !== 'string') errors.push('lastSeenKey invalide');
  return errors;
}

// Une entrée par version de départ: transforme un état de la version N en version N+1.
// v1 -> v2: les notes et commentaires sont abandonnés, `ignored` apparaît.
const MIGRATIONS = {
  1: (s) => ({ version: 2, order: s.order, seen: s.seen, ignored: isObject(s.ignored) ? s.ignored : {}, lastSeenKey: s.lastSeenKey }),
};

// Amène un état lu (stockage ou fichier importé) à la version courante, sans le valider.
export function migrate(raw) {
  if (!isObject(raw)) return { ok: false, error: 'état invalide' };
  let state = raw;
  if (Number.isInteger(state.version) && state.version > STATE_VERSION) {
    return { ok: false, error: `fichier plus récent que l'application (version ${state.version}) : mets l'application à jour` };
  }
  if (!Number.isInteger(state.version) || state.version < 1) return { ok: false, error: `version non supportée: ${state.version}` };
  while (state.version < STATE_VERSION) {
    const step = MIGRATIONS[state.version];
    if (!step) return { ok: false, error: `version non supportée: ${state.version}` };
    state = step(state);
  }
  // Ne garde que les champs connus
  const { version, order, seen, ignored, catchUp, skip, included, versions, lastSeenKey } = state;
  return { ok: true, state: { version, order, seen, ignored: ignored ?? {}, catchUp: catchUp ?? {}, skip: skip ?? [], included: included ?? {}, versions: versions ?? {}, lastSeenKey } };
}

export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const result = migrate(parsed);
    if (!result.ok || validateState(result.state).length) return defaultState();
    if (parsed.version !== STATE_VERSION) {
      // Migration: on garde l'ancien contenu tel quel (une seule fois) avant de réécrire
      try {
        if (!storage.getItem(BACKUP_KEY)) storage.setItem(BACKUP_KEY, raw);
        storage.setItem(STORAGE_KEY, JSON.stringify(result.state));
      } catch { /* stockage plein ou indisponible: l'état migré reste en mémoire */ }
    }
    return result.state;
  } catch {
    return defaultState();
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function setOrder(state, order) {
  if (!ORDERS.includes(order)) throw new Error(`ordre inconnu: ${order}`);
  return { ...state, order };
}

// Décocher une unité la sort aussi du rattrapage : si elle est re-cochée plus tard, c'est un vrai visionnage
function withSeen(state, seen, lastSeenKey) {
  const catchUp = Object.fromEntries(Object.entries(state.catchUp ?? {}).filter(([key]) => seen[key]));
  return { ...state, seen, catchUp, lastSeenKey };
}

export function toggleUnit(state, key, today) {
  const seen = { ...state.seen };
  if (seen[key]) {
    delete seen[key];
    return withSeen(state, seen, state.lastSeenKey);
  }
  seen[key] = today;
  return withSeen(state, seen, key);
}

export function setTitleSeen(state, title, value, today) {
  if (title.upcoming || titleIgnored(state, title)) return state;
  if (title.type === 'film') {
    if (Boolean(state.seen[title.id]) === value) return state;
    return toggleUnit(state, title.id, today);
  }
  const keys = title.episodes.map((e) => `${title.id}/${e.n}`);
  const seen = { ...state.seen };
  let lastSeenKey = state.lastSeenKey;
  for (const key of keys) {
    if (value && !seen[key]) seen[key] = today;
    if (!value) delete seen[key];
  }
  if (value) lastSeenKey = keys[keys.length - 1];
  return withSeen(state, seen, lastSeenKey);
}

export const isIgnored = (state, title) => titleIgnored(state, title);

export function setIgnored(state, id, value) {
  if (Boolean(state.ignored[id]) === value) return state;
  const ignored = { ...state.ignored };
  if (value) ignored[id] = true;
  else delete ignored[id];
  return { ...state, ignored };
}

export function isTitleSeen(state, title) {
  if (title.upcoming) return false;
  if (title.type === 'film') return Boolean(state.seen[title.id]);
  return title.episodes.every((e) => state.seen[`${title.id}/${e.n}`]);
}

export function setPhaseSeen(state, titles, phase, value, today) {
  return titles
    .filter((t) => t.phase === phase)
    .reduce((acc, t) => setTitleSeen(acc, t, value, today), state);
}

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

export function importState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fichier illisible: ce n'est pas du JSON valide." };
  }
  const migrated = migrate(parsed);
  if (!migrated.ok) return { ok: false, error: `Fichier invalide: ${migrated.error}` };
  const errors = validateState(migrated.state);
  if (errors.length) return { ok: false, error: `Fichier invalide: ${errors[0]}` };
  return { ok: true, state: migrated.state };
}

// Rattrapage : unités non vues, non ignorées et sorties, de la première jusqu'à la fin du titre `id` (incluse), dans l'ordre actif.
export function pendingUntil(state, titles, id) {
  const units = toUnits(sortTitles(titles.filter((t) => !titleIgnored(state, t)), state.order));
  let end = -1;
  units.forEach((u, i) => { if (u.titleId === id) end = i; });
  return end === -1 ? [] : units.slice(0, end + 1).filter((u) => !state.seen[u.key]);
}

export function markUntil(state, titles, id, today) {
  const pending = pendingUntil(state, titles, id);
  if (!pending.length) return state;
  const seen = { ...state.seen };
  const catchUp = { ...state.catchUp };
  for (const u of pending) {
    seen[u.key] = today;
    catchUp[u.key] = true;
  }
  return { ...state, seen, catchUp, lastSeenKey: pending[pending.length - 1].key };
}

// Version d'un film regardée (null : version d'origine). Champ optionnel de l'état : pas de changement de STATE_VERSION.
export function setTitleVersion(state, titleId, versionId) {
  const versions = { ...(state.versions ?? {}) };
  if (versionId) versions[titleId] = versionId;
  else delete versions[titleId];
  return { ...state, versions };
}

// Ignorer / réintégrer un titre en tenant compte des catégories coupées : « ignorer » est explicite et l'emporte toujours ;
// « ne plus ignorer » retire l'ignorance explicite, et réintègre le titre s'il n'était ignoré que par sa catégorie.
export function setTitleIgnored(state, title, value) {
  const info = ignoreInfo(state, title);
  if (info.ignored === value) return state;
  const ignored = { ...state.ignored };
  const included = { ...state.included };
  if (value) {
    ignored[title.id] = true;
    delete included[title.id];
  } else {
    delete ignored[title.id];
    if ((state.skip ?? []).some((id) => matchesCategory(id, title))) included[title.id] = true;
  }
  return { ...state, ignored, included };
}

// Couper ou suivre à nouveau une catégorie ; la suivre à nouveau efface les réintégrations devenues sans objet.
export function setSkip(state, categoryId, skipped, titles) {
  if (!CATEGORY_IDS.includes(categoryId)) throw new Error(`catégorie inconnue: ${categoryId}`);
  const current = state.skip ?? [];
  if (current.includes(categoryId) === skipped) return state;
  const skip = skipped ? [...current, categoryId] : current.filter((id) => id !== categoryId);
  const included = { ...state.included };
  if (!skipped) for (const t of titles) if (matchesCategory(categoryId, t) && !skip.some((id) => matchesCategory(id, t))) delete included[t.id];
  return { ...state, skip, included };
}
