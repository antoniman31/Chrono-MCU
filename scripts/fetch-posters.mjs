import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.themoviedb.org/3';
const KEY_ORDER = [
  'id', 'title', 'type', 'phase', 'saga', 'releaseDate', 'chronoOrder', 'runtimeMin', 'postCredits',
  'upcoming', 'altUniverse', 'tmdbId', 'tvmazeId', 'poster', 'verified', 'episodes',
];

export function searchQuery(title) {
  return title.replace(/\s*\((?:saison|season)\s*\d+\)\s*$/i, '').trim();
}

export function seasonNumber(title) {
  const m = title.match(/\((?:saison|season)\s*(\d+)\)\s*$/i);
  return m ? Number(m[1]) : null;
}

const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function pickResult(results, year, query = '') {
  const withPoster = results.filter((r) => r.poster_path);
  const yearOf = (r) => Number((r.release_date ?? r.first_air_date ?? '').slice(0, 4));
  const q = norm(query);
  const BONUS = /making[- ]?of|assembled|podcast|behind the scenes|documentary|featurette|rassemblement|coulisses/i;
  const score = (r) =>
    (q && [r.title, r.name, r.original_title, r.original_name].some((n) => norm(n) === q) ? 3 : 0) +
    (yearOf(r) === year ? 2 : 0) -
    ([r.title, r.name, r.original_title, r.original_name].some((n) => BONUS.test(n ?? '')) ? 10 : 0);
  const ranked = withPoster.map((r, i) => ({ r, i, score: score(r) })).sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked[0]?.r ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params, key) {
  const url = new URL(`${API}${path}`);
  url.search = new URLSearchParams({ api_key: key, language: 'fr-FR', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  return res.json();
}

async function seasonPoster(tvId, season, fallback, key) {
  try {
    const s = await tmdb(`/tv/${tvId}/season/${season}`, {}, key);
    return s.poster_path ?? fallback;
  } catch {
    return fallback;
  }
}

async function findPoster(t, key, showCache) {
  const isFilm = t.type === 'film';
  const q = searchQuery(t.title);
  const season = seasonNumber(t.title);
  if (!isFilm && season && season > 1 && showCache.has(q)) {
    const show = showCache.get(q);
    return { tmdbId: show.id, poster: await seasonPoster(show.id, season, show.poster_path, key) };
  }
  const year = Number(t.releaseDate.slice(0, 4));
  const search = await tmdb(isFilm ? '/search/movie' : '/search/tv', { query: q }, key);
  const hit = pickResult(search.results ?? [], year, q);
  if (!hit) return null;
  if (!isFilm) showCache.set(q, hit);
  const poster = !isFilm && season ? await seasonPoster(hit.id, season, hit.poster_path, key) : hit.poster_path;
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
  const showCache = new Map();
  const bySeason = [...data].sort((a, b) => (seasonNumber(a.title) ?? 1) - (seasonNumber(b.title) ?? 1));
  for (const t of bySeason) {
    if (t.poster && !force) continue;
    try {
      const r = await findPoster(t, key, showCache);
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
