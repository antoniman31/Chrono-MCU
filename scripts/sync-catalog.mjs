// Synchronisation du catalogue avec TMDB (films, annonces) et TVmaze (séries) :
//  1. un titre « à venir » dont la date est passée devient un titre sorti (durée, épisodes, date France) ;
//  2. une annonce ou sortie Marvel Studios / Marvel Animation absente du catalogue est ajoutée comme brouillon « à venir » ;
//  3. une nouvelle saison d'une série suivie est seulement signalée (l'ordre chronologique reste un choix humain).
// Sans --write, rien n'est écrit : le rapport est affiché. Avec --write, data/mcu.json est mis à jour et le rapport est écrit
// dans le fichier donné par --report. La clé TMDB (variable TMDB_API_KEY) est facultative : sans elle, seul TVmaze est utilisé.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frenchRelease, seasonNumber, shortOverview, tmdb } from './fetch-posters.mjs';
import { isComplete, tvmazeEpisodes } from './check-data.mjs';
import { orderTitle } from './shared.mjs';

const MARVEL_STUDIOS = '420';
const MARVEL_ANIMATION = '2301';
const DOCUMENTARY = 99;
const NOT_A_TITLE = /making[- ]?of|assembled|podcast|behind the scenes|documentary|featurette|rassemblement|coulisses|special presentation/i;
const RECENT_DAYS = 60;
const HORIZON_DAYS = 548; // au-delà (≈ 18 mois), les annonces TMDB sont surtout des placeholders
const PLACEHOLDER = /^(untitled|sans titre)\b/i;

export const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Titres « à venir » dont la date de sortie est arrivée
export const dueUpcoming = (catalog, today) => catalog.filter((t) => t.upcoming && t.releaseDate <= today);

// Film sorti : durée, date en France, retire « à venir ». Null tant que TMDB n'a pas de durée (on réessaiera la semaine suivante).
export function promoteFilm(t, info, frDate) {
  if (!(info?.runtime > 0)) return null;
  const { upcoming, ...rest } = t;
  const out = { ...rest, runtimeMin: info.runtime, verified: false };
  if (frDate) out.releaseDateFr = frDate;
  return out;
}

// Série sortie : épisodes de la saison depuis TVmaze. Null si aucun épisode n'a de durée connue.
export function promoteSeries(t, tvEpisodes, tvmazeId) {
  const eps = [...tvEpisodes].sort((a, b) => a.number - b.number);
  if (!eps.length || eps.every((e) => e.runtime == null)) return null;
  const { upcoming, ...rest } = t;
  const episodes = eps.map((e, i) => ({ n: i + 1, title: e.name?.trim() || `Épisode ${i + 1}`, airDate: e.airdate ?? undefined, runtimeMin: e.runtime ?? 0 }));
  for (const e of episodes) if (e.airDate === undefined) delete e.airDate;
  const complete = isComplete(episodes, eps.map((e, i) => ({ ...e, number: i + 1 })));
  return { ...rest, tvmazeId: rest.tvmazeId ?? tvmazeId, episodes, verified: complete && episodes.every((e) => e.runtimeMin > 0) };
}

// Annonces ou sorties récentes absentes du catalogue : brouillons « à venir », sans épisode ni durée
export function newCandidates({ movies = [], shows = [], catalog, ignored = [], today }) {
  const known = new Set(catalog.map((t) => t.tmdbId).filter(Boolean));
  const ids = new Set(catalog.map((t) => t.id));
  const since = addDays(today, -RECENT_DAYS);
  const until = addDays(today, HORIZON_DAYS);
  let order = Math.max(0, ...catalog.map((t) => t.chronoOrder));
  const phase = Math.max(1, ...catalog.map((t) => t.phase));
  const drafts = [];
  const consider = (r, type) => {
    const title = (r.title ?? r.name ?? '').trim();
    const date = r.release_date ?? r.first_air_date ?? '';
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < since || date > until || PLACEHOLDER.test(title)) return;
    if (known.has(r.id) || ignored.includes(r.id) || (r.genre_ids ?? []).includes(DOCUMENTARY) || NOT_A_TITLE.test(title)) return;
    let id = slugify(title);
    if (!id) return;
    for (let n = 2; ids.has(id); n += 1) id = `${slugify(title)}-${n}`;
    ids.add(id);
    known.add(r.id);
    order += 1;
    drafts.push({ id, title, type, phase, saga: 'multiverse', releaseDate: date, chronoOrder: order, upcoming: true, tmdbId: r.id, verified: false });
  };
  movies.forEach((r) => consider(r, 'film'));
  shows.forEach((r) => consider(r, 'serie'));
  return drafts;
}

