export const VIEW_KEY = 'chrono-mcu:view';
export const THEMES = ['auto', 'light', 'dark', 'oled'];

export function normalizeView(saved) {
  return {
    groupByPhase: saved?.groupByPhase !== false,
    showPosters: saved?.showPosters !== false,
    collapsedPhases: Array.isArray(saved?.collapsedPhases) ? saved.collapsedPhases.filter(Number.isInteger) : [],
    theme: THEMES.includes(saved?.theme) ? saved.theme : 'auto',
  };
}

export function loadView(storage) {
  try {
    return normalizeView(JSON.parse(storage?.getItem(VIEW_KEY)));
  } catch {
    return normalizeView(null);
  }
}

export function saveView(storage, view) {
  try {
    storage?.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* préférence d'affichage: sans importance si elle n'est pas conservée */
  }
}
