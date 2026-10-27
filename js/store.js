import { ORDERS } from './logic.js?v=__BUILD__';

export const STORAGE_KEY = 'chrono-mcu:v1';
export const STATE_VERSION = 1;

export function defaultState() {
  return { version: STATE_VERSION, order: 'chrono', seen: {}, notes: {}, lastSeenKey: null };
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
  if (!isObject(s.notes)) errors.push('notes invalide');
  else {
    for (const [id, n] of Object.entries(s.notes)) {
      if (!isObject(n)) errors.push(`notes["${id}"]: invalide`);
      else {
        if ('rating' in n && !(Number.isInteger(n.rating) && n.rating >= 1 && n.rating <= 5)) {
          errors.push(`notes["${id}"].rating: entier 1 à 5 attendu`);
        }
        if ('text' in n && typeof n.text !== 'string') errors.push(`notes["${id}"].text invalide`);
      }
    }
  }
  if (s.lastSeenKey !== null && typeof s.lastSeenKey !== 'string') errors.push('lastSeenKey invalide');
  return errors;
}

export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return validateState(parsed).length === 0 ? parsed : defaultState();
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

function withSeen(state, seen, lastSeenKey) {
  return { ...state, seen, lastSeenKey };
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
  if (title.upcoming) return state;
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
  const errors = validateState(parsed);
  if (errors.length) return { ok: false, error: `Fichier invalide: ${errors[0]}` };
  return { ok: true, state: parsed };
}

export function setNote(state, titleId, patch) {
  if ('rating' in patch && patch.rating != null) {
    if (!(Number.isInteger(patch.rating) && patch.rating >= 1 && patch.rating <= 5)) {
      throw new Error('rating: entier 1 à 5 attendu');
    }
  }
  const next = { ...state.notes[titleId], ...patch };
  if (next.rating == null) delete next.rating;
  if (!next.text) delete next.text;
  const notes = { ...state.notes };
  if (Object.keys(next).length === 0) delete notes[titleId];
  else notes[titleId] = next;
  return { ...state, notes };
}
