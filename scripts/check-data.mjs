import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seasonNumber } from './fetch-posters.mjs';
import { orderTitle } from './shared.mjs';

export function compareSeries(mine, tvEpisodes) {
  const diffs = [];
  if (mine.length !== tvEpisodes.length) {
    diffs.push(`nombre d'épisodes: ${mine.length} dans mcu.json, ${tvEpisodes.length} sur TVmaze`);
  }
  for (const m of mine) {
    const tv = tvEpisodes.find((e) => e.number === m.n);
    if (!tv || tv.runtime == null) continue;
    if (tv.runtime !== m.runtimeMin) diffs.push(`ép. ${m.n} « ${m.title} »: ${m.runtimeMin} min dans mcu.json, ${tv.runtime} min sur TVmaze`);
  }
  for (const m of mine) {
    const tv = tvEpisodes.find((e) => e.number === m.n);
    if (tv?.airdate && m.airDate && tv.airdate !== m.airDate) diffs.push(`ép. ${m.n} « ${m.title} »: diffusé le ${m.airDate} dans mcu.json, ${tv.airdate} sur TVmaze`);
  }
  return diffs;
}

export function isComplete(mine, tvEpisodes) {
  return mine.length === tvEpisodes.length && mine.every((m) => tvEpisodes.find((e) => e.number === m.n)?.runtime != null);
}

async function tvmazeEpisodes(id, season) {
  const res = await fetch(`https://api.tvmaze.com/shows/${id}/episodes`);
  if (!res.ok) throw new Error(`TVmaze ${res.status} pour la série ${id}`);
  const all = await res.json();
  return all.filter((e) => e.season === season && e.number != null);
}

async function main() {
  const write = process.argv.includes('--write');
  const path = new URL('../data/mcu.json', import.meta.url);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let problems = 0;
  let changed = 0;

  for (const t of data) {
    if (t.type !== 'serie' || !t.tvmazeId || t.upcoming) continue;
    let tv;
    try {
      tv = await tvmazeEpisodes(t.tvmazeId, seasonNumber(t.title) ?? 1);
    } catch (e) {
      console.log(`? ${t.title}: ${e.message}`);
      problems += 1;
      continue;
    }
    const diffs = compareSeries(t.episodes, tv);
    if (diffs.length) {
      problems += 1;
      console.log(`✗ ${t.title}`);
      diffs.forEach((d) => console.log(`    ${d}`));
    }
    if (write) {
      if (t.episodes.length === tv.length) {
        for (const m of t.episodes) {
          const e = tv.find((x) => x.number === m.n);
          if (e?.airdate && e.airdate !== m.airDate) {
            m.airDate = e.airdate;
            changed += 1;
          }
          if (e?.runtime != null && e.runtime !== m.runtimeMin) {
            m.runtimeMin = e.runtime;
            changed += 1;
          }
        }
      }
      const complete = isComplete(t.episodes, tv);
      if (complete !== t.verified) {
        t.verified = complete;
        changed += 1;
      }
    }
  }

  if (write) {
    const out = data.map(orderTitle);
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`${changed} valeur(s) mise(s) à jour dans data/mcu.json.`);
  }
  console.log(problems === 0 ? 'OK: durées et nombres d\'épisodes alignés sur TVmaze.' : `${problems} série(s) à revoir.`);
  process.exit(problems === 0 || write ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
