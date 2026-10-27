import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.themoviedb.org/3';
const KEY_ORDER = [
  'id', 'title', 'type', 'phase', 'saga', 'releaseDate', 'chronoOrder', 'runtimeMin', 'postCredits',
  'upcoming', 'tmdbId', 'poster', 'verified', 'episodes',
];

export function searchQuery(title) {
  return title.replace(/\s*\((?:saison|season)\s*\d+\)\s*$/i, '').trim();
}

export function seasonNumber(title) {
  const m = title.match(/\((?:saison|season)\s*(\d+)\)\s*$/i);
  return m ? Number(m[1]) : null;
}

export function pickResult(results, year) {
  const withPoster = results.filter((r) => r.poster_path);
  const yearOf = (r) => Number((r.release_date ?? r.first_air_date ?? '').slice(0, 4));
  return withPoster.find((r) => yearOf(r) === year) ?? withPoster[0] ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params, key) {
  const url = new URL(`${API}${path}`);
  url.search = new URLSearchParams({ api_key: key, language: 'fr-FR', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  return res.json();
}

async function findPoster(t, key) {
  const year = Number(t.releaseDate.slice(0, 4));
  const isFilm = t.type === 'film';
  const q = searchQuery(t.title);
  const search = await tmdb(isFilm ? '/search/movie' : '/search/tv', { query: q }, key);
  const hit = pickResult(search.results ?? [], year);
  if (!hit) return null;
  let poster = hit.poster_path;
  const season = seasonNumber(t.title);
  if (!isFilm && season) {
    try {
      const s = await tmdb(`/tv/${hit.id}/season/${season}`, {}, key);
      if (s.poster_path) poster = s.poster_path;
    } catch {
      /* on garde l'affiche de la série */
    }
  }
  return { tmdbId: hit.id, poster };
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error('Variable TMDB_API_KEY manquante (clé API v3 gratuite : https://www.themoviedb.org/settings/api).');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const dry = process.argv.includes('--dry');
  const path = new URL('../data/mcu.json', import.meta.url);
  const data = JSON.parse(readFileSync(path, 'utf8'));

  let found = 0;
  const missing = [];
  for (const t of data) {
    if (t.poster && !force) continue;
    try {
      const r = await findPoster(t, key);
      if (r) {
        Object.assign(t, r);
        found += 1;
      } else missing.push(t.title);
    } catch (e) {
      missing.push(`${t.title} (${e.message})`);
    }
    await sleep(120);
  }

  const out = data.map((t) => Object.fromEntries(KEY_ORDER.filter((k) => k in t).map((k) => [k, t[k]])));
  if (!dry) writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${found} affiche(s) trouvée(s)${dry ? ' (essai à blanc, rien écrit)' : ''}.`);
  if (missing.length) console.log(`Sans affiche : ${missing.join(' ; ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