// Nouvelle saison d'une série suivie : saison de TVmaze plus récente que celles du catalogue, diffusée ou annoncée récemment
export function newSeasons(catalog, tvEpisodesByShow, today) {
  const since = addDays(today, -RECENT_DAYS);
  const found = [];
  const byShow = new Map();
  for (const t of catalog.filter((x) => x.type === 'serie' && x.tvmazeId)) {
    byShow.set(t.tvmazeId, Math.max(byShow.get(t.tvmazeId) ?? 0, seasonNumber(t.title) ?? 1));
  }
  for (const [id, mine] of byShow) {
    const eps = tvEpisodesByShow.get(id) ?? [];
    const seasons = [...new Set(eps.map((e) => e.season))].filter((s) => s > mine);
    for (const s of seasons.sort((a, b) => a - b)) {
      const dates = eps.filter((e) => e.season === s && e.airdate).map((e) => e.airdate).sort();
      if (dates.length && dates.at(-1) >= since) {
        const name = catalog.find((x) => x.tvmazeId === id).title.replace(/\s*\((?:saison|season)\s*\d+\)\s*$/i, '');
        found.push({ show: name, season: s, first: dates[0], last: dates.at(-1), episodes: eps.filter((e) => e.season === s).length });
      }
    }
  }
  return found;
}

export function renderReport({ promoted, pending, drafts, seasons, skipped }) {
  const lines = ['# Synchronisation du catalogue', ''];
  if (promoted.length) lines.push('## Titres passés de « à venir » à sortis', ...promoted.map((t) => `- ${t.title} : ${t.type === 'film' ? `${t.runtimeMin} min` : `${t.episodes.length} épisode(s)`}, marqué « à vérifier »`), '');
  if (pending.length) lines.push('## Sortis, mais pas encore de données (réessai la semaine prochaine)', ...pending.map((t) => `- ${t}`), '');
  if (drafts.length) lines.push('## Nouveaux titres ajoutés comme brouillons « à venir »', ...drafts.map((t) => `- ${t.title} (${t.type === 'film' ? 'film' : 'série'}, ${t.releaseDate}) : ordre chronologique à placer, phase ${t.phase} par défaut, scènes post-générique et personnages à compléter`), '');
  if (seasons.length) lines.push('## Nouvelles saisons à ajouter à la main', ...seasons.map((s) => `- ${s.show}, saison ${s.season} : ${s.episodes} épisode(s) du ${s.first} au ${s.last}`), '');
  if (skipped.length) lines.push('## Non vérifié', ...skipped.map((s) => `- ${s}`), '');
  if (lines.length === 2) lines.push('Rien à signaler.');
  return `${lines.join('\n')}\n`;
}

async function discover(key, today) {
  const since = addDays(today, -RECENT_DAYS);
  const movies = await tmdb('/discover/movie', { with_companies: MARVEL_STUDIOS, 'primary_release_date.gte': since, sort_by: 'primary_release_date.asc' }, key);
  const shows = await tmdb('/discover/tv', { with_companies: `${MARVEL_STUDIOS}|${MARVEL_ANIMATION}`, 'first_air_date.gte': since, sort_by: 'first_air_date.asc' }, key);
  return { movies: movies.results ?? [], shows: shows.results ?? [] };
}

