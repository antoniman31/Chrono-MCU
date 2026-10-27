import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { orderTitle } from './shared.mjs';

const API = 'https://api.themoviedb.org/3';
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

// Résumé court: les premières phrases entières tenant dans `max` caractères (au moins la première, coupée proprement si besoin)
export function shortOverview(text, max = 300) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentences = clean.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"'])/);
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max && out) break;
    out = next;
  }
  if (out.length <= max) return out;
  const cut = out.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '')}…`;
}

// Titres d'épisodes en français d'une saison TMDB : Map n -> titre, ou null si les épisodes ne se correspondent pas.
// Les titres identiques à l'original (non traduits) et les libellés génériques « Épisode N » sont ignorés.
export function frenchEpisodeTitles(ours, tmdbEpisodes) {
  if (!Array.isArray(tmdbEpisodes) || tmdbEpisodes.length !== ours.length) return null;
  const out = new Map();
  for (const e of ours) {
    const tv = tmdbEpisodes.find((x) => x.episode_number === e.n);
    if (!tv) return null;
    const name = (tv.name ?? '').trim();
    if (!name || /^(épisode|episode)\s*\d+$/i.test(name) || norm(name) === norm(e.title)) continue;
    out.set(e.n, name);
  }
  return out;
}

// Sortie en salle en France: type 3 (cinéma), à défaut 2 (cinéma limité) puis 1 (première); la plus ancienne date du type retenu
export function frenchRelease(results) {
  const fr = (results ?? []).find((r) => r.iso_3166_1 === 'FR');
  if (!fr) return null;
  for (const type of [3, 2, 1]) {
    const dates = (fr.release_dates ?? []).filter((d) => d.type === type && d.release_date).map((d) => d.release_date.slice(0, 10)).sort();
    if (dates.length) return dates[0];
  }
  return null;
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

async function overviewFor(t, key) {
  const season = seasonNumber(t.title);
  if (t.type === 'serie' && season) {
    const s = await tmdb(`/tv/${t.tmdbId}/season/${season}`, {}, key);
    if (s.overview?.trim()) return s.overview;
  }
  return (await tmdb(`/${t.type === 'film' ? 'movie' : 'tv'}/${t.tmdbId}`, {}, key)).overview;
}

async function addDetails(data, key, force) {
  let filled = 0;
  const missing = [];
  for (const t of data) {
    if (!t.tmdbId) continue;
    const film = t.type === 'film';
    const needBackdrop = !t.backdrop;
    const needFr = film && !t.upcoming && !t.releaseDateFr;
    const needOverview = !t.overview;
    const needTitles = !film && !t.upcoming && !t.episodes.some((e) => 'titleFr' in e);
    if (!force && !needBackdrop && !needFr && !needOverview && !needTitles) continue;
    try {
      if (needTitles || (force && !film && !t.upcoming)) {
        const season = await tmdb(`/tv/${t.tmdbId}/season/${seasonNumber(t.title) ?? 1}`, {}, key);
        const titles = frenchEpisodeTitles(t.episodes, season.episodes);
        if (!titles) missing.push(`${t.title} (titres français : épisodes différents de TVmaze)`);
        else {
          for (const e of t.episodes) {
            if (titles.has(e.n)) {
              e.titleFr = titles.get(e.n);
              filled += 1;
            } else delete e.titleFr;
          }
        }
      }
      if (force || needOverview) {
        const short = shortOverview(await overviewFor(t, key));
        if (short) {
          t.overview = short;
          filled += 1;
        } else missing.push(`${t.title} (résumé français)`);
      }
      const info = await tmdb(`/${film ? 'movie' : 'tv'}/${t.tmdbId}`, {}, key);
      if (info.backdrop_path && (force || needBackdrop)) {
        t.backdrop = info.backdrop_path;
        filled += 1;
      } else if (!info.backdrop_path) missing.push(`${t.title} (image paysage)`);
      if (film && !t.upcoming) {
        const fr = frenchRelease((await tmdb(`/movie/${t.tmdbId}/release_dates`, {}, key)).results);
        if (fr) {
          t.releaseDateFr = fr;
          filled += 1;
        } else missing.push(`${t.title} (date France)`);
      }
    } catch (e) {
      missing.push(`${t.title} (${e.message})`);
    }
    await sleep(120);
  }
  return { filled, missing };
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

  if (process.argv.includes('--details')) {
    const { filled, missing: gaps } = await addDetails(data, key, force);
    const out = data.map(orderTitle);
    if (!dry) writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`${filled} valeur(s) ajoutée(s) (images paysage, dates France, résumés)${dry ? ' (essai à blanc, rien écrit)' : ''}.`);
    if (gaps.length) console.log(`Manquant : ${gaps.join(' ; ')}`);
    return;
  }

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

  const out = data.map(orderTitle);
  if (!dry) writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${found} affiche(s) trouvée(s)${dry ? ' (essai à blanc, rien écrit)' : ''}.`);
  if (missing.length) console.log(`Sans affiche : ${missing.join(' ; ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
