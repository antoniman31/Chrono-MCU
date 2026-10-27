import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isDate = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const isPosInt = (n) => Number.isInteger(n) && n > 0;
const isText = (s) => typeof s === 'string' && s.trim() !== '';

export function validate(data) {
  if (!Array.isArray(data)) return ['le catalogue doit être un tableau'];
  const errors = [];
  const ids = new Set();
  const orders = new Set();

  data.forEach((t, i) => {
    const at = `#${i} (${t?.id ?? '?'})`;
    if (!t || typeof t !== 'object') return errors.push(`${at}: entrée invalide`);

    if (!isText(t.id)) errors.push(`${at}: id manquant`);
    else if (ids.has(t.id)) errors.push(`${at}: id en double`);
    else ids.add(t.id);

    if (!isText(t.title)) errors.push(`${at}: title manquant`);
    if (!['film', 'serie'].includes(t.type)) errors.push(`${at}: type invalide`);
    if (!isPosInt(t.phase)) errors.push(`${at}: phase invalide`);
    if (!isText(t.saga)) errors.push(`${at}: saga manquante`);
    if (!isDate(t.releaseDate)) errors.push(`${at}: releaseDate invalide`);
    if (typeof t.verified !== 'boolean') errors.push(`${at}: verified doit être un booléen`);

    if (!isPosInt(t.chronoOrder)) errors.push(`${at}: chronoOrder invalide`);
    else if (orders.has(t.chronoOrder)) errors.push(`${at}: chronoOrder en double`);
    else orders.add(t.chronoOrder);

    if ('upcoming' in t && t.upcoming !== true) errors.push(`${at}: upcoming doit valoir true ou être absent`);

    if ('altUniverse' in t && t.altUniverse !== true) errors.push(`${at}: altUniverse doit valoir true ou être absent`);
    if ('poster' in t && !(typeof t.poster === 'string' && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(t.poster))) {
      errors.push(`${at}: poster doit être un chemin TMDB du type "/abc123.jpg"`);
    }
    if ('backdrop' in t && !(typeof t.backdrop === 'string' && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(t.backdrop))) {
      errors.push(`${at}: backdrop doit être un chemin TMDB du type "/abc123.jpg"`);
    }
    if ('overview' in t && !(isText(t.overview) && t.overview.length <= 400)) errors.push(`${at}: overview doit être un texte de 400 caractères maximum`);
    if ('releaseDateFr' in t && !(t.type === 'film' && isDate(t.releaseDateFr))) errors.push(`${at}: releaseDateFr réservé aux films (date valide)`);
    if ('tvmazeId' in t && !(t.type === 'serie' && isPosInt(t.tvmazeId))) errors.push(`${at}: tvmazeId réservé aux séries (entier positif)`);
    if ('tmdbId' in t && !isPosInt(t.tmdbId)) errors.push(`${at}: tmdbId doit être un entier positif`);

    if ('postCredits' in t) {
      const pcs = t.postCredits;
      const ok = t.type === 'film' && Array.isArray(pcs) && new Set(pcs).size === pcs.length && pcs.every((x) => ['mid', 'end'].includes(x));
      if (!ok) errors.push(`${at}: postCredits réservé aux films, tableau sans doublon de "mid" / "end"`);
    }

    if (t.upcoming === true) {
      if ('runtimeMin' in t || 'episodes' in t) errors.push(`${at}: un titre à venir n'a ni runtimeMin ni episodes`);
    } else if (t.type === 'film') {
      if (!isPosInt(t.runtimeMin)) errors.push(`${at}: runtimeMin requis pour un film`);
      if ('episodes' in t) errors.push(`${at}: un film n'a pas d'episodes`);
    } else if (t.type === 'serie') {
      if ('runtimeMin' in t) errors.push(`${at}: runtimeMin interdit pour une série`);
      if (!Array.isArray(t.episodes) || t.episodes.length === 0) {
        errors.push(`${at}: episodes requis (non vide) pour une série`);
      } else {
        t.episodes.forEach((e, j) => {
          if (e?.n !== j + 1) errors.push(`${at}: épisode ${j + 1} doit avoir n=${j + 1}`);
          if (!isText(e?.title)) errors.push(`${at}: épisode ${j + 1} sans title`);
          if (!isPosInt(e?.runtimeMin)) errors.push(`${at}: épisode ${j + 1} sans runtimeMin`);
          if (e && 'airDate' in e && !isDate(e.airDate)) errors.push(`${at}: épisode ${j + 1} avec airDate invalide`);
        });
      }
    }
  });

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? new URL('../data/mcu.json', import.meta.url);
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible: ${e.message}`);
    process.exit(1);
  }
  const errors = validate(data);
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    process.exit(1);
  }
  const unverified = data.filter((t) => !t.verified).length;
  const upcoming = data.filter((t) => t.upcoming).length;
  console.log(`OK: ${data.length} titres (${unverified} non vérifiés, ${upcoming} à venir)`);
}
