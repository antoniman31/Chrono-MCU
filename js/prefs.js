export const VIEW_KEY = 'chrono-mcu:view';
export const THEMES = ['auto', 'light', 'dark'];
export const NUDGE_CHOICES = [7, 14, 30, 0]; // jours avant le rappel de sauvegarde ; 0 = jamais
export const DEFAULT_GOAL = '2026-12-18'; // sortie annoncée d'Avengers : Doomsday

const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function normalizeView(saved) {
  return {
    groupByPhase: saved?.groupByPhase !== false,
    showPosters: saved?.showPosters !== false,
    collapsedPhases: Array.isArray(saved?.collapsedPhases) ? saved.collapsedPhases.filter(Number.isInteger) : [],
    // Anciennes sauvegardes : le thème « oled » est devenu « sombre » + noir OLED
    theme: saved?.theme === 'oled' ? 'dark' : THEMES.includes(saved?.theme) ? saved.theme : 'auto',
    oled: saved?.oled === true || saved?.theme === 'oled',
    // Dernière sauvegarde (export ou import) et report du rappel : propres à cet appareil, jamais exportés
    lastBackup: isDay(saved?.lastBackup?.day) && Number.isInteger(saved.lastBackup.seenCount) && saved.lastBackup.seenCount >= 0
      ? { day: saved.lastBackup.day, seenCount: saved.lastBackup.seenCount }
      : null,
    nudgeUntil: isDay(saved?.nudgeUntil) ? saved.nudgeUntil : null,
    nudgeDays: NUDGE_CHOICES.includes(saved?.nudgeDays) ? saved.nudgeDays : 30,
    // Mode sans spoiler : masque résumé, image paysage et titres d'épisodes de ce qui n'est pas encore commencé
    spoilerFree: saved?.spoilerFree === true,
    // Date cible de l'objectif : Doomsday tant que rien n'est enregistré ; null = objectif retiré par l'utilisateur
    goalDate: saved && 'goalDate' in saved ? (isDay(saved.goalDate) ? saved.goalDate : null) : DEFAULT_GOAL,
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
