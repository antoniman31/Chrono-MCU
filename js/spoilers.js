// Mode sans spoiler : fonctions pures. Un titre est « commencé » dès qu'une de ses unités est cochée
// (film vu, ou au moins un épisode vu) ; avant cela on cache son résumé et son image paysage.
// Le titre d'un épisode reste caché tant que cet épisode n'est pas vu.
export const isStarted = (state, title) =>
  title.type === 'film'
    ? Boolean(state.seen[title.id])
    : (title.episodes ?? []).some((e) => state.seen[`${title.id}/${e.n}`]);

export const hideSummary = (view, state, title) => view.spoilerFree === true && !isStarted(state, title);

export const hideEpisodeTitle = (view, state, titleId, n) => view.spoilerFree === true && !state.seen[`${titleId}/${n}`];