async function tvmazeAll(id) {
  const res = await fetch(`https://api.tvmaze.com/shows/${id}/episodes`);
  if (!res.ok) throw new Error(`TVmaze ${res.status} pour la série ${id}`);
  return res.json();
}

async function tvmazeSearch(title) {
  const query = title.replace(/\s*\((?:saison|season)\s*\d+\)\s*$/i, '').trim();
  const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}`);
  return res.ok ? (await res.json()).id : null;
}

async function main() {
  const write = process.argv.includes('--write');
  const reportPath = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
  const key = process.env.TMDB_API_KEY;
  const today = new Date().toISOString().slice(0, 10);
  const path = new URL('../data/mcu.json', import.meta.url);
  const ignorePath = new URL('../data/sync-ignore.json', import.meta.url);
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  const ignored = existsSync(ignorePath) ? JSON.parse(readFileSync(ignorePath, 'utf8')).tmdbIds ?? [] : [];
  const report = { promoted: [], pending: [], drafts: [], seasons: [], skipped: [] };

  // 1. Titres à venir dont la date est passée
  for (const due of dueUpcoming(catalog, today)) {
    const i = catalog.findIndex((t) => t.id === due.id);
    try {
      if (due.type === 'film') {
        if (!key || !due.tmdbId) { report.skipped.push(`${due.title} : durée de film demandée à TMDB (clé ou identifiant TMDB absent)`); continue; }
        const info = await tmdb(`/movie/${due.tmdbId}`, {}, key);
        const fr = frenchRelease((await tmdb(`/movie/${due.tmdbId}/release_dates`, {}, key)).results);
        const promoted = promoteFilm(due, info, fr);
        if (promoted) { catalog[i] = promoted; report.promoted.push(promoted); } else report.pending.push(`${due.title} (TMDB n'a pas encore de durée)`);
      } else {
        const id = due.tvmazeId ?? await tvmazeSearch(due.title);
        if (!id) { report.pending.push(`${due.title} (série introuvable sur TVmaze)`); continue; }
        const promoted = promoteSeries(due, await tvmazeEpisodes(id, seasonNumber(due.title) ?? 1), id);
        if (promoted) { catalog[i] = promoted; report.promoted.push(promoted); } else report.pending.push(`${due.title} (TVmaze n'a pas encore d'épisodes avec durée)`);
      }
    } catch (e) {
      report.skipped.push(`${due.title} : ${e.message}`);
    }
  }

  // 2. Nouveaux titres (TMDB) et 3. nouvelles saisons (TVmaze)
  if (key) {
    try {
      report.drafts = newCandidates({ ...(await discover(key, today)), catalog, ignored, today });
      for (const d of report.drafts) {
        const info = await tmdb(`/${d.type === 'film' ? 'movie' : 'tv'}/${d.tmdbId}`, {}, key);
        if (info.poster_path) d.poster = info.poster_path;
        if (info.backdrop_path) d.backdrop = info.backdrop_path;
        const overview = shortOverview(info.overview);
        if (overview) d.overview = overview;
      }
      catalog.push(...report.drafts);
    } catch (e) {
      report.skipped.push(`Annonces TMDB : ${e.message}`);
    }
  } else report.skipped.push('Annonces et nouveaux films : clé TMDB_API_KEY absente, seul TVmaze a été interrogé');
  const shows = new Map();
  for (const id of new Set(catalog.filter((t) => t.type === 'serie' && t.tvmazeId).map((t) => t.tvmazeId))) {
    try { shows.set(id, await tvmazeAll(id)); } catch (e) { report.skipped.push(e.message); }
  }
  report.seasons = newSeasons(catalog, shows, today);

  const text = renderReport(report);
  console.log(text);
  if (write) {
    writeFileSync(path, `${JSON.stringify(catalog.map(orderTitle), null, 2)}\n`);
    if (reportPath) writeFileSync(reportPath, text);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
